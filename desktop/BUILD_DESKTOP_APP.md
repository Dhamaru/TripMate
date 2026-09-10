# TripMate → desktop app (Tauri, free)

Wraps the deployed site (`https://tripmate-ylt6.onrender.com`) in a native
window — no URL bar, no tabs, no ⋮ menu, no extensions. Normal OS title bar
(drag / minimize / maximize / resize / snap). Ships a Windows
`.exe` installer with a built-in **auto-updater**. First launch shows a
one-time "unknown publisher" warning (More info → Run anyway) — removing
that needs a paid code-signing cert, optional.

## 1. Rust (one time)

<https://rustup.rs> → `rustup-init.exe` → accept defaults, reopen the
shell. Needs the MS C++ Build Tools ("Desktop development with C++" in the
Visual Studio Installer) — rustup prompts.

`~/.cargo/bin` is not on PATH in non-interactive shells; prepend it there.

## 2. Scaffold

```powershell
cd desktop
npm create tauri-app@latest tripmate-desktop -- --template vanilla --manager npm --yes
cd tripmate-desktop
```

## 3. Apply the tracked customization

Copy the three tracked files (in `desktop/`) into the scaffold:

| tracked                             | → destination                         |
| ----------------------------------- | ------------------------------------- |
| `desktop/lib.rs`                    | `src-tauri/src/lib.rs`                |
| `desktop/tauri.conf.json`           | `src-tauri/tauri.conf.json`           |
| `desktop/capabilities-default.json` | `src-tauri/capabilities/default.json` |

Then:

```powershell
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
cd src-tauri; cargo add tauri-plugin-updater tauri-plugin-dialog; cd ..
npm run tauri icon ../icon-512.png
```

`lib.rs` defines the window (decorated, points at the live URL) and, on
launch, checks `plugins.updater.endpoints` — if a newer signed build is
published it shows a native "Update available → Install & restart" dialog.

## 4. Build a signed release

The updater only accepts builds signed with the key whose public half is in
`tauri.conf.json > plugins.updater.pubkey`. Private key + password are in
`desktop/.updater-secret` (gitignored). **Lose them and no installed copy
can ever auto-update again.**

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\tripmate-updater.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<from desktop/.updater-secret>"
npm run tauri build
```

Produces `src-tauri/target/release/bundle/nsis/TripMate_<ver>_x64-setup.exe`
and `…-setup.exe.sig`.

## 5. Publish (this is what makes auto-update work)

Into `client/public/download/`, then commit + push (Render redeploys):

1. `TripMate_<ver>_x64-setup.exe` — the versioned installer the updater fetches
2. `TripMate-Setup.exe` — copy of the same, the stable "download now" link
3. `latest.json` — the update manifest:

```json
{
  "version": "1.0.1",
  "notes": "…",
  "pub_date": "<ISO-8601 UTC>",
  "platforms": {
    "windows-x86_64": {
      "signature": "<full contents of the .sig file>",
      "url": "https://tripmate-ylt6.onrender.com/download/TripMate_1.0.1_x64-setup.exe"
    }
  }
}
```

Installed apps poll `…/download/latest.json` on launch; if its `version` is
newer than theirs, the dialog appears.

> Write `latest.json` as UTF-8 **without a BOM** — the updater's JSON parser
> rejects a leading BOM. `Set-Content -Encoding utf8` in Windows PowerShell 5
> adds one; use `[System.IO.File]::WriteAllText($path,$json)` or write it
> from `node`/`python` instead.

## Each new release

Bump `version` in `desktop/tauri.conf.json` **and** the scaffold's
`src-tauri/tauri.conf.json`, rebuild signed (step 4), redo step 5 with the
new version number in all three places. Web-only changes need nothing — the
window loads the live site.

## Notes

- `desktop/tripmate-desktop/` is gitignored (generated). Tracked: this doc,
  `icon-512.png`, `lib.rs`, `tauri.conf.json`, `capabilities-default.json`.
- The v1.0.0 installer (pre-updater) can't auto-update — that one machine
  needs a manual reinstall of ≥1.0.1 once; after that it's automatic.
- WebView2 (Edge) renders it — same engine family as the PWA.
