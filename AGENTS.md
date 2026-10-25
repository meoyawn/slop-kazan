# Development environment

- Shell: `fish`.
- The dev server is already running at **http://127.0.0.1:5173/**. Use it for browser checks and performance measurements; do not start another server or restart the existing one. Vite reloads changes automatically.
- The user's Chrome has the city preview open. Connect to that tab to reproduce issues and iterate on measurements and fixes.
- Never run two game previews at the same time, including the original and the Kazan fork. They compete for CPU, GPU and memory and invalidate performance comparisons.
- Reuse one Chrome game tab. Navigate that tab between the original and the local release; do not create a new tab for each build or measurement. Check the tab inventory before a run and close duplicate game previews. Leave unrelated tabs alone.
- Open a game tab only when a browser check requires it, do the check, and close the agent-owned game tab when that browser job is finished. Do not leave heavyweight previews running during source analysis, builds or tests.
- Measure FPS with tracing stopped. Use Auto-Director Aerial for FPS runs, record actual game renders over wall time and record the camera segment. Loading and FPS measurements must run without concurrent builds, tests or another game.
- Let Vite generate `dist/`, including hashed prepared-world assets. No process may write to `public/`; Vite's public directory is disabled. Keep generated world intermediates in the ignored `.cache/compiled-world/` and local diagnostic evidence outside the repository. Use the existing Vite server for source iteration and Cloudflare Pages for final release checks, verifying published assets against the Vite build. Vite transforms JavaScript requested directly from `/dist/` or other source-tree paths; do not use those paths as unmodified release evidence.
- Rendering verification is part of every performance iteration: inspect release screenshots before and after camera movement, map teleports and return travel. Check roofs, facades, roads, terrain, vegetation and shadows for missing surfaces, stale instances, overlapping LODs, flicker and z-fighting. A passing FPS counter or data-only test is insufficient. Reproduce and fix any visible regression before publishing the checkpoint; use GPU pixel comparisons when screenshot evidence suggests stale buffer or lifecycle errors.

# Cloudflare

- Use the global, aube-managed `cf` CLI for Cloudflare account and resource management, including when working across multiple accounts. Keep `cf` global.
- This site's target is the Personal account `7f1bb3dfed48a390e1bcf9e1ac54305c`, Pages project `slop-kazan`, production branch `feat/kazan-tatarstan`, at `https://kazan.adelnz.com`.
- Pages uploads currently require project-local Wrangler. Keep Wrangler pinned in `package.json`; use `aube run deploy` for a local deployment.
- Local deployment credentials are in ignored `.cloudflare/pages.env`. CI uses GitHub Actions secrets. Never commit credential values or DNS migration backups.

# Local checks and deployment

- Run the relevant tests locally before pushing each implementation batch. CI/CD installs dependencies, builds and deploys; do not restore the automated test step on push or pull requests unless the user asks. Preserve the deployment response checks.

# Git

- Leave unrelated worktree changes alone; they belong to concurrent work. Never undo them.

# Procedural city and performance

- Prioritise the recognisable feel and illusion of Kazan through lightweight procedural rendering. The goal is a convincing city at 60 FPS, with readable silhouettes, characteristic materials, proportions and street context.
- Treat recurring building/infrastructure work as one systematic generator task across the inventory. Parameterise actual footprints, dimensions, heights, tags, context and available colour evidence; validate coverage and representative families, not every object individually. Do not turn a citywide system into repeated per-object photographic research. Satellite-derived colours may be used when available; never describe estimated colours as measured.
- Bias towards beauty over realism when current appearance evidence is missing: use attractive contemporary local palettes and clean painted finishes instead of blanket grey, heavy seams or invented decay. Label these choices as procedural estimates; never present a visual prior as a reliable classifier of renovations, construction or measured colour.
- Keep recurring infrastructure simple and shared: a few reusable shapes, material palettes and mapped size/layout variations. Brand distinctions are optional accents when already supported by data; do not spend repeated batches researching logos, reproducing many networks or polishing minor object details.
- Finish the principal visible result, check it and move to the next queued task. The large unfinished queue takes precedence over fine detail on one object. Keep uncertain photographic details and background refinements as explicit follow-ups; they must not hold the principal task open indefinitely.
- Batch geometry/materials spatially and reuse procedural families. Avoid expensive per-site meshes, textures, lights or animation unless they materially improve the city view. Check performance on real dense streets; do not claim 60 FPS without measurement.

# Work queue

- Performance sessions keep their scope, measurements and checkpoints in `docs/kazan-performance-log.md` and `docs/kazan-performance-subsystems.md`. The reconstruction queue `docs/kazan-work-queue.md` is out of scope for performance sessions; do not maintain it as part of that work.
- Read and maintain `docs/kazan-work-queue.md`. Keep completed work, the active task, remaining requests and photographic accuracy follow-ups distinct.
- Use one commit per coherent work batch, including implementation, checks, queue status and the transition to the next task. Do not create a second commit merely for a queue pointer or push receipt. Record deployment evidence in the next substantive batch; identify the current batch by its release evidence or commit subject when its own hash is not yet available.
- Work through the queue sequentially, one object or implementation task at a time. Finish a coherent, recognisable and checked result, commit and push it, record its publication status immediately, then take the next queued object without waiting for CI. Check publication alongside subsequent work.
- Keep detail work proportionate to the unfinished queue. Do not spend repeated batches polishing one object while many requested objects remain undetailed. After the main exterior, silhouette, materials and essential grounds are implemented and checked, move to the next object; retain fine ornament, obscured elevations and uncertain photo details as explicit follow-ups. This is sequential completion, not a simultaneous pass over the entire queue.
- Append new requests without losing unfinished scope. Keep remaining work and photographic follow-ups explicit; do not declare an entire scene complete when buildings or essential requested features are still missing.
- Record verification and published commit/deployment evidence before marking a task delivered. Retain unresolved details explicitly in the queue.

# Data sources

- Maintain `docs/kazan-data-sources.md` for citywide datasets: source URL, bulk acquisition method, saved files/importer, snapshot and licence/provenance. Distinguish imported sources from researched candidates; preserve unknown dates and estimated colours explicitly.

# Photo references and facades

- When using a reference photograph, take responsibility for the appearance of every visible building in that view, including neighboring and background buildings. Identify their mapped footprints and finish the whole photographed scene, not only the requested landmark.
- Build and reuse procedural facade families for Kazan's recurring cladding: white and red brick, painted panels, plaster, glazing, balconies and plinths. Preserve the visible arrangement of materials and accents; do not reduce a multicolored facade to one average gray or beige color.
- Record the reference and mapped building identities in the appearance data. Resolve uncertain background identities and obscured details through additional photographs; keep an explicit scene checklist until every visible building is addressed. Distinguish observed details from procedural estimates.

# Approvals

- When multiple commands need the same new approval prefix, request and finish the first approval before launching the remaining commands. Never parallelize approval-gated commands until the reusable prefix rule is stored.
