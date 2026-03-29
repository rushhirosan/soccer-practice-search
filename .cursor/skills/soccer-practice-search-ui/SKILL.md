---
name: soccer-practice-search-ui
description: Guides Soccer Practice Search Jinja templates, static CSS/JS, shared header, and client-side storage patterns. Use when editing templates, styles, search UI, favorites, practice notes, tactical board, or mobile layout.
---

# Soccer Practice Search — UI and Static Assets

Stack: **Jinja2** templates, **vanilla JavaScript**, single large **`static/styles.css`** (custom design system with CSS variables — not Bootstrap).

## Layout

| Area | Path |
|------|------|
| Pages | `templates/home.html`, `favorites.html`, `practice_notes.html`, `tactical_board.html`, `about.html`, `privacy.html` |
| Shared chrome | `templates/partials/site_header.html` |
| Global styles | `static/styles.css` |
| Search & cards | `static/scripts.js` |
| Favorites page | `static/favorites.js` |
| Practice notes | `static/practice-notes.js` (inline styles also in `practice_notes.html` for form sections) |
| Tactical board | `static/tactical-board.js`, `static/tactical-board.css` |
| Header behavior | `static/site-header.js` |

## Principles

- **Consistency**: Reuse `--primary-color`, `--radius-*`, `.card`, `.search-*` patterns before inventing new ones.
- **Mobile**: Sticky search, readable taps, no horizontal overflow on long Japanese labels (cards `.info`, date inputs).
- **Accessibility**: Preserve `aria-*` and landmark patterns already in templates when changing structure.
- **No unsolicited frameworks**: Do not add React/Vue/Bootstrap unless the project explicitly moves that direction.

## Client-side state

- **Favorites** and similar features may use **`localStorage`** — keys and shapes are defined in the relevant JS files; server has no favorites DB in the default design.

## When changing UI

1. Identify which **template** and **JS** file own the behavior.
2. Bump `?v=` on `styles.css` / script `src` when cache busting is needed (project already uses query params in places).
3. If API response shapes change, update **`static/scripts.js`** (or the feature JS) in the same PR.
4. Run **pytest** if you touch Python that feeds the UI; smoke-test **search** and **filters** in the browser.
