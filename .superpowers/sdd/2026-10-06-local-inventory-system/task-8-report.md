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
- Confirmed restore validation precedes the safety backup and atomic file replacement; invalid backups leave the live connection and data available.
- Confirmed restore snapshots its source through SQLite's backup API so data committed to a source WAL is included in the replacement.
- Existing unrelated edits to `.gitignore` and the shared plan/spec were left untouched.

## Review round 1/5

### RED

- Complete-schema adversarial test: a version-3 database with every expected table and the expected settings column names, but without the settings primary key, was accepted and replaced live data. The new test failed because restore resolved instead of rejecting.
- Atomic replacement failure-injection test: the injected replacement error was ignored by the implementation; restore resolved and closed the live connection. The test failed because restore did not reject while leaving the original connection usable.
- Startup recovery test: the test first failed because the startup recovery module was absent. Its contract requires automatic-backup failure to continue through migration and app readiness with a warning, while failed safety backup must stop before migration and readiness.
- Authorization tests: the test first failed because the authorization module was absent. The IPC test then demonstrated the picker returned the raw path and accepted a renderer path as restore input.
- Settings warning test: the startup backup warning was not rendered; the test failed to find a recoverable alert.
- Fallback test: the configured backup location failure surfaced `ENOTDIR` rather than creating the safety copy under user data.

### GREEN

- Restore validation now compares every persisted SQLite schema object (tables, indexes, triggers, full table DDL and constraints) against a fresh schema produced by all current migrations, after integrity and foreign-key checks. The incomplete-but-plausible fixture is rejected without closing or changing live data.
- Restore stages and validates the replacement in the database directory, checkpoints WAL, switches the open live connection to DELETE journaling, and performs one POSIX atomic rename over the live path. Injected replacement failure leaves the original file and open connection readable and writable. Successful replacement keeps the old connection from serving further IPC until the renderer requests relaunch.
- Operation safety backup retries in `<userData>/recovery-backups`; if both configured and fallback destinations fail, startup displays a native recovery error and does not migrate. Automatic startup backup failure is retained as a Settings warning while migration, IPC registration, and window creation continue.
- The native picker now returns only a random one-time token and basename. Main resolves and consumes the token, then presents a native confirmation naming the backup before restore. Cancellation consumes the token without restore; invalid/reused tokens and raw paths are rejected.
- Focused review suites: 26/26 tests passed. Final full suite: 20 files, 123 tests passed. `npm run typecheck`, `npm run lint`, and `git diff --check` passed using the Node 22.23.3 WSL runner. One lint invocation during parallel verification exited with a WSL Bus error; isolated and final sequential lint reruns passed.
