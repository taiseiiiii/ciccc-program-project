# 手動セットアップ手順（本番リリース）

英語版: [`MANUAL_SETUP.md`](MANUAL_SETUP.md)（内容は同一です。片方を変更したらもう片方も更新してください）

コードでできることはすべてリポジトリ内にあります。ここに書かれているのは、各サービスの管理画面にアクセスできる人が手で行う必要がある作業だけです。

**このドキュメントは本番リリースに必要な作業だけを扱います。** ローカル/開発環境の初期構築（初期マイグレーション、Supabase Storage バケット、デモアカウント、シードデータ、タグ語彙）は完了済みのため削除しました。経緯は Git 履歴を参照してください。

**プレースホルダー:** `<domain>` は Cloudflare で取得済みのドメインです。アプリは `app.<domain>` に置き、apex（ドメイン直下）は将来のLP用に空けておきます。

> **メディアファイルの掃除について**（`db/migrations/0008_media.sql` からの参照）
> セッションを削除すると `media` の行は CASCADE で消えますが、実ファイルには別の処理が必要でした。旧構成ではサーバーが service-role キーを持たず Storage に到達できなかったためです。理由と対応は[セクション 4](#4-cloudflare-r2)にあります。

---

## 作業の順序

依存関係があるので、この順に進めてください。

1. **Postmark のアカウント審査を申請する** — 人が行う審査で、こちらからは短縮できません（平日24時間以内）。承認されるまで実在のメールアドレスでの登録テストができないため、**最初に出して他の作業と並行させます**
2. **DNS** — DKIM と Return-Path の値は Postmark が発行するので、1 のあと
3. **R2 と Sentry** — 他に依存しないので、審査待ちの間に進められます
4. **Vercel の API プロジェクト** — フロントエンドの `VITE_API_URL` に API のURLが必要なので、こちらが先
5. **Vercel のフロントエンドプロジェクト** — 必須の環境変数が1つでも欠けているとビルドが**失敗**します（意図的な挙動）。最初のデプロイ前にすべて設定してください
6. **Supabase の本番設定** — SMTP に Postmark のトークン、URL Configuration に `app.<domain>` が必要なので最後

---

## 1. アカウント構成

現状 Cloudflare・Supabase・Vercel は個人アカウントにあります。**移管は不要です**が、プロジェクトが個人アカウントの人質にならないよう、共有の連絡先を1つ用意してください。

### 1.1 ドメインのメールアドレス

Cloudflare Email Routing（無料）で、以下を自分の受信箱へ転送します。各サービスにはこちらを登録してください。

| アドレス | 用途 |
| --- | --- |
| `admin@<domain>` | 各サービスのアカウント登録先 |
| `support@<domain>` | アプリやメールに載せる問い合わせ先 |
| `dmarc@<domain>` | DMARC 集計レポートの受信先 |

`noreply@<domain>` は Postmark からの送信専用なので、転送設定は不要です。

- **Email Routing は転送専用で、そのアドレスから送信はできません。** サービスの登録・確認メールを受け取る用途には十分ですが、`support@` 宛に届いたメールへ返信するには Gmail の「他のアドレスから送信」を別途設定する必要があります。
- **Email Routing を有効にすると Cloudflare が MX と SPF を自動追加します。** SPF は1ドメインに1本だけが有効なので、Postmark の分とマージしてください（[3.2](#32-メール関連レコード)）。
- Postmark の審査は「正当な送信者か」を人が見ます。`<domain>` から送信したいのに申請者が無料の Gmail アドレス、という組み合わせは質問される確率が上がるため、**Postmark に登録する前に**このアドレスを用意してください。

### 1.2 Google アカウントの命名

`climblog.ai@gmail.com` は勧めません。理由が3つあります。

- **Gmail はドットを無視します。** `climblog.ai@gmail.com` と `climblogai@gmail.com` は同一のメールボックスです。ドットに意味はなく、区別にも使えません
- ローカルパートの `.ai` はドメインの一部に見えるため、口頭でもチケットでも確実に間違えられます
- 製品名と TLD を、あとから改名できない場所に固定することになります

そもそも 1.1 のとおり各サービスには `admin@<domain>` を登録するので、**Gmail のアドレスはどこにも表示されません。** 復旧用の身元として持つだけなので、退屈な名前で十分です。

候補: `climblogapp@gmail.com` / `climblog.ops@gmail.com` / `climblogteam@gmail.com`

作成したら **2段階認証とリカバリコードを最初に設定してください。** このアカウントが本番インフラすべての復旧経路になります。

### 1.3 既存アカウントの共有

移管ではなく招待で十分です。得られる性質は同じで、リスクだけが違います。

| サービス | やること |
| --- | --- |
| Cloudflare | Members に `admin@<domain>` を Super Administrator で招待 |
| Supabase | Organization に Owner で招待 |
| Vercel | リリース後でよい。Project Transfer が公式にあるため後からでも安い |
| Postmark / Sentry | 未作成なので `admin@<domain>` で新規作成 |

**ドメインは移管しないでください。** 取得直後は ICANN の60日移管ロックに掛かる可能性があり、そもそも本番リリース直前に DNS の権威を動かすべきではありません。

**Supabase のプロジェクトは絶対に作り直さないでください。** `users.id` は Supabase Auth の UID を参照しています。作り直すと `auth.users` が消えて既存ユーザーとログの紐付けが壊れ、project ref も変わるため `VITE_SUPABASE_URL` も別物になります。将来どうしても移す場合は Organization 間の Transfer Project を使ってください（Free プランでの移管条件は管理画面で要確認）。

> Vercel と Supabase を **GitHub ログイン**で作っている場合、実質の所有者は Gmail ではなく GitHub アカウントです。その場合に効くのは GitHub Organization（無料）ですが、このリポジトリは提出物でもあるので、要件を確認してから判断してください。

---

## 2. Postmark

**これを最初に申請してください。**

認証メールを Supabase の組み込み送信機能で送ることはできません。**1時間あたり2通**という上限があり、これでは誰もオンボーディングできません。

1. Postmark のアカウントを `admin@<domain>` で作成し、`<domain>` を送信ドメインとして追加します。
2. 表示された DKIM と Return-Path のレコードを追加します — [3.2](#32-メール関連レコード) を参照。
3. **アカウント承認をすぐに申請してください。** 承認されるまで、Postmark は自分で検証済みのドメイン宛にしか配送しないため、Gmail 宛のテスト登録が無言で失敗します。審査は平日なら24時間以内です。
4. Server → Default Transactional Stream → API Tokens → **Server API Token** をコピー。SMTP のユーザー名とパスワードの**両方**にこの値を使います。
5. 月間送信量のアラートを **80通** に設定してください。無料プランは月100通で、超過分は課金ではなく**送信停止**になります。50件程度の新規登録＋パスワード再設定なら収まりますが、ローンチ月がぎりぎりです。超えそうなら Basic（月$15 / 10,000通）に上げてください。

> **審査を待つ間もテストはできます。** 承認前でも「自分で検証済みのドメイン宛」には配送されるので、1.1 で用意した `test@<domain>`（Email Routing で自分の受信箱へ転送）を使えば、登録 → 確認メール → リンク着地までを端から端まで確認できます。承認が必要なのは Gmail など**外部**アドレス宛の配送だけです。

---

## 3. Cloudflare DNS

すべて `<domain>` ゾーンでの作業です。このうち3つには落とし穴があります。

### 3.1 アプリ本体

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| CNAME | `app` | `cname.vercel-dns.com` | **DNS only（グレー雲）** |

> **オレンジ雲ではなくグレー雲にしてください。** プロキシを有効にすると Cloudflare の CDN と TLS が Vercel 自身のものの前段に入り、Vercel の証明書発行が失敗し、すべてのアセットが二重にキャッシュされます。

### 3.2 メール関連レコード

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| TXT | Postmark が表示する名前（例：`20260819._domainkey`） | Postmark が表示する DKIM 値 | 該当なし |
| CNAME | `pm-bounces`（Postmark が表示する正確なホスト名を使用） | `pm.mtasv.net` | **DNS only（グレー雲）** |
| TXT | `@` | `v=spf1 include:spf.mtasv.net ~all` | 該当なし |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@<domain>` | 該当なし |

さらに2つの落とし穴：

- Return-Path の CNAME も **グレー雲** にし、*Flatten all CNAMEs*（Rules → Settings）を **オフ** にしてください。Cloudflare がプロキシするのは HTTP のみなので、プロキシまたはフラット化されたバウンス用レコードは Cloudflare の IP に解決され、Postmark の検証が失敗します。
- **SPF の TXT レコードは1ドメインにつき1本だけが有効です。** [1.1](#11-ドメインのメールアドレス) の Email Routing を有効にすると Cloudflare が SPF を自動追加するので、2本目を追加せず統合してください：

  ```
  v=spf1 include:_spf.mx.cloudflare.net include:spf.mtasv.net ~all
  ```

DMARC は `p=none` から始めてください。拒否せずレポートのみを行うため、設定ミスが「届かない新規登録」ではなくレポート上に現れます。

---

## 4. Cloudflare R2

写真と動画の保存先です。Supabase Storage の無料枠はプロジェクト全体で1GBですが、アプリは1人あたり200MBを提供しているため、5人で50人分を使い切ってしまいます。R2 の無料枠は10GBで、ダウンロード（下り転送）は無料です。動画アプリで実際にコストがかかるのはこの下り転送の側です。

R2 で解消された欠陥もあります。旧構成ではセッションを削除すると `media` の行は消えるのにファイルは残っていました。サーバーが service-role キーを持っておらず Storage に到達できなかったためです。R2 ではサーバーが認証情報を持つので、行と同じ経路でファイルも削除されます。既存の孤児ファイルは Supabase 側に残っており、下記の移行スクリプトがそれらも含めてコピーします。

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

   キーはそのまま保持されるため、DB に保存済みのパスを書き換える必要はありません。Supabase 側からの削除は一切行いません（後片付けは[セクション 9](#9-後片付け)）。

---

## 5. Supabase

本番用に変更する設定だけです。プロジェクトそのものは作成済みで、そのまま使います。

- **SMTP Settings** → カスタムSMTPを有効化：ホスト `smtp.postmarkapp.com`、ポート `587`、送信元 `noreply@<domain>`、送信者名 `ClimbLog AI`、ユーザー名とパスワードは**どちらも** Server API Token。
- **Rate Limits** → カスタムSMTPを有効にすると既定値が 2通/時 から 30通/時 に変わります。**30のままにしてください。** この規模の利用者数には十分であり、同時に Postmark の月100通という無料枠に対する安全弁としても機能します。
- **URL Configuration** → Site URL を `https://app.<domain>`、リダイレクト許可リストに `https://app.<domain>/**` と `http://localhost:5173/**`。
- **Email Templates** → 現状まだ "Supabase" と表示されます。チーム外の人が登録する前にブランディングしておくとよいです。
- **Passkeys**（Authentication → Passkeys）→ ベータ機能を有効化し、**RP ID は `app.<domain>` ではなく親の `<domain>`** を設定してください。親ドメインに対して登録されたパスキーはどのサブドメインでも使えますが、`app.` に紐づけたものはそこから永久に動かせません。

> **パスキーはローカルでは検証できません。** WebAuthn は RP ID がオリジンのドメインか、その登録可能な親ドメインであることを要求します。`localhost` は `<domain>` のサブドメインではないため、RP ID を本番ドメインに設定した時点で localhost からの登録はブラウザに拒否されます。プレビュー用の `*.vercel.app` も同様です。**動作確認は `https://app.<domain>` でのみ可能**だと見込んでおいてください。

> **認証メールは1言語のみです。** Supabase のテンプレートはプロジェクト単位なので、アプリ側の日本語対応はここには及びません。日本語化するには Send Email フックから Postmark API を直接呼ぶ必要があり、今回は対象外としています。

---

## 6. Vercel

2つのプロジェクトを作ります。**API プロジェクトを先に**作ってください。フロントエンドの `VITE_API_URL` に API 側の URL が必要なためです。

### 6.1 API プロジェクト

- **Root Directory** は `server/`、Install コマンドは `pnpm install --frozen-lockfile`。ビルドは `package.json` の `vercel-build` スクリプトから実行されるため、追加設定は不要です。
- **Fluid Compute** が有効か確認してください（新規プロジェクトでは既定でオン）。コールドスタートが数十秒（Render 無料プランでは30〜60秒）ではなく1〜2秒に収まるのはこの機能によるものです。
- 環境変数：

| 変数 | 値 |
| --- | --- |
| `DATABASE_URL` | Supabase の **transaction pooler**、ポート 6543 |
| `MIGRATE_DATABASE_URL` | Supabase の **session** 接続、ポート 5432 — **Production 環境のみ** |
| `DATABASE_CA_CERT` | `server/certs/prod-ca-2021.crt` の PEM テキスト（Vercel は改行を含む値をそのまま貼れます） |
| `SUPABASE_URL` | プロジェクトURL |
| `OPENAI_API_KEY` | platform.openai.com から取得（[セクション 7](#7-sentry-と-openai)） |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | [セクション 4](#4-cloudflare-r2) から |
| `SENTRY_DSN` | [セクション 7](#7-sentry-と-openai) から |
| `CORS_ORIGIN` | `https://app.<domain>` |
| `NODE_ENV` | `production` |

> **`MIGRATE_DATABASE_URL` を Production のみに設定するのは意図的です。** この変数の有無が、そのデプロイでマイグレーションを実行するかどうかを決めています。Preview にも設定すると、プレビューブランチのたびに本番データベースのスキーマが変わります。逆に Production で未設定にするとスキーマが一切更新されません。マイグレーションは直接のセッション接続を必要とします（実行を直列化するアドバイザリロックが transaction pooler 経由では維持できないためです）。

データベースのパスワードはプロジェクト作成時に決めたもので、招待メンバーからは見えません。分からない場合は Database settings からリセットしてください（publishable / anon キーとは別物です）。

API プロジェクトにカスタムドメインは不要です。ブラウザからは `VITE_API_URL` 経由でのみアクセスされ、それを許可しているのが `CORS_ORIGIN` です。

### 6.2 フロントエンド プロジェクト

- Root は `frontend/`。ドメイン **`app.<domain>`** をこのプロジェクトに割り当てます。
- 環境変数：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`VITE_API_URL`（API プロジェクトのURL + `/api/v1`）、`VITE_SENTRY_DSN`。
- **前者3つのいずれかが欠けているとビルドが失敗します。** localhost を向いたクライアントを出荷してしまうより良いという判断で、意図的な挙動です。最初のデプロイ前に設定してください。

### 6.3 知っておくとよいこと

- **切り戻しは Deployments からワンクリックです。** 問題のあるデプロイを見つけたら、直前のデプロイの "Promote to Production" で戻せます。ただし**マイグレーションは巻き戻りません**（前進のみの設計です）。スキーマを壊す変更を含むデプロイは、切り戻しでは救えないと考えてください。
- **Hobby プランは商用利用が許可されていません。** 無料で提供している間は問題ありませんが、収益化する場合は Pro が必要です。

---

## 7. Sentry と OpenAI

**Sentry** — **React** 用と **Node** 用の2プロジェクトを作成し、それぞれの DSN を上記2つの Vercel プロジェクトに設定します。どちらの組み込みも DSN がない場合と本番以外では何もしないため、ローカル作業で無効化する操作は不要です。

**OpenAI の上限設定** — **この構成で実際に請求が発生しうる唯一のサービスです。** platform.openai.com → Settings → Limits で、月間の **hard limit**（到達したらAPIが停止）と、その手前の **soft limit**（メール通知）を設定してください。

アプリ側にも上限はあります。`middleware/aiQuota.ts` が1ユーザーあたり**1時間に10件**でAI生成を拒否します（`performances` と `trainings` の行数を直接数えるので、インスタンスが複数あっても再起動しても効きます）。ただしこれは1ユーザーあたりの制限なので、アカウント全体の天井は OpenAI 側で別に張っておく必要があります。

---

## 8. デプロイ後の確認

### 8.1 メール経路

- `dig CNAME pm-bounces.<domain>` が Cloudflare の IP ではなく **`pm.mtasv.net`** を返すこと。これがレコードがプロキシされていない証明になります。
- Postmark の DNS 画面で DKIM と Return-Path が verified になっていること。
- **Gmail アドレス**で新規登録してみてください。成功すれば Postmark の承認が下りています。
- [mail-tester.com](https://www.mail-tester.com) にメールを1通通し、SPF・DKIM・DMARC がすべて pass することを確認します。
- 確認メールのリンクが `https://app.<domain>` に着地すること。

### 8.2 アプリの動作確認

**`https://app.<domain>` で実施してください。** パスキーは本番ドメイン以外では検証できません（[セクション 5](#5-supabase)）。

1. **写真アップロード** — 本番オリジンからアップロードできること。**ここで最も起きやすいのが R2 の CORS の設定漏れ**で、エラーではなく「無言でアップロードに失敗する」形で現れます。
2. **セッション記録** — 壁の角度とホールドのボタン、弱点のドロップダウン、トライ/完登のカウンター。
3. **保存後の編集** — Sessions 画面から、保存済みのセッションとその各ルートを編集・削除できること。既存セッションへのルート追加もできること。
4. **検索** — ルート名・ジム名・日付範囲・グレードで絞り込めること。
5. **AI コーチ** — 分析を生成。過去レポートをモーダルで開いても**現在のカードが消えないこと**。モーダルからピン留めできること。
6. **レポート名** — 入力欄がカードの上部にあり、レポートを切り替えたあとも正しいレポートに保存されること。
7. **日本語** — Profile から言語を切り替え、全画面が日本語になること。その状態でAIレポートを生成し、**本文が日本語で返ること**。
8. **パスキー** — Profile から登録 → サインアウト → Face ID / Touch ID でサインイン。
9. **CSV インポート** — 不正な行を含むファイルを読み込み、エラーが行番号付きで表示され、正しい行だけが取り込まれること。
10. **モバイル** — 375px 幅で Log Session を開き、Session Date の入力欄が崩れないこと。
11. **AI クォータ** — 1時間に11件目の生成が 429 で拒否されること。

---

## 9. 後片付け

1. 1日ほど様子を見てから、**Render のサービスを削除**し、デプロイフックのシークレットも削除してください。それを呼んでいたワークフローはすでにリポジトリから削除済みです。
2. R2 への新経路が1週間動いたら、**Supabase Storage の `climb-media` バケットを空にし**、`storage.objects` 上の4つの `climb-media` ポリシーを削除します。移行スクリプトは Supabase 側を一切削除しないので、この作業は手動です。
3. Supabase の Storage 使用量が 0 に戻ったことを確認します。

---

## 無料枠の限界

執筆時点の値です。**最初に壊れるのはメールの月100通**で、その次がユーザー数ではなくデータ量です。

| サービス | 無料枠 | 超えたときに起きること |
| --- | --- | --- |
| Postmark | 100通 / 月 | **送信停止**（課金ではない）。Basic は $15/月で10,000通 |
| Supabase | DB 500MB、下り 5GB/月、7日間アクセスがないとプロジェクト一時停止 | 書き込み拒否 / 一時停止。Pro は $25/月 |
| Vercel | 帯域 100GB/月 | 追加分は課金または制限。商用利用は Pro が必要 |
| Cloudflare R2 | 10GB、下り転送は無料 | 超過分のみ従量課金（$0.015/GB 程度） |
| Sentry | 5,000件 / 月程度 | 超過分は破棄されるだけ |
| OpenAI | なし（従量課金） | **請求が発生する唯一の場所。[セクション 7](#7-sentry-と-openai) で上限を設定してください** |

アプリ側は1人あたり200MBのメディアを許可しています（`media.controller.ts` の `MAX_ACCOUNT_BYTES`）。R2 の10GBは、全員が上限まで使った場合の50人分にあたります。

---

## ローカル環境の更新

このブランチをローカルで動かす場合のみ必要です。

```bash
pnpm install                    # ルート、frontend、server それぞれ
cd server && pnpm db:migrate    # 0011（一覧用インデックス）と 0012（表示言語カラム）
```

`server/.env` に `R2_*` の4変数を追加してください（`climb-media-dev` バケットを指定）。未設定でもサーバーは起動しますが、メディア系のエンドポイントが 503 を返します。`frontend/.env.local` は変更不要です。
