# Evidence log: UI uplift (epic castraferrum#63)

Plan: [2026-10-21-ui-uplift.md](2026-10-21-ui-uplift.md). Every task appends a section headed `## U<k>` with commands and
literal output only: Red, each Green, the ratchet before and after, the test counts.

## U0

### Baseline: `npm run verify` on `main`

- `main` SHA: `a1f86efbf657323f91c704fd6e92ae398e96918a`; exit code `0`.
- unit: `Tests  427 passed | 2 skipped (429)` (`Test Files  34 passed | 1 skipped (35)`).
- contract: `Tests  114 passed (114)`; `memory: 50 passed · postgres: 50 passed`;
  `executor contract — claude (fake query): 7 passed · mock: 7 passed`.
- api: `Tests  115 passed (115)` (`Test Files  12 passed (12)`).
- e2e: `58 passed (10.7m)` (37 in the `chromium` project, 21 in the `visual` project).
- uc-coverage: `UCs with a green e2e: 32/32`.
- design:states: `states with shots: 92/92`.
- `git archive HEAD:design | wc -c`: `25456640`.

### Red

`npx vitest run --project unit tests/tools/design-tokens.test.ts tests/tools/design-lint.test.ts tests/tools/ratchets.test.ts`
(tests written, scripts not yet):

```
 FAIL  |unit| tests/tools/design-tokens.test.ts [ tests/tools/design-tokens.test.ts ]
Error: Cannot find module '../../scripts/design-tokens.mjs' imported from .../tests/tools/design-tokens.test.ts
 FAIL  |unit| tests/tools/ratchets.test.ts [ tests/tools/ratchets.test.ts ]
Error: Cannot find module '../../scripts/ratchets.mjs' imported from .../tests/tools/ratchets.test.ts
 Test Files  3 failed (3)
      Tests  no tests
```

(the third file, `design-lint.test.ts`, failed the same way on `../../scripts/design-lint.mjs`.)

`npx playwright test tests/visual/phone-check.visual.ts --project visual` (after `npm run build`, with
`scripts/phone-check.mts` absent):

```
Error: Cannot find module '...\scripts\phone-check.mts' imported from ...\tests\visual\phone-check.visual.ts
Error: No tests found.
```

The plan's form `npx playwright test --project visual tests/visual/phone-check.visual.ts` stops earlier with Playwright
1.64.1: `--project` takes every following argument as a project name (`Project(s) "tests/visual/phone-check.visual.ts"
not found`). The path goes first; the run is otherwise the same.

### Green

(1) Unit tests of the tools:

```
 Test Files  3 passed (3)
      Tests  23 passed (23)
```

(2) `npx playwright test tests/visual/phone-check.visual.ts --project visual`:

```
  ✓  1 [visual] › tests\visual\phone-check.visual.ts:9:1 › a page that fits has no overflow
  ✓  2 [visual] › tests\visual\phone-check.visual.ts:15:1 › a 600px-wide table overflows by 210px
  2 passed (5.7s)
```

(3) `npm run design:tokens -- design/tokens.css --pairs design/contrast-pairs-classic.json` (exit code `1`):

```
design/tokens.css
empty or swallowed: 4 (--surface --surface-sunken --st-skipped-soft --log-bg)
missing in dark: 8 (--surface --surface-2 --surface-sunken --border --st-skipped-soft --st-active --log-bg --log-text)
contrast dark --text on --surface-2: 1.10 < 4.5
contrast pairs checked: 2
contrast failures: 1
```

(4) `npm run design:lint` (exit code `1`: every maximum defaults to 0, and 8 titles are above it):

```
  web/features/loop-detail/parts.tsx:70 title on <td>
  web/features/repos/FolderPicker.tsx:164 title on <button>
  web/features/repos/FolderPicker.tsx:214 title on <div>
  web/features/repos/FolderPicker.tsx:234 title on <span>
  web/features/repos/FolderPicker.tsx:275 title on <Button>
  web/features/repos/ReposScreen.tsx:217 title on <Button>
  web/ui/DropMenu.tsx:28 title on <Button>
  web/ui/components.tsx:55 title on <span>
native title: 8
unknown classes: 0
dynamic classes: 4 (not checked)
literal styles: 0
css violations: 0
```

(5) `npm run phone:check`:

```
/@390: overflow 620px (span[data-testid="lamp-db"].lamp)
/loops/new@390: overflow 620px (span[data-testid="lamp-db"].lamp)
/loops/:id@390: overflow 620px (span[data-testid="lamp-db"].lamp)
/executions/:id@390: overflow 620px (span[data-testid="lamp-db"].lamp)
/runs/:id@390: overflow 620px (span[data-testid="lamp-db"].lamp)
/repos@390: overflow 620px (span[data-testid="lamp-db"].lamp)
/@768: overflow 242px (span[data-testid="lamp-db"].lamp)
/loops/new@768: overflow 242px (span[data-testid="lamp-db"].lamp)
/loops/:id@768: overflow 242px (span[data-testid="lamp-db"].lamp)
/executions/:id@768: overflow 242px (span[data-testid="lamp-db"].lamp)
/runs/:id@768: overflow 242px (span[data-testid="lamp-db"].lamp)
/repos@768: overflow 242px (span[data-testid="lamp-db"].lamp)
phone overflow: 12/12
```

The classic top bar is about 1010px wide and never wraps, so every screen scrolls sideways at both widths. The check
measures against the Playwright viewport width, not `innerWidth`: with `isMobile`, Chromium widens the layout viewport
to the content (`innerWidth` read 1010 on the 390px phone), which hid every overflow in a first version (`0/12`). The
fixture test runs with `isMobile` so that this mistake fails it.

(6) `npm run ratchets -- --base main`:

```
e2e expects: 712 (min 712)
base main: no scripts/ratchets.json there, nothing to compare
ratchets: ok
```

(7) `npm run verify` on the branch: exit code `0`, with `ratchets: ok` right after `arch`. The CI `checks` job runs the
ratchets step on the pull request.

(8) This section.

### After: `npm run verify` on the branch

- unit: `Tests  450 passed | 2 skipped (452)` (427 -> 450: the 23 new tool tests).
- contract: `Tests  114 passed (114)`; api: `Tests  115 passed (115)`.
- e2e: `60 passed (10.4m)` (58 -> 60: the two phone-check fixture tests run in the `visual` project).
- uc-coverage: `UCs with a green e2e: 32/32`.

### Ratchet

Baselines recorded in `scripts/ratchets.json`: empty 4, missing in dark 8, classic contrast failures 1, native title 8,
unknown classes 0, literal styles 0, e2e expects 712. Not in the JSON: phone overflow 12/12, design bytes 25456640,
dynamic classes 4.

## U1

### Red

`npm run design:tokens -- design/tokens.css --pairs design/contrast-pairs-classic.json` on `main` (exit code `1`):

```
design/tokens.css
empty or swallowed: 4 (--surface --surface-sunken --st-skipped-soft --log-bg)
missing in dark: 8 (--surface --surface-2 --surface-sunken --border --st-skipped-soft --st-active --log-bg --log-text)
contrast dark --text on --surface-2: 1.10 < 4.5
contrast pairs checked: 2
contrast failures: 1
```

### Green

(1) The same command after the four values (exit code `0`):

```
design/tokens.css
empty or swallowed: 0
missing in dark: 0
contrast pairs checked: 2
contrast failures: 0
```

The hovered-row pair, computed with `contrastRatio` of `scripts/design-tokens.mjs`:
`dark --text #d9e0d2 on --surface-2 #181b16 : 12.88`.

(2) `npm run ratchets` with the classic maxima at 0: `ratchets: ok` (exit code `0`).

(3) `npm run design:shots -- --theme dark`: `shot 92 images → design/preview/shots/`.
`git diff --stat main -- design/preview/shots`: `92 files changed`, every one a `-dark.png`; 0 light shots changed.
92 of the 92 dark shots changed.

(4) `npm run build`, then `npx playwright test --project visual`: `23 passed (4.9m)` (exit code `0`).

(5) `npm run verify` (exit code `0`): `ratchets: ok`; unit `Tests  450 passed | 2 skipped (452)`; contract
`Tests  114 passed (114)`; api `Tests  115 passed (115)`; e2e `60 passed (9.9m)`; `UCs with a green e2e: 32/32`.

### Ratchet

empty or swallowed 4 -> 0; missing in dark 8 -> 0; classic contrast failures 1 -> 0 (`scripts/ratchets.json`, classic
entry). Tool: `npm run design:tokens`.

## U2

### Red

The two JSON files and `tests/tools/ds-tokens-spec.test.ts` first, `design/ds/tokens.css` absent.

`npx vitest run --project unit tests/tools/ds-tokens-spec.test.ts`:

```
AssertionError: design/ds/tokens.css is missing: expected false to be true // Object.is equality
AssertionError: light --bg: expected undefined to be '#f3ecdc' // Object.is equality
AssertionError: desktop --font-ui: expected undefined to be '"Be Vietnam Pro", system-ui, -apple-s…' // Object.is equality
AssertionError: --dur-fast: expected undefined to be '0ms' // Object.is equality
      Tests  4 failed | 3 passed (7)
```

The three that pass read only the spec and the JSON files: the tables parse into 41 colour and 99 other names, the
140 required names, and the 63 pairs generated from the 4.3 bullets equal `contrast-pairs.json` (that file was written
from a separate hand expansion of the bullets, so the two agree independently).

`npm run design:tokens -- design/ds/tokens.css --pairs design/ds/contrast-pairs.json --require design/ds/required-tokens.json`
(exit code `1`):

```
Error: ENOENT: no such file or directory, open '...\design\ds\tokens.css'
```

### Green

(1) The spec test: `Tests  7 passed (7)`.

(2) The token command (exit code `0`):

```
design/ds/tokens.css
empty or swallowed: 0
missing in dark: 0
contrast pairs checked: 126
contrast failures: 0
required tokens: 140
missing tokens: 0
```

(3) `npm run ratchets`: the new `design/ds/tokens.css` entry prints the same six lines, then `ratchets: ok`.

(4) `npm run verify` (exit code `0`): `ratchets: ok`; unit `Tests  457 passed | 2 skipped (459)`; contract
`Tests  114 passed (114)`; api `Tests  115 passed (115)`; e2e `60 passed (9.1m)`; `UCs with a green e2e: 32/32`.
A first run, started at 23:33, exited `1` on two e2e tests of `tests/e2e/list.spec.ts` (UC-03, UC-04: expected
`→ 00:00`, received `→ 22/10 00:00`): the next run fell on the next day. This is the known clock flake #22 (this
branch changes no `web/` or e2e file). The run above started after midnight.

### Stub check

- Wrong value (phone `--fs-h3` 17px -> 18px): `AssertionError: phone --fs-h3: expected '18px' to be '17px'`,
  `Tests  1 failed | 6 passed (7)`.
- Contrast break (light `--text-subtle` -> `#9a9080`): `contrast light --text-subtle on --bg: 2.67 < 4.5` and five more,
  `contrast failures: 6`, exit code `1`.
- Fewer pairs (last pair dropped): `AssertionError: expected [ …(62) ] to deeply equal [ …(63) ]`;
  `contrast pairs checked: 124`.
- Empty `tokens.css`: `missing tokens: 140 (...)`; spec test `Tests  4 failed | 3 passed (7)`.

### Ratchet

A new entry in `scripts/ratchets.json` for `design/ds/tokens.css`: empty 0, missing in dark 0, contrast failures 0
(126 checked), missing tokens 0 (140 required), all at 0 from the start. The classic entry is unchanged (0, 0, 0). Unit
tests 450 -> 457 (the 7 spec tests). Tool: `npm run design:tokens`, `npm run ratchets`.

## U3

### Red

Both tests first, with no `design/ds/components.css` or `design/ds/index.html`.

`npx vitest run --project unit tests/tools/ds-catalogue.test.ts`:

```
catalogue coverage: 0/178
     × every class is a selector of components.css 17ms
     × every class has a rule with at least one declaration 6ms
     × every class appears on the design-system page 4ms
AssertionError: design/ds/components.css: classes with no selector: expected [ 'app', 'topbar', …(176) ] to deeply equal []
AssertionError: design/ds/components.css: classes whose rules declare nothing: expected [ 'app', 'topbar', …(176) ] to deeply equal []
AssertionError: design/ds/index.html: classes not shown: expected [ 'app', 'topbar', …(176) ] to deeply equal []
      Tests  3 failed | 1 passed (4)
```

The test that passes only parses the spec table (178 classes, more than 150, `btn` and `picker-target` among them).

After `npm run build`, `npx playwright test --project=visual tests/visual/ds/system-page.visual.ts`:

```
  ✘  1 [visual] › tests\visual\ds\system-page.visual.ts:55:5 › desktop light › desktop light: sizes and colours (469ms)
  ✘  2 [visual] › tests\visual\ds\system-page.visual.ts:72:5 › phone light › phone light: sizes and colours (344ms)
  ✘  3 [visual] › tests\visual\ds\system-page.visual.ts:55:5 › desktop dark › desktop dark: sizes and colours (370ms)
  ✘  4 [visual] › tests\visual\ds\system-page.visual.ts:72:5 › phone dark › phone dark: sizes and colours (300ms)
    Error: page.goto: net::ERR_FILE_NOT_FOUND at file:///.../design/ds/index.html
```

### Green

(1) The catalogue test (`--reporter=verbose`):

```
spec 4.5 classes: 178
catalogue coverage: 178/178
 ✓ |unit| tests/tools/ds-catalogue.test.ts > design/ds components against spec 4.5 > the table of spec 4.5 names the classes
 ✓ |unit| tests/tools/ds-catalogue.test.ts > design/ds components against spec 4.5 > every class is a selector of components.css
 ✓ |unit| tests/tools/ds-catalogue.test.ts > design/ds components against spec 4.5 > every class has a rule with at least one declaration
 ✓ |unit| tests/tools/ds-catalogue.test.ts > design/ds components against spec 4.5 > every class appears on the design-system page
      Tests  4 passed (4)
```

(2) The system-page command:

```
  ✓  1 [visual] › tests\visual\ds\system-page.visual.ts:55:5 › desktop light › desktop light: sizes and colours (1.3s)
  ✓  2 [visual] › tests\visual\ds\system-page.visual.ts:72:5 › phone light › phone light: sizes and colours (1.0s)
  ✓  3 [visual] › tests\visual\ds\system-page.visual.ts:55:5 › desktop dark › desktop dark: sizes and colours (1.2s)
  ✓  4 [visual] › tests\visual\ds\system-page.visual.ts:72:5 › phone dark › phone dark: sizes and colours (1.1s)
  4 passed (8.8s)
```

(3) `npm run design:lint` with `design/ds/components.css` present: `css violations: 0` (the web counts unchanged:
`native title: 8`, `unknown classes: 0`, `literal styles: 0`).

(4) `npm run design:tokens -- design/ds/tokens.css --pairs design/ds/contrast-pairs.json --require design/ds/required-tokens.json`:

```
empty or swallowed: 0
missing in dark: 0
contrast pairs checked: 126
contrast failures: 0
required tokens: 143
missing tokens: 0
```

The spec test `tests/tools/ds-tokens-spec.test.ts` still passes: `Tests  7 passed (7)`.

(5) `npm run ratchets`: `ratchets: ok`.

(6) Screenshots in `reports/ds-system/` (gitignored), next to a copy of `design/reference/tokens-sheet.png`
(`reference-tokens-sheet.png`): `desktop-1440-light.png` and `desktop-1440-dark.png` (each theme column at 1440 by
900), `phone-390-light.png` and `phone-390-dark.png` (the two phone frames, `index.html?frame=1&theme=<t>`, full page).

(7) `npm run verify` (exit code `0`): `ratchets: ok`; unit `Tests  461 passed | 2 skipped (463)`; contract
`Tests  114 passed (114)`; api `Tests  115 passed (115)`; e2e `64 passed (9.9m)` (60 before plus the 4 system-page
tests); `UCs with a green e2e: 32/32`. Unit tests 457 -> 461 (the 4 catalogue tests).

### Tokens added in U3

Non-colour only, in `design/ds/tokens.css` and `design/ds/required-tokens.json` (140 -> 143 required); the owner
reviews them at U10, and U4 writes them into `SYSTEM.md`:

- `--size-tip-arrow: 5px`: the tooltip arrow (`canvas.css` `.tip-b::after`, border 5px);
- `--size-stepper-value: 52px`: the value box of a stepper (`canvas.css` `.p-stepper output`, min-width 52px);
- `--size-tx-head: 140px`: the transcript entry head beside its body from 1024px (spec 4.5, Transcript, desktop; the
  canvas has no desktop transcript, so no value to port).

### Stub check

- Every rule emptied (each declaration block replaced by `{}`): catalogue `AssertionError: design/ds/components.css:
  classes whose rules declare nothing: expected [ 'app', 'topbar', …(176) ] to deeply equal []`,
  `Tests  1 failed | 3 passed (4)`; the system page `Expected: "36px"`, `Received: "21px"` (desktop) and
  `Expected: "44px"`, `Received: "21px"` (phone) for `.btn`, all 4 tests failed.
- One literal value (`.pill` `height: 22px` instead of `var(--size-pill)`): `design/ds/components.css:234 length
  literal: height: 22px`, `css violations: 1`, exit code `1`.

### Ratchet

Catalogue coverage 0/178 -> 178/178 (`tests/tools/ds-catalogue.test.ts`); measured component checks 0 -> 4 passing
tests (`tests/visual/ds/system-page.visual.ts`); `css violations` 0 -> 0 with the file now present; required tokens
140 -> 143, missing 0 -> 0. Tools: the two tests, `npm run design:lint`, `npm run design:tokens`.

## U4

### Ratchet

Documented tokens (the count `tests/tools/ds-docs.test.ts` prints): `0/143` before, `143/143` after.

### Red

The docs test first, with no `design/ds/SYSTEM.md`.

`npx vitest run --project unit tests/tools/ds-docs.test.ts`:

```
sections: 0/13
component families: 0/19
documented tokens: 0/143
     × exists 5ms
     × has a section for each part of the plan 6ms
     × has a subsection for every component family of spec 4.5 3ms
     × names the label design-system 1ms
     × documents every required token 4ms
AssertionError: design/ds/SYSTEM.md is missing or empty: expected 0 to be greater than 0
AssertionError: design/ds/SYSTEM.md: missing sections: expected [ 'Principles', 'Tokens', …(11) ] to deeply equal []
AssertionError: design/ds/SYSTEM.md: missing component families: expected [ 'App frame', 'Tab bar', …(17) ] to deeply equal []
AssertionError: expected '' to contain '`design-system`'
AssertionError: design/ds/SYSTEM.md: tokens not documented: expected [ '--bg', '--surface', …(141) ] to deeply equal []
      Tests  5 failed (5)
```

### Green

(1) The docs test (`--reporter=verbose`):

```
sections: 13/13
component families: 19/19
documented tokens: 143/143
 ✓ |unit| tests/tools/ds-docs.test.ts > design/ds/SYSTEM.md > exists
 ✓ |unit| tests/tools/ds-docs.test.ts > design/ds/SYSTEM.md > has a section for each part of the plan
 ✓ |unit| tests/tools/ds-docs.test.ts > design/ds/SYSTEM.md > has a subsection for every component family of spec 4.5
 ✓ |unit| tests/tools/ds-docs.test.ts > design/ds/SYSTEM.md > names the label design-system
 ✓ |unit| tests/tools/ds-docs.test.ts > design/ds/SYSTEM.md > documents every required token
      Tests  5 passed (5)
```

(2) `node scripts/lang-scan.mjs --path design`: `vietnamese: 0`.

(3) `npm run verify` (exit code `0`): `ratchets: ok`; unit `Tests  466 passed | 2 skipped (468)`; contract
`Tests  114 passed (114)`; api `Tests  115 passed (115)`; e2e `64 passed (9.7m)`; `UCs with a green e2e: 32/32`.
Unit tests 461 -> 466 (the 5 docs tests).

### Stub check

`SYSTEM.md` cut to its first 80 lines: `sections: 2/13`, `component families: 0/19`, `documented tokens: 42/143`,
`Tests  4 failed | 1 passed (5)`. An empty `SYSTEM.md`: `0/13`, `0/19`, `0/143`, `Tests  5 failed (5)`.

## U5

### Ratchet

New preview states: `0` before (`git ls-tree -r --name-only main -- design/ds/preview design/ds/STATES.md | wc -l` prints
`0`), `24` after (`states: 24/24 (shots not checked)`): 16 desktop and 8 phone.

### Red

The 24 rows of `design/ds/STATES.md` and the ids of `design/ds/preview/states.js` first.

(a) On `main`'s script, `npm run design:shots -- --design design/ds --dry` (exit code `1`):

```
TypeError [ERR_PARSE_ARGS_UNKNOWN_OPTION]: Unknown option '--design'
```

(b) With the option built and no draw function yet (exit code `1`; first and last lines of 48):

```
  ✗ frame-loading light: no draw function for state: frame-loading · requires list-loading, shows 0 · requires summary, shows 0 · requires topbar, shows 0
  ✗ frame-loading dark: no draw function for state: frame-loading · requires list-loading, shows 0 · requires summary, shows 0 · requires topbar, shows 0
  ...
drawn 24 states x 2 themes, 244 problems
```

### Green

(1) `npm run design:shots -- --design design/ds --dry`: `drawn 24 states x 2 themes, 0 problems`.

(2) `npm run design:states -- --design design/ds --no-shots`: `states: 24/24 (shots not checked)`, exit code `0`.

(3) `npx vitest run --project unit shared/i18n/i18n.test.ts tests/tools/design-states.test.ts`:
`Test Files  2 passed (2)`, `Tests  17 passed (17)` (6 new: three for `--design` and `--no-shots`, three for the
dry-run check `checkDrawn`).

(4) `git diff --stat main -- design/preview design/STATES.md` prints nothing.

(5) `reports/ds-preview/loops-overview-light.png` (next to `design/reference/d-loops-light.png`) and
`reports/ds-preview/phone-loops-overview-dark.png` (next to `design/reference/m-loops-dark.png`). The desktop matches
the board apart from the texts of spec Appendix B (it wins over the board). The phone differs where the system has no
rule yet: the `+` sits under the large title, the repo filter wraps below the search. Both are in the design-system gap
castraferrum#106, with the texts Appendix B lacks (the Loops table heads from the board, `row.lastTimedOut`).

(6) `npm run verify` (exit code `0`): `ratchets: ok`; unit `Tests  472 passed | 2 skipped (474)`; contract
`Tests  114 passed (114)`; api `Tests  115 passed (115)`; e2e `64 passed (9.6m)`; `UCs with a green e2e: 32/32`.
Unit tests 466 -> 472.

### Stub check

`loops-overview` drawn as an empty string (`--only loops-overview,phone-loops-overview`), exit code `1`:

```
  ✗ loops-overview light: requires summary, shows 0 · requires stat-active-loops, shows 0 · requires stat-running-runs, shows 0 · requires stat-runs-today, shows 0 · requires stat-errors-24h, shows 0 · requires loop-row*7, shows 0 · requires list-search, shows 0 · requires topbar, shows 0
```

`loops-search-empty` with an invented class, an inline colour and length, and a key only in the draw code:

```
  ✗ loops-search-empty light: missing i18n key: loops.notAKey · requires list-no-match, shows 0 · unknown class .my-invented · inline style with a literal: "color:#ff0000;margin:4px"
drawn 1 states x 1 themes, 4 problems
```

A key only in `en.ts` fails `vi.ts`'s `Record<MessageKey, string>` type and the i18n test "has one key set".
