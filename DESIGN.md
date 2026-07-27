---
name: TripMate
description: Your passport, stamped at every stage of a trip.
colors:
  ink-blue: "#163F73"
  ink-blue-deep: "#0F2C52"
  stamp-red: "#B3261E"
  customs-blue: "#1D4E89"
  customs-blue-deep: "#122A47"
  transit-green: "#3D9467"
  ink-navy: "#0D1B2E"
  ink-navy-card: "hsl(211 40% 15%)"
  kraft-paper: "hsl(42 38% 90%)"
  kraft-card: "hsl(40 35% 96%)"
  parchment-text: "#EDE6D6"
  ink-text: "hsl(211 40% 14%)"
typography:
  display:
    fontFamily: "IBM Plex Serif, Georgia, serif"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.01em"
  body:
    fontFamily: "IBM Plex Sans, -apple-system, system-ui, sans-serif"
    fontWeight: 400
    lineHeight: 1.55
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    letterSpacing: "0.01em"
rounded:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
  xl: "12px"
  3xl: "24px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.ink-blue}"
    textColor: "#FFFFFF"
    rounded: "{rounded.xl}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.ink-blue-deep}"
  status-badge:
    rounded: "3px"
    padding: "2px 8px"
---

# Design System: TripMate

## Overview

**Creative North Star: "The Passport & Visa Stamp System"**

TripMate refuses the generic photo-card-and-gradient SaaS travel app. Instead, the product behaves like the traveler's own passport: trip cards read as bio-data pages, status changes are ink stamps pressed into the page, and forms carry the register of a customs declaration. The dark theme is the passport checked under a customs-desk lamp at night — cool ink-navy ground, warm parchment text. The light theme is the same passport in daylight — kraft/parchment paper, ink-navy text. Both themes are the same object, lit differently, not two disconnected palettes.

The system is Operate-mode disciplined: this is task-completion software (planning a trip, checking a budget, reading a forecast), so the passport metaphor lives in color, texture, and named components — never in decoration that would slow down reading a form or a data table. Confirmed visual rejections: no gradient hero cards as a stand-in for real content, no `text-black` on a saturated accent (previously present, corrected), no warm-amber "AI badge" cliché.

**Key Characteristics:**
- Four named ink roles instead of a single brand accent: ink-blue (primary/CTA), customs-blue (planning), transit-green (active), stamp-red (completed/alert), and the neutral ink/parchment ground.
- IBM Plex type family throughout — serif for display, sans for body, mono for anything that reads like official data (dates, prices, codes).
- Status is always a stamp: rotated slightly, bordered in its own ink color, never a flat SaaS pill.

## Colors

An ink-and-paper palette: one authoritative red for action, blue and green for status, warm parchment or cool ink-navy for the ground depending on theme.

### Primary
- **Ink Blue** (`#163F73`): the primary action ink. Every CTA, primary button, and the brand's single loudest color — a deep official-stamp blue, deliberately deeper than the lighter customs-blue used for the "planning" status role.

### Secondary
- **Customs Blue** (`#1D4E89`): the "planning" status ink and a secondary navigational accent (links, informational icons).
- **Transit Green** (`#3D9467`): the "active"/in-progress status ink and positive/success states.

### Neutral
- **Ink-Navy** (`#0D1B2E`, dark mode background): the passport-under-a-lamp ground. Cards sit one step lighter (`hsl(211 40% 15%)`).
- **Kraft Parchment** (`hsl(42 38% 90%)`, light mode background): the daylight paper ground. Cards sit on a slightly whiter "fresh stamp page" (`hsl(40 35% 96%)`).
- **Parchment Text** (`#EDE6D6`, dark mode foreground): warm aged-paper text against the cool ink ground — the deliberate light/dark tension that makes the dark theme feel like paper under lamplight rather than a generic OLED-black app.

### Named Rules
**The One Ink Rule.** Ink Blue is the only fully saturated color allowed on a primary action per screen. If two elements compete for it, one loses to a neutral ink.
**The Stamp, Not Pill Rule.** Any status/state indicator is bordered and slightly rotated (`-2deg` to `-3deg`), never a plain rounded-full pill in a flat tint.

## Typography

**Display Font:** IBM Plex Serif (with Georgia, serif fallback)
**Body Font:** IBM Plex Sans (with system-ui fallback)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace fallback)

**Character:** A single type family (three weights of the same system) rather than a display/body pairing from two different foundries — reads as one coherent official-document type system, the way a real passport uses one typeface across the photo page, the visa stamps, and the machine-readable zone.

### Hierarchy
- **Display** (700, page/section H1-H2, 1.18 line-height, -0.01em tracking): trip destination names, page titles.
- **Body** (400, 1.55 line-height): all prose, descriptions, form labels.
- **Label** (600, 10px, 0.1em tracking, uppercase, mono): section eyebrows ("Quick actions", "Recent trips") — reads like a stamped form-field label.
- **Data** (mono, tabular numerals): dates, prices, durations, group sizes — anything that is a discrete fact rather than prose, so it lines up like a manifest.

### Named Rules
**The One Family Rule.** Every weight and role comes from IBM Plex (Serif/Sans/Mono). No second display typeface is introduced for "personality."

## Layout

Mobile-first responsive grid, unchanged from the prior system's spacing rhythm (the redesign replaced color and material, not the app's information architecture). Cards remain the primary content unit; dashboards use a 2-4 column responsive grid for quick actions and trip cards.

## Elevation & Depth

Flat-by-default with ink-role borders doing the work shadows would otherwise do. A card's border color, not its shadow, signals its ink role (a `status-planning` card border reads customs-blue at 55% opacity). `--shadow-hover` still exists for interactive lift on hover, now tinted toward ink-blue instead of amber.

### Named Rules
**The Border-Is-Status Rule.** Status and role are conveyed by a 2px bordered ink color first; shadow is a hover-only affordance, never the primary signal.

## Shapes

Corners stay moderate (`rounded-xl`/`12px` on buttons, `rounded-2xl`/`16-24px` on cards) — soft enough to stay "Operate" friendly, not the sharp-cornered severity of a pure bureaucratic-document pastiche. Stamps and badges use a much tighter `3px` radius deliberately, so a stamp visually reads as "stamped," distinct from the surrounding soft-cornered UI chrome.

## Components

### Buttons
- **Shape:** `rounded-xl` (12px).
- **Primary:** Ink Blue fill (`#163F73`), white text — never black-on-color.
- **Hover:** darkens to `#0F2C52` (ink-blue-deep), the "pressed ink" state.

### Status Badge ("the stamp")
- **Style:** 2px border in the status's ink color, background at 10% opacity of that ink, `-2deg` rotation, uppercase mono text, `3px` radius.
- **Roles:** `status-planning` (customs-blue), `status-active` (transit-green, pulses), `status-completed` (stamp-red, an alert/closed ink distinct from the primary blue).

### Cards / Containers
- **Corner Style:** `rounded-2xl` (16px) for dashboard cards, `rounded-xl` for smaller tiles.
- **Background:** `hsl(var(--card))` — ink-navy-elevated in dark mode, fresh-parchment in light mode.
- **Border:** 1px `hsl(var(--border))`, a cool-ink hairline in dark mode, warm-kraft hairline in light mode.
- **Signature texture:** `.perforated-edge` (dashed top border) marks a boarding-pass-style tear line between a card's image/hero region and its data footer.

### Navigation
Sidebar/tab bar inherits the ink-navy (dark) / kraft (light) surface tokens directly; the active-item indicator is a 2px Ink Blue left bar (`.nav-active-bar`).

## Do's and Don'ts

### Do:
- **Do** use `formatMoney()`-style currency-aware formatting with `.font-mono-data` for any price, date, or count.
- **Do** border status/role indicators in their ink color at 2px; let opacity-10% background carry the tint.
- **Do** keep Ink Blue to one primary action per view.

### Don't:
- **Don't** use `text-black` on Ink Blue, Stamp Red, or any saturated ink-role background — always white text.
- **Don't** introduce a second display typeface; IBM Plex Serif/Sans/Mono covers every role.
- **Don't** render a gradient block as a placeholder for missing photo content on a hero/first-viewport element — use a textured ink-role surface instead.
