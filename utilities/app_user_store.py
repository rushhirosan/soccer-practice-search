"""
擬似匿名ユーザー（ニックネーム＋パスワード）と user_sync_data の読み書き。

スキーマは utilities.db_access.create_app_user_tables を参照（app_users /
user_sync_data.payload JSONB、1ユーザー1行）。
"""
from __future__ import annotations

import json
import logging
import re
import secrets
import time
from typing import Any, Dict, Optional, Tuple

import psycopg2
from psycopg2.extras import Json
from werkzeug.security import check_password_hash, generate_password_hash

from utilities.db_access import use_db_connection

logger = logging.getLogger(__name__)

NICKNAME_RE = re.compile(r"^[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\-]{2,24}$")
MIN_PASSWORD_LEN = 8
MAX_PASSWORD_LEN = 128
MAX_PAYLOAD_BYTES = 512 * 1024

_rate_buckets: Dict[str, list] = {}


def rate_limit_allow(key: str, max_events: int = 30, window_sec: int = 900) -> bool:
    now = time.time()
    cutoff = now - window_sec
    bucket = _rate_buckets.setdefault(key, [])
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)
    if len(bucket) >= max_events:
        return False
    bucket.append(now)
    return True


def validate_nickname(nickname: str) -> str:
    if not nickname or not isinstance(nickname, str):
        raise ValueError("ニックネームを入力してください")
    n = nickname.strip()
    if not NICKNAME_RE.match(n):
        raise ValueError("ニックネームは2〜24文字、英数字・_-・日本語が使えます")
    return n


def validate_password(password: str) -> str:
    if not password or not isinstance(password, str):
        raise ValueError("パスワードを入力してください")
    if len(password) < MIN_PASSWORD_LEN or len(password) > MAX_PASSWORD_LEN:
        raise ValueError(f"パスワードは{MIN_PASSWORD_LEN}〜{MAX_PASSWORD_LEN}文字です")
    return password


def hash_secret(plain: str) -> str:
    return generate_password_hash(plain, method="pbkdf2:sha256")


def verify_secret(stored_hash: str, plain: str) -> bool:
    return check_password_hash(stored_hash, plain)


def generate_recovery_secret_plain() -> str:
    return secrets.token_urlsafe(32)


def create_user(nickname: str, password: str) -> Tuple[int, str]:
    n = validate_nickname(nickname)
    p = validate_password(password)
    recovery_plain = generate_recovery_secret_plain()
    ph = hash_secret(p)
    rh = hash_secret(recovery_plain)

    with use_db_connection() as conn:
        with conn.cursor() as c:
            try:
                c.execute(
                    """
                    INSERT INTO app_users (nickname, password_hash, recovery_secret_hash)
                    VALUES (%s, %s, %s)
                    RETURNING id
                    """,
                    (n, ph, rh),
                )
                row = c.fetchone()
                uid = row[0]
                c.execute(
                    """
                    INSERT INTO user_sync_data (user_id, payload, updated_at)
                    VALUES (%s, %s::jsonb, NOW())
                    """,
                    (uid, Json({})),
                )
                conn.commit()
                return uid, recovery_plain
            except psycopg2.Error as e:
                conn.rollback()
                if getattr(e, "pgcode", None) == "23505":
                    raise ValueError("このニックネームは既に使われています") from e
                logger.error("create_user: %s", e)
                raise


def get_user_by_nickname(nickname: str) -> Optional[Dict[str, Any]]:
    n = nickname.strip()
    with use_db_connection() as conn:
        with conn.cursor() as c:
            c.execute(
                """
                SELECT id, nickname, password_hash, recovery_secret_hash
                FROM app_users WHERE nickname = %s
                """,
                (n,),
            )
            row = c.fetchone()
            if not row:
                return None
            return {
                "id": row[0],
                "nickname": row[1],
                "password_hash": row[2],
                "recovery_secret_hash": row[3],
            }


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    with use_db_connection() as conn:
        with conn.cursor() as c:
            c.execute(
                """
                SELECT id, nickname, password_hash, recovery_secret_hash
                FROM app_users WHERE id = %s
                """,
                (user_id,),
            )
            row = c.fetchone()
            if not row:
                return None
            return {
                "id": row[0],
                "nickname": row[1],
                "password_hash": row[2],
                "recovery_secret_hash": row[3],
            }


def update_password_for_user_id(user_id: int, new_password: str) -> None:
    p = validate_password(new_password)
    ph = hash_secret(p)
    with use_db_connection() as conn:
        with conn.cursor() as c:
            c.execute(
                """
                UPDATE app_users SET password_hash = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (ph, user_id),
            )
            conn.commit()


def reset_password_with_recovery(nickname: str, recovery_plain: str, new_password: str) -> None:
    u = get_user_by_nickname(nickname)
    if not u:
        raise ValueError("ニックネームが見つかりません")
    if not verify_secret(u["recovery_secret_hash"], recovery_plain):
        raise ValueError("回復用キーが正しくありません")
    update_password_for_user_id(u["id"], new_password)


def verify_login(nickname: str, password: str) -> Optional[int]:
    u = get_user_by_nickname(nickname)
    if not u:
        return None
    if not verify_secret(u["password_hash"], password):
        return None
    return u["id"]


def get_payload(user_id: int) -> Tuple[Dict[str, Any], Optional[str]]:
    with use_db_connection() as conn:
        with conn.cursor() as c:
            c.execute(
                """
                SELECT payload, updated_at FROM user_sync_data WHERE user_id = %s
                """,
                (user_id,),
            )
            row = c.fetchone()
            if not row:
                return {}, None
            payload = row[0]
            if isinstance(payload, str):
                payload = json.loads(payload)
            ts = row[1].isoformat() if row[1] else None
            return dict(payload) if payload else {}, ts


def put_payload(user_id: int, payload: Dict[str, Any]) -> str:
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if len(raw.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise ValueError("保存データが大きすぎます（上限を超えています）")

    with use_db_connection() as conn:
        with conn.cursor() as c:
            c.execute(
                """
                INSERT INTO user_sync_data (user_id, payload, updated_at)
                VALUES (%s, %s::jsonb, NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    payload = EXCLUDED.payload,
                    updated_at = NOW()
                RETURNING updated_at
                """,
                (user_id, Json(payload)),
            )
            row = c.fetchone()
            conn.commit()
            return row[0].isoformat() if row and row[0] else ""


def delete_user_and_data(user_id: int) -> None:
    with use_db_connection() as conn:
        with conn.cursor() as c:
            c.execute("DELETE FROM app_users WHERE id = %s", (user_id,))
            conn.commit()
