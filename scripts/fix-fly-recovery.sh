#!/bin/bash
# Fly.io 復旧 & 1インスタンス化スクリプト
# 失敗したマシンを整理し、1台のみで再デプロイする

set -e
APP_NAME="soccer-practice-search"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🔧 Fly.io 復旧・1インスタンス化を開始します"
echo ""

# 1. 現在の状態を確認
echo "📊 現在のマシン状態:"
fly status -a "$APP_NAME" || true
echo ""

# 2. スケールを1に設定（余分なマシンを削除）
echo "📉 インスタンス数を1に設定..."
fly scale count 1 -a "$APP_NAME" --yes 2>/dev/null || true
echo ""

# 3. 失敗したマシンを全て削除（クリーンな状態から再デプロイ）
echo "🗑️ 既存マシンを削除中..."
for MACHINE_ID in $(fly machine list -a "$APP_NAME" -q 2>/dev/null); do
    echo "  マシン $MACHINE_ID を削除..."
    fly machine destroy "$MACHINE_ID" -a "$APP_NAME" --force
done
echo ""

# 4. 1台のみで再デプロイ（--ha=false で冗長化なし）
echo "🚀 1インスタンスで再デプロイ中..."
fly deploy -a "$APP_NAME" --ha=false

echo ""
echo "✅ 復旧完了！"
echo "🌐 サイト: https://soccer-practice-search.fly.dev/"
echo ""
echo "💡 ヒント: min_machines_running=0 のため、アクセスがないとVMは自動停止します。"
echo "   初回アクセス時に数秒かかる場合があります。"
