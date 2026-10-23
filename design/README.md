# Castraferrum - design

The source of truth for the UI: the design system in [`ds/`](ds/) (look C "Soft studio", mobile-first), its preview and
the approved reference it was built from. Every UI change starts here (CLAUDE.md, "Design system first"). Start with
[`ds/SYSTEM.md`](ds/SYSTEM.md), the written rules, then look at the approved reference [`reference/`](reference/README.md).

| File | What it is | Used by |
|---|---|---|
| [`ds/SYSTEM.md`](ds/SYSTEM.md) | The written rules: principles, every token, type, contrast, interaction states, every component family, layout, content, accessibility, iOS, test ids, how to change the system and the checklist for UI pull requests | everyone who changes the UI; read it first |
| [`reference/`](reference/README.md) | Exports of the brainstorm canvas the owner approved on 2026-10-21 (phone and desktop boards, the tokens sheet) | the ratified input; the system and its preview are built to match it |
| [`ds/tokens.css`](ds/tokens.css) | Every token: colours (light and dark), type, space, sizes, radius, motion, layers, safe areas | the app (`web/ui/kit/styles.css` imports it as it is), the preview |
| [`ds/required-tokens.json`](ds/required-tokens.json), [`ds/contrast-pairs.json`](ds/contrast-pairs.json) | The token list and the contrast pairs `npm run design:tokens` checks | `verify`, CI |
| [`ds/components.css`](ds/components.css) | Every component class, reading only tokens | the app (`web/ui/kit/` is the React shell around these classes), the preview |
| [`ds/fonts.css`](ds/fonts.css) | Be Vietnam Pro and JetBrains Mono, self-hosted from `node_modules` (the app loads the same files through `web/ui/kit/fonts.ts`) | the design-system page, the preview |
| [`ds/index.html`](ds/index.html) | The design-system page: every component in both themes side by side, and two phone frames (`?frame=1&theme=light\|dark`) | reference |
| [`ds/STATES.md`](ds/STATES.md) | The state list of the preview (one row = one state) | `npm run design:states` |
| [`ds/preview/index.html`](ds/preview/index.html) | Index of every state with its approved light and dark shots | side-by-side review |
| [`ds/preview/app.html`](ds/preview/app.html) | Draws one state: `app.html?state=<id>&theme=light\|dark[&lang=vi]` | live view, shooting |
| `ds/preview/shots/` | `<id>-light.png` and `<id>-dark.png`: the reference the app is compared with | pull request bodies, the visual tests |
| [`APPROVED.md`](APPROVED.md) | The project owner's approvals, and the decisions agents made under the owner's rules | every UI pull request |

## The preview

| File | Role |
|---|---|
| `ds/preview/states.js` | State catalogue (id, screen, description, viewport); the index page and the shooting script both read it |
| `ds/preview/preview.js` | Draw functions per screen and state, using only the classes of `ds/components.css`; all UI text goes through `t()` |
| `ds/preview/data.js` | Consistent sample data; the visual tests seed the same world into the test database (`tests/support/preview-world.ts`) |
| `ds/preview/messages.js` | Generated from `shared/i18n/*.ts`; do not edit by hand (gitignored) |
| `ds/preview/schedule.js` | Generated from `shared/domain/schedule.ts`: schedule sentences, warnings, cron errors and the next runs; the preview never writes a schedule sentence itself (gitignored) |

UI text lives in `shared/i18n/en.ts` and `vi.ts`. Commands (run in the repository root): `npm run design:shots` generates
`messages.js` and `schedule.js` and re-shoots everything (`-- --only a,b` shoots a few states, `-- --dry` draws every state
and checks it without writing images); `npm run design:states` prints `states with shots: N/N` and exits 1 on a missing light
or dark shot, a state the preview cannot draw, or a generated file that drifted from its source. To add a state: a row in
`ds/STATES.md`, an entry in `states.js`, a draw function in `preview.js`, then shoot.

The comparison of the real app with the preview (approved shot, real app, diff, mismatch ratio per region) is generated,
never committed: `npm run verify` writes it to `reports/compare/ds/`, and `npm run design:compare` writes it to
`design/compare/ds/` (gitignored).

## Changing the system

A component never writes a colour, size, spacing or radius value directly, and the app uses no class the system does not
define (`npm run design:lint`, `npm run ratchets`). A gap in the system becomes an issue labelled `design-system`; see "How to
change the system" in [`ds/SYSTEM.md`](ds/SYSTEM.md). The addition is drawn on the design-system page and in the preview,
re-shot, and recorded in [`APPROVED.md`](APPROVED.md).

The first design system of the console ("Control room", 2026-10-18) and its preview were deleted at the cut-over of the UI
uplift (epic #63, task U25); they stay in the git history.
