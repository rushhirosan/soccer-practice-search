"""認証・user-data API の軽量テスト（DB 不要: ensure_user_tables_migrated をモック）。"""
from unittest.mock import patch

import pytest


@pytest.fixture
def client():
    import app as app_module

    app_module.app.config["TESTING"] = True
    app_module.app.config["WTF_CSRF_ENABLED"] = False
    with app_module.app.test_client() as c:
        yield c


def test_auth_status_logged_out(client):
    r = client.get("/auth/status")
    assert r.status_code == 200
    j = r.get_json()
    assert j["logged_in"] is False
    assert "csrf_token" in j


@patch("app.ensure_user_tables_migrated", lambda: None)
def test_api_user_data_put_requires_login(client):
    r = client.put("/api/user-data", json={"payload": {}})
    assert r.status_code == 401


@patch("app.ensure_user_tables_migrated", lambda: None)
def test_api_user_data_put_requires_csrf_when_enabled():
    import app as app_module

    app_module.app.config["TESTING"] = True
    app_module.app.config["WTF_CSRF_ENABLED"] = True
    with app_module.app.test_client() as c:
        with c.session_transaction() as sess:
            sess["user_id"] = 1
            sess["nickname"] = "t"
        r = c.put("/api/user-data", json={"payload": {"x": 1}}, content_type="application/json")
    assert r.status_code in (400, 403)


@patch("app.ensure_user_tables_migrated", lambda: None)
@patch("utilities.app_user_store.put_payload", return_value="2020-01-01T00:00:00+00:00")
def test_api_user_data_put_ok_with_session_and_csrf_disabled(mock_put, client):
    with client.session_transaction() as sess:
        sess["user_id"] = 1
        sess["nickname"] = "t"
    r = client.put("/api/user-data", json={"payload": {"soccer_favorite_videos": []}})
    assert r.status_code == 200
    j = r.get_json()
    assert j.get("ok") is True
    mock_put.assert_called_once()
