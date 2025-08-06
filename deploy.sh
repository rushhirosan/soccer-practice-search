#!/bin/bash

# Fly.ioデプロイスクリプト

echo "🚀 Starting deployment to Fly.io..."

# Fly.io CLIがインストールされているかチェック
if ! command -v fly &> /dev/null; then
    echo "❌ Fly.io CLI is not installed. Please install it first:"
    echo "   curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# ログイン状態をチェック
if ! fly auth whoami &> /dev/null; then
    echo "🔐 Please login to Fly.io first:"
    echo "   fly auth login"
    exit 1
fi

# アプリケーションが存在するかチェック
if ! fly apps list | grep -q "soccer-practice-search"; then
    echo "📱 Creating new Fly.io app..."
    fly apps create soccer-practice-search
fi

# データベースが存在するかチェック
if ! fly postgres list | grep -q "soccer-practice-db"; then
    echo "🗄️ Creating PostgreSQL database..."
    fly postgres create soccer-practice-db --region nrt
    fly postgres attach soccer-practice-db --app soccer-practice-search
fi

# 環境変数を設定
echo "🔧 Setting environment variables..."
fly secrets set DATABASE_URL="$(fly postgres connect -a soccer-practice-db -c 'echo $DATABASE_URL')"

# デプロイ
echo "🚀 Deploying to Fly.io..."
fly deploy

echo "✅ Deployment completed!"
echo "🌐 Your app is available at: https://soccer-practice-search.fly.dev" 