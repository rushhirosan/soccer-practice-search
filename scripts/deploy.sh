#!/bin/bash

echo "🚀 最適化デプロイを開始します..."

# 変更をコミット
echo "📝 変更をコミット中..."
git add .
git commit -m "VM停止対策と課金最適化"
if [ $? -ne 0 ]; then
    echo "❌ コミットに失敗しました。デプロイを中止します。"
    exit 1
fi

# Fly.ioにデプロイ
echo "🌐 本番環境にデプロイ中..."
fly deploy -a soccer-practice-search
if [ $? -ne 0 ]; then
    echo "❌ デプロイに失敗しました。デプロイを中止します。"
    exit 1
fi

# VMの状態を確認・起動
echo "🚀 VMの状態を確認中..."
VM_STATE=$(fly status -a soccer-practice-search | grep "app" | awk '{print $4}')
if [[ "$VM_STATE" == "stopped" ]]; then
    echo "🚀 VMが停止しています。起動します..."
    fly machine start $(fly status -a soccer-practice-search | grep "app" | awk '{print $2}' | head -n 1) -a soccer-practice-search
    if [ $? -ne 0 ]; then
        echo "❌ VMの起動に失敗しました。データベース再構築を中止します。"
        exit 1
    fi
    echo "🚀 VMが起動しました。少し待機します..."
    sleep 15
else
    echo "🚀 VMは既に起動しています。"
fi

# データベース再構築（タイムアウト付き）
echo "🗄️ データベース再構築中（最適化版）..."
timeout 600 fly ssh console -a soccer-practice-search -C "python main.py"
if [ $? -eq 0 ]; then
    echo "✅ データベース再構築が完了しました！"
else
    echo "⚠️ データベース再構築がタイムアウトしました。"
    echo "💡 ヒント: 処理が長すぎる場合は、チャンネルを分割して実行してください。"
fi

# VMを停止してコスト削減
echo "💰 コスト削減のためVMを停止します..."
fly machine stop $(fly status -a soccer-practice-search | grep "app" | awk '{print $2}' | head -n 1) -a soccer-practice-search

echo "✅ 最適化デプロイ完了！"
echo "🌐 サイト: https://soccer-practice-search.fly.dev/"
echo "💡 ヒント: サイトにアクセスするとVMが自動起動します。"
