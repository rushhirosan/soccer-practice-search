# セキュリティインシデント分析: APIキー漏洩

## 📅 発生日時
2026年1月2日（コミット `b1670f0`）

## 🔍 原因分析

### 根本原因

1. **バックアップファイルの作成**
   - `utilities/.env.local.bak` というバックアップファイルが作成された
   - おそらく手動で `.env.local` をバックアップした際に作成

2. **.gitignoreの不備**
   - 当時の `.gitignore` には以下が含まれていた：
     - `utilities/.env`
     - `utilities/.env.local`
   - **しかし、`*.bak` や `.env*.bak` のパターンが含まれていなかった**

3. **コミット前の確認不足**
   - `git add .` や `git add -A` を使用した際に、バックアップファイルも含まれてしまった
   - `git status` で確認せずにコミットした可能性

4. **GitHub Secret Scanningの検出**
   - GitHubが自動的にAPIキーを検出
   - しかし、検出される前に既に公開リポジトリにプッシュされていた

### タイムライン

```
1. .env.local.bak ファイルが作成される
   ↓
2. git add でバックアップファイルも追加される
   ↓
3. コミット（b1670f0）でリポジトリに含まれる
   ↓
4. GitHubにプッシュ
   ↓
5. GitHub Secret Scanningが検出（3日後）
```

## 🛡️ 再発防止策

### 1. .gitignoreの強化 ✅（実施済み）

```gitignore
# 環境変数ファイル
utilities/.env
utilities/.env.local
.env*.bak
.env*.backup

# バックアップファイル全般
*.bak
*.backup
```

### 2. Git Hooksの導入（推奨）

#### pre-commitフック
コミット前に秘密情報が含まれていないかチェック

```bash
#!/bin/sh
# .git/hooks/pre-commit

# 秘密情報のパターンをチェック
if git diff --cached --name-only | grep -E '\.(env|bak|backup)$'; then
    echo "❌ エラー: 環境変数ファイルまたはバックアップファイルが含まれています"
    echo "これらのファイルはコミットしないでください"
    exit 1
fi

# APIキーのパターンをチェック
if git diff --cached | grep -E 'AIza[0-9A-Za-z_-]{35}'; then
    echo "❌ エラー: Google APIキーが検出されました"
    echo "APIキーをコミットしないでください"
    exit 1
fi
```

### 3. git-secretsの導入（推奨）

AWSが提供する `git-secrets` を使用して、コミット前に秘密情報を検出

```bash
# インストール
brew install git-secrets

# セットアップ
git secrets --install
git secrets --register-aws

# カスタムパターンの追加
git secrets --add 'AIza[0-9A-Za-z_-]{35}'  # Google API Key
git secrets --add 'sk-[0-9A-Za-z]{32,}'     # OpenAI API Key
```

### 4. コミット前チェックリスト

コミット前に必ず確認：

- [ ] `git status` で追加されるファイルを確認
- [ ] `.env` や `.bak` ファイルが含まれていないか確認
- [ ] `git diff` で変更内容を確認
- [ ] 秘密情報（APIキー、パスワードなど）が含まれていないか確認

### 5. バックアップファイルの管理方法

#### ❌ やってはいけないこと
```bash
# バックアップファイルをリポジトリ内に作成
cp .env.local .env.local.bak  # ❌
```

#### ✅ 正しい方法
```bash
# 方法1: リポジトリ外にバックアップ
cp utilities/.env.local ~/backups/env.local.$(date +%Y%m%d)

# 方法2: .gitignoreに含まれるディレクトリにバックアップ
mkdir -p .backup
cp utilities/.env.local .backup/env.local.$(date +%Y%m%d)
# .backup/ を .gitignore に追加

# 方法3: バージョン管理システムを使用（git以外）
# 例: 1Password, LastPass, AWS Secrets Manager など
```

### 6. 環境変数の管理ベストプラクティス

#### ローカル開発環境
- `.env.local` を使用（`.gitignore`に含める）
- テンプレートファイル `.env.example` を作成（秘密情報なし）

#### 本番環境
- Fly.ioのシークレット機能を使用
- 環境変数は直接設定、ファイルに保存しない

### 7. 定期的な監査

```bash
# リポジトリ内の秘密情報を検索
git log --all --full-history -p | grep -E 'AIza[0-9A-Za-z_-]{35}'

# 現在のファイル内を検索
grep -r 'AIza[0-9A-Za-z_-]{35}' . --exclude-dir=.git
```

### 8. GitHub設定の確認

- [ ] Secret Scanningが有効になっているか確認
- [ ] Dependabot alertsが有効になっているか確認
- [ ] リポジトリが公開されている場合、秘密情報の取り扱いに注意

## 📋 チェックリスト

### コミット前
- [ ] `git status` でファイルを確認
- [ ] `.env` や `.bak` ファイルが含まれていないか
- [ ] `git diff` で変更内容を確認
- [ ] 秘密情報が含まれていないか

### 定期的に
- [ ] `.gitignore` の見直し
- [ ] リポジトリ内の秘密情報の検索
- [ ] GitHub Secret Scanningアラートの確認

### インシデント発生時
- [ ] 即座にAPIキーを無効化
- [ ] Git履歴から削除
- [ ] 新しいキーを生成
- [ ] 強制プッシュ（注意が必要）
- [ ] GitHubアラートを解決済みとしてマーク

## 🔗 参考リンク

- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [git-secrets](https://github.com/awslabs/git-secrets)

