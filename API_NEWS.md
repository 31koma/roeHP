# Roe's Kitchen News API

Roe's Kitchen公式ホームページのお知らせは、Vercel API RouteからSupabaseへ保存します。ホームページ側は `/api/news` から公開済みのお知らせを取得して表示します。

## Supabase環境変数

VercelのProduction環境に以下を設定してください。

```text
NEWS_API_KEY=自動投稿アプリから送る共有キー
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=Supabaseのservice_roleキー
```

`SUPABASE_SERVICE_ROLE_KEY` はサーバー専用です。ブラウザ側には出さないでください。

## Supabase SQL

Supabase SQL Editorで [supabase/schema.sql](./supabase/schema.sql) を実行してください。

## POST /api/news/create

自動投稿アプリからお知らせを投稿するAPIです。`x-api-key` が `NEWS_API_KEY` と一致した場合のみ保存します。

```sh
curl -X POST https://roe-kyoto.com/api/news/create \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: NEWS_API_KEYの値' \
  -d '{
    "id": "2026-05-22-001",
    "date": "2026-05-22",
    "title": "お知らせタイトル",
    "menu_name": "メニュー名",
    "price": "1300円",
    "sales_time": "11:30〜14:00",
    "body_ja": "日本語本文",
    "body_en": "English body",
    "image_alt": "画像の説明文",
    "image_url": "",
    "source": "instagram",
    "published": true
  }'
```

自動投稿アプリ側が既存のcamelCase形式を送っても受信できます。

```json
{
  "menuName": "メニュー名",
  "salesTime": "11:30〜14:00",
  "bodyJa": "日本語本文",
  "bodyEn": "English body",
  "imageAlt": "画像の説明文",
  "imageUrl": ""
}
```

必須項目は `id`、`date`、`title`、`body_ja` です。`published` は未指定なら `true` になります。同じ `id` が存在する場合は `409 Conflict` を返します。

成功時:

```json
{ "success": true }
```

失敗時:

```json
{ "success": false, "reason": "理由" }
```

## GET /api/news

公開済みのお知らせだけを日付降順で返します。

```sh
curl https://roe-kyoto.com/api/news
curl https://roe-kyoto.com/api/news?limit=3
```

トップページは最新3件、`/news/` は一覧表示に使います。
