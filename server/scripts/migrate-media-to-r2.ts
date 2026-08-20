/**
 * One-time copy of every stored photo and video from Supabase Storage to R2.
 *
 * Run once, locally, before the frontend that reads from R2 goes live:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/migrate-media-to-r2.ts
 *   SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/migrate-media-to-r2.ts --commit
 *
 * Without `--commit` it reports what it would do and copies nothing.
 *
 * Keys are preserved exactly, so a row's `storage_path` keeps working and no
 * database change is needed. Objects are copied, never deleted: leave the
 * Supabase bucket intact until the new path has run in production for a while,
 * then empty it by hand.
 *
 * The service-role key is read from the environment and used only here. The
 * server itself has never held one — that is precisely why it could not delete
 * from Supabase Storage, and why files orphaned by a deleted session are still
 * sitting in that bucket. Those are copied too; reconciling them is a separate
 * job, and having them in one place first makes it easier.
 */
import dotenv from "dotenv";
import { Client } from "pg";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { resolveSsl } from "../src/db/ssl";

dotenv.config();

const BUCKET = "climb-media";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

interface Row {
  media_id: number;
  storage_path: string;
  mime_type: string;
  byte_size: number;
}

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");

  const databaseUrl = required("DATABASE_URL");
  const supabaseUrl = required("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
  const r2Bucket = required("R2_BUCKET");

  const db = new Client({
    connectionString: databaseUrl,
    ssl: resolveSsl(databaseUrl),
  });
  await db.connect();

  const { rows } = await db.query<Row>(
    `SELECT media_id, storage_path, mime_type, byte_size
       FROM media ORDER BY media_id`,
  );
  await db.end();

  console.log(
    `${rows.length} file(s) to copy${commit ? "" : " — dry run, pass --commit to do it"}`,
  );

  let copied = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const label = `#${row.media_id} ${row.storage_path}`;

    if (!commit) {
      console.log(`  would copy ${label} (${row.byte_size} bytes)`);
      continue;
    }

    try {
      // Storage's REST API rather than the JS client: one authenticated GET is
      // the whole interaction, and it saves adding a dependency to the server
      // for a script that runs once.
      const res = await fetch(
        `${supabaseUrl}/storage/v1/object/${BUCKET}/${row.storage_path}`,
        { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
      );
      if (!res.ok) {
        failures.push(`${label}: download failed (${res.status})`);
        continue;
      }

      const body = Buffer.from(await res.arrayBuffer());

      // The table's byte_size fed the storage quota and was self-reported by
      // the client of the day, so this is the first time anyone has checked it.
      // Worth knowing about, not worth stopping for.
      if (body.byteLength !== row.byte_size) {
        console.warn(
          `  ${label}: recorded ${row.byte_size} bytes, actually ${body.byteLength}`,
        );
      }

      await s3.send(
        new PutObjectCommand({
          Bucket: r2Bucket,
          Key: row.storage_path,
          Body: body,
          ContentType: row.mime_type,
        }),
      );

      copied += 1;
      console.log(`  copied ${label}`);
    } catch (err) {
      failures.push(`${label}: ${(err as Error).message}`);
    }
  }

  if (commit) {
    console.log(`\ncopied ${copied}/${rows.length}`);
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s):`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
