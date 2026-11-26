# TripMate UI Style Guide (The Passport & Visa Stamp System)

This guide documents the design tokens, component architecture, and styling rules established in `DESIGN.md` and implemented in `client/src/index.css`.

---

## 1. Creative Concept & Ground Philosophy

- **Metaphor:** The traveler's passport, stamped at every stage of a journey.
- **Dark Mode (Default):** The passport inspected under a customs desk lamp (`#0D1B2E` cool ink-navy ground, `#EDE6D6` warm parchment text).
- **Light Mode:** The same passport in daylight (`hsl(42 38% 90%)` kraft/parchment paper, ink-navy text).
- **Operate Mode:** Task-completion travel software. Clarity, scanability, and spatial layout outrank decorative SaaS clichés.

---

## 2. Typography (IBM Plex Foundry)

Always use IBM Plex family tokens:

- **Display Headings:** `IBM Plex Serif` (`.font-display`, 700 weight, 1.18 line-height, -0.01em tracking) for destination names and primary headers.
- **Body & Prose:** `IBM Plex Sans` (`.font-sans-clean`, 400/500 weight, 1.55 line-height) for labels, descriptions, and inputs.
- **Manifest / Discrete Data:** `IBM Plex Mono` (`.font-mono-data`, `font-variant-numeric: tabular-nums`) for currency amounts, dates, flight/transit codes, and coordinates.
- **Label / Eyebrows:** `.label-xs` (uppercase, 10px, tracked mono, 0.1em letter-spacing) for manifest and field headers.

---

## 3. Official Ink Roles & Color Tokens

All color tokens live in `client/src/index.css`:

### Primary Actions

- `--ink-blue` (`#163F73`) / `--ink-blue-rgb` (`22 63 115`): Primary CTA, submit buttons, brand accent. Darkens to `#0F2C52` on hover (`.stamp-press`).

### State & Status Inks

- `--customs-blue` (`#1D4E89`) / `--customs-blue-rgb` (`29 78 137`): Planning status, informational links, transit icons.
- `--transit-green` (`#2F6F4E` or `#3D9467`) / `--transit-green-rgb` (`47 111 78`): Active status, confirmed items, success states.
- `--stamp-red` (`#B3261E`) / `--stamp-red-rgb` (`179 38 30`): Completed status, alerts, warnings, destructive actions.
- `--warning-amber` (`#D97706`) / `--warning-amber-rgb` (`217 119 6`): Time-sensitive notes, departure warnings.

### 8-Way Activity Category Register

Used by `TripMap.tsx` markers and activity badges:

- `--ink-sightseeing`: Sightseeing & Attractions (Indigo `#1E3A8A`)
- `--ink-dining`: Restaurants & Cafes (Terracotta `#C2410C`)
- `--ink-lodging`: Hotels & Accommodations (Slate Navy `#334155`)
- `--ink-transit`: Travel & Logistics (Customs Blue `#1D4E89`)
- `--ink-culture`: Museums & Historic Sites (Warm Bronze `#854D0E`)
- `--ink-nature`: Parks & Outdoor Spots (Transit Green `#2F6F4E`)
- `--ink-nightlife`: Bars & Evening Events (Stamp Red `#B3261E`)
- `--ink-shopping`: Bazaars & Retail (Deep Teal `#0F766E`)

_Note on Opacity:_ Always use `[rgb(var(--<name>-rgb)/N%)]` when applying opacity modifiers in Tailwind.

---

## 4. Components & Signatures

### Status Badge ("The Stamp")

- Use the `.stamp` utility: 2px border in currentColor, 3px border-radius, `-2deg` to `-3deg` rotation, uppercase mono data text.
- Never use generic flat SaaS pill badges with pastel backgrounds.

### Perforated Ticket Divider

- Use `.perforated-edge`: 2px dashed border mimicking a boarding-pass tear line between hero media and manifest card footers.

### Buttons & Inputs

- Primary Button: `bg-[var(--ink-blue)] hover:bg-[#0F2C52] text-white rounded-xl stamp-press`.
- Active tactile feedback: `.stamp-press` gives subtle scale(`0.96`) and brightness(`0.85`) depression.

---

## 5. Accessibility & Responsiveness

- **Contrast:** Minimum 4.5:1 for body copy; 3:1 for large display headers.
- **Tap Targets:** Minimum 44px x 44px on all interactive mobile buttons.
- **Mobile Safe Areas:** Avoid `fixed bottom-0` or `sticky bottom-0` without clearing the mobile navigation bar (`bottom-3`). Use `pb-20 md:pb-4`.
- **Responsive Text:** Prevent clipped titles by using `basis-full sm:basis-auto` on responsive flex headers.
