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

Normal OS-decorated window (real title bar: drag, minimize, maximize,
close, resize, Windows snap). No browser chrome — no URL bar, no tabs, no
⋮ menu, no extensions. `src-tauri/src/lib.rs` stays at the scaffold
default.

**`src-tauri/tauri.conf.json`** — `productName` `TripMate`, `identifier`
`com.onrender.tripmate.desktop`, `version` `1.0.0`, and:

```json
"app": {
  "withGlobalTauri": false,
  "windows": [
    {
      "label": "main",
      "title": "TripMate",
      "url": "https://tripmate-ylt6.onrender.com",
      "width": 1200, "height": 800,
      "minWidth": 360, "minHeight": 600,
      "resizable": true, "maximizable": true, "decorations": true
    }
  ],
  "security": { "csp": null }
}
```

Icons: copy `../icon-512.png` over `src-tauri/icons/icon.png`, then
`npm run tauri icon ../icon-512.png`.

> Frameless (`decorations: false`) was tried and reverted: a custom title
> bar has to be injected into the remote page, and Tauri won't expose its
> window API to a remote origin without extra capability config — the
> injected buttons ended up dead and the window couldn't be moved or
> closed. Not worth it for a web wrapper.

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
