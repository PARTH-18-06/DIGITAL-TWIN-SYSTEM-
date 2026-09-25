# Live Deployment QA

Date: 2026-09-24 (Asia/Calcutta)
Target: https://digital-twin-system-topaz.vercel.app/

## Verdict

The original deployment worked for the tested BGH workflows, but four issues needed attention before describing it as fully correct. This was functional and exploratory testing, not field validation, an exhaustive security audit, or a sustained load test.

## Fix Pass - 2026-09-24

Status: local fixes completed and verified. These changes do not establish field-data validation or engineering approval; they only correct dashboard state handling, risk display semantics, missing-history API behavior, and optimizer status disclosure.

## Follow-up Fix Pass - 2026-09-24

Status: local fixes completed and verified. No commit, push, PR, or deployment was performed in this pass.

### Changes made

- Forecast-driven input hydration now lets the same active forecast request finish, clear `Forecasting...`, and refresh history after it intentionally advances the operating-input version.
- Request completion now also checks the active request id for each action type, so an older request cannot clear a newer request's loading state or overwrite newer results.
- Simulation, optimization, forecast, and risk requests now capture their request input/well snapshot for follow-up history refreshes instead of reading a later mutable input state.
- `frontend/package.json` now runs both `tests/*.test.ts` and `tests/*.test.mjs`, so the existing well-input regression suite is included in the default `pnpm test` command.

### Local verification results

- Frontend tests: 24 passed, including the 13 existing `wellInput.test.mjs` tests and new request-lifecycle regressions for forecast hydration, input-change invalidation, well-switch invalidation, and older/newer request interference.
- Frontend production build: passed. Existing Vite warning remains for a chunk larger than 500 kB.
- Backend tests: 46 passed, 2 existing deprecation warnings.
- `git diff --check -- . ':!backend/.gitignore'`: passed for the files changed in this pass.
- Full `git diff --check`: reports `backend/.gitignore:9: new blank line at EOF.` This was a pre-existing unrelated local change and was intentionally preserved per the request.

### Remaining limitations

- This follow-up pass did not redeploy and did not run a browser automation smoke test; it was limited to local code/test/build verification.

## What-if And Historical Charts Pass - 2026-09-24

Status: local implementation completed and verified. No commit, push, PR, or deployment was performed in this pass.

### Changes made

- Added a what-if scenario comparison panel with up to four scenarios per selected well. Scenarios have independent CSS/SRP settings, names, edit/remove/apply actions, per-scenario loading/error/retry state, dirty markers after edits, and stale-response rejection after edits, deletion, or well switching.
- Scenario evaluation uses the existing Stage 1 simulation API. Production, SOR, and energy are displayed as explicitly labeled Stage 1 proxy estimates derived from simulation output and inputs. The panel does not declare a universal best scenario or create a combined score.
- Applying a scenario updates dashboard inputs and invalidates simulation, optimization, forecast, risk, and recommended-twin state.
- Added a focused read-only observations API: `GET /api/history/{well_id}/observations?limit=...`, using existing well-identifier resolution and Supabase observation access patterns.
- Added historical SVG charts for oil production, reservoir temperature, steam volume, and available risk. Charts distinguish synthetic observations, simulation scenarios, and forecasts; use actual timestamps; preserve missing values as gaps; provide date-range controls and SVG tooltips.
- Added an uncertainty notice: "Prediction interval unavailable." No prediction interval is shown because this project has no calibration artifact for statistically valid intervals. R² values and classifier probabilities are not converted into confidence ranges.

### Local verification results

- Frontend tests: 34 passed.
  - Added tests for scenario independence, baseline differences, stale response guards, deletion/unknown scenario rejection, partial failure retry state, historical ordering, date filtering, missing values as gaps, source labels, and prediction-interval unavailable state.
- Backend tests: 47 passed, 2 existing deprecation warnings.
  - Added observations endpoint regression coverage, including well-name lookup and bounded limit validation.
- Frontend production build: passed. Existing Vite warning remains for a chunk larger than 500 kB.
- `git diff --check -- . ':!backend/.gitignore'`: passed for files changed in this pass.
- Full `git diff --check`: reports `backend/.gitignore:9: new blank line at EOF.` This was a pre-existing unrelated local change and was intentionally preserved.
- Local preview started successfully at `http://127.0.0.1:5173/` with backend at `http://127.0.0.1:8000`.
- Additional fixes from final verification:
  - Edited scenario inputs now clear the previous result object and dirty scenarios are excluded from active baseline comparisons until reevaluated.
  - Historical chart values now include expandable, keyboard/touch-accessible value buttons instead of relying only on SVG `<title>` tooltips.
  - Scenario baseline controls expose `aria-pressed`, and what-if/chart controls have visible `:focus-visible` styling.
- Browser smoke in the available in-app browser:
  - BGH-001 loaded real inputs and observations.
  - Simulation ran and updated prediction output and the 3D twin.
  - What-if baseline scenario evaluated independently and displayed comparison rows.
  - Forecast, risk, and optimization ran; run history refreshed with new runs.
  - Recommended twin visualization switched to AI-recommended mode and retained one canvas.
  - Historical charts rendered observation, simulation, and forecast series with source labels.
  - A clean post-fix preview tab showed no new React key warnings or console errors; only Vite connection logs and the standard React DevTools info message were present.
- Headless Chrome verification through the DevTools Protocol:
  - Exercised the actual UI for creating four scenarios and confirmed the add limit.
  - Renamed, edited, removed, evaluated, failed, retried, and applied scenarios independently.
  - Confirmed edited evaluated scenarios become dirty and no longer contribute current comparison values until reevaluated.
  - Confirmed a delayed stale response after editing a pending scenario did not restore outdated results.
  - Confirmed deleting a pending scenario kept it deleted after its late response returned.
  - Confirmed switching from BGH-001 to BGH-013 reset scenarios and kept previous-well scenario names/results out of the new well.
  - Confirmed one failed scenario preserved successful scenario results and retry recovered only the failed scenario.
  - Confirmed applying a scenario transferred the intended input values and invalidated downstream dashboard results.
  - Rechecked simulation, optimization, forecast, risk, current/recommended twin mode, date filtering, empty chart ranges, history/observations refresh, and one-canvas rendering.
  - Responsive checks at desktop, tablet, 390 px, and 360 px found no document-level horizontal overflow. Wide scenario comparison tables scroll inside their container on tablet/mobile.
  - Chart value disclosures exposed keyboard/touch-accessible values on tablet/mobile; SVG title tooltips are no longer the only value-access path.
  - Stable screenshots captured under `qa_screenshots/`:
    - `qa-stable-desktop-whatif.png`
    - `qa-stable-desktop-history.png`
    - `qa-stable-tablet-whatif.png`
    - `qa-stable-tablet-history.png`
    - `qa-stable-mobile-390-whatif.png`
    - `qa-stable-mobile-390-history.png`
    - `qa-stable-mobile-360-whatif.png`
    - `qa-stable-mobile-360-history.png`
  - The automated browser run intentionally generated one scenario 422 response to verify partial-failure handling. Chrome also reported a Three.js shader precision warning from the local GPU/WebGL stack. No React duplicate-key warning was captured after the chart-key fix, though the long-lived Vite terminal still contains older pre-fix warning lines from 03:44.

### Remaining limitations

- Production/SOR/energy in the what-if panel are scenario-comparison proxies from the Stage 1 simulation, not calibrated production predictions or field measurements.
- No calibrated prediction intervals are available. Adding ranges would require validation/calibration work that is not present in the current artifacts.
- Browser automation used local headless Chrome viewport emulation rather than physical touch hardware. It verified mobile widths and touch-accessible controls, but a final manual pass on an actual phone/tablet is still recommended before demo.
- The observations endpoint depends on Supabase `well_observations`; if Supabase is unavailable, charts show the existing frontend error state.

## Field Data Import Verification Pass - 2026-09-25

Status: local implementation and remaining end-to-end verification completed. No commit, push, PR, deployment, production migration, or production data import was performed.

### Changes made during final verification

- Fixed the CSV import panel's request lifecycle:
  - File and metadata changes now invalidate the active dry-run/confirm request.
  - A dry-run preview is tied to the exact CSV text, dataset identifier, source, and data kind that produced it.
  - Old dry-run responses can no longer enable confirmation after the operator changes the file or import metadata.
  - Empty files, unsupported non-CSV files, and files over 2,000,000 bytes are rejected locally with clear messages before validation.
- Added an explicit production-like write guard:
  - `ALLOW_LOCAL_CSV_IMPORT=true` is no longer sufficient by itself when `ENVIRONMENT=production`, `RENDER`, or `VERCEL` is present.
  - Confirmed imports remain disabled by default.
- Added focused regression tests for the import payload guard, unsupported file handling, production write guard, and duplicate-safe isolated storage behavior.

### Actual browser upload verification

- Browser automation used the actual file chooser flow with local fixture files under `qa_screenshots/import-fixtures/`.
- Selecting `valid_observations.csv` updated React state: the filename appeared and `Dry-run preview` became enabled.
- Dry-run through the browser returned `total_rows=1`, `valid_rows=1`, `importable_rows=1`, and `errors=0`.
- The UI now reads the backend import rules and shows an import-disabled notice when writes are unavailable; in production/default mode the `Confirm import` button stays disabled instead of becoming clickable and failing.
- Selecting `invalid_observations.csv` cleared the prior preview and produced row-level errors:
  - unknown well identifier,
  - invalid timestamp,
  - non-numeric oil production,
  - missing reservoir temperature.
- Selecting the corrected valid CSV after the invalid one cleared stale errors and preview rows before the new dry-run; the new dry-run then re-enabled confirmation.
- Changing the dataset identifier while a large dry-run request was pending left confirmation disabled and did not display stale preview stats after the old response returned.
- Empty, unsupported, and oversized files were verified through the same file input:
  - empty CSV: `CSV file is empty...`
  - `.txt` file: `Only CSV files are supported...`
  - oversized CSV: `CSV file is too large...`
- Direct API confirmation was blocked by the default backend guard with HTTP 403 and the clear `IMPORT_DISABLED` message. No production data was modified.
- Browser console inspection after the import workflow showed no warnings or errors.

### Isolated storage and API verification

- Dry-run was verified to make no writes through a focused backend test.
- Confirmation success, provenance persistence, repeated-import duplicate skipping, and storage failure handling were verified with isolated in-memory mocked storage, not production Supabase.
- Repeated confirm against the same isolated storage imported one row on the first call and skipped the duplicate on the second call without overwriting or duplicating observations.
- Imported rows preserve provenance fields in the isolated storage path: source, upload id, upload time, dataset identifier, `data_kind`, and `field_validated=false`.
- The dashboard continues to label user-supplied field data as unverified, and prediction intervals remain unavailable.
- Confirmed import against a real database was intentionally not run because the request forbids production data writes and no disposable local Supabase database was configured in this workspace.

### Automated regression results

- Frontend tests: 36 passed.
- Backend tests: 59 passed, 2 existing deprecation warnings.
- Frontend production build: passed. Existing Vite chunk-size warning remains for the main bundle.
- `git diff --check -- . ':!backend/.gitignore'`: passed. The unrelated `backend/.gitignore` blank EOF change remains preserved.
- Credential scan over frontend, backend app code, docs, and this QA report found only variable names such as `SUPABASE_KEY`, not actual keys or credentials.

### Responsive and accessibility checks

- Upload workflow checked at desktop 1280 px, 390 px, and 360 px widths.
- Import controls retained labels, keyboard-focusable controls, loading/error messages, and no document-level horizontal overflow.
- Screenshots captured:
  - `qa_screenshots/qa-import-desktop-1280.png`
  - `qa_screenshots/qa-import-mobile-390.png`
  - `qa_screenshots/qa-import-mobile-360.png`

### Remaining limitations

- Browser automation used the in-app browser's Playwright-compatible file chooser, not physical touch hardware.
- Confirmed import success used isolated mocked storage. A disposable real local Supabase/Postgres environment was not available, so no migration was applied to a live database.
- The provenance migration remains unapplied to production and must be applied only to the intended target database before real confirmed imports can persist provenance columns.
- Importing future real field data does not retrain models, validate prediction intervals, or create field-approved operating limits.

### Changes made

- Input and well changes now invalidate displayed simulation, optimization, forecast, and risk results. In-flight responses are accepted only when their well-selection and operating-input versions still match the current dashboard state.
- The 3D twin risk summary now has an explicit "Risk not assessed" state. When risk data exists, it selects the highest assessed category first, then the highest score within that category, so a MEDIUM category is not hidden by a larger LOW numeric score.
- Forecast and risk endpoints now return structured HTTP 422 `INSUFFICIENT_HISTORY` responses when Supabase has no observations and the local CSV fallback is unavailable or empty. Supabase observation-query failures still surface as infrastructure errors.
- The optimization panel now shows optimizer termination. If the differential-evolution search reaches the iteration limit, the UI describes the result as the best candidate found within the search budget, not a confirmed converged optimum.

### Local verification results

- Frontend regression tests: 5 passed.
- Backend targeted regression tests: 14 passed.
- Full backend tests: 46 passed, 2 existing deprecation warnings.
- Frontend production build: passed. Existing Vite warning remains for a chunk larger than 500 kB.
- Local API smoke: `/health` returned `{"status":"ok"}`. `POST /api/forecast/next-day` and `POST /api/risk` for `DEMO-001 (synthetic)` returned structured 422 insufficient-history responses, not 500s.
- Browser smoke in the available in-app browser: BGH-001 simulation, risk assessment, forecast, optimization, history, 3D twin, current/recommended mode, and one-canvas rendering worked with no console errors or warnings.
- Rapid input-change smoke: changing `steam_volume` while optimization was in flight prevented the stale optimization response from repopulating the dashboard. A clean rerun displayed the max-iteration search-budget notice.
- Well-switching smoke: switching to BGH-013 cleared stale results and kept one canvas.
- Responsive smoke: desktop 1440x1000 and mobile 390x844 had no horizontal overflow and one canvas. At 320x800, `scrollWidth` equaled the viewport width and no element extended past the viewport; the `clientWidth` comparison is smaller because of the vertical scrollbar.

### Remaining limitations

- Browser automation used the Codex in-app browser because Chrome was not exposed to the controller in this session.
- This pass did not run a sustained load test, forced Render/Vercel cold starts, every parameter combination, every browser engine, security penetration testing, or prediction-accuracy validation against measured field data.

## Findings

### 1. Edited inputs retain stale results

Priority: high for decision-support correctness.

Reproduction: select BGH-001, run optimization, then change Steam volume from 1103.725771 to 600 without rerunning. The Current parameter column updates to 600, while the current production prediction remains 14.416 and the recommendation remains 756.347. There is no stale-results indicator. Existing simulation and risk results also remain visible after input edits.

Cause: `frontend/src/App.tsx:65` updates inputs without advancing the operating version or invalidating results. The request guard at line 69 therefore also cannot reject results computed before ordinary input edits.

Expected: retain the result's original input snapshot, or invalidate/mark results stale and reject outdated in-flight responses.

### 2. Risk summary can understate an individual category

Priority: high for interpretation of results.

Reproduction: run risk assessment on BGH-001 with its loaded baseline inputs. Rod failure is MEDIUM (score 0.184), while the twin displays Max risk LOW 21% because rod floating has the largest numeric score (0.215) but a LOW classifier category.

Cause: `frontend/src/components/DigitalTwin.tsx:998` selects both score and category from the largest numeric score, although different risk categories use different classification methods. Before assessment, the same function reports LOW 0% for missing risk results.

Expected: distinguish maximum numeric score from highest categorical severity; display an unassessed state when results are absent.

### 3. Missing observation history produces server errors

Priority: medium.

Both requests return HTTP 500 and plain `Internal Server Error`:

```text
POST /api/forecast/next-day
POST /api/risk
Body: {"well_id":"DEMO-001 (synthetic)"}
```

Cause: `backend/app/routers/forecast.py:28` and `backend/app/routers/risk.py:75` fall back to a local CSV excluded from the deployed bundle. The missing-file exception is not handled. The dashboard disables these two buttons for DEMO wells, which limits direct UI exposure, but the API still fails and the same path can affect a BGH well with missing observations.

Expected: a structured missing-history response (such as HTTP 422), and an appropriate upstream-service error when the database request failed.

### 4. Optimizer termination is not disclosed in the UI

Priority: medium.

All three sampled API optimizations returned `optimizer.success=false` with `Maximum number of iterations has been exceeded.` Their recommended scores exceeded the input scores, so they returned useful candidates; convergence was not established.

`backend/app/ml/optimizer.py:30` caps the search at six iterations. `frontend/src/components/OptimizationPanel.tsx:93` shows scores and method but omits the returned termination status/message.

Expected: describe the result as the best candidate found within the search budget and show termination status; do not imply convergence or global optimality.

## Passed Checks

- Automated live API checks: 105 passed, 2 failed (the two missing-history requests above), out of 107 checks.
- Homepage, health, API documentation, OpenAPI schema, and GLB asset return HTTP 200.
- All 29 wells can be retrieved; each well's history contains the correct well identifiers.
- Simulation, optimization, risk, and forecast work for BGH-001, BGH-013, and BGH-025.
- New simulation, optimization, and forecast records appear in Supabase-backed history.
- Forecast responses identify Supabase observations as their source and acknowledge synthetic data/non-field-validation.
- Risk scores remain within [0, 1]. Sampled recommendation scores improve on baseline scores.
- Unknown wells/routes, wrong HTTP methods, missing/extra fields, out-of-bounds inputs, nonfinite input, and incomplete live risk inputs return the expected 404/405/422 responses.
- Twelve risk requests with concurrency six complete successfully and preserve well identity; slowest measured request was 6.745 seconds. This is a small concurrency check, not a capacity benchmark.
- In-browser simulation, forecast, risk, optimization, explanation, technical metrics, and recommendation visualization work.
- Changing wells during an optimization discards the previous well's late result and resets the displayed results.
- Invalid temperature input displays the server validation message; editing the field clears its inline error.
- History filtering, expanding to all 34 forecast runs, and opening a details disclosure work.
- The GLB well renders; current/recommended modes, pause/start, and reset respond.
- Desktop 1440x1000 and mobile 390x844 / 320x800 layouts have no horizontal document overflow in the inspected states. Screenshots show readable controls and tables.
- No browser console errors were captured in the tested UI session.
- `/.env`, `/backend/.env`, and `/.git/config` return 404.

The earlier deployment verification also passed 41 backend tests, 13 frontend tests, the frontend production build, and the existing integration verifier. These were not rerun in this pass because application code had not changed.

## Artifacts And Limits

The local live-check script and machine-readable results are in `.vercel/full_check.py` and `.vercel/full_check_results.json` (ignored by Git). The script uses the local `.vercel/smoke-input.json` test fixture.

Tests added synthetic demo run records to the existing database. They did not delete records, change database schema, or change production configuration.

Not tested: forced cold starts, sustained traffic, database outage recovery, every parameter combination, every browser engine, authentication/security penetration, or prediction accuracy against measured field data. Forecast dates reflect the latest stored synthetic observations (2023-08-24 in the sampled responses), not tomorrow's calendar date.
