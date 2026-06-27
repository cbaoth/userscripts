---
description: 'Conventions for writing git commit messages — verb prefix, imperative mood, length limits, and foreign-repo guidance'
applyTo: '**'
---

# Git Commit Message Conventions

Guidelines for writing consistent, readable commit messages across all personal repositories.

## Format

```
<Verb> <what>: <short description>

Optional body — why, not what. Wrap at 72 chars.
- Use bullet points for multiple items
- Each point on its own line
```

- **Subject line**: one single line — never a list, never multiple sentences
- **Length**: max 50 chars (ideal), hard limit 72 — this is what `git log --oneline` and GitHub show
- **Blank line** required between subject and body; omit body entirely for self-explanatory changes
- **Body content**: explain *why*, not *what* — use `- ` bullet points when listing multiple changes
- **No trailing period** on the subject line
- **Imperative mood**: "Add feature" not "Added feature" or "Adding feature"
  - Think: "If applied, this commit will: *Add feature*"

**Multi-file changes** — subject names the primary change; body lists the rest:

```
Add mpv show-speed script and enhance OSD controls

- Add show-speed: display playback speed with full precision via OSD
- Update input.conf: add speed binding OSD feedback
- Update config: enable milliseconds in OSD time display
```

## Verb Prefixes

| Prefix      | When to use                                               | Example                                      |
| ----------- | --------------------------------------------------------- | -------------------------------------------- |
| `Add`       | New file, feature, or functionality                       | `Add mpv-next-or-quit script`                |
| `Fix`       | Bug fix, broken behavior, incorrect output                | `Fix dbbackup: partial files not cleaned up` |
| `Update`    | Change or improve existing functionality                  | `Update sway config: minor tweaks`           |
| `Remove`    | Delete files, features, dead code                         | `Remove .mplayer: project abandoned`         |
| `Refactor`  | Code restructuring without behavior change                | `Refactor PATH handling: sanitize entries`   |
| `Enhance`   | User-visible improvement that is not a new feature        | `Enhance conky: add threshold color alerts`  |
| `Docs:`     | Documentation only — no code change                       | `Docs: update README with linking guide`     |
| `Chore:`    | Build, dependencies, CI, tooling — no user-facing change  | `Chore: update .gitignore patterns`          |

**Notes:**
- `Add` / `Fix` / `Update` / `Remove` / `Refactor` / `Enhance` are used without a colon when followed by a subject — the colon is reserved for `Docs:` and `Chore:` to visually distinguish meta-commits.
- `Enhance` vs `Update`: use `Enhance` for improvements where *better* is the intent; use `Update` for neutral changes (config tweaks, version bumps, wording).
- Sequential multi-commit tasks (e.g. a migration in phases) may use a parenthetical suffix for ordering context: `Refactor aliases: migrate OS/host files to lib/ (1/4)` — keep it brief and consistent within the series.

## When to Add a Body

The subject line answers *what*. Add a body only when the *why* is not obvious:

```
Fix dbbackup: partial files not cleaned up on error

Without cleanup, re-running after a failed backup would hit the
"file exists" guard and silently skip the backup entirely.
```

Skip the body for routine changes where the subject is self-explanatory.

## Contributing to Foreign Repos

1. **Check first**: `git log --oneline -20` to see their style; look for `CONTRIBUTING.md`
2. **Match their convention** — if they use Conventional Commits (`feat:`, `fix:`), use that
3. **If no clear pattern**: apply these conventions — it's rarely a blocker for maintainers
4. **Never mix styles within a PR** — pick one and stay consistent across all commits in the contribution
