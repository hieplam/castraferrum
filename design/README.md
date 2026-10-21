# Castraferrum - design

The source of truth for the UI. Until the cut-over of the UI uplift (epic #63, task U25) this folder holds two design
systems side by side:

- **The new system** in [`ds/`](ds/), for the new UI (look C "Soft studio", mobile-first). It is the rule for every new
  UI change. Start with [`ds/SYSTEM.md`](ds/SYSTEM.md), the written rules, then look at the approved reference
  [`reference/`](reference/README.md).
- **The classic system** (every other file of this folder, described below), for the classic UI that stays the default
  until the cut-over. Its files are unchanged; a fix to the classic UI follows them.

## The new system (`ds/`)

| File | What it is | Used by |
|---|---|---|
| [`ds/SYSTEM.md`](ds/SYSTEM.md) | The written rules: principles, every token, type, contrast, interaction states, every component family, layout, content, accessibility, iOS, test ids, how to change the system and the checklist for UI pull requests | everyone who changes the UI; read it first |
| [`reference/`](reference/README.md) | Exports of the brainstorm canvas the owner approved on 2026-10-21 (phone and desktop boards, the tokens sheet) | the ratified input; the system and its preview are built to match it |
| [`ds/tokens.css`](ds/tokens.css) | Every token: colours (light and dark), type, space, sizes, radius, motion, layers, safe areas | the new UI |
| [`ds/required-tokens.json`](ds/required-tokens.json), [`ds/contrast-pairs.json`](ds/contrast-pairs.json) | The token list and the contrast pairs `npm run design:tokens` checks | `verify`, CI |
| [`ds/components.css`](ds/components.css) | Every component class, reading only tokens | the new UI |
| [`ds/fonts.css`](ds/fonts.css) | Be Vietnam Pro and JetBrains Mono, self-hosted | the design-system page, the new UI |
| [`ds/index.html`](ds/index.html) | The design-system page: every component in both themes side by side, and two phone frames (`?frame=1&theme=light\|dark`) | reference |

The new preview (`ds/preview/`) is added by tasks U5 to U9 of the epic. A gap in the new system becomes an issue labelled
`design-system`; see "How to change the system" in [`ds/SYSTEM.md`](ds/SYSTEM.md).

## The classic system

Open any `.html` file straight in a browser (no server needed); add `?theme=dark` to `system/layout.html` for the dark
set. **Start from [`preview/index.html`](preview/index.html)**: an index of every screen and state, with a light and a
dark shot per state.

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

### Preview files

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

### Components added after the first set

Each block sits at the end of `components.css`, reads only existing tokens and adds none. The decisions behind them are in
[`STATES.md`](STATES.md) and the approvals in [`APPROVED.md`](APPROVED.md).

| Block | Components |
|---|---|
| the phase 1 preview | `.row-actions`, `.pop-anchor`, `.menu.is-pop` (row actions and menu); `.toast-stack`, `.toast.is-err`; `.banner.inset`, `.banner .txt`; `.note`; `.empty.is-err`, `.empty.sm`; `.guide`; `.form-grid`, `.form-stack`, `.field-head`, `.affix`, `.form-foot`, `.chips`; `.sched-out`, `.sched-desc`, `.next-runs`; `.log-scroll`, `.log.is-paused`; `.sid`, `.ph-sub`, `.sk.lg`, `.sk.block`, `.is-stale`; `.back-link` with a media query below 1100px (`--bp-split`) |
| the phase 2 preview | `.topnav` (Loop / Repo navigation); `.repo-tag`, `.row-name .nm`; `.select.is-fake`, `.select.sm`, `.combo`, `.opt-path`, `.field-act`; `.form-grid.repo-add`, `.table td.act`; `.cmd` (the `claude --resume <id>` command with a copy button); `.code.prose` |
| Run summary | `.table tr.has-sum` and `tr.sum-row`: the sub-row under a run holding the first line of its summary |
| the transcript preview | `.log.tx` (Transcript frame); `.tx-row`, `.tx-k`, `.tx-b` with `.k-<kind>` and `.is-err`; `.tx-b.is-prose`, `.is-think`, `.is-sys`; `.tx-subj`, `.tx-input`, `.tx-field`, `.tx-fk`; `.tx-fold`, `.tx-first`, `.tx-meta`, `.tx-pre`; `.tx-edge` |
| Folder picker | `.affix > .btn` (Browse button); `.dialog.is-wide`; `.fp` and its parts: `.fp-bar`, `.fp-crumbs`, `.fp-main`, `.fp-side`, `.fp-place`, `.fp-pane`, `.fp-tools`, `.fp-check`, `.fp-list`, `.fp-row`, `.tag-git`, `.tag-repo`, `.go`, `.fp-status`, `.fp-target` |
