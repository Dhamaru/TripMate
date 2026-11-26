# TripMate → standalone Android app (free, no Play Store)

Wraps the deployed PWA (`https://tripmate-ylt6.onrender.com`) into a real
signed `.apk` you sideload. Opens fully standalone — **no address bar, no
Chrome** — once Digital Asset Links is set up (step 4).

## One-time prerequisites

- **Node 18+** (already have it)
- **~2 GB free disk** + internet (Bubblewrap auto-downloads a JDK + the
  Android SDK build tools on first run — just say yes to its prompts)

```bash
npm install -g @bubblewrap/cli
```

## Build

Run everything from the `android/` folder:

```bash
cd android
```

### 1. Initialise (first time only)

```bash
bubblewrap init --manifest ./twa-manifest.json
```

- When it asks about the **signing key**: let it create one
  (`android.keystore`). **Write down the key store password + key password**
  — you need the same key for every future update.
- It prints a **SHA-256 fingerprint** like
  `AA:BB:CC:...`. Copy it. (Get it again anytime with
  `bubblewrap fingerprint list`.)

### 2. Build the APK

```bash
bubblewrap build
```

Output: `android/app-release-signed.apk`

### 3. Install on the phone

- USB: `adb install app-release-signed.apk`
- Or copy the `.apk` to the phone, open it, allow "install from this
  source". It lands in the app drawer as **TripMate**.

At this point it works but **still shows a thin URL bar** because the site
hasn't verified the app yet. Fix that next.

### 4. Verify the app ↔ domain (removes the URL bar)

1. Open `client/public/.well-known/assetlinks.json` in the repo.
2. Replace `REPLACE_WITH_SHA256_FINGERPRINT_FROM_bubblewrap_init` with the
   fingerprint from step 1 (keep the `AA:BB:...` colon format).
3. Commit + push → Render deploys it.
4. Confirm it's live:
   `https://tripmate-ylt6.onrender.com/.well-known/assetlinks.json`
5. Force-stop TripMate on the phone and reopen (Android re-checks the link
   within ~a few minutes, or clear the app's cache).

The URL bar disappears — fully standalone, like any store app.

## Updating later

After deploying new web changes there's nothing to rebuild — the app loads
the live site. Only rebuild the APK to change the icon, name, or bump the
version (`appVersionCode` + `appVersionName` in `twa-manifest.json`, then
`bubblewrap update && bubblewrap build`).

## Notes

- `packageId` is `com.tripmate.app` — fine for sideloading. Only matters
  for uniqueness if you ever publish to Play Store.
- `android/` (except this file + `twa-manifest.json`) and
  `android.keystore` are gitignored — the keystore is a secret, never
  commit it.
