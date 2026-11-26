# Database backups

Production runs on MongoDB Atlas's free tier, which has no backups of its own.
`.github/workflows/db-backup.yml` covers that gap:

- A nightly `mongodump` of the `tripmate` database (21:00 UTC), plus a manual
  "Run workflow" button on the Actions tab.
- Encrypted with AES-256 (`gpg --symmetric`) before upload. The repo is
  public, so a dump is never stored unencrypted.
- Kept as a workflow artifact for 30 days.

## One-time setup

1. In GitHub, go to repo **Settings → Secrets and variables → Actions** and add:
   - `MONGODB_URI`: the production connection string. A read-only database
     user is enough: in Atlas, **Database Access → Add user**, role "Read any
     database".
   - `BACKUP_PASSPHRASE`: a long random passphrase. Keep a copy somewhere
     safe outside GitHub; without it no backup can be restored.
2. In Atlas, **Network Access** must allow GitHub's runners. If Render already
   connects through `0.0.0.0/0`, nothing changes.
3. On the Actions tab, run **Database Backup** once by hand and check that it
   produced an artifact.

## Restore

1. On the Actions tab, open a **Database Backup** run and download the
   artifact (a zip containing `tripmate-<date>.archive.gz.gpg`).
2. Decrypt it:
   `gpg --decrypt tripmate-<date>.archive.gz.gpg > tripmate.archive.gz`
   Enter the passphrase when asked.
3. Restore into a scratch database first and check it:
   `mongorestore --uri="<uri>" --archive=tripmate.archive.gz --gzip --nsFrom="tripmate.*" --nsTo="tripmate_restore.*"`
4. Only after checking it, restore over production by dropping `--nsFrom`
   and `--nsTo` and adding `--drop`. This overwrites live data.

Do a test restore into a scratch database once after setup, so you know the
backups actually work.
