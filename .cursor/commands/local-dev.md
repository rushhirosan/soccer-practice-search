---
description: >-
  Run the Flask app locally with typical env loading. Use when the user says
  ローカル起動 / local dev / localhost / 開発サーバー.
---

# Local development

## 最短（アプリだけ起動）

```bash
python app.py
```

ブラウザ: `http://localhost:5000`（Flask 既定ポートに従う）

## 環境変数

- ローカル優先: `utilities/.env.local`（存在すれば `main.py` 等で読み込み）
- テンプレート: リポジトリのドキュメントや `.env.example` があればそれに従う

## DB を含めた初回・再構築

PostgreSQL と `DATABASE_URL` が整っている前提:

```bash
python main.py
```

詳細は `docs/LOCAL_DEVELOPMENT.md`。

## DB 再構築 + サーバ連続実行（スクリプト）

```bash
./scripts/local.sh
```

`main.py` のあと `app.py` を起動するため、データ投入に時間がかかる場合があります。
