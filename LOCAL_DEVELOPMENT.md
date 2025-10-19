# ローカル開発環境セットアップ

このドキュメントでは、ローカル開発環境でPostgreSQLを使用してアプリケーションを実行する方法を説明します。

## 前提条件

- Python 3.8以上
- PostgreSQL（インストール済み）
- 必要なPythonパッケージ（requirements.txtからインストール）

## セットアップ手順

### 1. データベースの作成

```bash
# PostgreSQLデータベースを作成
createdb soccer_practice_search_local
```

### 2. 依存関係のインストール

```bash
# 仮想環境をアクティベート（既に作成済みの場合）
source venv/bin/activate

# 依存関係をインストール
pip install -r requirements.txt
```

### 3. ローカル環境設定

`utilities/.env.local`ファイルが既に作成されています。このファイルには以下が設定されています：

- ローカルPostgreSQLデータベースの接続情報
- API キー（本番環境と同じ）
- チャンネル情報（本番環境と同じ）

### 4. データベース初期化

初回のみ、データベースを初期化する必要があります：

```bash
# 方法1: 専用スクリプトを使用
python init_local_db.py

# 方法2: main.pyを直接実行
python main.py
```

### 5. アプリケーションの起動

```bash
# 方法1: 専用スクリプトを使用（推奨）
python run_local.py

# 方法2: app.pyを直接実行
python app.py
```

## 使用方法

### ローカル開発環境での動作確認

1. **アプリケーション起動**
   ```bash
   python run_local.py
   ```

2. **ブラウザでアクセス**
   ```
   http://localhost:5000
   ```

3. **データベースリセット**（必要に応じて）
   ```bash
   python reset_env.py
   ```

### 本番環境との切り替え

- **ローカル環境**: `utilities/.env.local`ファイルが存在する場合、自動的にローカル設定を使用
- **本番環境**: `utilities/.env.local`ファイルを削除または名前を変更すると、本番設定（`utilities/.env`）を使用

## トラブルシューティング

### データベース接続エラー

```bash
# PostgreSQLが起動しているか確認
brew services list | grep postgresql
# または
pg_ctl status

# データベースが存在するか確認
psql -l | grep soccer_practice_search_local
```

### ポートが使用中の場合

```bash
# ポート5000が使用中の場合、別のポートを指定
export PORT=5001
python run_local.py
```

### 環境変数の確認

```bash
# 現在の環境変数を確認
python -c "
from dotenv import load_dotenv
import os
load_dotenv('./utilities/.env.local')
print('DATABASE_URL:', os.getenv('DATABASE_URL'))
print('API_KEY:', '設定済み' if os.getenv('API_KEY') else '未設定')
"
```

## ファイル構成

- `utilities/.env.local` - ローカル開発環境用設定
- `run_local.py` - ローカル開発環境用起動スクリプト
- `init_local_db.py` - ローカルデータベース初期化スクリプト
- `LOCAL_DEVELOPMENT.md` - このドキュメント

## 注意事項

- ローカル環境では本番環境とは別のデータベースを使用します
- API キーは本番環境と同じものを使用していますが、必要に応じて別のキーを設定できます
- ローカル環境での変更は本番環境には影響しません
