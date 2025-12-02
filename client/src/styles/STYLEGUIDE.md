# TripMate UI Style Guide

## Design Tokens
- Colors: use existing CSS variables (`--ios-*`, `--sidebar-*`, `--primary`, etc.).
- Spacing: prefer Tailwind spacing and `.responsive-container` for page padding.
- Shadows: use `.elev-1` and `.elev-2` for depth; avoid inline box-shadow.
- Typography: keep current font stack via `--font-sans`; headings use existing Tailwind sizes.

## Layout
- Header: fixed at 64px height; top: 0; full width.
- Sidebar: fixed, `height: 100vh`, inner `overflow-y: auto`; toggle `body.sidebar-expanded`. Support mini-mode with `body.sidebar-collapsed`.
- Content: add `.with-sidebar` at page root. Avoid page-level top padding; rely on global header offset.
- Container: wrap main content in `.responsive-container` (max-width 1280px). Use `.page-section` for vertical grouping.

## Interactions
- Apply `.smooth-transition` to interactive elements.
- Micro-interactions: use `.hover-lift` for subtle hover lift; `.interactive-tap` or `.tap-scale` on mobile.
- Use `.fade-in` / `.slide-up` for non-essential UI only; avoid animations on initial load.
- Tooltips: use `aria-describedby` and fade within 120ms.
- Respect `prefers-reduced-motion`.

## Components
- Cards: support `.card-filled`, `.card-outlined`, `.card-quiet` for variants.
- Buttons: support loading via `.btn-loading`.
- Icons: follow size tokens via `.icon-sm`, `.icon-md`, `.icon-lg`.
- Inputs: use subtle borders via `.input-subtle`.

## Accessibility
- Roles: `nav[role="navigation"]`, descriptive `aria-label`s.
- Add a skip link using `.skip-to-content`; visible on focus.
- Sidebar/menu announce state via `aria-expanded` and `aria-current`.
- Maintain at least 3:1 contrast for muted elements.
- Minimum tap target: 44px x 44px.

## Responsiveness
- Use `.responsive-container`; grids collapse below 640px.
- Sidebar collapses automatically below 768px.
- Use percentage widths for map containers.
- Ensure text never scales below 14px on mobile.

## Do/Don't
- Do: use semantic utility names like `.section-title`, `.subtle-text`, `.chip`, `.badge`.
- Do: prefer CSS variables over Tailwind arbitrary values.
- Do: document new utilities in `client/src/styles/utilities.css`.
- Don't: scroll-jack, force animations, or use non-tokenized gradients.

## Additional Tokens
- Surfaces: `--surface`, `--surface-2`.
- Text: `--text-primary`, `--text-secondary`.
- Borders: `--border-subtle`, `--border-strong`.
- Radius: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill`.
- Motion: `--transition-fast`, `--transition-medium`, `--transition-slow`.
- Icons: `--icon-sm`, `--icon-md`, `--icon-lg`.
