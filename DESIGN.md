---
source: getdesign.md — Airbnb DESIGN.md
adapted-for: TripMate
date: 2026-05-02
---

# TripMate Design System
## Airbnb-inspired — Warm travel marketplace aesthetic

> Single accent (Rausch #ff385c) on a white canvas. Photography leads. Whitespace is signal.
> Soft rounded geometry. Typography defers to imagery, never competes with it.

---

## 1. Visual Theme & Atmosphere

Warm, generous, light-mode travel platform. Clean white canvas surfaces let destination photography breathe. The single brand accent — **Rausch coral** (#ff385c) — carries every CTA, active state, and rating indicator. No hard corners except the content grid. Shadows are whisper-light. The design trusts the photograph to do the heavy lifting.

---

## 2. Color Palette & Roles

| Token | Hex | Role |
|---|---|---|
| `primary` | `#ff385c` | Rausch coral — every CTA, active badge, star dot |
| `primary-active` | `#e00b41` | Pressed/hover state of primary |
| `primary-disabled` | `#ffd1da` | Disabled primary button fill |
| `primary-error` | `#c13515` | Error text, destructive actions |
| `ink` | `#222222` | Primary text, headings, icons |
| `body` | `#3f3f3f` | Body copy |
| `muted` | `#6a6a6a` | Secondary text, placeholders, metadata |
| `muted-soft` | `#929292` | Tertiary text, timestamps |
| `hairline` | `#dddddd` | Card borders, dividers, input borders |
| `hairline-soft` | `#ebebeb` | Subtle separators, nav underlines |
| `border-strong` | `#c1c1c1` | Focused input borders |
| `canvas` | `#ffffff` | Page background, card surface |
| `surface-soft` | `#f7f7f7` | Secondary backgrounds, sidebar |
| `surface-strong` | `#f2f2f2` | Icon button backgrounds, chips |
| `on-primary` | `#ffffff` | Text on Rausch |
| `legal-link` | `#428bff` | Inline hyperlinks only |
| `semantic-success` | `#00a699` | Teal — positive states |
| `semantic-warning` | `#fc642d` | Orange — warnings |
| `semantic-error` | `#c13515` | Red — errors |
| `luxe` | `#460479` | Premium tier accent |
| `plus` | `#92174d` | Plus tier accent |

---

## 3. Typography

**Font stack:** `Inter, -apple-system, system-ui, Roboto, 'Helvetica Neue', sans-serif`

| Role | Size | Weight | Line Height | Letter Spacing |
|---|---|---|---|---|
| `display-xl` | 28px | 700 | 1.43 | 0 |
| `display-lg` | 22px | 500 | 1.18 | -0.44px |
| `display-md` | 21px | 700 | 1.43 | 0 |
| `display-sm` | 20px | 600 | 1.20 | -0.18px |
| `title-md` | 16px | 600 | 1.25 | 0 |
| `title-sm` | 16px | 500 | 1.25 | 0 |
| `body-md` | 16px | 400 | 1.50 | 0 |
| `body-sm` | 14px | 400 | 1.43 | 0 |
| `caption` | 14px | 500 | 1.29 | 0 |
| `caption-sm` | 13px | 400 | 1.23 | 0 |
| `badge` | 11px | 600 | 1.18 | 0 |
| `micro-label` | 12px | 700 | 1.33 | 0 |
| `button-md` | 16px | 500 | 1.25 | 0 |
| `button-sm` | 14px | 500 | 1.29 | 0 |
| `nav-link` | 16px | 600 | 1.25 | 0 |

**Rule:** Never use weight 700+ for body copy. Never weight below 400 for interactive elements.

---

## 4. Border Radius

| Token | Value | Use |
|---|---|---|
| `xs` | 4px | Tags, micro chips |
| `sm` | 8px | **Buttons**, text inputs |
| `md` | 14px | **Cards**, modals, panels |
| `lg` | 20px | Large feature panels |
| `xl` | 32px | Hero sections |
| `full` | 9999px | **Pills**, search bars, avatars, search orbs |

**Rule:** Buttons = 8px. Cards = 14px. Pills/avatars = 9999px. No mixing.

---

## 5. Spacing

| Token | Value |
|---|---|
| `xxs` | 2px |
| `xs` | 4px |
| `sm` | 8px |
| `md` | 12px |
| `base` | 16px |
| `lg` | 24px |
| `xl` | 32px |
| `xxl` | 48px |
| `section` | 64px |
| `hero` | 96px |

Section rhythm: 64px between major sections. Card grid gutters: 16px.

---

## 6. Elevation

| Level | Shadow | Use |
|---|---|---|
| flat | none | Default page surfaces |
| card-resting | `0 1px 2px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05)` | Trip cards, journal cards |
| card-hover | `rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0` | Card hover state |
| modal | `rgba(0,0,0,0.5)` scrim + `0 8px 32px rgba(0,0,0,0.12)` panel | Dialogs, sheets |

**Rule:** No heavy shadows. Max opacity 0.1 on elevation. Borders do the separation work.

---

## 7. Component Patterns (TripMate mapping)

| Component | Spec |
|---|---|
| **Primary button** | Rausch fill, 8px radius, 48px height, 14px×24px padding, weight 500 |
| **Secondary button** | White fill, ink border (`1px solid #222`), 8px radius, same size |
| **Ghost button** | Transparent, ink text, no border |
| **Pill button** | Rausch fill, 9999px radius, 10px×20px padding |
| **Search bar** | Full pill (9999px), white, hairline border, resting shadow, 64px height |
| **Search orb** | Rausch fill, 9999px, 48×48px |
| **Trip card** | White, 14px radius, resting shadow, photo-first layout |
| **Journal card** | White, 14px radius, experience-card pattern |
| **Badge/status** | Pill (9999px), 11px/600, white bg or Rausch fill |
| **Text input** | White, 8px radius, 56px height, hairline border, ink-border on focus |
| **Top nav** | White, 80px height, hairline bottom border |
| **Sidebar** | surface-soft (#f7f7f7), hairline right border, 240px |
| **Avatar** | Full pill, white border ring 2px |
| **Modal** | White, 14px radius, scrim overlay |
| **Tab active** | Ink underline, ink text |
| **Tab inactive** | Transparent, muted text |

---

## 8. Photography Guidelines

- Trip card images: 4:3 or 16:9 ratio, full-cover (`object-cover`)
- Gradient overlay: `linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)` for text legibility
- No low-res images. Minimum 800px wide.
- Hero sections: full-viewport photography, centered CTA over image

---

## 9. Do / Don't

**Do:**
- Use Rausch as the single dominant CTA color
- Keep buttons 8px radius, cards 14px, pills 9999px
- Trust whitespace — section padding is 64px
- Cluster cards in 16px gutter grids
- Photo always above text in cards

**Don't:**
- Use Rausch for body text or decorative elements
- Mix border-radius values on same component
- Add heavy shadows (max 0.1 opacity)
- Use weight 700+ for body copy
- Dark backgrounds except scrim overlays
