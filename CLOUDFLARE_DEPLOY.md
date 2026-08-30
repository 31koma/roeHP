# Cloudflare移行メモ

このサイトは、次の構成でCloudflareへ移行しました。

- 静的ページ: Workers Static Assets
- お知らせデータ: D1（`roes-kitchen-news`）
- お知らせ画像: R2（`roes-kitchen-media`）
- 投稿認証: Worker secret `NEWS_API_KEY`

`workers.dev` の仮URLで全ページ、D1読み書き、R2画像アップロードを実測したうえで、独自ドメインをWorkerへ登録しています。

## 現在の公開状況（2026-08-30）

- Worker: `https://roes-kitchen.komatobi3.workers.dev`
- Custom Domain: `roe-kyoto.com`、`www.roe-kyoto.com`（Workerへの登録済み）
- Cloudflare zone: ネームサーバー変更待ち
- Cloudflare nameservers: `fattouche.ns.cloudflare.com`、`rose.ns.cloudflare.com`
- 現在のnameservers: `ns1.namegear.co`、`ns2.namegear.co`
- メール保護: MX（さくら）とSPFのTXTを旧DNSと照合済み

Namegear側のネームサーバーをCloudflareの2件へ置き換えるまでは、`roe-kyoto.com` の閲覧者には旧サーバーが表示されます。切替後はwwwをルートドメインへ301転送します。

## 初回だけ行うこと

1. `npx wrangler login`
2. `npx wrangler d1 create roes-kitchen-news`
3. 返されたdatabase IDを `wrangler.jsonc` の `database_id` に設定
4. `npx wrangler r2 bucket create roes-kitchen-media`
5. `npm run db:migrate:remote`
6. `.migration/news-api-key.txt` の値を `npx wrangler secret put NEWS_API_KEY` で登録
7. `.migration/manifest.json` のうち画像1件をR2へ `--remote` 付きで投入し、サイズを照合
8. `.migration/news.sql`（ニュース2件）をD1へ投入
9. `npm run deploy`

## 本番切替前の検収

- `/`、`/news/`、`/lunch/`、`/dinner/`、`/english/`、`/access/` が表示される
- `/news` と `/news/` の両方が期待どおりに解決される
- `/api/news` と `/api/news?limit=3` がD1の公開済みデータを返す
- 誤ったAPIキーとキー未設定時は投稿が拒否される
- 実際に画像を1枚アップロードし、返されたURLのHEADでサイズとContent-Typeを確認する
- 実際にお知らせを1件作成し、一覧に出ることを確認する
- Workerログにエラーが残っていない

検収は完了しています。旧DNSの自動取り込み結果は信用せず、A 3件、MX 1件、TXT 1件を旧ネームサーバーと照合しました。Cloudflare内のルートとwwwの旧AレコードだけをWorkerのCustom Domainへ置き換え、メール用レコードとワイルドカードAレコードは維持しています。

## ネームサーバー切替後の確認

1. `dig NS roe-kyoto.com +short` がCloudflareの2件を返す
2. `https://roe-kyoto.com/` が新サイトを返す
3. `https://www.roe-kyoto.com/` がルートドメインへ301転送される
4. `/api/news` がニュース2件を返し、R2画像が表示される
5. MXとTXTが切替前と同じ内容で引ける
6. 問題がなければ、Cloudflareに残した旧サーバー向けワイルドカードAレコードの要否を判断する
