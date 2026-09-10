# TripMate → frameless desktop app (Tauri, free)

Wraps the deployed site (`https://tripmate-ylt6.onrender.com`) in a real
native window — **no address bar, no ⋮ menu, no Chrome frame**. Produces a
Windows `.exe` / `.msi` (and `.dmg` / `.AppImage` if you build on those
OSes). Free. First launch shows a one-time "unknown publisher" warning
(click "More info → Run anyway"); killing that needs a paid code-signing
cert and is optional.

## 1. Install Rust (one time, free)

Windows: download and run <https://rustup.rs> → `rustup-init.exe` →
accept the defaults. Reopen PowerShell after.

```powershell
rustc --version   # should print a version
```

You also need the **Microsoft C++ Build Tools** — rustup prompts for this;
if not, get "Desktop development with C++" from the Visual Studio
Installer.

## 2. Create the Tauri project

From the repo root:

```powershell
npm install -g @tauri-apps/cli
cd desktop
npm create tauri-app@latest tripmate-desktop -- --template vanilla --manager npm --yes
cd tripmate-desktop
```

## 3. Point it at the live site

Edit `tripmate-desktop/src-tauri/tauri.conf.json`:

- Under `app.windows[0]`, set:
  ```json
  "url": "https://tripmate-ylt6.onrender.com",
  "title": "TripMate",
  "width": 1200,
  "height": 800,
  "minWidth": 360,
  "minHeight": 600,
  "resizable": true
  ```
- Set `productName` to `TripMate` and `identifier` to
  `com.onrender.tripmate.desktop`.
- (Optional, for a custom title bar / fully borderless later:
  `"decorations": false` — but then you must draw your own drag region.)

Replace the generated icons: copy `../icon-512.png` over
`src-tauri/icons/icon.png`, then run `npm run tauri icon ../icon-512.png`
(regenerates `.ico` / `.icns` / all sizes).

Allow the remote origin: in
`src-tauri/capabilities/default.json`, no change needed for a plain web
view — but if any Tauri API is called, add the origin to
`app.security.csp` / `remoteDomains` per the Tauri v2 docs.

## 4. Build

```powershell
npm run tauri build
```

Output:
`src-tauri/target/release/bundle/msi/TripMate_1.0.0_x64_en-US.msi`
and a standalone `.exe` in `src-tauri/target/release/`.

Double-click the `.msi` to install → **TripMate** in the Start Menu, its
own icon, its own frameless window.

## Updating

Nothing to rebuild for web changes — it loads the live site. Rebuild only
to change the icon, window size, or app version.

## Notes

- `desktop/tripmate-desktop/` is gitignored (generated). Only this doc and
  `icon-512.png` are tracked.
- Tauri window is a system WebView (Edge WebView2 on Windows) — same
  engine family as the PWA, so rendering matches.
