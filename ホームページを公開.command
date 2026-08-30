#!/bin/bash
# ホームページの変更をCloudflareへ公開する（ダブルクリックするだけでOK）

cd "$(dirname "$0")"

echo "================================"
echo " ホームページの変更を公開します"
echo "================================"

if ! npm run check || ! npm run build; then
  echo "公開前の検査に失敗しました。この画面の内容をコマやんアプリのチャットに貼ってください。"
  read -r -p "Enterキーで閉じます"
  exit 1
fi

git add -A
if ! git diff --cached --quiet; then
  git commit -m "ホームページ更新 $(date '+%Y-%m-%d %H:%M')" || exit 1
fi

if ! git push origin main; then
  echo "公開に失敗しました。この画面の内容をコマやんアプリのチャットに貼ってください。"
  read -r -p "Enterキーで閉じます"
  exit 1
fi

if ! npx wrangler deploy; then
  echo "Cloudflareへの公開に失敗しました。この画面の内容をコマやんアプリのチャットに貼ってください。"
  read -r -p "Enterキーで閉じます"
  exit 1
fi

echo ""
echo "================================"
echo " Cloudflareへの公開が完了しました！"
echo " この画面は閉じて大丈夫です"
echo "================================"
read -r -p "Enterキーで閉じます"
