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
