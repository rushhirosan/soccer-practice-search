#!/bin/bash

# ローカル開発スクリプト
echo "🏠 ローカル開発環境を開始します..."

# 1. ローカルデータベース再構築
echo "🗄️ ローカルデータベース再構築中..."
python main.py

# 2. ローカルアプリケーション起動
echo "🚀 ローカルアプリケーション起動中..."
python app.py

echo "✅ ローカル開発環境完了！"
echo "🌐 サイト: http://localhost:5000/"
