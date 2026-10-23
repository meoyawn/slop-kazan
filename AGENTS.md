# Development environment

- Shell: `fish`.
- The dev server is already running at **http://127.0.0.1:5173/**. Use it for browser checks and performance measurements; do not start another server or restart the existing one. Vite reloads changes automatically.
- The user's Chrome has the city preview open. Connect to that tab to reproduce issues and iterate on measurements and fixes.

# Cloudflare

- Use the global, aube-managed `cf` CLI for Cloudflare account and resource management, including when working across multiple accounts. Keep `cf` global.
- This site's target is the Personal account `7f1bb3dfed48a390e1bcf9e1ac54305c`, Pages project `slop-kazan`, production branch `feat/kazan-tatarstan`, at `https://kazan.adelnz.com`.
- Pages uploads currently require project-local Wrangler. Keep Wrangler pinned in `package.json`; use `aube run deploy` for a local deployment.
- Local deployment credentials are in ignored `.cloudflare/pages.env`. CI uses GitHub Actions secrets. Never commit credential values or DNS migration backups.

# Git

- Leave unrelated worktree changes alone; they belong to concurrent work. Never undo them.

# Photo references and facades

- When using a reference photograph, take responsibility for the appearance of every visible building in that view, including neighboring and background buildings. Identify their mapped footprints and finish the whole photographed scene, not only the requested landmark.
- Build and reuse procedural facade families for Kazan's recurring cladding: white and red brick, painted panels, plaster, glazing, balconies and plinths. Preserve the visible arrangement of materials and accents; do not reduce a multicolored facade to one average gray or beige color.
- Record the reference and mapped building identities in the appearance data. Resolve uncertain background identities and obscured details through additional photographs; keep an explicit scene checklist until every visible building is addressed. Distinguish observed details from procedural estimates.

# Approvals

- When multiple commands need the same new approval prefix, request and finish the first approval before launching the remaining commands. Never parallelize approval-gated commands until the reusable prefix rule is stored.
