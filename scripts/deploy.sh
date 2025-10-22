#!/bin/bash

# デプロイスクリプト
echo "🚀 デプロイを開始します..."

# 1. 変更をコミット
echo "📝 変更をコミット中..."
git add .
git commit -m "環境自動判別システムの実装"

# 2. 本番環境にデプロイ
echo "🌐 本番環境にデプロイ中..."
fly deploy -a soccer-practice-search

# 3. データベース再構築
echo "🗄️ データベース再構築中..."
fly ssh console -a soccer-practice-search -C "python -c \"
import os
from dotenv import load_dotenv
load_dotenv('./utilities/.env', override=True)
import main
\""

echo "✅ デプロイ完了！"
echo "🌐 サイト: https://soccer-practice-search.fly.dev/"
