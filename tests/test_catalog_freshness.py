"""Catalog freshness (header badge) helpers."""

from datetime import datetime

from utilities import ui_i18n
from utilities.db_access import _parse_upload_date_raw, reset_catalog_freshness_cache


def test_parse_upload_date_iso():
    dt = _parse_upload_date_raw("2026-05-20T14:30:00Z")
    assert dt == datetime(2026, 5, 20, 14, 30, 0)


def test_parse_upload_date_japanese_legacy():
    dt = _parse_upload_date_raw("2023年11月22日11時00分")
    assert dt == datetime(2023, 11, 22, 11, 0, 0)


def test_format_catalog_freshness_date_ja():
    dt = datetime(2026, 5, 29, 10, 0, 0)
    assert ui_i18n.format_catalog_freshness_date(dt, "ja") == "2026/05/29"


def test_format_catalog_freshness_date_en():
    dt = datetime(2026, 5, 29, 10, 0, 0)
    assert ui_i18n.format_catalog_freshness_date(dt, "en") == "May 29, 2026"


def test_reset_catalog_freshness_cache():
    reset_catalog_freshness_cache()
