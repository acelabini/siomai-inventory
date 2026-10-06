# Task 8: Backups, Restore, Settings, and Recovery

## Outcome

Implemented SQLite API snapshots for automatic, manual, and safety backups; one automatic startup backup per Asia/Manila calendar day; and 30-file automatic-backup retention. Existing databases receive a safety snapshot before migrations. Imports, restore, and migration startup share one main-process exclusive operation lock, and imports take a safety snapshot before the Task 7 `ImportService.commit()` path.

Restore validates integrity, foreign keys, all expected version-3 migrations, required tables, and required columns before touching the live database. It creates a pre-restore safety snapshot, snapshots the selected SQLite database through SQLite's backup API (including committed WAL content), then atomically replaces the live database. Failed replacement attempts restore the original file or safety backup and return a stable recovery error. The app relaunches after a successful restore.

Settings now supports business-name editing, fixed PHP / Asia-Manila display, backup-directory selection, manual backup creation, and a named restore confirmation with cancellation and validation errors.

## RED/GREEN evidence

- Backup RED: `npm test -- tests/integration/backup-service.test.ts` failed because `src/main/services/backup-service` did not exist.
- Settings RED: `npm test -- tests/renderer/settings-page.test.tsx` failed because `src/renderer/pages/SettingsPage` did not exist.
- GREEN: the focused backup and Settings suites pass 14/14 tests. Backup cases cover Manila-day idempotence, retention, committed snapshot content, pre-operation snapshot content, corrupt/foreign/newer schema rejection without changing live data, atomic restore with a safety snapshot, WAL-resident committed data, and operation-lock ordering/failure release. Settings cases cover business-name save, fixed settings display, directory selection, manual backup, named confirmation, picker/confirmation cancellation, invalid backup errors, and relaunch after success.
- The first post-implementation focused run exposed a malformed SQL string in the newer-schema test fixture; corrected the fixture to use a parameterized insert, then reran the suite successfully.

## Verification

All commands ran in WSL using the requested runner:

```sh
npx --yes --package=node@22.23.3 node "$(command -v npm)" ...
```

- Full test suite: 17 files, 111 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.

## Self-review

- Confirmed backup snapshots are created with `better-sqlite3`'s SQLite backup API and use a temporary file plus rename for publication.
- Confirmed restore validation precedes safety backup, live connection closure, and file replacement; invalid backups leave the live connection and data available.
- Confirmed restore snapshots its source through SQLite's backup API so data committed to a source WAL is included in the replacement.
- Existing unrelated edits to `.gitignore` and the shared plan/spec were left untouched.
