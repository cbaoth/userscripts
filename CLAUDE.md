# Claude Code — Project Guidelines

## Project Overview

- Personal browser userscripts (Tampermonkey/Greasemonkey), public repo
- Primary docs: `README.md` (overview only), `docs/` (details), `docs/TODO.md` (todos/issues)
- All docs must be kept up-to-date — outdated docs are worse than no docs

## Project Structure

```
/                          repo root
  *.user.js                userscripts
  lib/                     shared libs (cblib.* under review — see docs/TODO.md)
  docs/                    project-wide documentation
    TODO.md                todos, ideas, known issues (internal dev use)
    DEV.md                 dev setup / release process (only if needed)
    {script-name}/         per-script docs (README.md, TODO.md — only if substantial)
  dev/                     dev utilities, not for production
  docs/template.user.js    template for new scripts
  README.md                general overview only; link to docs/ for details
```

## Template

- Use `docs/template.user.js` for all new scripts
- When reviewing existing scripts, compare metadata against the template (it may be newer)

## Documentation Rules

- `README.md` = overview only; link to `docs/{script-name}/README.md` for script details
- `TODO.md` uses `- [ ]` checkboxes; ~~strikethrough~~ + check when done; remove fully resolved sections (git history preserves them)
- Create `docs/{script-name}/` subdirs only when per-script docs become substantial
- Prefer updating existing docs over creating new files

## `@version` Format

- Format: `YYYY-MM-DD` (e.g. `2025-12-24`)
- Add time suffix `YYYY-MM-DDTHHmmss` only if multiple releases in one day
- Version = date of last **functional** change; new scripts use creation date
- **Functional metadata** (bump version): `@match`, `@include`, `@exclude`, `@grant`, `@require`, `@resource`, `@run-at` — these affect script behavior or permissions
- **Non-functional metadata** (no bump needed): `@name`, `@description`, `@author`, `@namespace`, `@icon`, `@license`, `@homepage`

## Stale Scripts

- Scripts with no functional changes in 3+ years are flagged in `README.md` with a compatibility warning
- Flagged scripts have a corresponding `docs/TODO.md` entry to verify/update/remove

## Dependencies

- Prefer native browser APIs and modern JS — avoid adding new external lib dependencies
- Do not add jQuery, underscore, or `waitForKeyElements` to new or updated scripts
- Use `MutationObserver` instead of `waitForKeyElements`
- `lib/cblib.*` is under review — check `docs/TODO.md` before using it in new scripts

## Style & Formatting

- Modern JS: ES2020+, `const`/`let`, arrow functions, template literals, optional chaining
- Formatter: Prettier (`.prettierrc` at repo root) — `formatOnSave` auto-applies in VSCode
- Linter: ESLint (`eslint.config.mjs`) — run `npm run lint` before committing; fix all errors
- Comments only where logic isn't self-evident — no noise
- Consistent patterns across scripts: observer setup, GM settings access, error handling
- Consider that `source.fixAll: always` may be set in VSCode global settings — using `dbaeumer.vscode-eslint` to activate auto-fix on save
