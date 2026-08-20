#!/usr/bin/env bash
#
# The build step Vercel runs before publishing a deployment.
#
# Two jobs, in this order:
#
#   1. Compile. Vercel builds the function from api/index.ts itself, but the
#      migration runner is invoked as a plain node script, so dist/ has to
#      exist first.
#
#   2. Migrate — but only when MIGRATE_DATABASE_URL is set.
#
# Running migrations here rather than at boot is what keeps the schema ahead of
# the code: a deployment that cannot migrate never goes live, and no instance
# ever starts against a database it does not match. Booting was the old home for
# this, and on a serverless runtime that would mean re-running the check on
# every cold start.
#
# The guard matters. Migrations need a direct session connection for the
# advisory lock that serialises them; the transaction pooler the API runs
# through cannot hold one. Preview deployments are meant to run against the
# schema production already has, so leaving MIGRATE_DATABASE_URL unset there is
# the signal to skip — rather than quietly migrating through the wrong route.
set -euo pipefail

echo "[build] compiling"
tsc --project tsconfig.build.json

if [ -n "${MIGRATE_DATABASE_URL:-}" ]; then
  echo "[build] applying migrations"
  node dist/db/migrate.js
else
  echo "[build] MIGRATE_DATABASE_URL is not set — skipping migrations"
fi
