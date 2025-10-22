# YouTube チャンネル動画検索サイト

このプロジェクトは、特定の YouTube チャンネルのサッカー関係の動画を取得し、ウェブサイト上で検索・閲覧できるアプリケーションです。ユーザーはキーワードや選択肢で動画を検索し、詳細情報を閲覧することができます。

## 概要

- **機能**:
  - 特定の YouTube チャンネルから動画情報を取得
  - 動画タイトル、説明、公開日、再生回数などの詳細情報を表示
  - 検索バーを用いた動画のキーワード検索
  - 動画のサムネイル画像の表示
  - 動画ページへのリンク提供

## 必要な環境

- Python 3.8 以上
- Flask
- google-api-python-client
- その他必要なパッケージは `requirements.txt` を参照してください。

## インストール手順

1. **リポジトリのクローン**

   ```bash
   git clone https://github.com/yourusername/soccer-content-search.git
   cd soccer-content-search
   ```

2. **依存関係のインストール**

   ```bash
   pip install -r requirements.txt
   ```

3. **環境変数の設定**

   `utilities/.env` ファイルを作成し、以下の環境変数を設定してください：

   ```env
   API_KEY=your_youtube_api_key
   CHANNEL_ID=your_channel_id
   CHANNEL_LINK=your_channel_link
   DATABASE_URL=your_database_url
   ```

4. **データベースの初期化**

   ```bash
   python main.py
   ```

5. **アプリケーションの起動**

   ```bash
   python app.py
   ```

## Fly.io へのデプロイ

このアプリケーションは Fly.io にデプロイできます。

### 前提条件

1. **Fly.io CLI のインストール**

   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Fly.io へのログイン**

   ```bash
   fly auth login
   ```

### デプロイ手順

1. **自動デプロイ（推奨）**

   ```bash
   ./deploy.sh
   ```

   このスクリプトは以下を自動で実行します：
   - Fly.io アプリケーションの作成
   - PostgreSQL データベースの作成
   - 環境変数の設定
   - アプリケーションのデプロイ

2. **手動デプロイ**

   ```bash
   # アプリケーションの作成
   fly apps create soccer-practice-search

   # PostgreSQL データベースの作成
   fly postgres create soccer-practice-db --region nrt
   fly postgres attach soccer-practice-db --app soccer-practice-search

   # 環境変数の設定
   fly secrets set DATABASE_URL="your_database_url"

   # デプロイ
   fly deploy
   ```

### デプロイ後の確認

デプロイが完了すると、以下のURLでアプリケーションにアクセスできます：

```
https://soccer-practice-search.fly.dev
```

### ヘルスチェック

アプリケーションの状態は以下のエンドポイントで確認できます：

```
https://soccer-practice-search.fly.dev/health
```

## 🚀 データベース更新フロー

### **ローカル環境でのデータ更新**

```bash
# ワンコマンドでローカル環境構築 + アプリ起動
./scripts/local.sh
```

**手動での更新（参考）**
```bash
# 1. データベース再構築
python main.py

# 2. アプリケーション起動
python app.py
```

### **本番環境でのデータ更新**

```bash
# ワンコマンドでデプロイ + データベース再構築
./scripts/deploy.sh
```

**手動での更新（参考）**
```bash
# 1. デプロイ
fly deploy -a soccer-practice-search

# 2. データベース再構築
fly ssh console -a soccer-practice-search -C "python main.py"
```

## 🔧 環境自動判別システム

### **ローカル環境**
- `.env.local`ファイルが存在する場合
- 自動的にローカル設定を読み込み
- データベース: `postgresql://localhost:5432/soccer_practice_search_local`

### **本番環境**
- `.env.local`ファイルが存在しない場合
- 自動的に本番設定を読み込み
- データベース: Fly.io PostgreSQL

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

## 技術スタック

- **バックエンド**: Flask (Python)
- **データベース**: PostgreSQL
- **デプロイ**: Fly.io
- **コンテナ**: Docker
- **プロセス管理**: Gunicorn

## ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。

## フォルダ構成

soccer_practice_search/
├── app.py                    # メインアプリケーション
├── main.py                   # データベース初期化
├── requirements.txt          # 依存関係
├── README.md                 # プロジェクト説明
├── todo.md                   # 開発メモ
├── Dockerfile                # Docker設定（デプロイ用）
├── fly.toml                  # Fly.io設定（デプロイ用）
├── docs/                     # 📁 ドキュメント
│   └── LOCAL_DEVELOPMENT.md
├── scripts/                  # 📁 スクリプト
│   ├── deploy.sh             # 本番デプロイスクリプト
│   └── local.sh              # ローカル開発スクリプト
├── config/                   # 📁 設定ファイル
│   ├── Dockerfile            # Docker設定（テンプレート）
│   ├── fly.toml              # Fly.io設定（テンプレート）
│   ├── Procfile              # プロセス設定
│   └── deploy.sh             # デプロイスクリプト（テンプレート）
├── static/                   # 静的ファイル
│   ├── favicon.ico
│   ├── scripts.js
│   ├── soccer-og-image.jpg
│   └── styles.css
├── templates/                # HTMLテンプレート
│   ├── home.html
│   └── privacy.html
├── tests/                    # テストファイル
│   ├── __init__.py
│   └── test_get_videos.py
└── utilities/                # ユーティリティ
    ├── __init__.py
    ├── db_access.py
    ├── get_channel_id.py
    ├── get_videos.py
    └── update_category_db.py