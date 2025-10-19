#!/usr/bin/env python3
"""
ローカル開発環境用の起動スクリプト
PostgreSQLを使用してローカルでアプリケーションを実行
"""

import os
import sys
from dotenv import load_dotenv

def setup_local_environment():
    """ローカル環境のセットアップ"""
    # ローカル用の.envファイルを読み込み
    env_path = os.path.join(os.path.dirname(__file__), 'utilities', '.env.local')
    load_dotenv(env_path)
    
    # 環境変数を確認
    database_url = os.getenv('DATABASE_URL')
    api_key = os.getenv('API_KEY')
    
    print("=== ローカル開発環境セットアップ ===")
    print(f"Database URL: {database_url}")
    print(f"API Key: {'設定済み' if api_key else '未設定'}")
    
    if not database_url:
        print("エラー: DATABASE_URLが設定されていません")
        sys.exit(1)
    
    if not api_key:
        print("エラー: API_KEYが設定されていません")
        sys.exit(1)
    
    return True

def run_local_app():
    """ローカルアプリケーションの実行"""
    print("\n=== ローカルアプリケーション起動 ===")
    
    # Flask アプリケーションをインポートして実行
    from app import app
    
    # ローカル開発用の設定
    app.config['DEBUG'] = True
    app.config['TESTING'] = False
    
    # ローカルで実行
    port = int(os.environ.get("PORT", 5000))
    print(f"アプリケーションを http://localhost:{port} で起動します")
    
    app.run(
        host="127.0.0.1",  # ローカルホストのみ
        port=port,
        debug=True,
        use_reloader=True
    )

def init_local_database():
    """ローカルデータベースの初期化"""
    print("\n=== ローカルデータベース初期化 ===")
    
    try:
        from main import app as main_app
        with main_app.app_context():
            # main.pyの処理を実行してデータベースを初期化
            print("データベース初期化を実行中...")
            # main.pyの処理は直接実行されるので、ここでは何もしない
            print("データベース初期化完了")
    except Exception as e:
        print(f"データベース初期化エラー: {e}")
        return False
    
    return True

if __name__ == '__main__':
    print("ローカル開発環境をセットアップしています...")
    
    # 環境セットアップ
    if not setup_local_environment():
        sys.exit(1)
    
    # データベース初期化（初回のみ）
    init_choice = input("\nデータベースを初期化しますか？ (y/n): ").lower().strip()
    if init_choice == 'y':
        if not init_local_database():
            print("データベース初期化に失敗しました")
            sys.exit(1)
    
    # アプリケーション起動
    run_local_app()
