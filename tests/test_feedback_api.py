"""フィードバック API の軽量テスト（DB 不要）。"""
from unittest.mock import patch

import pytest

from utilities import app_user_store


@pytest.fixture
def client():
    import app as app_module

    app_module.app.config["TESTING"] = True
    app_module.app.config["WTF_CSRF_ENABLED"] = False
    with app_module.app.test_client() as c:
        yield c


@pytest.fixture(autouse=True)
def clear_feedback_rate_buckets():
    app_user_store._rate_buckets.clear()
    yield
    app_user_store._rate_buckets.clear()


@patch("app.save_feedback_to_db")
@patch("app.client_ip", return_value="203.0.113.50")
def test_submit_feedback_rate_limited(mock_ip, mock_save, client):
    payload = {"message": "hello", "category": "general"}
    for _ in range(6):
        r = client.post("/submit-feedback", json=payload)
        assert r.status_code == 200
    r = client.post("/submit-feedback", json=payload)
    assert r.status_code == 429
    assert mock_save.call_count == 6


@patch("app.save_feedback_to_db")
def test_submit_feedback_requires_message(mock_save, client):
    r = client.post("/submit-feedback", json={"message": "  "})
    assert r.status_code == 400
    mock_save.assert_not_called()
