# Development environment

- Shell: `fish`.
- The dev server is already running at **http://127.0.0.1:5173/**. Use it for browser checks and performance measurements; do not start another server or restart the existing one. Vite reloads changes automatically.
- The user's Chrome has the city preview open. Connect to that tab to reproduce issues and iterate on measurements and fixes.

# Git

- Leave unrelated worktree changes alone; they belong to concurrent work. Never undo them.

# Approvals

- When multiple commands need the same new approval prefix, request and finish the first approval before launching the remaining commands. Never parallelize approval-gated commands until the reusable prefix rule is stored.
