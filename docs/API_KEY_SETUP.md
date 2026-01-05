# APIキー設定ガイド

## ✅ 本番環境（Fly.io）

新しいAPIキーは既にFly.ioのシークレットとして設定済みです。

確認方法:
```bash
flyctl secrets list -a soccer-practice-search
```

## 📝 ローカル開発環境

ローカル開発環境で使用する場合は、以下の手順で設定してください。

### 1. .env.localファイルの作成

```bash
# utilities/.env.example をコピー（存在する場合）
# または、手動で作成
touch utilities/.env.local
```

### 2. 環境変数の設定

`utilities/.env.local` ファイルに以下を記述してください：

```bash
# Google YouTube Data API Key
API_KEY=your_api_key_here

# データベース接続URL（ローカルPostgreSQL）
DATABASE_URL=postgresql://localhost:5432/soccer_practice_search_local

# YouTube チャンネルID（カンマ区切り）
CHANNEL_ID=UCbOAexGZEFnMfgQZAomSrHQ,UCjDIumxHAYlytjbTKXRSicA,UC4Nrt3aTTnjVAW_ein2nTQQ,UCHHHsRNfUopr6fcFaQbhqHQ,UCinpZCQt_IPjmOOnABQp96w,UCRwozhdOYYgp2v_UtuRjIbg

# YouTube チャンネルリンク（カンマ区切り）
CHANNEL_LINK=https://www.youtube.com/@web7560,https://www.youtube.com/@coachunited5580,https://www.youtube.com/@REGATE,https://www.youtube.com/@SOLUNA-FOOTBALL,https://www.youtube.com/@%E3%82%B5%E3%83%83%E3%82%AB%E3%83%BC%E3%81%AE%E3%81%BF%E3%81%A1%E3%81%97%E3%82%8B%E3%81%B9,https://www.youtube.com/@gekisakafc

# CSRF保護用のシークレットキー（任意のランダムな文字列）
SECRET_KEY=your_local_secret_key_here
```

### 3. 確認

`.gitignore` に `utilities/.env.local` が含まれていることを確認してください。

```bash
grep "\.env\.local" .gitignore
```

## 🔒 セキュリティ注意事項

1. **`.env.local` ファイルは絶対にコミットしない**
   - `.gitignore` に含まれていることを確認
   - `git status` で表示されないことを確認

2. **バックアップファイルを作成しない**
   - `.env.local.bak` などのファイルは作成しない
   - 必要に応じて、リポジトリ外にバックアップ

3. **APIキーをコードに直接書かない**
   - 環境変数として管理
   - ハードコードしない

## 🔄 APIキーの更新方法

### 本番環境（Fly.io）

```bash
flyctl secrets set API_KEY=新しいAPIキー -a soccer-practice-search
```

### ローカル環境

`utilities/.env.local` ファイルを編集して、`API_KEY` の値を更新してください。

## 📋 チェックリスト

- [x] Fly.ioのシークレットに新しいAPIキーを設定
- [ ] ローカル環境の `.env.local` に新しいAPIキーを設定（必要に応じて）
- [ ] `.gitignore` に `.env.local` が含まれていることを確認
- [ ] `git status` で `.env.local` が表示されないことを確認

