"""
データベースインデックス作成・最適化スクリプト

検索クエリのパフォーマンス向上のため、必要なインデックスを作成します。
"""
import sys
import os
from pathlib import Path

# プロジェクトルートをパスに追加
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import logging
from utilities.db_access import get_db_connection, load_environment

# ロガーの設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)


def check_pg_trgm_extension(conn):
    """pg_trgm拡張機能が有効か確認し、なければ作成"""
    try:
        with conn.cursor() as cursor:
            # 拡張機能の存在確認
            cursor.execute("""
                SELECT EXISTS(
                    SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
                )
            """)
            exists = cursor.fetchone()[0]
            
            if not exists:
                logger.info("pg_trgm拡張機能を作成中...")
                cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
                conn.commit()
                logger.info("✅ pg_trgm拡張機能を作成しました")
            else:
                logger.info("✅ pg_trgm拡張機能は既に存在します")
            return True
    except Exception as e:
        logger.error(f"pg_trgm拡張機能の確認/作成に失敗: {e}")
        return False


def check_existing_indexes(conn):
    """既存のインデックスを確認"""
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    tablename,
                    indexname,
                    indexdef
                FROM pg_indexes
                WHERE schemaname = 'public'
                AND tablename IN ('contents', 'category', 'cid')
                ORDER BY tablename, indexname
            """)
            indexes = cursor.fetchall()
            
            logger.info("=== 既存のインデックス ===")
            if indexes:
                for table, index, definition in indexes:
                    logger.info(f"  {table}.{index}: {definition}")
            else:
                logger.info("  インデックスが見つかりませんでした")
            logger.info("")
            
            return indexes
    except Exception as e:
        logger.error(f"既存インデックスの確認に失敗: {e}")
        return []


def create_indexes(conn):
    """検索パフォーマンス向上のためのインデックスを作成"""
    indexes_to_create = [
        # 1. contents.title の ILIKE検索用（pg_trgm GINインデックス）
        {
            "name": "idx_contents_title_gin",
            "table": "contents",
            "query": """
                CREATE INDEX IF NOT EXISTS idx_contents_title_gin 
                ON contents USING gin (title gin_trgm_ops)
            """,
            "description": "contents.title の ILIKE検索高速化"
        },
        # 2. contents.upload_date のソート用
        {
            "name": "idx_contents_upload_date",
            "table": "contents",
            "query": """
                CREATE INDEX IF NOT EXISTS idx_contents_upload_date 
                ON contents (upload_date DESC)
            """,
            "description": "contents.upload_date のソート高速化"
        },
        # 3. contents.channel_category のフィルタリング用
        {
            "name": "idx_contents_channel_category",
            "table": "contents",
            "query": """
                CREATE INDEX IF NOT EXISTS idx_contents_channel_category 
                ON contents (channel_category)
            """,
            "description": "contents.channel_category のフィルタリング高速化"
        },
        # 4. category.category_title のフィルタリング用
        {
            "name": "idx_category_category_title",
            "table": "category",
            "query": """
                CREATE INDEX IF NOT EXISTS idx_category_category_title 
                ON category (category_title)
            """,
            "description": "category.category_title のフィルタリング高速化"
        },
        # 5. category.players のフィルタリング用
        {
            "name": "idx_category_players",
            "table": "category",
            "query": """
                CREATE INDEX IF NOT EXISTS idx_category_players 
                ON category (players)
            """,
            "description": "category.players のフィルタリング高速化"
        },
        # 6. category.level のフィルタリング用
        {
            "name": "idx_category_level",
            "table": "category",
            "query": """
                CREATE INDEX IF NOT EXISTS idx_category_level 
                ON category (level)
            """,
            "description": "category.level のフィルタリング高速化"
        },
        # 7. category.channel_brand_category のJOIN/フィルタリング用
        # （FOREIGN KEYがある場合、自動的にインデックスが作成される可能性があるが、明示的に作成）
        {
            "name": "idx_category_channel_brand_category",
            "table": "category",
            "query": """
                CREATE INDEX IF NOT EXISTS idx_category_channel_brand_category 
                ON category (channel_brand_category)
            """,
            "description": "category.channel_brand_category のJOIN/フィルタリング高速化"
        },
        # 8. 複合インデックス: category の複数フィルタ同時使用時
        {
            "name": "idx_category_filters_composite",
            "table": "category",
            "query": """
                CREATE INDEX IF NOT EXISTS idx_category_filters_composite 
                ON category (category_title, players, level, channel_brand_category)
            """,
            "description": "category の複数フィルタ同時使用時の高速化"
        },
    ]
    
    created_count = 0
    skipped_count = 0
    error_count = 0
    
    logger.info("=== インデックス作成開始 ===")
    
    for idx_info in indexes_to_create:
        try:
            with conn.cursor() as cursor:
                # インデックスが既に存在するか確認
                cursor.execute("""
                    SELECT EXISTS(
                        SELECT 1 FROM pg_indexes 
                        WHERE schemaname = 'public' 
                        AND indexname = %s
                    )
                """, (idx_info["name"],))
                exists = cursor.fetchone()[0]
                
                if exists:
                    logger.info(f"⏭️  スキップ: {idx_info['name']} (既に存在)")
                    skipped_count += 1
                else:
                    logger.info(f"📝 作成中: {idx_info['name']} - {idx_info['description']}")
                    cursor.execute(idx_info["query"])
                    conn.commit()
                    logger.info(f"✅ 作成完了: {idx_info['name']}")
                    created_count += 1
        except Exception as e:
            logger.error(f"❌ エラー: {idx_info['name']} の作成に失敗: {e}")
            error_count += 1
            conn.rollback()
    
    logger.info("")
    logger.info("=== インデックス作成結果 ===")
    logger.info(f"  作成: {created_count}個")
    logger.info(f"  スキップ: {skipped_count}個")
    logger.info(f"  エラー: {error_count}個")
    
    return created_count, skipped_count, error_count


def analyze_query_performance(conn):
    """クエリパフォーマンスを分析（EXPLAIN ANALYZE）"""
    logger.info("")
    logger.info("=== クエリパフォーマンス分析 ===")
    
    test_queries = [
        {
            "name": "タイトル検索（ILIKE）",
            "query": """
                EXPLAIN ANALYZE
                SELECT * FROM contents
                WHERE title ILIKE '%パス%'
                ORDER BY upload_date DESC
                LIMIT 10
            """
        },
        {
            "name": "フィルタリング検索（JOIN）",
            "query": """
                EXPLAIN ANALYZE
                SELECT DISTINCT c.ID 
                FROM contents c
                JOIN category cat ON c.ID = cat.ID
                JOIN cid ch ON cat.channel_brand_category = ch.id
                WHERE cat.category_title = 'パス'
                LIMIT 10
            """
        }
    ]
    
    for test in test_queries:
        try:
            logger.info(f"\n--- {test['name']} ---")
            with conn.cursor() as cursor:
                cursor.execute(test["query"])
                result = cursor.fetchall()
                for row in result:
                    logger.info(f"  {row[0]}")
        except Exception as e:
            logger.error(f"  分析エラー: {e}")


def main():
    """メイン処理"""
    logger.info("🚀 データベースインデックス最適化を開始します...")
    
    # 環境変数の読み込み
    load_environment()
    
    try:
        conn = get_db_connection()
        if conn is None:
            logger.error("❌ データベース接続に失敗しました")
            return
        
        logger.info("✅ データベース接続成功")
        
        # 1. 既存インデックスの確認
        check_existing_indexes(conn)
        
        # 2. pg_trgm拡張機能の確認・作成
        if not check_pg_trgm_extension(conn):
            logger.warning("⚠️  pg_trgm拡張機能が使用できません。タイトル検索のインデックスは作成されません。")
        
        # 3. インデックスの作成
        created, skipped, errors = create_indexes(conn)
        
        # 4. 作成後のインデックス確認
        logger.info("")
        logger.info("=== 作成後のインデックス一覧 ===")
        check_existing_indexes(conn)
        
        # 5. クエリパフォーマンス分析（オプション）
        # analyze_query_performance(conn)
        
        conn.close()
        logger.info("")
        logger.info("✅ インデックス最適化が完了しました！")
        
    except Exception as e:
        logger.error(f"❌ エラーが発生しました: {e}")
        import traceback
        logger.error(traceback.format_exc())


if __name__ == "__main__":
    main()

