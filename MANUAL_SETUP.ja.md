# 手動セットアップ手順

英語版: [`MANUAL_SETUP.md`](MANUAL_SETUP.md)（内容は同一です。移行時はこちらも更新してください）

コードでできることはすべてリポジトリ内にあります。ここに書かれているのは、各サービスの管理画面にアクセスできる人が手で行う必要がある作業だけです。

**初めて本番リリースする場合**：セクション 1〜6 はローカル/開発環境の設定で、すでに完了しています。本番作業のチェックリストは[セクション 7 以降](#7-本番リリース)です。

なかでも **Postmark のアカウント審査を最初に申請してください**。人が行う承認作業でこちらから短縮できず、承認されるまで実際のメールアドレスでの新規登録テストができません。

---

## 1. マイグレーションの実行

`0004`〜`0012` のマイグレーションで、セッション時間のカラム、壁角度/ホールド/弱点のタグテーブル、`attempts` の「1行 = 1課題」への変更、メディアテーブル、AIレポートのメモ用カラム、ケガ関連テーブル、一覧画面用のインデックス、表示言語カラムが追加されます。

```bash
cd server
pnpm db:status     # 適用済み / 未適用の一覧
pnpm db:migrate
```

**状態：ローカルの `climb_app` データベースには適用済みです。** それ以外のデータベース（チームメンバーの環境やデプロイ先）には別途必要です。マイグレーションは前進のみ・チェックサム付きなので、二度実行しても安全です。

### `0007` が既存データに与えた影響

`attempts` の1行の意味が変わりました。以前は「1回のトライ」でしたが、現在は「1つの課題（トライ数と完登数を持つ）」です。既存の行はそれぞれ *1トライ* として引き継がれました。実行時点でローカルDBの `attempts` は0行だったため、実際には変換対象はありませんでした。

---

## 2. Storage バケットの作成 — 写真・動画に必要（現在は退役予定）

ブラウザから Supabase Storage へ直接アップロードし、生成されたオブジェクトキーだけを API に送る構成でした。プライベートバケット1つと4つのポリシーが必要です。

Supabase ダッシュボード → **SQL Editor** で以下を実行します：

```sql
-- バケット本体。プライベート設定：ファイルは短命の署名付きURL経由で配信されるため、
-- コピーされたリンクは永久公開URLではなく期限切れになります。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'climb-media',
  'climb-media',
  false,
  52428800,  -- 50 MB（サーバー側の動画上限と一致）
  array[
    'image/jpeg','image/png','image/webp','image/heic',
    'video/mp4','video/quicktime','video/webm'
  ]
)
on conflict (id) do nothing;

-- ポリシー。すべてのオブジェクトキーはアップロードした人の auth user id で始まるため、
-- 「パスの最初のセグメントが自分自身であること」が認可ルールのすべてです。
create policy "climb-media: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'climb-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "climb-media: upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'climb-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "climb-media: update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'climb-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "climb-media: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'climb-media' and (storage.foldername(name))[1] = auth.uid()::text);
```

`create policy` を再実行すると「policy already exists」エラーになりますが無害です。`insert` 側はガードされています。

### マイグレーション 0002 と競合しない理由

`0002_lock_down_data_api.sql` は、アプリ自身のテーブルを Supabase Data API（PostgREST）から遮断します。Storage は `storage.objects` に独自のポリシーを持つ別サブシステムなので影響を受けません。`storage.objects` に同じ全拒否設定を **適用しないでください** — ブラウザはまさにこのアクセスを必要としています。

### このバケットは退役します

メディアは Cloudflare R2 へ移行しました（[セクション 9](#9-cloudflare-r2-写真と動画の保存先)）。Supabase Storage の無料枠はプロジェクト全体で1GBですが、アプリは1人あたり200MBを提供しているため、50人で共有すべき容量を5人で使い切ってしまいます。R2 の無料枠は10GBで、ダウンロード（下り転送）は無料です。動画アプリで実際にコストがかかるのはこの下り転送の側です。

`scripts/migrate-media-to-r2.ts` ですべてコピーし、新しい経路が本番で1週間動いたことを確認するまで、このバケットとポリシーは残しておいてください。その後に空にします。

R2 で解消された欠陥も1つあります。セッションを削除すると `media` の行は消えるのにファイルは残っていました。サーバーが service-role キーを持っておらず Storage に到達できなかったためです。その孤児ファイルは今もバケット内にあります。移行スクリプトはそれらも含めてコピーします（整理は別作業ですが、まず1か所に集約されている方が扱いやすくなります）。

---

## 3. デモアカウントの作成

シードデータはすべて1つのデモアカウントに紐づきます。そのアカウントはシード実行前に **Supabase Auth 側に存在している必要があります**。SQL では作成できません。認証は委譲されているため、`users` 行だけではアカウントの半分でしかなく、対応する Auth ユーザーがいないとログインできずデータもアプリに現れません。

一度だけ以下を行います：

1. アプリを起動し `/auth` → **Create account**
2. `demo@climblog.app`（名前 `Demo`）で登録。パスワードはデモ当日にチームが実際に思い出せるものにしてください
3. 確認メールのリンクをクリック
4. **一度ログインする。** `users` 行は最初の認証済みリクエスト時に作成される（`middleware/auth.ts`）ため、ログインするまで存在しません

そのアドレスでメールを受け取れない場合は、自分が持つ受信箱のプラスアドレスを使ってください（Gmail は `you+demo@gmail.com` を `you@gmail.com` に配送します）。そのうえで `db/seed.sql` のアドレスを差し替えます。あるいは Supabase ダッシュボード（Authentication → Users → Add user、"Auto Confirm User" をオン）で作成することもできますが、その場合もステップ4のためにアプリから一度ログインしてください。

---

## 4. デモデータの投入

`db/seed.sql` は10週間分の14セッション（タグとメモ付き）、目標、ケガ2件を書き込みます。全画面とAIコーチが実データで動くのに十分な量です。

対象アカウントは冒頭付近の1行です：

```sql
INSERT INTO seed_config VALUES ('demo@climblog.app');   -- <<< 変更してください
```

```bash
cd server
pnpm db:seed       # --force がない限りローカル以外のホストを拒否します
```

誤った場所にシードするくらいなら実行を拒否する設計です。未知のメールアドレスの場合は既存アカウント一覧を添えて失敗し、古いプレースホルダーアカウントを指した場合も説明付きで失敗します。成功時は書き込んだ内容と対象アカウントを表示します。

再実行しても安全です。シードは自分が前回書いた内容を先に消します。3つのデモジム名（`The Hive`、`Cliffhanger`、`Ground Up`）と、課題名・目標説明・ケガ説明の `[seed]` プレフィックスで判定するため、手動で記録したデータは残ります。

日付は `CURRENT_DATE` からの相対値なので、いつ実行してもデータは最新の期間になります。`performances` と `trainings` は意図的にシードしていません（AI Coach 画面から実際に生成してください）。

古い `demo@climb.app` の行（以前のシードが作っていた固定UUIDのプレースホルダー）も削除します。そのアカウントはログイン不可能で、混乱の元にしかならなかったためです。

---

## 5. 環境変数 — ローカル開発

| 変数 | 場所 | 用途 |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | frontend | 認証 |
| `VITE_API_URL` | frontend | APIのベースURL |
| `DATABASE_URL` | server | マイグレーションと全クエリ |
| `OPENAI_API_KEY` | server | AIコーチ（任意。未設定ならAI系エンドポイントが503を返します） |
| `R2_*`（4つ） | server | 写真・動画の保存（任意。未設定ならメディア系エンドポイントが503を返します） |

両方の `.env.example` にすべての変数が詳しく記載されています。本番用の一式は[セクション 7](#7-本番リリース)以降にあります。

---

## 6. タグの語彙 — 任意

マイグレーション `0005`、`0006`、`0010` で投入済みです：

- **壁の角度：** Slab, Vertical, Overhang, Roof, Arête, Dihedral
- **ホールド：** Jug, Crimp, Sloper, Pinch, Pocket, Sidepull, Undercling, Volume
- **弱点：** Finger strength, Grip / lock-off, Footwork, Core tension, Power / dynamic moves, Endurance, Reading the beta, Fear of falling, Flexibility, Balance on slab
- **体の部位：** Finger / pulley, Wrist, Elbow, Shoulder, Back, Hip, Knee, Ankle, Other

これらのマイグレーションは適用済みなので、リストを変更するには新しいマイグレーションを追加する必要があります（適用済みファイルの編集は、意図的にチェックサム検証で失敗します）。

なお、弱点のラベルは記録フォームからユーザーが自由に追加できるため、このリストは最も厳密でなくてよい部類です。

---

## 7. 本番リリース

ここから先はすべて本番用で、リポジトリには含まれません。おおよその順序は、**Postmark を最初に**（人による審査待ちがあるため）、**次に DNS**（他のすべてがこれを参照して検証されるため）、**その後に Vercel の2プロジェクト**です。

**以下のプレースホルダーについて：** `<domain>` はあなたが所有するドメイン（Cloudflare がレジストラ兼DNSプロバイダ）です。アプリは `app.<domain>` に置き、apex（ドメイン直下）は将来のLP用に空けておきます。メールは `noreply@<domain>` から送信します。

### 7.1 Postmark — これを最初に

認証メールを Supabase の組み込み送信機能で送ることはできません。**1時間あたり2通**という上限があり、これでは誰もオンボーディングできません。

1. Postmark のアカウントを作成し、`<domain>` を送信ドメインとして追加します。
2. 表示された DKIM と Return-Path のレコードを追加します — [8.2](#82-メール関連レコード) を参照。
3. **アカウント承認をすぐに申請してください。** 承認されるまで、Postmark は自分で検証したドメイン宛にしか配送しないため、Gmail 宛のテスト登録が無言で失敗します。審査は平日なら24時間以内です。
4. Server → Default Transactional Stream → API Tokens → **Server API Token** をコピー。SMTP のユーザー名とパスワードの**両方**にこの値を使います。
5. 月間送信量のアラートを **80通** に設定してください。無料プランは月100通で、超過分は課金ではなく**送信停止**になります。50件程度の新規登録＋パスワード再設定なら収まりますが、ローンチ月がぎりぎりです。超えそうなら Basic（月$15 / 10,000通）に上げてください。

### 7.2 Supabase Auth

- **SMTP Settings** → カスタムSMTPを有効化：ホスト `smtp.postmarkapp.com`、ポート `587`、送信元 `noreply@<domain>`、送信者名 `ClimbLog AI`、ユーザー名とパスワードは**どちらも** Server API Token。
- **Rate Limits** → カスタムSMTPを有効にすると既定値が 2通/時 から 30通/時 に変わります。**30のままにしてください。** この規模の利用者数には十分であり、同時に Postmark の月100通という無料枠に対する安全弁としても機能します。
- **URL Configuration** → Site URL を `https://app.<domain>`、リダイレクト許可リストに `https://app.<domain>/**` と `http://localhost:5173/**`。
- **Email Templates** → 現状まだ "Supabase" と表示されます。チーム外の人が登録する前にブランディングしておくとよいです。
- **Passkeys**（Authentication → Passkeys）→ ベータ機能を有効化し、**RP ID は `app.<domain>` ではなく親の `<domain>`** を設定してください。親ドメインに対して登録されたパスキーはどのサブドメインでも使えますが、`app.` に紐づけたものはそこから永久に動かせません。

> 認証メールは1言語のみです。Supabase のテンプレートはプロジェクト単位なので、アプリ側の日本語対応はここには及びません。日本語化するには Send Email フックから Postmark API を直接呼ぶ必要があり、今回は対象外としています。

---

## 8. Cloudflare DNS

すべて `<domain>` ゾーンでの作業です。このうち3つには落とし穴があります。

### 8.1 アプリ本体

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| CNAME | `app` | `cname.vercel-dns.com` | **DNS only（グレー雲）** |

> **オレンジ雲ではなくグレー雲にしてください。** プロキシを有効にすると Cloudflare の CDN と TLS が Vercel 自身のものの前段に入り、Vercel の証明書発行が失敗し、すべてのアセットが二重にキャッシュされます。

### 8.2 メール関連レコード

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| TXT | Postmark が表示する名前（例：`20260819._domainkey`） | Postmark が表示する DKIM 値 | 該当なし |
| CNAME | `pm-bounces`（Postmark が表示する正確なホスト名を使用） | `pm.mtasv.net` | **DNS only（グレー雲）** |
| TXT | `@` | `v=spf1 include:spf.mtasv.net ~all` | 該当なし |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@<domain>` | 該当なし |

さらに2つの落とし穴：

- Return-Path の CNAME も **グレー雲** にし、*Flatten all CNAMEs*（Rules → Settings）を **オフ** にしてください。Cloudflare がプロキシするのは HTTP のみなので、プロキシまたはフラット化されたバウンス用レコードは Cloudflare の IP に解決され、Postmark の検証が失敗します。
- **SPF の TXT レコードは1ドメインにつき1本だけが有効です。** 受信用に Cloudflare Email Routing を有効にする場合は、2本目を追加せず統合してください：`v=spf1 include:_spf.mx.cloudflare.net include:spf.mtasv.net ~all`

DMARC は `p=none` から始めてください。拒否せずレポートのみを行うため、設定ミスが「届かない新規登録」ではなくレポート上に現れます。

---

## 9. Cloudflare R2 — 写真と動画の保存先

1. バケット `climb-media` と `climb-media-dev` を作成します（dev 用があるとローカルでの試行が本番に混ざりません）。
2. R2 の API トークンを、対象バケットに限定した **Object Read & Write** 権限で作成します。ここから `R2_ACCESS_KEY_ID` と `R2_SECRET_ACCESS_KEY` が得られます。アカウントIDは S3 エンドポイント内の16進文字列です。
3. バケットの **CORS** を設定します。**忘れると最初に失敗するのがここです**（ブラウザが R2 へ直接 PUT するため）：
   ```json
   [
     {
       "AllowedOrigins": ["https://app.<domain>", "http://localhost:5173"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["content-type", "content-length"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. 既存ファイルを一度だけコピーします。両方の認証情報がある端末から実行してください：
   ```bash
   cd server
   SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/migrate-media-to-r2.ts          # ドライラン
   SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/migrate-media-to-r2.ts --commit
   ```
   キーはそのまま保持されるため、保存済みパスを書き換える必要はありません。Supabase 側からの削除は一切行いません。新しい経路が1週間動いたことを確認してから、手動でバケットを空にしてください。

---

## 10. Vercel — 2つのプロジェクト

### API プロジェクト

- **Root Directory** は `server/`、Install コマンドは `pnpm install --frozen-lockfile`。ビルドは `package.json` の `vercel-build` スクリプトから実行されるため、追加設定は不要です。
- **Fluid Compute** が有効か確認してください（新規プロジェクトでは既定でオン）。コールドスタートが数十秒（Render 無料プランでは30〜60秒）ではなく1〜2秒に収まるのはこの機能によるものです。
- 環境変数：

| 変数 | 値 |
| --- | --- |
| `DATABASE_URL` | Supabase の **transaction pooler**、ポート 6543 |
| `MIGRATE_DATABASE_URL` | Supabase の **session** 接続、ポート 5432 — **Production 環境のみ** |
| `DATABASE_CA_CERT` | `server/certs/prod-ca-2021.crt` の PEM テキスト |
| `SUPABASE_URL` | プロジェクトURL |
| `OPENAI_API_KEY` | platform.openai.com から取得 |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | セクション9から |
| `SENTRY_DSN` | セクション11から |
| `CORS_ORIGIN` | `https://app.<domain>` |
| `NODE_ENV` | `production` |

> **`MIGRATE_DATABASE_URL` を Production のみに設定するのは意図的です。** この変数の有無が、そのデプロイでマイグレーションを実行するかどうかを決めています。Preview にも設定すると、プレビューブランチのたびに本番データベースのスキーマが変わります。逆に Production で未設定にするとスキーマが一切更新されません。マイグレーションは直接のセッション接続を必要とします（実行を直列化するアドバイザリロックが transaction pooler 経由では維持できないためです）。

### フロントエンド プロジェクト

- Root は `frontend/`。ドメイン **`app.<domain>`** をこのプロジェクトに割り当てます。
- 環境変数：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`VITE_API_URL`（API プロジェクトのURL + `/api/v1`）、`VITE_SENTRY_DSN`。
- 前者3つのいずれかが欠けているとビルドが**失敗**します。localhost を向いたクライアントを出荷してしまうより良いという判断で、意図的な挙動です。

API プロジェクトにカスタムドメインは不要です。ブラウザからは `VITE_API_URL` 経由でのみアクセスされ、それを許可しているのが `CORS_ORIGIN` です。

---

## 11. Sentry

**React** 用と **Node** 用の2プロジェクトを作成し、それぞれの DSN を上記2つの Vercel プロジェクトに設定します。どちらの組み込みも DSN がない場合と本番以外では何もしないため、ローカル作業で無効化する操作は不要です。

---

## 12. 初回の本番デプロイ後

1. 1日ほど様子を見てから、**Render のサービスを削除**し、デプロイフックのシークレットも削除してください。それを呼んでいたワークフローはすでにリポジトリから削除済みです。
2. R2 へのコピーが1週間動いたら、Supabase Storage のバケットを空にし（セクション9）、セクション2の `climb-media` ポリシー4つを削除します。
3. メール経路を端から端まで確認します：
   - `dig CNAME pm-bounces.<domain>` が Cloudflare の IP ではなく **`pm.mtasv.net`** を返すこと。これがレコードがプロキシされていない証明になります。
   - **Gmail アドレス**で新規登録してみてください。成功すれば Postmark の承認が下りています。
   - [mail-tester.com](https://www.mail-tester.com) にメールを1通通し、SPF・DKIM・DMARC がすべて pass することを確認します。
4. 本番のオリジンから写真アップロードが動くことを確認してください。ここで最も起きやすいのが CORS の失敗で、エラーではなく「無言でアップロードに失敗する」形で現れます。

---

## 動作確認

```bash
cd server && pnpm db:status && pnpm dev
cd frontend && pnpm dev
```

1. **セッション記録** — 壁の角度とホールドのボタン、弱点のドロップダウン、トライ/完登のカウンター。写真を添付して1課題記録してみてください。
2. **分析** — 有効な目標が3件を超えると「すべて表示」ボタンが現れます。課題にタグを付けると「壁の角度別の完登率」グラフが表示されます。
3. **AIコーチ** — 分析を生成します。冒頭に2行の要約、グレード別のグラフ。ピン留めしてメモを書いてみてください。
4. **ケガの記録** — 1件記録し、日々のチェックインを行い、ダッシュボードにバナーが出ることを確認します。トレーニングプランを生成し、ドリルが除外された場合にその旨が報告されることを確認してください。

写真アップロードが権限エラーで失敗する場合は、セクション2（または本番ではセクション9のCORS設定）が反映されていません。
