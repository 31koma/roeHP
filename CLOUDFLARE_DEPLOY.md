# Cloudflare移行メモ

このサイトは、次の構成でCloudflareへ移行しました。

- 静的ページ: Workers Static Assets
- お知らせデータ: D1（`roes-kitchen-news`）
- お知らせ画像: R2（`roes-kitchen-media`）
- 投稿認証: Worker secret `NEWS_API_KEY`

Vercelホスティングへの依存をなくし、Cloudflareの `workers.dev` で全ページ、D1読み書き、R2画像アップロードを実測しています。HPの実運用ではSupabaseを使用していません。

## 現在の公開状況（2026-08-30）

- 公式URL: `https://roeskitchen.com`
- Worker fallback: `https://roes-kitchen.komatobi3.workers.dev`
- Custom Domain: `roeskitchen.com` / `www.roeskitchen.com`
- `roe-kyoto.com`: 旧HP業者のサービスに属するため使用しない

`www.roeskitchen.com` は `https://roeskitchen.com` へ301転送します。

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

検収は完了しています。旧Vercel API、実運用されていなかったSupabaseスキーマ、旧ホスティング設定はリポジトリから削除済みです。ロエズオフィスは別システムであり、現在のVercel＋Supabase構成には触れません。
