from contextlib import closing
from collections import defaultdict
from dotenv import load_dotenv
from flask import g
from psycopg2.pool import SimpleConnectionPool
from contextlib import contextmanager
from typing import Optional, List, Dict, Any, Generator, Union

import sqlite3
import psycopg2
import logging
import pandas as pd
import os

# データベースに接続し、コンテキストマネージャを使って自動で接続を閉じる
#DATABASE_PATH = './soccer_content.db'
#file_path = "../misc/youtube_video_data.csv"

# TABLES
# contents, category, feedback, cid

# TO .env
def load_environment():
    """環境変数を読み込む関数"""
    # 環境自動判別システム
    # 本番環境では環境変数が既に設定されているので、.envファイルの読み込みを優先
    if os.getenv('FLY_APP_NAME') or os.getenv('DATABASE_URL', '').startswith('postgresql://soccer_user'):
        # 本番環境
        load_dotenv("./utilities/.env", override=True)
    elif os.path.exists("./utilities/.env.local"):
        # ローカル開発環境
        load_dotenv("./utilities/.env.local", override=True)
    elif os.path.exists(".env.local"):
        load_dotenv(".env.local", override=True)
    elif os.path.exists("../utilities/.env.local"):
        load_dotenv("../utilities/.env.local", override=True)
    else:
        load_dotenv(override=True)

# 環境変数の読み込みは遅延初期化で行う

# データベース接続情報を環境変数から取得
# DATABASE_CONFIG = {
#     'dbname': os.getenv('DB_NAME'),
#     'user': os.getenv('DB_USER'),
#     'password': os.getenv('DB_PASSWORD'),
#     'host': os.getenv('DB_HOST'),
#     'port': os.getenv('DB_PORT', '5432'),
# }

def get_database_url():
    """データベースURLを取得"""
    # 環境変数を読み込み
    load_environment()
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise ValueError("DATABASE_URL is not set!")
    return database_url

# DATABASE_URLは遅延初期化
DATABASE_URL = None

# ロガーの設定
logging.basicConfig(
    level=logging.INFO,  # ログレベルを INFO に設定
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # 標準出力にログを表示
    ]
)
logger = logging.getLogger(__name__)


#pool = SimpleConnectionPool(1, 10, **DATABASE_CONFIG)  # 最小1、最大10の接続プール

# プールは遅延初期化
pool = None

def get_pool():
    """接続プールを取得（遅延初期化）"""
    global pool
    if pool is None:
        database_url = get_database_url()
        pool = SimpleConnectionPool(1, 10, dsn=database_url)
    return pool


def get_db_connection() -> psycopg2.extensions.connection:
    """新しい接続を毎回作成（プールを使わない）"""
    database_url = get_database_url()
    conn = psycopg2.connect(database_url)
    logger.info("New database connection created")
    return conn



@contextmanager
def use_db_connection() -> Generator[psycopg2.extensions.connection, None, None]:
    """接続の管理を安全に行うコンテキストマネージャ"""
    conn = get_db_connection()
    try:
        yield conn
    finally:
        try:
            conn.close()
            logger.info("Database connection closed")
        except Exception as e:
            logger.error(f"Error closing connection: {e}")

# def get_db_connection():
#     """データベース接続を取得"""
#     logger.info("Establishing database connection...")
#     return psycopg2.connect(**DATABASE_CONFIG)
#     #return sqlite3.connect(DATABASE_PATH)


def delete_table(tbl_name: str) -> None:
    """テーブルを削除して、データを削除"""
    logger.info(f"Deleting data and dropping {tbl_name} table if it exists...")
    with use_db_connection() as conn:
        with conn.cursor() as c:
            try:
                c.execute(f"DROP TABLE IF EXISTS {tbl_name} CASCADE")
                conn.commit()
                logger.info(f"{tbl_name} table deleted successfully.")
            except psycopg2.Error as e:
                logger.error("Error while deleting table: %s", e)
                conn.rollback()


def create_table(query: str) -> None:
    """テーブル作成の汎用関数"""
    logger.info("Creating table...")
    with use_db_connection() as conn:
        with conn.cursor() as c:
            try:
                c.execute(query)
                conn.commit()
                logger.info("Table created successfully.")
            except psycopg2.Error as e: # sqlite3.Error < for sqlite
                logger.error("Error while creating table: %s", e)
                conn.rollback()


def create_cid_table() -> None:
    """`cid`テーブルを作成"""
    logger.info("Creating 'cid' table...")
    query = '''
        CREATE TABLE IF NOT EXISTS cid (
            id SERIAL PRIMARY KEY,
            cid TEXT UNIQUE,
            cname TEXT,
            clink TEXT
        )
    '''
    create_table(query)
    # id INTEGER PRIMARY KEY AUTOINCREMENT, <- for sqlite


def create_contents_table() -> None:
    """`contents`テーブルを作成"""
    logger.info("Creating 'contents' table...")
    query = '''
        CREATE TABLE IF NOT EXISTS contents (
            ID TEXT PRIMARY KEY,
            title TEXT,
            upload_date TEXT,
            video_url TEXT,
            view_count INTEGER,
            like_count INTEGER,
            duration TEXT,
            channel_category INTEGER
        )
    '''
    create_table(query)


def create_category_table() -> None:
    """`category`テーブルを作成"""
    logger.info("Creating 'category' table...")
    query = '''
        CREATE TABLE IF NOT EXISTS category (
            ID TEXT PRIMARY KEY,
            category_title TEXT,
            players TEXT,
            level TEXT,
            channel_brand_category INTEGER,
            FOREIGN KEY (channel_brand_category) REFERENCES cid(id) ON DELETE CASCADE            
        )
    '''
    create_table(query)


def create_feedback_table() -> None:
    """`feedback`テーブルを作成"""
    logger.info("Creating 'feedback' table...")
    query = '''
        CREATE TABLE IF NOT EXISTS feedback (
            id SERIAL PRIMARY KEY,
            name TEXT,
            email TEXT,
            category TEXT,
            message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    '''
    create_table(query)
    # id INTEGER PRIMARY KEY AUTOINCREMENT, < for sqlite


def insert_cid_data(cid: str, cname: str, clink: str) -> None:
    """`cid`テーブルにデータを挿入"""
    logger.info("Inserting data into 'cid' table...")
    with use_db_connection() as conn:
        with conn.cursor() as c:
            try:
                c.execute('''
                    INSERT INTO cid (cid, cname, clink)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (cid) DO NOTHING
                ''', (cid, cname, clink))
                conn.commit()
                logger.info("Data inserted into 'cid' table successfully.")
            except psycopg2.Error as e:
                logger.error("Error while inserting data into 'cid' table: %s", e)
                conn.rollback()


def insert_category_data(contents_data: List[Dict[str, Any]], channel_category: int) -> None:
    """`category`テーブルにデータを挿入"""
    logger.info("Inserting data into 'category' table...")
    with use_db_connection() as conn:
        with conn.cursor() as c:
            try:
                for data in contents_data:
                    c.execute('''
                        INSERT INTO category (ID, category_title, players, level, channel_brand_category)
                        VALUES (%s, %s, %s, %s, %s) ON CONFLICT (ID) DO NOTHING
                    ''', (data["id"], data["category"], data["nop"], data["level"], channel_category))
                    conn.commit()
                logger.info("Data inserted into 'category' table successfully.")
            except psycopg2.Error as e:
                logger.error("Error while inserting data into 'category' table: %s", e)
                conn.rollback()


def insert_contents_data(video_data: List[Dict[str, Any]], channel_category: int) -> None:
    """CSVファイルからデータをデータベースに挿入"""
    logger.info("Inserting data from CSV into 'contents' table...")
    #df = pd.read_csv(file_path)
    #duplicates = find_duplicates(df)

    # if duplicates:
    #     r = input(f"Duplicate IDs found: {duplicates}. Do you want to delete them? (y/n): ")
    #     if r.lower() == "y":
    #         df = df.drop_duplicates(subset="ID", keep="first")
    #         df.to_csv(file_path, index=False)
    #         logger.info("Duplicates removed and CSV file updated.")
    #     else:
    #         logger.info("Processing stopped due to duplicate IDs.")
    #         return
    with use_db_connection() as conn:  # データベース接続
        with conn.cursor() as c:  # カーソルのクローズを自動管理
            try:
                for data in video_data:
                    # like_count の変換処理
                    like_count = data.get('like_count')
                    if like_count in ('N/A', None):
                        like_count = None
                    else:
                        try:
                            like_count = int(like_count)
                        except ValueError:
                            logger.warning("Invalid like_count value for ID %s: %s", data['id'], like_count)
                            like_count = None  # 数値変換できない場合は None にする

                    # channel_category の存在チェック
                    #channel_category = data.get('channel_category', None)  # デフォルト値を None に

                    logger.info(
                        "INSERTするデータ: %s, %s, %s, %s, %s, %s, %s, %s",
                        data['id'], data['title'], data['upload_date'], data['url'],
                        data['view_count'], like_count, data['duration'], channel_category
                    )

                    # データ挿入
                    try:
                        c.execute('''
                            INSERT INTO contents (id, title, upload_date, video_url, 
                            view_count, like_count, duration, channel_category)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s) 
                            ON CONFLICT (id) DO NOTHING
                        ''', (
                            data['id'], data['title'], data['upload_date'], data['url'],
                            data['view_count'], like_count, data['duration'], channel_category
                        ))
                    except psycopg2.Error as e:
                        logger.error("Error while inserting data for ID %s: %s", data['id'], e)
                        conn.rollback()  # エラー発生時にロールバック

                conn.commit()  # すべての処理が成功したらコミット
                logger.info("All data inserted successfully into 'contents' table.")

            except Exception as e:
                conn.rollback()  # 致命的なエラーが発生した場合にロールバック
                logger.error("Unexpected error: %s", e)


def search_content_table() -> List[tuple]:
    """`contents`テーブルを検索"""
    logger.info("Searching data in 'contents' table...")
    with use_db_connection() as conn:
        c = conn.cursor()
        query = 'SELECT * FROM contents'
        c.execute(query)
        #c.execute("SELECT * FROM contents WHERE id = %s;", ('B-uDfqk20ac',))
        results = c.fetchall()
        logger.info("Search completed. Found %d records.", len(results))
        print(results)
        return results

# def search_table(search_term: str = None):
#     """`contents`テーブルからデータを検索"""
#     logger.info("Searching data in 'contents' table...")
#     with closing(get_db_connection()) as conn:
#         c = conn.cursor()
#         query = 'SELECT * FROM contents'
#         if search_term:
#             query += ' WHERE title LIKE ?'
#             logger.info("Searching for records containing: %s", search_term)
#             c.execute(query, ('%' + search_term + '%',))
#         else:
#             c.execute(query)
#
#         results = c.fetchall()
#         logger.info("Search completed. Found %d records.", len(results))
#         return [[result[0], result[1]] for result in results]


def get_channel_name_from_id(id: int) -> str:
    """チャンネルIDからチャンネル名を取得"""
    logger.info(f"Getting channel name for ID: {id}")
    with use_db_connection() as conn:
        with conn.cursor() as c:
            try:
                c.execute("SELECT cname FROM cid WHERE id = %s", (id,))
                result = c.fetchone()
                return result[0] if result else "Unknown Channel"
            except psycopg2.Error as e:
                logger.error("Error while getting channel name: %s", e)
                return "Unknown Channel"


def search_db() -> List[str]:
    """データベースのテーブル一覧を表示"""
    logger.info("Fetching list of tables in the database...")
    with use_db_connection() as conn:
        with conn.cursor() as c:
            try:
                c.execute("""
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                """)
                tables = c.fetchall()
                table_names = [table[0] for table in tables]
                logger.info("Tables found: %s", table_names)
                return table_names
            except psycopg2.Error as e:
                logger.error("Error while fetching table list: %s", e)
                return []


def search_term_in_table(table: str) -> List[tuple]:
    """指定されたテーブルの全データを検索"""
    # テーブル名のバリデーション
    allowed_tables = {'contents', 'cid', 'category', 'feedback'}
    if table not in allowed_tables:
        logger.error("Invalid table name: %s", table)
        raise ValueError(f"Invalid table name: {table}")

    with use_db_connection() as conn:
        with conn.cursor() as c:
            try:
                query = f"SELECT * FROM {table}"
                c.execute(query)
                results = c.fetchall()
                logger.info("Search completed. Found %d records.", len(results))
                return results
            except psycopg2.Error as e:
                logger.error("Error while searching table: %s", e)
                return []

def temp_func(tbl_name: str) -> List[tuple]:
    """一時的な関数 - 特定のIDを持つレコードを検索"""
    with use_db_connection() as conn:
        with conn.cursor() as c:
            try:
                query = f"""
                    SELECT ID FROM {tbl_name} 
                    WHERE ID IN (
                        'ewMGrhiWc1E', 'vY8B71_TVLw', '6sFICjN9bPQ', 
                        'hUBAMSuydJI', 'y_ZXOJJFyuA', 'EnZ95vi9RU8', 
                        'TIu4PNw_PTQ', 'XPPl5NDFdMc', 'sYVfBvdc6Xo', 
                        'HKcB-ZrL52Q'
                    )
                """
                c.execute(query)
                results = c.fetchall()
                logger.info("Search completed. Found %d records.", len(results))
                return results
            except psycopg2.Error as e:
                logger.error("Error while executing temp_func: %s", e)
                return []

# def find_duplicates(df: pd.DataFrame) -> list:
#     """重複したIDを検索"""
#     logger.info("Searching for duplicate IDs...")
#     id_count = defaultdict(int)
#     for _, row in df.iterrows():
#         id_count[row["ID"]] += 1
#     duplicates = [k for k, v in id_count.items() if v >= 2]
#     if duplicates:
#         logger.warning("Duplicate IDs found: %s", duplicates)
#     return duplicates


# if __name__ == '__main__':
# #     delete_table("cid")
#      search_db()

    #print(search_content_table())

# #     create_base_table()
# #     create_feedback_table()
# #     insert_contents_data()
    
    #
#     #insert_category_data()
#     # search_term = 'ドリブル'
#     # contents = search_table(search_term)
#     # print(contents)
