# Task 4 — Fixed-Field Module Editing Report

## Result

- Commit: `bee61768c50075f31e370feea8969186d971bb6f` (`Add audited fixed-field module editing`)
- Base: `5989e03c6e88ba7754388a634ecd2c6f77af0bdb`
- Basic、Library 與 BudgetBook 現在透過 Task 3 `useYearModule.save(data, audit)` 以單一 batch 儲存固定欄位與 audit log。
- BudgetBook PDF 仍只能下載；此任務沒有實作上傳、Storage 寫入或 Task 5+ records CRUD。

## TDD evidence

### Baseline

```sh
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_API_KEY=test-key npm test -- --reporter=dot
```

```text
Test Files  9 passed (9)
Tests       67 passed (67)
```

### RED — validators, deadline, exact comparison, and field-scoped audits

The first focused run was made before production implementation:

```sh
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_API_KEY=test-key npm test -- src/lib/fixedFieldEditing.test.js src/lib/yearDataRepository.test.js --reporter=verbose
```

Observed failures:

- `fixedFieldEditing.js` did not exist.
- Audited module save returned the complete server document in `before`/`after`; the test expected only `classes`, `students`, and `status`, preserving `13` as a number and `'262'` as a string.

The first GREEN checkpoint was:

```text
Test Files  2 passed (2)
Tests       32 passed (32)
```

### RED — mounted meta/module/audit/Shell lifecycles

Mounted hook tests then failed with the intended missing behavior:

```text
Test Files  2 failed (2)
Tests       5 failed (5)
```

- `useYearMeta` exposed neither `exists`/`error` nor an imperative write decision and leaked the prior year during a switch.
- `useYearModule` exposed no imperative readiness decision.
- `useAuditLog` did not exist.
- `useCurrentYearGuard` did not exist.

After implementation, the new lifecycle tests plus all pre-existing Task 3 mounted tests passed:

```text
Test Files  3 passed (3)
Tests       19 passed (19)
```

### RED — source-version and pending state machine

`useFixedFieldEditor.test.js` first failed because the hook did not exist. Its GREEN checkpoint covered:

- synchronous duplicate-save rejection;
- success with no source update;
- success after one exact, type-preserving submitted echo;
- safe reset for intermediate, unrelated, or type-mismatched source updates;
- retained callbacks after year/module scope change and unmount.

```text
Test Files  1 passed (1)
Tests       6 passed (6)
```

### RED — mounted Basic, Library, and BudgetBook behavior

Before the page rewrite, six mounted tests failed for the expected reasons:

- Basic still used the legacy change log and lacked the new loading/error/audit states.
- Library saved the whole source object without an audit, retained numeric/unrelated fields, and ignored the Shell guard.
- BudgetBook had no fixed-field edit control.

After implementation:

```text
Test Files  2 passed (2)
Tests       13 passed (13)
```

These tests exercise real mounted inputs and click handlers rather than source-only assertions.

### RED — exact object edge case found in self-review

A final regression test proved that two different `Date` objects were incorrectly considered equal because both have zero enumerable fields:

```text
Test Files  1 failed (1)
Tests       1 failed | 20 passed (21)
```

Prototype checks plus exact `Date#getTime()` comparison made the validator/editor checkpoint pass:

```text
Test Files  2 passed (2)
Tests       27 passed (27)
```

## Implemented behavior

- All Basic, Library, and BudgetBook edit/save/cancel callbacks call the current AuthContext authorization source at invocation.
- The same callbacks invoke the Shell-provided `hasCurrentYear`, current `useYearMeta.authorizeWrite`, and current `useYearModule.authorizeWrite` decisions before changing edit state or writing.
- `useYearMeta` now masks transitions and requires the current year snapshot to be loaded, present, and unlocked; missing/error/locked/loading states deny writes in Traditional Chinese.
- `useYearModule.authorizeWrite` consumes Task 3 snapshot-gated readiness and revokes after scope changes, listener errors, or unmount.
- `useCurrentYearGuard` uses unique Shell lifetime and selected-year tokens. Retained callbacks fail after a year switch/unmount; an old effect cleanup cannot revoke the newly rendered year scope.
- Basic checks its current deadline inside every edit/save/cancel invocation. `YYYY-MM-DD` is parsed as local `23:59:59.999`, invalid calendar dates fail closed, and years `0000`–`0099` retain their actual year.
- Basic validates all six count fields for both draft and submitted saves. Library validates both count fields. Only non-empty digit strings are accepted, including zero.
- BudgetBook trims both text fields, rejects empty strings, and limits each to 100 characters.
- Pending state is set synchronously before awaiting Firestore, disables every field/action, and rejects duplicate saves before a second repository call.
- Save payloads contain only each module's fixed editable fields. Audit `fields` scopes repository-derived server `before` and merged `after` objects without string coercion; unrelated server fields remain unchanged in the module document and are excluded from the audit snapshot.
- Audit actor identity uses the current Firebase UID and profile name, with email/name fallbacks.
- Source lifecycle accepts success only with no source version or one exact, type-preserving submitted echo. Intermediate, unrelated, second, and type-mismatched updates reset to the latest snapshot without reporting a false success.
- `useAuditLog` queries `/years/{year}/auditLogs` with `where('moduleKey', '==', moduleKey)` before `orderBy('createdAt', 'desc')` and `limit(max)`. A→B→A callbacks are token-scoped, and Basic renders audit loading/error/empty/data states separately.
- BudgetBook retains its read-only PDF link/disabled state and contains no file input or upload mutation.

## Files changed

- `src/App.jsx` — provides each page with the lifetime-bound current-year guard.
- `src/hooks/useCurrentYearGuard.js` and test — unique Shell lifetime/year callback invalidation.
- `src/hooks/useFixedFieldEditor.js` and test — fixed-field draft, pending, duplicate-write, and exact source-version lifecycle.
- `src/hooks/useYearData.js` — scope-safe year metadata, imperative module/meta readiness, and module-filtered audit log hook.
- `src/hooks/useYearMetaAudit.test.js` — mounted year/module/audit readiness and stale callback coverage.
- `src/lib/fixedFieldEditing.js` and test — count validation, local deadline parsing, and exact typed comparisons.
- `src/lib/yearDataRepository.js` and test — exact field-scoped audited module snapshots while preserving unrelated server data.
- `src/pages/Basic.jsx`, `src/pages/Library.jsx`, `src/pages/BudgetBook.jsx` — audited fixed-field create/update forms and Chinese states.
- `src/pages/fixedFieldModules.test.jsx` — mounted page behavior, event-time guards, validation, pending, echo, audit payload, and PDF boundary.

## Final verification

Focused Task 4 plus Task 3 compatibility suite:

```sh
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_API_KEY=test-key npm test -- src/lib/fixedFieldEditing.test.js src/lib/yearDataRepository.test.js src/hooks/useCurrentYearGuard.test.js src/hooks/useFixedFieldEditor.test.js src/hooks/useYearMetaAudit.test.js src/hooks/useYearData.test.js src/pages/fixedFieldModules.test.jsx src/pages/mutationAuthorization.test.js --reporter=dot
```

```text
Test Files  8 passed (8)
Tests       71 passed (71)
```

Full environment-pinned suite:

```sh
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_API_KEY=test-key npm test -- --reporter=dot
```

```text
Test Files  14 passed (14)
Tests       107 passed (107)
```

Production build:

```sh
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_API_KEY=test-key npm run build
```

```text
vite v6.4.3 building for production...
✓ 313 modules transformed.
✓ built in 2.00s
```

Diff validation:

```sh
git diff --cached --check
```

```text
(no output; exit 0)
```

## Self-review

- Re-read the Task 4 brief, design constraints, and controller binding requirements line by line.
- Confirmed all nine edit/save/cancel handlers make a current AuthContext check and then call current year, year-meta, and module-readiness guards; Basic additionally re-parses the current deadline.
- Confirmed save payloads and audit field lists are fixed and contain no spread of the source module document.
- Confirmed the repository still performs the server re-read and single-batch module/audit write from Task 3.
- Confirmed exact comparisons distinguish numeric/string values, nested unrelated changes, different prototypes, and different dates.
- Confirmed audit state is queried server-side by `moduleKey`, ordered newest first, limited, and stale-listener safe.
- Confirmed Task 3 record CRUD remains unchanged and compatible.
- Confirmed no Task 5 record page CRUD, Task 6 PDF upload, rules, indexes, migration, provisioning, or deployment was introduced.
- Per controller instruction, no reviewer subagent was spawned.

## Concerns / later task boundaries

- `npm run lint` still cannot start because this repository has ESLint 9 but no `eslint.config.js`, `eslint.config.mjs`, or `eslint.config.cjs`. This is pre-existing and explicitly remains Task 7; the command exits 2 before linting any file.
- Vite still emits the pre-existing warning for a minified chunk larger than 500 kB; the production build exits 0.
- `useAuditLog`'s Firestore composite index (`moduleKey` + descending `createdAt`) remains Task 7 as planned.

---

# Task 4 review-finding fixes

## Result

- Fix commit: `055b799` (`Fix fixed-field editing review findings`).
- Basic now includes `status` in its editor comparison/submitted snapshot, so an exact create/status-transition echo is accepted while unrelated source changes still invalidate the save.
- A successful save with no listener echo advances an internal committed source. The next edit starts from submitted values, and one delayed exact echo is absorbed without cancelling or resetting a newer draft.
- Immutable audit actor identity now comes from the same live AuthContext imperative source as authorization at callback invocation. Current UID/name/email fallback changes are observed; revoked access or an unavailable actor fails closed.
- Year metadata is writable only when `locked === false`. Missing, `null`, `0`, `'false'`, and `true` are denied in the hook and hidden/denied consistently in Basic, Library, and BudgetBook.
- Active metadata/module errors take precedence over loading in all three pages, render Traditional Chinese errors, and expose no write path.
- BudgetBook PDF remains read-only. No file upload, Storage mutation, records CRUD, or Task 5+ behavior was added.

## Review-fix TDD evidence

### RED/GREEN 1 — status echo and committed source baseline

RED command:

```sh
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_API_KEY=test-key npm test -- src/hooks/useFixedFieldEditor.test.js src/pages/fixedFieldModules.test.jsx --reporter=verbose
```

Observed RED:

```text
Test Files  2 failed (2)
Tests       3 failed | 13 passed (16)
```

- A successful no-echo save reopened from the old source value (`1`) instead of submitted `11`.
- A delayed exact echo cancelled a newer edit and replaced `12` with `11`.
- Basic treated the exact `draft` → `submitted` status transition as unrelated data and reported a source conflict.

GREEN with the same command:

```text
Test Files  2 passed (2)
Tests       16 passed (16)
```

The checkpoint also explicitly preserves rejection of a repeated exact publication, intermediate value, unrelated edit, and type mismatch.

### RED/GREEN 2 — invocation-current immutable audit actor

RED command:

```sh
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_API_KEY=test-key npm test -- src/contexts/AuthContext.test.jsx src/pages/fixedFieldModules.test.jsx --reporter=verbose
```

Observed RED:

```text
Test Files  2 failed (2)
Tests       2 failed | 11 passed (13)
```

- The live authorization source had no imperative actor decision API.
- A retained Library save wrote render-captured `admin-fixed / 校務管理員` instead of invocation-current `current-user / 即時名稱`.

GREEN command:

```sh
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_API_KEY=test-key npm test -- src/lib/accessPolicy.test.js src/contexts/AuthContext.test.jsx src/pages/fixedFieldModules.test.jsx --reporter=verbose
```

```text
Test Files  3 passed (3)
Tests       23 passed (23)
```

During self-review, the page fixture was switched from a duplicated actor decision mock to the real `createAuthorizationSource`. That exposed missing `role/modules` in the fixture rather than a product defect; after matching the real access shape, the actor/Auth/page checkpoint passed `29/29` with no unhandled rejection.

### RED/GREEN 3 — exact lock readiness and error precedence

RED command:

```sh
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_API_KEY=test-key npm test -- src/hooks/useYearMetaAudit.test.js src/pages/fixedFieldModules.test.jsx --reporter=verbose
```

Observed RED:

```text
Test Files  2 failed (2)
Tests       9 failed | 15 passed (24)
```

- `locked` missing, `null`, and `0` were incorrectly authorized.
- Basic, Library, and BudgetBook exposed their edit control for non-boolean falsy lock values.
- Each page rendered loading instead of an active module error when metadata was loading.

GREEN with the same command:

```text
Test Files  2 passed (2)
Tests       24 passed (24)
```

The mounted cases cover missing, `null`, `0`, `'false'`, and `true`, plus both error/loading directions and zero repository writes.

## Final verification

Focused Task 4 plus Task 3/Auth compatibility suite:

```sh
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_API_KEY=test-key npm test -- src/lib/accessPolicy.test.js src/contexts/AuthContext.test.jsx src/lib/fixedFieldEditing.test.js src/lib/yearDataRepository.test.js src/hooks/useCurrentYearGuard.test.js src/hooks/useFixedFieldEditor.test.js src/hooks/useYearMetaAudit.test.js src/hooks/useYearData.test.js src/pages/fixedFieldModules.test.jsx src/pages/mutationAuthorization.test.js --reporter=dot
```

```text
Test Files  10 passed (10)
Tests       102 passed (102)
```

Fresh full environment-pinned suite immediately before commit:

```sh
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_API_KEY=test-key npm test -- --reporter=dot
```

```text
Test Files  14 passed (14)
Tests       124 passed (124)
```

Fresh production build immediately before commit:

```sh
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_API_KEY=test-key npm run build
```

```text
vite v6.4.3 building for production...
✓ 313 modules transformed.
✓ built in 2.63s
```

Cached diff validation:

```sh
git diff --cached --check
```

```text
(no output; exit 0)
```

## Files changed by `055b799`

- `src/contexts/AuthContext.jsx`
- `src/contexts/AuthContext.test.jsx`
- `src/hooks/useFixedFieldEditor.js`
- `src/hooks/useFixedFieldEditor.test.js`
- `src/hooks/useYearData.js`
- `src/hooks/useYearMetaAudit.test.js`
- `src/lib/accessPolicy.js`
- `src/pages/Basic.jsx`
- `src/pages/Library.jsx`
- `src/pages/BudgetBook.jsx`
- `src/pages/fixedFieldModules.test.jsx`

## Review-fix self-review

- Re-read all five reviewer findings against the final diff and exercised each with mounted behavior.
- Confirmed Basic's comparison field set is the six count fields plus `status`; validation remains restricted to the six count fields.
- Confirmed the committed source merges only the submitted fixed fields over the prior source, preserving unrelated baseline values and exact type comparison.
- Confirmed only one delayed exact echo is absorbed; active-save intermediate, unrelated, type-mismatched, and repeated publications retain the prior fail-safe reset behavior.
- Confirmed Basic, Library, and BudgetBook edit/save/cancel retained callbacks still re-run live authorization, Shell year, metadata, and module readiness guards; Basic also rechecks the invocation-current deadline.
- Confirmed audited saves alone require `authorizeModuleActor`, whose authorization and actor snapshot come from one synchronous imperative source. Revocation and missing actor return before `beginSave` and repository mutation.
- Confirmed year write authorization and all three edit-control conditions use exact boolean `locked === false`.
- Confirmed page-level active errors are checked before loading and return before any edit/save control is rendered.
- Confirmed BudgetBook has no file input or upload mutation and retains only the PDF download link/disabled state.
- Confirmed no records CRUD, rules/index changes, migration, provisioning, deployment, or Task 5+ implementation entered the diff.

## Remaining concerns

- The build still emits the pre-existing chunk-size warning for the main minified bundle; build exits 0.
- The pre-existing ESLint 9/no flat-config limitation and Task 7 audit composite index boundary are unchanged.

---

# Task 4 deadline own-property fail-closed fix

## SHA

- Implementation commit: `ea2abff` (`Fail closed invalid basic deadlines`)

## RED

Before implementation, the focused regression command was:

```sh
VITE_FIREBASE_PROJECT_ID=test-project VITE_FIREBASE_API_KEY=test-key npm test -- src/lib/fixedFieldEditing.test.js src/pages/fixedFieldModules.test.jsx --reporter=verbose
```

```text
Test Files  2 failed (2)
Tests       10 failed | 34 passed (44)
```

- `getDeadlineState` was absent, so the helper contract for own-property presence had no implementation.
- A mounted Basic page accepted a retained cancel callback after metadata changed from a valid deadline to own-property `basic: false`; the editor closed instead of remaining protected.

## GREEN

The same focused command passed after the minimal implementation:

```text
Test Files  2 passed (2)
Tests       44 passed (44)
```

The helper treats only a missing own `deadlines.basic` property as no deadline. An inherited property is also absent; an own `''`, `null`, `0`, `false`, `NaN`, `undefined`, malformed date, or impossible date is invalid. Basic uses the state both for its Traditional Chinese invalid-deadline UI and at each edit/save/cancel invocation, before any repository save.

## Final verification

Focused Task 4 compatibility suite:

```text
Test Files  10 passed (10)
Tests       111 passed (111)
```

Full environment-pinned suite:

```text
Test Files  14 passed (14)
Tests       133 passed (133)
```

Production build completed successfully with the existing Vite large-chunk warning. `git diff --check` produced no output and exited 0 before the implementation commit.

## Files

- `src/lib/fixedFieldEditing.js`
- `src/lib/fixedFieldEditing.test.js`
- `src/pages/Basic.jsx`
- `src/pages/fixedFieldModules.test.jsx`
- `.superpowers/sdd/firestore-task-4-report.md`
