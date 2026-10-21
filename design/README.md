# Castraferrum - design

The source of truth for the UI. Open any `.html` file straight in a browser (no server needed); add `?theme=dark` to
`system/layout.html` for the dark set. **Start from [`preview/index.html`](preview/index.html)**: an index of every screen and
state, with a light and a dark shot per state.

| File | What it is | Used by |
|---|---|---|
| [`tokens.css`](tokens.css) | The only token file: colours, type, spacing, radius, shadows. Light set by default, dark set under `[data-theme="dark"]` | preview and app (`web/ui/styles.css` imports it directly) |
| [`components.css`](components.css) | Components that only read the variables of `tokens.css` | preview and app (`web/ui/components.tsx` is the React shell around these classes) |
| [`system/index.html`](system/index.html) | Design-system page, light and dark side by side | reference |
| [`system/layout.html`](system/layout.html) | Sample AppShell layout | reference |
| [`APPROVED.md`](APPROVED.md) | The project owner's approvals | every UI pull request |
| [`STATES.md`](STATES.md) | The state list (one row = one state), its source in the spec, and the design decisions | `npm run design:states` |
| [`preview/index.html`](preview/index.html) | Index of every state with the approved shots | side-by-side review |
| [`preview/app.html`](preview/app.html) | Draws one state: `app.html?state=<id>&theme=light\|dark[&lang=en]` | live view, shooting |
| `preview/shots/` | `<id>-light.png` and `<id>-dark.png` (1440x900, full page) | pull request bodies, comparison |

The comparison of the real app with the preview (approved shot, real app, diff, mismatch ratio per region) is generated, never
committed: `npm run verify` writes it to `reports/compare/`, and `npm run design:compare` writes it to `design/compare/`
(gitignored).

Rule: a component never writes a colour, font size or spacing value directly. A missing value becomes a token in `tokens.css`
and an entry in `APPROVED.md` once the project owner approves it.

## Preview files

| File | Role |
|---|---|
| `preview/states.js` | State catalogue (id, screen, description, viewport); the index page and the shooting script both read it |
| `preview/preview.js` | Draw functions per screen and state, using only the classes of `components.css`; all UI text goes through `t()` |
| `preview/data.js` | Consistent sample data (loop names, prompts, Mock log, figures that follow the run rules of the spec) |
| `preview/messages.js` | Generated from `shared/i18n/*.ts`; do not edit by hand (gitignored) |
| `preview/schedule.js` | Generated from `shared/domain/schedule.ts`: schedule sentences, warnings, cron errors and the next 5 runs; the preview never writes a schedule sentence itself (gitignored) |

UI text lives in `shared/i18n/vi.ts` and `en.ts`. Commands (run in `loop-console/`): `npm run design:shots` generates
`messages.js` and `schedule.js` and re-shoots everything (`-- --only a,b` shoots a few states); `npm run design:states` prints
`states with shots: N/N` and exits 1 on a missing light or dark shot, a state the preview cannot draw, or a generated file that
drifted from its source. To add a state: a row in `STATES.md`, an entry in `states.js`, a draw function in `preview.js`, then shoot.

## Components added after the first set

Each block sits at the end of `components.css`, reads only existing tokens and adds none. The decisions behind them are in
[`STATES.md`](STATES.md) and the approvals in [`APPROVED.md`](APPROVED.md).

| Block | Components |
|---|---|
| the phase 1 preview | `.row-actions`, `.pop-anchor`, `.menu.is-pop` (row actions and menu); `.toast-stack`, `.toast.is-err`; `.banner.inset`, `.banner .txt`; `.note`; `.empty.is-err`, `.empty.sm`; `.guide`; `.form-grid`, `.form-stack`, `.field-head`, `.affix`, `.form-foot`, `.chips`; `.sched-out`, `.sched-desc`, `.next-runs`; `.log-scroll`, `.log.is-paused`; `.sid`, `.ph-sub`, `.sk.lg`, `.sk.block`, `.is-stale`; `.back-link` with a media query below 1100px (`--bp-split`) |
| the phase 2 preview | `.topnav` (Loop / Repo navigation); `.repo-tag`, `.row-name .nm`; `.select.is-fake`, `.select.sm`, `.combo`, `.opt-path`, `.field-act`; `.form-grid.repo-add`, `.table td.act`; `.cmd` (the `claude --resume <id>` command with a copy button); `.code.prose` |
| Run summary | `.table tr.has-sum` and `tr.sum-row`: the sub-row under a run holding the first line of its summary |
| the transcript preview | `.log.tx` (Transcript frame); `.tx-row`, `.tx-k`, `.tx-b` with `.k-<kind>` and `.is-err`; `.tx-b.is-prose`, `.is-think`, `.is-sys`; `.tx-subj`, `.tx-input`, `.tx-field`, `.tx-fk`; `.tx-fold`, `.tx-first`, `.tx-meta`, `.tx-pre`; `.tx-edge` |
| Folder picker | `.affix > .btn` (Browse button); `.dialog.is-wide`; `.fp` and its parts: `.fp-bar`, `.fp-crumbs`, `.fp-main`, `.fp-side`, `.fp-place`, `.fp-pane`, `.fp-tools`, `.fp-check`, `.fp-list`, `.fp-row`, `.tag-git`, `.tag-repo`, `.go`, `.fp-status`, `.fp-target` |
