## ✅ 完了したタスク

2025/10/20
- [x] 検証環境の確立、postgres
- [x] チャンネルの整理
- [x] 整理したチャンネルで再度データベースを構築する
- [x] プロジェクト構造の整理
- [x] データベース接続問題の修正
2025/10/21
- [x] UI変更
- [x] 環境自動判別システムの実装
- [x] デプロイスクリプトの作成

## 🚀 新しい推奨フロー（自動化済み）

### **ローカル開発時**
```bash
# ワンコマンドでローカル環境構築 + アプリ起動
./scripts/local.sh
```

### **本番更新時**
```bash
# ワンコマンドでデプロイ + データベース再構築
./scripts/deploy.sh
```

## 📋 各スクリプトの役割

### `main.py`
- **用途**: 完全なデータベース再構築
- **内容**: テーブル作成 + YouTube APIからデータ取得 + データ挿入
- **時間**: 長い（YouTube API制限のため）
- **環境**: 自動判別（ローカル/本番）

### `app.py`
- **用途**: Flaskアプリケーション起動
- **内容**: Webサーバー起動
- **時間**: 即座
- **環境**: 自動判別（ローカル/本番）

### `scripts/local.sh`
- **用途**: ローカル開発環境の完全セットアップ
- **内容**: データベース再構築 + アプリ起動
- **時間**: 中程度

### `scripts/deploy.sh`
- **用途**: 本番環境への完全デプロイ
- **内容**: コミット + デプロイ + データベース再構築
- **時間**: 長い

## 🔧 環境自動判別システム

### **ローカル環境**
- `.env.local`ファイルが存在する場合
- 自動的にローカル設定を読み込み
- データベース: `postgresql://localhost:5432/soccer_practice_search_local`

### **本番環境**
- `.env.local`ファイルが存在しない場合
- 自動的に本番設定を読み込み
- データベース: Fly.io PostgreSQL

## 📊 新しいチャンネル構成

1. 雑誌『サッカークリニック』, web版
2. COACH UNITED編集部
3. SOLUNA Ch.
4. サッカーのみちしるべ
5. REGATEドリブル塾
6. ゲキサカ

## 🎯 従来の手動コマンド（参考）

### **ローカル開発（手動）**
```bash
# 1. データベース再構築
python main.py

# 2. アプリケーション起動
python app.py
```

### **本番更新（手動）**
```bash
# 1. デプロイ
fly deploy -a soccer-practice-search

# 2. データベース再構築
fly ssh console -a soccer-practice-search -C "python -c \"
import os
from dotenv import load_dotenv
load_dotenv('./utilities/.env', override=True)
import main
\""
```