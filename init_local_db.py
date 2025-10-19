#!/usr/bin/env python3
"""
ローカル開発環境用のデータベース初期化スクリプト
"""

import os
import sys
from dotenv import load_dotenv

def setup_local_environment():
    """ローカル環境のセットアップ"""
    # ローカル用の.envファイルを読み込み
    env_path = os.path.join(os.path.dirname(__file__), 'utilities', '.env.local')
    load_dotenv(env_path)
    
    print("=== ローカル開発環境セットアップ ===")
    database_url = os.getenv('DATABASE_URL')
    api_key = os.getenv('API_KEY')
    
    print(f"Database URL: {database_url}")
    print(f"API Key: {'設定済み' if api_key else '未設定'}")
    
    if not database_url:
        print("エラー: DATABASE_URLが設定されていません")
        sys.exit(1)
    
    if not api_key:
        print("エラー: API_KEYが設定されていません")
        sys.exit(1)
    
    return True

if __name__ == '__main__':
    print("ローカルデータベースを初期化しています...")
    
    # 環境セットアップ
    if not setup_local_environment():
        sys.exit(1)
    
    # main.pyを実行してデータベース初期化
    print("\nデータベース初期化を実行中...")
    try:
        from main import app as main_app
        with main_app.app_context():
            print("データベース初期化完了")
    except Exception as e:
        print(f"データベース初期化エラー: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
