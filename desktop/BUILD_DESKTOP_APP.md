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

## 3. Point it at the live site — frameless, custom title bar

The window is **frameless** (`decorations: false`) with a slim dark title
bar injected into the remote page (we can't edit that page, so we inject).
Because the window is built in Rust (not `tauri.conf.json`) so it can carry
an `initialization_script`, the config's `app.windows` array is left empty.

**`src-tauri/tauri.conf.json`** — set `productName` `TripMate`, `identifier`
`com.onrender.tripmate.desktop`, `version` `1.0.0`, and:

```json
"app": {
  "withGlobalTauri": true,
  "windows": [],
  "security": { "csp": null }
}
```

`withGlobalTauri: true` is required — the injected bar calls
`window.__TAURI__.window.getCurrentWindow()` for minimize/maximize/close.

**`src-tauri/src/lib.rs`** — replace with the version tracked alongside this
doc (`desktop/lib.rs`). It builds the `main` window pointing at the live
URL, `decorations(false)`, and injects `TITLEBAR_JS`: a 32px fixed bar with
`data-tauri-drag-region` (window drag) + `– □ ✕` buttons, plus
`html{margin-top:32px}` so site content clears the bar. A `MutationObserver`
re-injects it if the SPA wipes the DOM on navigation.

**`src-tauri/capabilities/default.json`** — add the window permissions the
buttons need:

```json
"permissions": [
  "core:default",
  "core:window:allow-minimize",
  "core:window:allow-toggle-maximize",
  "core:window:allow-close",
  "core:window:allow-start-dragging",
  "opener:default"
]
```

Icons: copy `../icon-512.png` over `src-tauri/icons/icon.png`, then
`npm run tauri icon ../icon-512.png`.

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

- `desktop/tripmate-desktop/` is gitignored (generated). Tracked: this doc,
  `icon-512.png`, and `lib.rs` (the customized window/title-bar source — copy
  it into `src-tauri/src/lib.rs` after scaffolding).
- The built installer is published at
  `https://tripmate-ylt6.onrender.com/download` (served from
  `client/public/download/TripMate-Setup.exe`). After a rebuild, copy the
  new NSIS `-setup.exe` there and redeploy.
- Tauri window is a system WebView (Edge WebView2 on Windows) — same
  engine family as the PWA, so rendering matches.
