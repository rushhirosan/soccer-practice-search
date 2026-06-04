"""SEO helpers and public page head tags."""

import pytest

from app import build_seo_page_url, get_site_base_url


def test_build_seo_page_url_home():
    base = get_site_base_url()
    assert build_seo_page_url("/", "ja") == f"{base}/?lang=ja"
    assert build_seo_page_url("/", "en") == f"{base}/?lang=en"


def test_build_seo_page_url_subpath():
    base = get_site_base_url()
    assert build_seo_page_url("/about", "ja") == f"{base}/about?lang=ja"
    assert build_seo_page_url("board", "en") == f"{base}/board?lang=en"


@pytest.fixture
def client():
    import app as app_module

    app_module.app.config["TESTING"] = True
    app_module.app.config["WTF_CSRF_ENABLED"] = False
    with app_module.app.test_client() as c:
        yield c


def test_sitemap_includes_indexable_pages_only(client):
    r = client.get("/sitemap.xml")
    assert r.status_code == 200
    body = r.get_data(as_text=True)
    base = get_site_base_url()
    assert f"<loc>{base}/</loc>" in body
    assert f"<loc>{base}/about</loc>" in body
    assert f"<loc>{base}/board</loc>" in body
    assert f"<loc>{base}/privacy</loc>" in body
    assert "/favorites" not in body
    assert "/practice-notes" not in body
    assert "/account" not in body


def test_home_has_hreflang_alternate(client):
    r = client.get("/")
    assert r.status_code == 200
    body = r.get_data(as_text=True)
    base = get_site_base_url()
    assert f'hreflang="ja" href="{base}/?lang=ja"' in body
    assert f'hreflang="en" href="{base}/?lang=en"' in body
    assert 'hreflang="x-default"' in body


def test_about_has_hreflang_and_youtube_notice(client):
    r = client.get("/about")
    assert r.status_code == 200
    body = r.get_data(as_text=True)
    base = get_site_base_url()
    assert f'hreflang="ja" href="{base}/about?lang=ja"' in body
    assert "著作権" in body or "copyright" in body.lower()


def test_footer_youtube_notice_on_home(client):
    r = client.get("/")
    body = r.get_data(as_text=True)
    assert "footer-youtube-notice" in body
    assert "YouTube" in body
