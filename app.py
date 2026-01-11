from flask import Flask, render_template, request, jsonify, g
from flask_wtf.csrf import CSRFProtect, generate_csrf
from datetime import datetime
from utilities.db_access import get_db_connection, pool, get_channel_name_from_id
from contextlib import closing
import os
import sqlite3
import unicodedata
import logging
import psycopg2
from typing import Optional, Any
from dotenv import load_dotenv


# ロガーの設定
logging.basicConfig(
    level=logging.INFO,  # ログレベルを INFO に設定
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # 標準出力にログを表示
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
DATABASE = 'soccer_content.db'

# セキュリティ: CSRF保護の設定
# SECRET_KEYは環境変数から取得、なければランダムに生成（本番環境では必ず環境変数で設定すること）
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', os.urandom(32).hex())
app.config['WTF_CSRF_ENABLED'] = True
app.config['WTF_CSRF_TIME_LIMIT'] = 3600  # トークンの有効期限（秒）
# JSONリクエストでもCSRFトークンを検証するための設定
app.config['WTF_CSRF_HEADERS'] = ['X-CSRFToken', 'X-CSRF-Token']

# CSRF保護を有効化
csrf = CSRFProtect(app)


def convert_to_embed_url(video_url: str) -> str:
    """YouTubeの通常リンクからVIDEO_IDを抽出し、埋め込みリンクを生成する"""
    if "watch?v=" in video_url:
        video_id = video_url.split("watch?v=")[-1]
        return f"https://www.youtube.com/embed/{video_id}"
    return video_url  # 他のリンク形式の場合そのまま返す


def convert_activities(activities: list) -> list:
    """アクティビティリストのデータを変換する"""
    logger.info("Converting activities")
    result = []

    column_names = [
        "id", "title", "upload_date", "video_url", "view_count", 
        "like_count", "duration", "channel_category"
    ]  # カラム名を明示的に定義

    for activity in activities:
        # zip() を使ってタプルを辞書に変換
        activity_dict = dict(zip(column_names, activity))

        dt = activity_dict["upload_date"].rstrip("Z")
        try:
            # 日本語形式（例: "2023年11月22日11時00分"）の場合
            date_obj = datetime.strptime(dt, "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            try:
                date_obj = datetime.strptime(dt, "%Y年%m月%d日%H時%M分")
            except ValueError:
                logger.error(f"Unsupported date format: {dt}")
                continue

        # 必要に応じてフォーマットを変換して保存
        activity_dict["upload_date"] = date_obj.strftime("%Y年%m月%d日%H時%M分")
        activity_dict["video_url"] = convert_to_embed_url(activity_dict["video_url"])
        # チャンネルIDを数値に変換してからチャンネル名を取得
        try:
            channel_id = int(activity_dict["channel_category"]) if activity_dict["channel_category"] else None
            if channel_id:
                activity_dict["channel_category"] = get_channel_name_from_id(channel_id)
            else:
                activity_dict["channel_category"] = "Unknown Channel"
        except (ValueError, TypeError):
            activity_dict["channel_category"] = "Unknown Channel"

        result.append(activity_dict)

    return result


def build_query_with_filters(base_query: str, filters: dict, params: list) -> tuple[str, list]:
    """フィルタに基づいてクエリを構築する補助関数"""
    if filters.get('type_filter'):
        base_query += " AND cat.category_title = %s"
        params.append(filters['type_filter'])

    if filters.get('players_filter'):
        base_query += " AND cat.players = %s"
        params.append(filters['players_filter'])

    if filters.get('level_filter'):
        base_query += " AND cat.level = %s"
        params.append(filters['level_filter'])

    if filters.get('channel_filter'):
        # チャンネルIDで検索
        base_query += " AND cat.channel_brand_category = %s"
        params.append(filters['channel_filter'])

    return base_query, params


def get_db() -> Optional[psycopg2.extensions.connection]:
    """データベース接続を取得する"""
    try:
        return get_db_connection()
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        return None


def execute_query(query: str, params: list = None) -> list:
    """クエリを実行し、結果を返す"""
    db = get_db()
    if db is None:
        logger.error("No database connection available")
        return []

    try:
        with db.cursor() as cursor:
            cursor.execute(query, params or [])
            return cursor.fetchall()
    except Exception as e:
        logger.error(f"Error executing query: {e}")
        return []
    finally:
        # 接続はプールに返すため、ここでは閉じない
        pass


def get_total_data_by_id(q: str, ids: list) -> int:
    """IDリストに基づいて総データ数を取得"""
    if not ids:
        return 0

    # プレースホルダを作成
    placeholders = ', '.join(['%s'] * len(ids))
    q_like = f"%{q}%" if q else None

    # クエリの作成
    query = f'''
        SELECT count(*) FROM contents
        WHERE ID IN ({placeholders})
    '''

    # パラメータをidsとして設定
    params = ids

    # qが指定されている場合、LIKE句を追加
    if q:
        query += " AND title LIKE %s"
        params.append(q_like)

    try:
        result = execute_query(query, params)
        return result[0][0] if result else 0
    except Exception as e:
        logger.error(f"Error getting total data: {e}")
        return 0


def get_data_by_id(q: str, ids: list, sort: str, offset: int, limit: int = None) -> list:
    """IDリストに基づいてデータを取得"""
    if not ids:
        return []

    # セキュリティ: sortパラメータのホワイトリスト検証
    allowed_sort_columns = ['upload_date', 'view_count', 'like_count']
    if sort not in allowed_sort_columns:
        sort = 'upload_date'  # デフォルト値にフォールバック

    # PostgreSQL では %s を使う
    placeholders = ', '.join(['%s'] * len(ids))
    q_like = f"%{q}%" if q else None

    # クエリ構築
    query = f'''
        SELECT * FROM contents
        WHERE ID IN ({placeholders})
    '''
    params = ids

    if q:
        query += " AND title LIKE %s"
        params.append(q_like)

    # セキュリティ: ホワイトリスト検証済みのsortカラムのみ使用
    query += f" ORDER BY {sort} DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    # クエリ実行
    return execute_query(query, params)


def multi_search_total(q: str, filters: dict) -> int:
    """複数のフィルタ条件に基づいて総データ数を取得"""
    # JOINを使用してより適切な検索を実現
    base_query = """
        SELECT DISTINCT c.ID 
        FROM contents c
        JOIN category cat ON c.ID = cat.ID
        JOIN cid ch ON cat.channel_brand_category = ch.id
        WHERE 1=1
    """
    params = []
    base_query, params = build_query_with_filters(base_query, filters, params)

    rows = execute_query(base_query, params)
    ids = [row[0] for row in rows]
    return get_total_data_by_id(q, ids)


def multi_search(q: str, filters: dict, sort: str, offset: int, limit: int) -> list:
    """複数のフィルタ条件に基づいてデータを取得"""
    # JOINを使用してより適切な検索を実現
    base_query = """
        SELECT DISTINCT c.ID 
        FROM contents c
        JOIN category cat ON c.ID = cat.ID
        JOIN cid ch ON cat.channel_brand_category = ch.id
        WHERE 1=1
    """
    params = []
    base_query, params = build_query_with_filters(base_query, filters, params)

    rows = execute_query(base_query, params)
    ids = [row[0] for row in rows]
    return get_data_by_id(q, ids, sort, offset, limit)


@app.route('/search')
def search_activities():
    
    query = request.args.get('q', '')
    type_filter = request.args.get('type', '')
    players_filter = request.args.get('players', '')
    level_filter = request.args.get('level', '')
    channel_filter = request.args.get('channel', '')
    sort = request.args.get('sort', 'upload_date')
    
    # セキュリティ: sortパラメータのホワイトリスト検証
    allowed_sort_columns = ['upload_date', 'view_count', 'like_count']
    if sort not in allowed_sort_columns:
        sort = 'upload_date'  # デフォルト値にフォールバック
    
    # セキュリティ: limitとoffsetの値検証
    try:
        limit = int(request.args.get('limit', 10))
        limit = max(1, min(limit, 100))  # 1-100の範囲に制限
    except (ValueError, TypeError):
        limit = 10
    
    try:
        offset = int(request.args.get('offset', 0))
        offset = max(0, offset)  # 0以上に制限
    except (ValueError, TypeError):
        offset = 0

    filters = {
        'type_filter': type_filter,
        'players_filter': players_filter,
        'level_filter': level_filter,
        'channel_filter': channel_filter
    }

    conn = get_db()
    with closing(conn.cursor()) as c:  # ✅ カーソルのみ `closing` を使用
        try:
            if query:
                if not any([type_filter, players_filter, level_filter, channel_filter]):
                    query = unicodedata.normalize('NFKC', query.strip())

                    c.execute('''
                        SELECT count(*) FROM contents
                        WHERE title ILIKE %s
                    ''', ('%' + query + '%',))  # ✅ `?` → `%s` に修正 (PostgreSQL 用)

                    total = c.fetchone()[0]

                    # セキュリティ: sortパラメータは既にホワイトリスト検証済み
                    c.execute(f'''
                        SELECT * FROM contents
                        WHERE title ILIKE %s
                        ORDER BY {sort} DESC
                        LIMIT %s OFFSET %s
                    ''', ('%' + query + '%', limit, offset))

                    activities = c.fetchall()
                else:
                    total = multi_search_total(query, filters)
                    activities = multi_search(query, filters, sort, offset, limit)
            else:
                total = multi_search_total(query, filters)
                activities = multi_search(query, filters, sort, offset, limit)

        except psycopg2.Error as e:
            logger.error("Error while executing search query: %s", e)
            return jsonify({"error": "Database error"}), 500  # HTTP 500 を返す

    current_display_count = len(activities) + offset

    #conn.close()

    return jsonify({
        "activities": convert_activities(activities),
        "total": total,
        "current_display_count": current_display_count
    })


def save_feedback_to_db(feedback):
    """フィードバックデータをデータベースに保存する"""
    logger.info(f"Saving feedback: {feedback}")
    conn = get_db()
    try:
        with conn.cursor() as c:
            c.execute(
                'INSERT INTO feedback (name, email, category, message) VALUES (%s, %s, %s, %s)',
                (feedback['name'], feedback['email'], feedback['category'], feedback['message'])
            )
            conn.commit()
    except Exception as e:
        logger.error(f"Error saving feedback: {e}")
    finally:
        conn.close()


# DBからユニークな値を取得する関数
def get_unique_values(column_name):
    try:
        # セキュリティ: カラム名のホワイトリスト検証
        allowed_columns = ['category_title', 'players']
        if column_name not in allowed_columns:
            logger.error(f"Invalid column name: {column_name}")
            return []
        
        conn = get_db()
        if conn is None:
            logger.error("Database connection failed")
            return []
        
        cursor = conn.cursor()
        # セキュリティ: ホワイトリスト検証済みのカラム名のみ使用
        query = f"""
            SELECT DISTINCT {column_name} 
            FROM category 
            WHERE {column_name} IS NOT NULL AND {column_name} != ''
            ORDER BY {column_name} ASC
        """
        cursor.execute(query)
        values = [row[0] for row in cursor.fetchall()]
        cursor.close()
        logger.info(f"Retrieved {len(values)} unique values for column {column_name}")
        return values
    except Exception as e:
        logger.error(f"Error getting unique values for {column_name}: {e}")
        return []


# APIエンドポイント
@app.route("/get_unique_values/<column>")
def get_unique_values_api(column):
    if column in ["category_title", "players"]:  # 安全のため制限
        return jsonify(get_unique_values(column))
    return jsonify({"error": "Invalid column"}), 400


def get_levels():
    try:
        conn = get_db()
        if conn is None:
            logger.error("Database connection failed")
            return []
        
        with conn.cursor() as cursor:
            # より厳密な重複排除とソート
            cursor.execute("""
                SELECT DISTINCT level,
                    CASE 
                        WHEN level = '小学生以上' THEN 1
                        WHEN level = '中学生' THEN 2
                        WHEN level = '高校生' THEN 3
                        WHEN level = 'ユース' THEN 4
                        ELSE 5
                    END as sort_order
                FROM category 
                WHERE level IS NOT NULL AND level != '' 
                ORDER BY sort_order, level
            """)
            levels = [{"level": row[0]} for row in cursor.fetchall()]
            logger.info(f"Retrieved {len(levels)} unique levels")
            return levels
    except Exception as e:
        logger.error(f"Error loading level option: {e}")
        return []


# APIエンドポイント（JSONでチャネル一覧を返す）
@app.route("/get_levels")
def get_levels_api():
    return jsonify(get_levels())


def get_channels():
    try:
        conn = get_db()
        if conn is None:
            logger.error("Database connection failed")
            return []
        
        with conn.cursor() as cursor:
            # より厳密な重複排除とソート
            cursor.execute("""
                SELECT DISTINCT id, cname, clink 
                FROM cid 
                WHERE cname IS NOT NULL AND cname != '' 
                ORDER BY id
            """)
            channels = [{"id": row[0], "channel_name": row[1], "channel_link": row[2]} for row in cursor.fetchall()]
            logger.info(f"Retrieved {len(channels)} unique channels")
            return channels
    except Exception as e:
        logger.error(f"Error loading channel option: {e}")
        return []


# APIエンドポイント（JSONでチャネル一覧を返す）
@app.route("/get_channels")
def get_channels_api():
    return jsonify(get_channels())

@app.route("/debug/database-status")
def debug_database_status():
    """データベースの状態を確認するデバッグエンドポイント"""
    try:
        conn = get_db()
        if conn is None:
            return jsonify({"error": "Database connection failed"}), 500
        
        cursor = conn.cursor()
        
        # 各テーブルのレコード数を確認
        # セキュリティ: テーブル名のホワイトリスト検証
        allowed_tables = ['cid', 'contents', 'category', 'feedback']
        table_counts = {}
        
        for table in allowed_tables:
            try:
                # セキュリティ: ホワイトリスト検証済みのテーブル名のみ使用
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                table_counts[table] = count
            except Exception as e:
                table_counts[table] = f"Error: {str(e)}"
        
        # サンプルデータを取得
        sample_data = {}
        try:
            cursor.execute("SELECT cname FROM cid LIMIT 3")
            sample_data['channels'] = [row[0] for row in cursor.fetchall()]
        except Exception as e:
            sample_data['channels'] = f"Error: {str(e)}"
        
        try:
            cursor.execute("SELECT category_title FROM category LIMIT 3")
            sample_data['categories'] = [row[0] for row in cursor.fetchall()]
        except Exception as e:
            sample_data['categories'] = f"Error: {str(e)}"
        
        cursor.close()
        
        return jsonify({
            "table_counts": table_counts,
            "sample_data": sample_data,
            "database_url": "Configured" if os.getenv('DATABASE_URL') else "Not set"
        })
        
    except Exception as e:
        logger.error(f"Debug database status error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/get-csrf-token', methods=['GET'])
def get_csrf_token():
    """CSRFトークンを取得するエンドポイント"""
    return jsonify({'csrf_token': generate_csrf()})


@app.route('/submit-feedback', methods=['POST'])
def submit_feedback():
    data = request.json

    if not data:
        return jsonify({'error': 'Invalid request'}), 400

    logger.info(f"Received feedback submission: {data}")

    # セキュリティ: 入力値の検証とサニタイゼーション
    name = (data.get('name') or '').strip()[:100]  # 最大100文字
    email = (data.get('email') or '').strip()[:255]  # 最大255文字
    category = (data.get('category') or '').strip()[:50]  # 最大50文字
    message = (data.get('message') or '').strip()[:5000]  # 最大5000文字

    # 必須項目の検証
    if not message:
        return jsonify({'error': 'Message is required'}), 400

    # カテゴリのホワイトリスト検証
    allowed_categories = ['general', 'bug', 'suggestion']
    if category and category not in allowed_categories:
        category = 'general'  # デフォルト値にフォールバック

    # メールアドレスの形式検証（簡易版）
    if email and '@' not in email:
        email = ''  # 無効なメールアドレスは空文字に

    # フィードバックの詳細を抽出
    feedback_details = {
        'name': name,
        'email': email,
        'category': category,
        'message': message
    }

    # フィードバックをデータベースに保存
    save_feedback_to_db(feedback_details)

    return jsonify({'message': 'Feedback submitted successfully'}), 200


def close_db(e: Optional[Any] = None) -> None:
    """データベース接続を閉じる"""
    db = g.pop('db', None)
    if db is not None:
        try:
            pool.putconn(db)
            logger.info("Database connection returned to pool")
        except Exception as e:
            logger.error(f"Error while closing database connection: {e}")


@app.route('/')
def index():
    logger.info("Starting Flask application")
    return render_template('home.html')


@app.route('/health')
def health_check():
    """ヘルスチェック用エンドポイント"""
    return jsonify({"status": "healthy", "message": "Service is running"}), 200


@app.route('/db-stats')
def database_stats():
    """データベース統計を表示するエンドポイント"""
    try:
        conn = get_db()
        with conn.cursor() as c:
            # 存在するテーブルを確認
            c.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            tables = [row[0] for row in c.fetchall()]
            
            stats = {"tables": tables, "counts": {}}
            
            # 各テーブルの件数を取得
            # セキュリティ: テーブル名は既にinformation_schemaから取得した安全な値のみ
            for table in tables:
                try:
                    # セキュリティ: information_schemaから取得したテーブル名のみ使用
                    c.execute(f"SELECT COUNT(*) FROM {table}")
                    count = c.fetchone()[0]
                    stats["counts"][table] = count
                except Exception as e:
                    stats["counts"][table] = f"Error: {str(e)}"
            
            # 総件数を計算
            total = sum([count for count in stats["counts"].values() if isinstance(count, int)])
            stats["total"] = total
            
            return jsonify(stats), 200
    except Exception as e:
        logger.error(f"Error getting database stats: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/clear-database', methods=['POST'])
def clear_database():
    """データベースをクリアするエンドポイント"""
    try:
        db = get_db()
        if db is None:
            return jsonify({"error": "Database connection failed"}), 500

        with db.cursor() as cursor:
            # テーブルを削除（存在する場合）
            cursor.execute("DROP TABLE IF EXISTS feedback CASCADE")
            cursor.execute("DROP TABLE IF EXISTS category CASCADE")
            cursor.execute("DROP TABLE IF EXISTS contents CASCADE")
            cursor.execute("DROP TABLE IF EXISTS cid CASCADE")
            db.commit()
            
        return jsonify({"message": "Database cleared successfully"})
        
    except Exception as e:
        logger.error(f"Error clearing database: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/db-info')
def database_info():
    """データベース接続情報を表示するエンドポイント（セキュリティのため一部マスク）"""
    try:
        db_url = os.getenv('DATABASE_URL', 'Not set')
        if db_url and db_url != 'Not set':
            # セキュリティのため、ホスト名のみ表示
            if '://' in db_url:
                parts = db_url.split('://')
                if len(parts) > 1:
                    host_part = parts[1].split('@')
                    if len(host_part) > 1:
                        host = host_part[1].split('/')[0]
                        return jsonify({
                            "database_type": "PostgreSQL",
                            "host": host,
                            "connection_status": "Configured"
                        })
            return jsonify({
                "database_type": "PostgreSQL",
                "connection_status": "Configured (URL format masked)"
            })
        else:
            return jsonify({
                "database_type": "Not configured",
                "connection_status": "No DATABASE_URL found"
            })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/drop-soccer-tables', methods=['POST'])
def drop_soccer_tables():
    """soccer_practice_searchデータベースのテーブルを削除するエンドポイント"""
    try:
        db = get_db()
        if db is None:
            return jsonify({"error": "Database connection failed"}), 500

        with db.cursor() as cursor:
            # soccer_practice_searchデータベースのテーブルを削除
            cursor.execute("DROP SCHEMA IF EXISTS soccer_practice_search CASCADE")
            db.commit()
            
        return jsonify({"message": "soccer_practice_search tables dropped successfully"})
        
    except Exception as e:
        logger.error(f"Error dropping soccer tables: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/init-database', methods=['POST'])
def init_database():
    """データベースを初期化し、テーブルを作成するエンドポイント"""
    try:
        from utilities.db_access import (
            create_cid_table, create_contents_table, 
            create_category_table, create_feedback_table
        )
        
        # テーブルを作成
        create_cid_table()
        create_contents_table()
        create_category_table()
        create_feedback_table()
        
        return jsonify({"message": "Database initialized successfully"})
        
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/create-indexes', methods=['POST'])
def create_indexes_endpoint():
    """検索パフォーマンス向上のためのインデックスを作成するエンドポイント"""
    try:
        from utilities.create_indexes import (
            check_pg_trgm_extension, check_existing_indexes, create_indexes
        )
        
        conn = get_db()
        if conn is None:
            return jsonify({"error": "Database connection failed"}), 500
        
        # 既存インデックスの確認
        existing_indexes = check_existing_indexes(conn)
        
        # pg_trgm拡張機能の確認・作成
        pg_trgm_available = check_pg_trgm_extension(conn)
        
        # インデックスの作成
        created, skipped, errors = create_indexes(conn)
        
        # 作成後のインデックス確認
        final_indexes = check_existing_indexes(conn)
        
        return jsonify({
            "message": "Index creation completed",
            "pg_trgm_available": pg_trgm_available,
            "created": created,
            "skipped": skipped,
            "errors": errors,
            "existing_indexes_count": len(existing_indexes),
            "final_indexes_count": len(final_indexes)
        })
        
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


@app.route('/test-simple', methods=['GET'])
def test_simple():
    """シンプルなテストエンドポイント"""
    try:
        return jsonify({
            "status": "success",
            "message": "App is working",
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"Error in test-simple: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/test-db-connection', methods=['GET'])
def test_db_connection():
    """データベース接続テスト"""
    try:
        db = get_db()
        if db is None:
            return jsonify({"error": "No database connection"}), 500
            
        with db.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM contents")
            count = cursor.fetchone()[0]
            
        return jsonify({
            "status": "success",
            "database_connected": True,
            "contents_count": count
        })
    except Exception as e:
        logger.error(f"Error in test-db-connection: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/fetch-youtube-data', methods=['POST'])
def fetch_youtube_data():
    """YouTubeデータを取得してデータベースに挿入するエンドポイント"""
    try:
        logger.info("Starting fetch-youtube-data endpoint")
        
        # インポート
        try:
            from utilities.get_videos import get_youtube_video_data
            from utilities.db_access import insert_cid_data, insert_contents_data, insert_category_data
            logger.info("Successfully imported required modules")
        except ImportError as e:
            logger.error(f"Import error: {e}")
            return jsonify({"error": f"Import error: {e}"}), 500
        
        # チャンネルIDを取得（複数対応）
        channel_ids_str = os.getenv('CHANNEL_ID')
        logger.info(f"CHANNEL_ID from env: {channel_ids_str}")
        
        if not channel_ids_str:
            logger.error("CHANNEL_ID not set")
            return jsonify({"error": "CHANNEL_ID not set"}), 500
            
        # カンマ区切りのチャンネルIDを分割
        channel_ids = [cid.strip() for cid in channel_ids_str.split(',')]
        logger.info(f"Parsed channel IDs: {channel_ids}")
        
        # YouTubeデータを取得
        api_keys = os.getenv('API_KEYS', '').split(',')  # カンマ区切りで複数のAPIキー
        if not api_keys or api_keys[0] == '':
            api_key = os.getenv('API_KEY')  # 単一のAPIキー（後方互換性）
            api_keys = [api_key] if api_key else []
        
        if not api_keys:
            logger.error("No API keys available")
            return jsonify({"error": "No API keys available"}), 500
            
        logger.info(f"Available API keys: {len(api_keys)}")
            
        all_videos = []
        total_videos = 0
        processed_channels = 0
        current_api_key_index = 0
        
        for i, channel_id in enumerate(channel_ids):
            logger.info(f"Processing channel {i+1}/{len(channel_ids)}: {channel_id}")
                
            try:
                # 各チャンネルからデータを取得
                videos = get_youtube_video_data(channel_id, api_keys[current_api_key_index])
                logger.info(f"Retrieved {len(videos) if videos else 0} videos from channel {channel_id}")
            except Exception as e:
                logger.error(f"Error getting videos from channel {channel_id}: {e}")
                continue
            
            if videos:
                all_videos.extend(videos)
                total_videos += len(videos)
                
                try:
                    # チャンネル情報を挿入（実際のチャンネル名を取得）
                    from utilities.get_channel_id import get_channel_details
                    channel_name = get_channel_details(channel_id, api_keys[current_api_key_index])
                    if channel_name == "N/A":
                        channel_name = f"サッカーチャンネル{i+1}"  # フォールバック
                    channel_link = f"https://www.youtube.com/channel/{channel_id}"
                    insert_cid_data(channel_id, channel_name, channel_link)
                    logger.info(f"Inserted channel data for {channel_id} with name: {channel_name}")
                    
                    # 動画データを挿入
                    insert_contents_data(videos, i+1)  # channel_category = i+1
                    logger.info(f"Inserted {len(videos)} videos to contents table")
                    
                                                # カテゴリデータを挿入（main.pyと同じ処理）
                    from utilities.update_category_db import update_category
                    from utilities.db_access import search_content_table, create_category_table
                    
                    # カテゴリテーブルを作成
                    create_category_table()
                    
                    # contentsテーブルからデータを取得
                    contents = search_content_table()
                    
                    # update_category関数でカテゴリを自動判定
                    contents_data = update_category(contents)
                    
                    # カテゴリデータを挿入
                    insert_category_data(contents_data, i+1)
                    logger.info(f"Inserted category data for {len(videos)} videos")
                    
                    processed_channels += 1
                    logger.info(f"Successfully processed channel {channel_id} with {len(videos)} videos")
                except Exception as e:
                    logger.error(f"Error inserting data for channel {channel_id}: {e}")
                    continue
            else:
                logger.warning(f"No videos found for channel {channel_id}")
        
        videos = all_videos  # 後続の処理のために設定
        
        if not videos:
            return jsonify({"error": "No videos found"}), 500
        
        logger.info(f"Processing completed. Processed {processed_channels} channels with {len(videos)} total videos")
        
        return jsonify({
            "message": f"Successfully processed {processed_channels} channels with {len(videos)} videos",
            "count": len(videos),
            "channels_processed": processed_channels
        })
        
    except Exception as e:
        logger.error(f"Error fetching YouTube data: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


@app.route('/debug-youtube', methods=['GET'])
def debug_youtube():
    """YouTube API接続をテストするデバッグエンドポイント"""
    try:
        from utilities.get_videos import fetch_videos_from_channel, fetch_video_details
        
        # 環境変数を取得
        api_key = os.getenv('API_KEY')
        channel_id = os.getenv('CHANNEL_ID')
        
        if not api_key:
            return jsonify({"error": "API_KEY not set"}), 500
            
        if not channel_id:
            return jsonify({"error": "CHANNEL_ID not set"}), 500
            
        # チャンネルIDを分割
        channel_ids = [cid.strip() for cid in channel_id.split(',')]
        
        # 最初のチャンネルでテスト
        test_channel_id = channel_ids[0]
        channel_data = fetch_videos_from_channel(test_channel_id, api_key)
        
        if not channel_data:
                    return jsonify({
            "error": "No channel data returned",
            "api_key": api_key[:10] + "..." if api_key else None,
            "test_channel_id": test_channel_id,
            "all_channel_ids": channel_ids
        }), 500
            
        # 動画数を確認
        items = channel_data.get('items', [])
        video_count = len(items)
        
        # 最初の動画の詳細を取得（テスト用）
        if items:
            first_video_id = items[0]['id']['videoId']
            details = fetch_video_details([first_video_id], api_key)
            
            return jsonify({
                "status": "success",
                "test_channel_id": test_channel_id,
                "all_channel_ids": channel_ids,
                "video_count": video_count,
                "first_video": {
                    "id": first_video_id,
                    "title": items[0]['snippet']['title'],
                    "details": details[0] if details else None
                },
                "channel_data_keys": list(channel_data.keys())
            })
        else:
                    return jsonify({
            "error": "No videos found in channel",
            "test_channel_id": test_channel_id,
            "all_channel_ids": channel_ids,
            "channel_data_keys": list(channel_data.keys())
        }), 500
            
    except Exception as e:
        logger.error(f"Error in debug_youtube: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/table-structure/<table_name>', methods=['GET'])
def get_table_structure(table_name):
    """テーブルの構造を確認"""
    try:
        from utilities.db_access import get_db_connection
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # テーブルの構造を取得
        cursor.execute("""
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = %s
            ORDER BY ordinal_position
        """, (table_name,))
        
        columns = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return jsonify({
            "table_name": table_name,
            "columns": [{"name": col[0], "type": col[1], "nullable": col[2]} for col in columns]
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/update-channel-names', methods=['POST'])
def update_channel_names():
    """既存のチャンネル名を実際のYouTubeチャンネル名で更新"""
    try:
        from utilities.get_channel_id import get_channel_details
        from utilities.db_access import get_db_connection
        
        api_key = os.getenv('API_KEY')
        if not api_key:
            return jsonify({"error": "API key not set"}), 500
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 現在のチャンネル情報を取得
        cursor.execute("SELECT cid FROM cid")
        channels = cursor.fetchall()
        
        updated_count = 0
        errors = []
        
        for (channel_id,) in channels:
            try:
                # 実際のチャンネル名を取得
                channel_name = get_channel_details(channel_id, api_key)
                
                if channel_name != "N/A":
                    # チャンネル名を更新（cnameカラムを使用）
                    cursor.execute(
                        "UPDATE cid SET cname = %s WHERE cid = %s",
                        (channel_name, channel_id)
                    )
                    updated_count += 1
                    logger.info(f"Updated channel {channel_id} to: {channel_name}")
                else:
                    errors.append(f"Could not get name for channel {channel_id}")
                    
            except Exception as e:
                errors.append(f"Error updating {channel_id}: {str(e)}")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({
            "success": True,
            "updated_count": updated_count,
            "errors": errors
        })
        
    except Exception as e:
        logger.error(f"Error updating channel names: {e}")
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


@app.route('/update-channel-names-manual', methods=['POST'])
def update_channel_names_manual():
    """手動でチャンネル名を更新（.envファイルの情報を使用）"""
    try:
        from utilities.db_access import get_db_connection
        
        # .envファイルの情報に基づくチャンネル名マッピング
        channel_names = {
            'UCbOAexGZEFnMfgQZAomSrHQ': '雑誌『サッカークリニック』, web版 (『サックリ』)',
            'UCjDIumxHAYlytjbTKXRSicA': 'COACH UNITED編集部',
            'UCRwozhdOYYgp2v_UtuRjIbg': 'ゲキサカ',
            'UC_WCtGlbSkJVg3bgxOPja5g': 'サカサポChannel',
            'UC4Nrt3aTTnjVAW_ein2nTQQ': 'REGATEドリブル塾',
            'UCg2c6yQb47SSeKbg1n9HSOg': 'KSS SOCCER SCHOOL',
            'UCuC6lqWJeqBa0I4C4KDgRdw': 'サカイク編集部',
            'UC4V5lKucWAYx5m41wfO5s4A': 'Footy14Skills',
            'UCq3OMmpMGUFCgTm0UFCtAFQ': 'イースリーショップ'
        }
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        updated_count = 0
        errors = []
        
        for channel_id, channel_name in channel_names.items():
            try:
                # チャンネル名を更新
                cursor.execute(
                    "UPDATE cid SET cname = %s WHERE cid = %s",
                    (channel_name, channel_id)
                )
                if cursor.rowcount > 0:
                    updated_count += 1
                    logger.info(f"Updated channel {channel_id} to: {channel_name}")
                else:
                    errors.append(f"Channel {channel_id} not found in database")
                    
            except Exception as e:
                errors.append(f"Error updating {channel_id}: {str(e)}")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({
            "success": True,
            "updated_count": updated_count,
            "errors": errors
        })
        
    except Exception as e:
        logger.error(f"Error updating channel names manually: {e}")
        import traceback
        return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500


# アプリケーションコンテキストが終了したときに接続を閉じる
app.teardown_appcontext(close_db)




@app.route('/robots.txt')
def robots():
    """robots.txtを生成"""
    from flask import make_response
    
    robots_txt = '''User-agent: *
Allow: /

# Sitemap
Sitemap: https://soccer-practice-search.fly.dev/sitemap.xml

# Crawl-delay
Crawl-delay: 1'''
    
    response = make_response(robots_txt)
    response.headers['Content-Type'] = 'text/plain'
    return response

@app.route('/privacy')
def privacy():
    """プライバシーポリシーページ"""
    return render_template('privacy.html')

@app.route('/about')
def about():
    """このサイトについてページ"""
    return render_template('about.html')

@app.route('/google-search-console.html')
def google_search_console():
    """Google Search Console所有権確認ページ"""
    return render_template('google-search-console.html')

@app.route('/sitemap.xml')
def sitemap():
    """サイトマップを生成"""
    from flask import make_response
    
    # 現在の日時を取得
    current_time = datetime.now().strftime('%Y-%m-%d')
    
    # サイトマップのXMLを生成
    sitemap_xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://soccer-practice-search.fly.dev/</loc>
        <lastmod>{current_time}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>1.0</priority>
    </url>
    <url>
        <loc>https://soccer-practice-search.fly.dev/#search</loc>
        <lastmod>{current_time}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.9</priority>
    </url>
    <url>
        <loc>https://soccer-practice-search.fly.dev/about</loc>
        <lastmod>{current_time}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.7</priority>
    </url>
    <url>
        <loc>https://soccer-practice-search.fly.dev/privacy</loc>
        <lastmod>{current_time}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.5</priority>
    </url>
</urlset>'''
    
    response = make_response(sitemap_xml)
    response.headers['Content-Type'] = 'application/xml'
    return response


if __name__ == '__main__':
    # 環境自動判別システム
    if os.path.exists("./utilities/.env.local"):
        load_dotenv("./utilities/.env.local")
        logger.info("ローカル開発環境の設定を読み込みました")
    else:
        load_dotenv("./utilities/.env")
        logger.info("本番環境の設定を読み込みました")
    
    port = int(os.environ.get("PORT", 5000))  # PORT環境変数を使用、無ければ5000
    app.run(host="0.0.0.0", port=port, debug=True)  # 0.0.0.0で外部アクセスを許可