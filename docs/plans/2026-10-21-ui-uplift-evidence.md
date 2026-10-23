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

## U6

### Ratchet

New preview states: `24` before (`npm run design:states -- --design design/ds --no-shots` on `main` prints
`states: 24/24 (shots not checked)`), `54` after (`states: 54/54 (shots not checked)`): 21 desktop and 9 phone added
(16 `loop-*`, 5 `period-*`, the 8 phone states of spec 5.3 and `phone-period-running`).

### Corrected figures

Read from the classic app for the seeded world: `npm run build`, then
`npx playwright test --project=visual tests/visual/detail.visual.ts` (`5 passed`; the plan's `--project visual <file>`
form makes Playwright read the file as a second project name, so the `=` form was used). The app shots in
`reports/compare/shots/` were compared with every `avg` and `longest` of `design/ds/preview/data.js`:

| Loop | Field | Old value | New value | App shot |
|---|---|---|---|---|
| Issue backlog worker | `avg` | `18 * 60 + 47` (18:47) | `14 * 60 + 52` (14:52) | `loop-running-light.png`, "Avg per run 14:52, 9 finished" |
| Clean old artifacts | `avg` | `41` (0:41) | `37` (0:37) | `loop-stopped-light.png`, "Avg per run 0:37, 4 finished" |
| Scan API logs for crashes | `longest.sec` | `5d 21h 28m 34s` | `4d 23h 28m 34s` | `loop-repo-missing-light.png`, "Longest execution 4d 23h, #1" |

The other loops already match their shots: Digest upstream releases 6:52 and 1d 2h (`loop-idle`), Check test coverage
6:01 and 9h 41m (`loop-last-failed`), Watch open PRs 2:40 and 5d 1h (`loop-server-down`), Old schedule test 1:00 and
3h 2m (`loop-archived`). Execution #1 of "Scan API logs for crashes" reads its up time from `longest.sec`, so it is
corrected with it.

### Red

The 30 rows of `design/ds/STATES.md` and the ids of `design/ds/preview/states.js` first, no draw function yet.
`npm run design:shots -- --design design/ds --dry` (exit code `1`; the first of 60 lines, then the last):

```
  ✗ loop-running light: no draw function for state: loop-running · requires loop-header, shows 0 · requires now-card, shows 0 · ...
  ...
drawn 54 states x 2 themes, 504 problems
```

The 60 lines name exactly the 30 new states, each in both themes: `loop-archived loop-disconnected loop-help loop-idle
loop-last-failed loop-loading loop-menu loop-never-run loop-not-found loop-running loop-runs loop-server-down
loop-settings loop-stop-confirm loop-stopped loop-stopping period-copied period-not-found period-running
period-server-down period-stopped phone-loop-help phone-loop-last-failed phone-loop-menu phone-loop-never-run
phone-loop-running phone-loop-runs phone-loop-settings phone-loop-stop-confirm phone-period-running`.

### Green

(1) `npm run design:shots -- --design design/ds --dry`: `drawn 54 states x 2 themes, 0 problems`, exit code `0`.

(2) `npm run design:states -- --design design/ds --no-shots`: `states: 54/54 (shots not checked)`.

(3) `npx vitest run --project unit shared/i18n/i18n.test.ts tests/tools/design-states.test.ts`:
`Test Files  2 passed (2)`, `Tests  17 passed (17)`. 101 keys added to `en.ts` and `vi.ts`: 98 of Appendix B and
three that it lacks (`runs.prev`, `runs.next`, `period.notFound`, in castraferrum#108).

(4) `git diff --stat main -- design/preview design/STATES.md` prints nothing.

(5) `reports/ds-preview/loop-running-dark.png` next to `design/reference/d-loop-dark.png`, and
`reports/ds-preview/phone-loop-running-light.png` next to `design/reference/m-loop-light.png`. Both follow the boards:
the same blocks in the same order (header with Edit, `⋯` and Stop loop; the now card with the live output and Open run
#69; the four figures; Recent runs with the current period's four runs, "Show 6 more runs from this period" and the two
earlier periods; on the desktop the Settings card, on the phone the All 69 runs and Settings and prompt cells and the
action bar). They differ where Appendix B or SYSTEM.md wins over the board (texts such as "Settings and prompt", a dash
for a run without a summary, durations as `4h 13m`), where the corrected figures differ (typical run 14:52, not 18:47),
where the server's own log line reads "Start round #69" (data, not UI text), and where the system has no rule yet: the
prompt is not clamped in the side card (castraferrum#108). Also looked at: `loop-help` (desktop popover, dark),
`phone-loop-help` (sheet, light, next to `m-help-light.png`), `loop-runs`, `phone-period-running`,
`phone-loop-last-failed`.

(6) The corrected figures are listed above, each with the app shot it was read from.

(7) `npm run verify`: exit code `0`: `ratchets: ok`; unit `Tests  472 passed | 2 skipped (474)`; contract
`Tests  114 passed (114)`; api `Tests  115 passed (115)`; e2e `64 passed (9.6m)`; `UCs with a green e2e: 32/32`.

### Stub check

`loop-running` drawn as an empty string (`--only loop-running`), exit code `1`:

```
  ✗ loop-running light: requires loop-header, shows 0 · requires now-card, shows 0 · requires loop-figures, shows 0 · ...
drawn 1 states x 2 themes, 24 problems
```

An invented class, an inline colour or length and a key missing from the locale files fail the same dry run (the
checks of U5). A preview that keeps the contradicting figure (`avg: 18 * 60 + 47` put back) still draws
`drawn 1 states x 2 themes, 0 problems`: the dry run does not compare figures; the app at U16 does, against the
corrected values above.

### Notes

- `loop-last-failed` draws "Scan API logs for crashes": it is the only sample loop that waits after a failed run (the
  classic state drew "Check test coverage", whose run 105 is working, so the new now card would say that run is
  working). Its runs have no skipped run, so the state shows none, although spec 5.3 mentions one.
- Pushed pages (the loop page, All runs, loop settings, the active period page) show the navigation bar on the phone and
  no tab bar, as the boards do; `states.js` adds `tabbar` to the required ids of the tab-root states only.
- Gaps of the system, in castraferrum#108 (blocks U16, castraferrum#84): a pager, a clamped prompt, the state of an
  active period in its head, the repo-missing now card, three texts, and the board's sentence for a run without a
  summary.

## U7

### Ratchet

New preview states: `54` before (`npm run design:states -- --design design/ds --no-shots` on `main` prints
`states: 54/54 (shots not checked)`), `74` after (`states: 74/74 (shots not checked)`): 17 desktop and 3 phone added
(the 17 states of spec 5.5 and `phone-run-running`, `phone-run-succeeded`, `phone-run-transcript-running`).

### Red

The 20 rows of `design/ds/STATES.md` and the ids of `design/ds/preview/states.js` first, no draw function yet.
`npm run design:shots -- --design design/ds --dry` (exit code `1`; the first of 40 lines, then the last):

```
  ✗ run-running light: no draw function for state: run-running · requires run-header, shows 0 · requires run-facts, shows 0 · ...
  ...
drawn 74 states x 2 themes, 258 problems
```

The 40 lines name exactly the 20 new states, each in both themes: `phone-run-running phone-run-succeeded
phone-run-transcript-running run-cancelled run-failed run-interrupted run-loading run-not-found run-repo-missing
run-resume-copied run-running run-skipped run-succeeded run-timed-out run-transcript-missing run-transcript-no-session
run-transcript-paused run-transcript-running run-transcript-waiting vi-run-transcript`.

### Green

(1) `npm run design:shots -- --design design/ds --dry`: `drawn 74 states x 2 themes, 0 problems`, exit code `0`. (The
first drawn run reported `requires tx-entry*7, shows 11` for the three states that follow run 69: the sample session
has 11 entries, so the required count was corrected to 11.)

(2) `npm run design:states -- --design design/ds --no-shots`: `states: 74/74 (shots not checked)`.

(3) `npx vitest run --project unit shared/i18n/i18n.test.ts tests/tools/design-states.test.ts`:
`Test Files  2 passed (2)`, `Tests  17 passed (17)`. 30 keys added to `en.ts` and `vi.ts`: 28 of Appendix B (the
run page and `tx.*` rows; `run.title` and `run.cost` already exist with the same text and are reused) and two that it
lacks (`tx.lines.one`, `tx.lines.other`, in castraferrum#110).

(4) `git diff --stat main -- design/preview design/STATES.md` prints nothing.

(5) `reports/ds-preview/phone-run-succeeded-light.png` next to `design/reference/m-run-light.png`, and
`reports/ds-preview/phone-run-succeeded-dark.png` next to `design/reference/m-run-dark.png`. Both follow the boards:
the same blocks in the same order (navigation bar with `⋯`; "Run #68" and the Succeeded pill; the time line
"Sun 18/10 · 13:30 to 13:53 · took 23:04"; "Issue backlog worker · active period #3"; the summary card; the facts
Started by, Estimated cost with its note, Session with the copy button; Reopen this session on your computer with the
command and Copy command; Transcript with its `?`, "9 entries · session ended", the nine entries and "End of the
session · 13:53:04"; Log with "stored log · 2 lines"; the Prompt used cell). They differ where the sample data wins
over the board (the summary of run 68 in `data.js`, the session id the seeded world makes, a thinking block that is
empty because Claude Code stores only its signature, the server's own log line "Start round #68", the result of
`npm test` as its own entry), where the navigation bar names the loop as on the other pushed pages of U6, and where the
system has a rule or a defect that the board does not show (castraferrum#110): every fold shows body text because
`.app button` overrides `.tx-fold`, and the resume command stays on one line (`.cmd`). Also looked at: `run-succeeded`
(desktop, two columns: summary, transcript and log left; facts, resume command and prompt used right),
`run-failed`, `run-repo-missing`, `run-skipped`, `phone-run-transcript-running`, `vi-run-transcript`.

(6) `npm run verify`: exit code `0`: `ratchets: ok`; unit `Tests  472 passed | 2 skipped (474)`; contract
`Tests  114 passed (114)`; api `Tests  115 passed (115)`; e2e `64 passed (9.4m)`; `UCs with a green e2e: 32/32`.

### Stub check

`run-succeeded` drawn as an empty string (`--only run-succeeded`), exit code `1`:

```
  ✗ run-succeeded light: requires run-header, shows 0 · requires run-facts, shows 0 · requires run-session, shows 0 · ...
drawn 1 states x 2 themes, 20 problems
```

An invented class, an inline colour or length and a key missing from the locale files fail the same dry run (the
checks of U5).

### Notes

- Transcripts: `run-transcript-running`, `run-transcript-paused` and `run-running` follow run 69 (`pilot69`),
  `run-failed` shows the last page of 50 of run 104's 52 entries with "loading older…" at the top (`debt104`),
  `vi-run-transcript` shows the whole file of run 63 (`pilot63`). Four short sessions are added to `data.js` for the
  runs the classic preview drew without a transcript: run 68 (the board's nine entries), run 59 (interrupted), run 4 of
  "Old schedule test" (timed out) and run 4 of "Clean old artifacts" (cancelled).
- `run-running` and `run-transcript-running` draw the same page: in the new UI the transcript is always on the run
  page, so a running run shows its live transcript.
- The resume command appears only once a run has ended (D-UI12); a run without a session (skipped, repo missing) shows
  the no-session note in place of the transcript.
- Gaps of the system, in castraferrum#110 (blocks U17, castraferrum#85): the `.tx-fold` font and colour inside `.app`, a
  command that wraps, a scrolling transcript frame, the two `tx.lines` texts and the classic texts reused by the states
  without a board, and the `tx-entry` test id the state check counts.

## U8

### Ratchet

New preview states: `74` before (`npm run design:states -- --design design/ds --no-shots` on `main` prints
`states: 74/74 (shots not checked)`), `99` after (`states: 99/99 (shots not checked)`): 20 desktop and 5 phone added
(the 20 states of spec 5.6 and `phone-form-new`, `phone-form-sched-daily`, `phone-form-sched-weekly`,
`phone-form-errors`, `phone-form-repo-pick`).

### Red

The 25 rows of `design/ds/STATES.md` and the ids of `design/ds/preview/states.js` first, no draw function yet.
`npm run design:shots -- --design design/ds --dry` (exit code `1`; the first of 50 lines, then the last):

```
  ✗ form-new light: no draw function for state: form-new · requires f-name, shows 0 · requires f-repo, shows 0 · ...
  ...
drawn 99 states x 2 themes, 644 problems
```

The 50 lines name exactly the 25 new states, each in both themes: `form-conflict form-duplicate form-edit-claude
form-edit-running form-errors form-exec-mock form-loading form-new form-no-repos form-repo-pick form-repo-required
form-saving form-sched-advanced form-sched-advanced-error form-sched-daily form-sched-hours form-sched-minutes-uneven
form-sched-monthly-warn form-sched-weekly phone-form-errors phone-form-new phone-form-repo-pick phone-form-sched-daily
phone-form-sched-weekly vi-form-errors`.

### Green

(1) `npm run design:shots -- --design design/ds --dry`: `drawn 99 states x 2 themes, 0 problems`, exit code `0`.

(2) `npm run design:states -- --design design/ds --no-shots`: `states: 99/99 (shots not checked)`.

(3) `npx vitest run --project unit shared/i18n/i18n.test.ts tests/tools/design-states.test.ts`:
`Test Files  2 passed (2)`, `Tests  17 passed (17)`. 43 keys added to `en.ts` and `vi.ts`: the `editor.*` rows of
Appendix B.

(4) `git diff --stat main -- design/preview design/STATES.md` prints nothing.

(5) `reports/ds-preview/phone-form-sched-daily-light.png` next to `design/reference/m-form-light.png`. It follows the
board: the same sections in the same order (Details: Name, Repo with its value and chevron, Description with its hint,
then "Every run happens in this folder: C:\Users\alice\work\acme-api"; Prompt: "What each run should do", the board's
prompt and `184 / 20,000`; Schedule: Repeat, At, Time zone, then the card "Every day at 02:30", "stored as cron
30 2 * * * · Asia/Ho_Chi_Minh" and the five next runs from Mon 19/10 02:30 "in 12 h 29 min" to Fri 23/10 "in 4 d 12 h";
Agent: Model haiku, sonnet, opus with opus on; Effort with medium on; Runs at the same time with the stepper; Time
limit per run, empty for none; Create loop in the action bar). It differs where the system has no rule for what the
board shows (castraferrum#112): the stepper's number field fills its row, so the label "Runs at the same time" is
squeezed; Repeat, At, Time zone and Time limit are field cells with the label above, not rows with the value at the
end; the navigation bar shows a plain Cancel and the page keeps its `h1` "New loop"; the prompt is not set in
`--font-data`; Effort shows the five values the app accepts, and "medium" overflows its segment; the time field shows
"02:30 AM" in an English Chromium. Also looked at: `form-sched-daily` (desktop, `.page.is-narrow` with `.form-foot`),
`form-repo-pick` (desktop menu, the gone folder's warning) and `phone-form-repo-pick` (sheet), `phone-form-errors`,
`phone-form-sched-weekly` (seven chips, Mon, Wed and Fri on), `form-conflict`, `form-exec-mock`,
`form-sched-advanced-error`, `vi-form-errors`.

(6) `npm run verify`: exit code `0`: `ratchets: ok`; unit `Tests  472 passed | 2 skipped (474)`; contract
`Tests  114 passed (114)`; api `Tests  115 passed (115)`; e2e `64 passed (9.4m)`; `UCs with a green e2e: 32/32`.

### Stub check

`form-sched-daily` drawn as an empty string (`--only form-sched-daily`), exit code `1`:

```
  ✗ form-sched-daily light: requires f-name, shows 0 · requires f-repo, shows 0 · requires f-prompt, shows 0 · ...
drawn 1 states x 2 themes, 28 problems
```

An invented class, an inline colour or length and a key missing from the locale files fail the same dry run (the
checks of U5).

### Notes

- Sample data: `data.js` gains `formSample` (the board's "Nightly dependency check", acme-api and its prompt) and the
  schedule `daily0230` (`30 2 * * *`), so the next runs of `form-sched-daily` come from `shared/domain/schedule.ts`.
- Edit states: `form-edit-running`, `form-conflict` (effort max) and `form-duplicate` edit "Issue backlog worker";
  `form-edit-claude` edits "Digest upstream releases" with haiku, low and 600 seconds (`hint-f-timeout` shows 10 min).
- The executor choice and the Mock fields show only in `form-exec-mock` (test mode).
- Gaps of the system, in castraferrum#112 (blocks U18, castraferrum#86): the stepper's number field, the repo
  combobox, a row of chips, a field cell with the value at the end, the editor's navigation bar, the prompt font, five
  effort values on the phone, the classic texts reused by the states without a board, and the time field's format.

## U9

### Ratchet

New preview states: `99` before (`npm run design:states -- --design design/ds --no-shots` on `main` prints
`states: 99/99 (shots not checked)`), `120` after (`states: 120/120 (shots not checked)`): 16 desktop and 5 phone
added (the 14 `repos-*` and `vi-repos-*` states, `settings`, `settings-db-down`, and `phone-repos-list`,
`phone-repos-add`, `phone-repos-delete-confirm`, `phone-settings`, `phone-vi-settings`). 120 is the count of spec
section 5 (90 desktop and 30 phone states): the preview is complete.

### Red

The 21 rows of `design/ds/STATES.md` and the ids of `design/ds/preview/states.js` first, no draw function yet.
`npm run design:shots -- --design design/ds --dry` (exit code `1`; the first of 42 lines, then the last):

```
  ✗ repos-list light: no draw function for state: repos-list · requires repo-table, shows 0 · requires repo-row*4, ...
  ...
drawn 120 states x 2 themes, 350 problems
```

The 42 lines name exactly the 21 new states, each in both themes: `phone-repos-add phone-repos-delete-confirm
phone-repos-list phone-settings phone-vi-settings repos-add repos-add-denied repos-add-mac repos-add-notfound
repos-delete-blocked repos-delete-confirm repos-empty repos-err-dup-name repos-err-dup-path repos-err-missing
repos-list repos-loading settings settings-db-down vi-repos-add vi-repos-list`.

### Green

(1) `npm run design:shots -- --design design/ds --dry`: `drawn 120 states x 2 themes, 0 problems`, exit code `0`.

(2) `npm run design:states -- --design design/ds --no-shots`: `states: 120/120 (shots not checked)`, equal to the
count of spec section 5.

(3) `npx vitest run --project unit shared/i18n/i18n.test.ts tests/tools/design-states.test.ts`:
`Test Files  2 passed (2)`, `Tests  17 passed (17)`. 45 keys added to `en.ts` and `vi.ts`: the `repos.*`, `picker.*`
and `settings.*` rows of Appendix B and `status.folderGone`.

(4) `git diff --stat main -- design/preview design/STATES.md` prints nothing.

(5) `reports/ds-preview/phone-repos-add-light.png` next to `design/reference/m-folder-light.png`: the full-height
sheet with Cancel and "Add a repo" in its navigation bar, the path field `C:\Users\alice\work` with Up, quick access
as chips with "work" on, the breadcrumb `C: › Users › alice › work`, the folder list (acme-api tagged git and "already
a repo", the selected acme-tools with the rail, the other folders, `›` on each), "Tap a folder to choose it, tap › to
open it.", the target line "Adds C:\Users\alice\work\acme-tools as acme-tools" and Add repo. It also shows what the
spec adds to the board: Go, the filter, the show-hidden switch (one hidden folder, `.vs`) and the name field.
`reports/ds-preview/phone-settings-light.png` next to `design/reference/m-settings-light.png`: the same groups in the
same order (Appearance: Theme Automatic, Light, Dark with Automatic on, Language English and the Vietnamese option's own name; Connection:
Server Connected and Database Answering with a green dot, Console address `http://192.168.1.20:7070`; This device: Add
to Home Screen with how; About: Version `0.1.0`) above the tab bar with Settings on. The language options read their
own names from their locale files, with `lang` and `data-raw`. They differ where the system has no rule for what the
boards show (castraferrum#114): the paths, the address and the version are not in `--font-data`; the target line and
Add repo scroll with the sheet instead of staying at its bottom; "Home folder" instead of "Home". Also looked at:
`phone-repos-list` (next to `m-repos-light`: the four repos, "Folder is gone", the loop counts 5, 2, No loops, 1 loop,
each with `⋯`), `repos-add` and `repos-err-dup-name` (desktop dialogs), `repos-add-denied`, `repos-delete-blocked`,
`settings`, `phone-vi-settings` (dark), `phone-repos-delete-confirm` (dark).

(6) `npm run verify`: exit code `0`: `ratchets: ok`; unit `Tests  472 passed | 2 skipped (474)`; contract
`Tests  114 passed (114)`; api `Tests  115 passed (115)`; e2e `64 passed (9.2m)`; `UCs with a green e2e: 32/32`.

### Stub check

`repos-add` drawn as an empty string (`--only repos-add`), exit code `1`:

```
  ✗ repos-add light: requires folder-picker, shows 0 · requires repo-path, shows 0 · requires folder-list, shows 0 · ...
drawn 1 states x 2 themes, 16 problems
```

An invented class, an inline colour or length and a key missing from the locale files fail the same dry run (the
checks of U5).

### Notes

- Sample data: `data.js` gains `console` (the address Settings shows and the version of `package.json`). The folder
  worlds are the classic ones: `repos-add` selects acme-tools on the Windows machine; `repos-add-mac` and
  `repos-add-denied` draw the Mac's own console (its two repos, no loops), with dotfiles selected and `~/Desktop`
  refused.
- The loop counts are those of the sample loops: acme-api (old) shows 2 loops (Scan API logs for crashes and the
  archived Old schedule test), where the board shows 1.
- `repos-add-notfound` keeps the open folder as the target (the error comes from opening a typed path), so Add repo
  stays on; `repos-err-missing`, `repos-err-dup-path` and `repos-err-dup-name` lock it.
- `vi-settings` is the phone-only state `phone-vi-settings` (base `settings`, `lang: 'vi'`).
- Gaps of the system, in castraferrum#114 (blocks U14, castraferrum#82, and U19, castraferrum#87): a switch, slots of
  the picker for the breadcrumb, the filter, the switch and the path error, the picker's height in the dialog, a foot
  for the name and Add repo, data in `--font-data`, the quick-access labels, the classic texts reused by the states
  without a board, and the tab-root action (castraferrum#106).

## U11

### Ratchet

New reference shots: `0/120` before (`npm run design:states -- --design design/ds` on `main`), `120/120` after.
Projected design bytes after the cut-over: `2358681` on `main` (no new shots), `25324824` with the 240 shots of this
task (under the 29 500 000 of D22).

### Red

`npm run design:states -- --design design/ds` on `main`, exit code `1` (120 `missing:` lines, then):

```
  note: design/ds/preview/messages.js is missing (build output of shared/i18n) — run npm run design:shots
  note: design/ds/preview/schedule.js is missing (build output of shared/domain/schedule.ts) — run npm run design:shots
states with shots: 0/120
```

### Green

(1) `npm run design:states -- --design design/ds`: `states with shots: 120/120`, exit code `0`.

(2) The widths, read from the PNG header (`IHDR` width at byte 16):

```
node -e "const fs=require('fs');const d='design/ds/preview/shots/';let bad=0,n=0;const seen={};for(const f of fs.readdirSync(d)){const w=fs.readFileSync(d+f).readUInt32BE(16);const want=f.startsWith('phone-')?390:1440;n++;if(w!==want){bad++;console.log('wrong',f,w)}seen[w]=(seen[w]||0)+1}console.log('widths',JSON.stringify(seen),'files',n,'wrong',bad)"
widths {"390":60,"1440":180} files 240 wrong 0
```

Every `phone-*` shot is 390 wide (60), every other shot 1440 wide (180).

(3) `npm run design:shots -- --design design/ds --compress`: `shot 240 images`, `pixels identical: 240/240
(22966143 → 22966143 bytes)`, exit code `0`.

(4) The projection:

```
node -e "const {execSync}=require('child_process');const fs=require('fs');const del=['design/tokens.css','design/components.css','design/STATES.md','design/contrast-pairs-classic.json'];const dirs=['design/preview/','design/system/'];let n=0;for(const f of execSync('git ls-files design').toString().trim().split('
')){if(del.includes(f)||dirs.some(d=>f.startsWith(d)))continue;n+=fs.statSync(f).size}console.log('projected design bytes: '+n)"
projected design bytes: 25324824
```

(5) `git diff --stat main -- design/preview design/STATES.md` prints nothing.

(6) `npm run verify` (now starting with `npm run design:states -- --design design/ds`): exit code `0`:
`states with shots: 120/120`; `ratchets: ok`; unit `Tests  493 passed | 2 skipped (495)`; contract
`Tests  114 passed (114)`; api `Tests  115 passed (115)`; e2e `71 passed (13.7m)`; `UCs with a green e2e: 32/32`.

### Stub check

- Without shots the check prints `states with shots: 0/120` and exits `1` (Red).
- A wrong width fails the header check: with `form-conflict-light.png` (1440 wide) copied over
  `phone-form-errors-light.png` in a copy of the folder, the same one-liner prints
  `wrong width phone-form-errors-light.png 1440` and `wrong 1`, exit code `1`.
- A lossy re-encode fails the pixel comparison: `tests/tools/design-states.test.ts` ("compressPng: a lossless
  re-encode keeps the pixels; a lossy one fails and keeps the original") flips one bit of the decoded pixels before
  encoding; `compressPng` returns `identical: false` and keeps the original bytes, and `design:shots --compress` counts
  that shot as a problem and exits `1`.

### Notes

- The re-encode never wins: Chromium's PNGs are already about 15 % smaller than pngjs at deflate level 9 with the
  adaptive filter (for example `form-conflict-dark.png`: 148213 bytes from Chromium, 174433 from pngjs as RGB, 193395
  as RGBA). `--compress` keeps the smaller file, so every shot stays as Chromium wrote it; the step still proves the
  pixels round-trip. The set is 22 966 143 bytes, about the size of the classic set (D22).
- The owner's local `.git/info/exclude` lists `design/ds/preview/shots/` (from before the preview was approved); the
  shots were added with `git add -f`. Once tracked, the exclude line has no effect on them.

## U12

### Ratchet

Class and XPath selectors in tests (`tests/tools/e2e-selectors.test.ts`): `59` before, `0` after. e2e expects
(`npm run ratchets`): `712` before, `712` after. Chromium e2e tests (`npx playwright test --list --project chromium`):
`Total: 37 tests in 11 files` before, `37` after.

### Red

Both tool tests first, no `tests/support/ui.ts`:
`npx vitest run --project unit tests/tools/e2e-selectors.test.ts tests/tools/ui-branches.test.ts` (exit code `1`):

```
class and xpath selectors in tests: 59
+   "tests/e2e/claude.spec.ts:159 class token .log-scroll in \".log-scroll > div[data-seq]\"",
+   "tests/e2e/concurrency.spec.ts:57 class token .row-name in \".row-name .nm\"",
+   "tests/e2e/concurrency.spec.ts:96 class token .ph in \".ph .st.running\"",
  ... (59 lines)
Error: ENOENT: no such file or directory, open '...\tests\support\ui.ts'
 Test Files  2 failed (2)
      Tests  2 failed | 2 passed (4)
```

The plan's regular expression also matches the file and folder names the tests create or read (`.claude`, `.git`,
`.jsonl`, `.png`, and the hidden test folder `.an`): 14 more places in a first run (73). The scan lists them as file
names, not selectors; the 59 left are the selectors.

### Green

(1) The same command with `--silent=false` (Vitest 5 hides the console output of passing tests):

```
helpers without a new branch: 12
class and xpath selectors in tests: 0
 Test Files  2 passed (2)
      Tests  4 passed (4)
```

(2), (3), (5) `npm run verify`: exit code `0`. Build, then e2e `64 passed (9.4m)`: 37 in `chromium` (as U0) and 27 in
`visual`. Unit `Tests  476 passed | 2 skipped (478)`; contract `Tests  114 passed (114)`; api
`Tests  115 passed (115)`; `UCs with a green e2e: 32/32` (unchanged). `git diff --stat main -- design` prints nothing.

(4) `npm run ratchets -- --base main` (inside verify):

```
e2e expects: 712 (min 712)
base main: every limit held
ratchets: ok
```

### Stub check

`toHaveClass(/is-sel/)` put back on the selected loop row in `list.spec.ts`: the scan fails with
`class and xpath selectors in tests: 1` and `"tests/e2e/list.spec.ts:192 toHaveClass("`. One `expect` removed from
`detail.spec.ts`: `e2e expects: 711 (min 712)`, `ratchets: failed`. A new-UI branch with fewer `expect` calls than its
classic branch fails the fixture case of `ui-branches.test.ts`.

### Notes

- `StatusTag` renders `data-status` (and `data-testid`) only when it gets a `testId`. With `data-status` on every tag,
  `[data-status="failed"]` inside `runs-table` matched both a run row and its pill, and 4 tests failed (UC-12, UC-13,
  UC-14, UC-32). `row-right` carries the last run's status itself, as `data-status`.
- `Field` gets `errorFor`, which names the error element `error-<id>` for the repo combobox, which has no `htmlFor`.
- `loop-repo` is a span around the header's `RepoTag`, so the tag's own `repo-tag` id stays.

## U13

### Ratchet

Arch fixtures (`npm run arch`): `25/25` before, `26/26` after. Unit tests (`npx vitest run --project unit`):
`Tests  476 passed | 2 skipped (478)` before, `Tests  481 passed | 2 skipped (483)` after. Chromium e2e
(`npx playwright test --project chromium`): `37 passed` before (on `main`), `40 passed` after. `chromium-new`: no project
before, `4 passed` after. e2e expects (`npm run ratchets`): `712` minimum, `724` after.

### Red

Tests and fixture first, nothing built:

- `npx vitest run --project unit web/prefs/ui-version.test.ts tests/tools/pixel-diff.test.ts`:
  `Error: Cannot find module './ui-version'` and `AssertionError: expected undefined to be 0.001`,
  `Test Files  2 failed (2)`.
- `npx playwright test --project chromium-new`:
  `Error: Project(s) "chromium-new" not found. Available projects: "chromium", "visual"`.
- `npm run arch` with the fixture and no rule (exit code `1`):

  ```
  arch-fixtures: 25/26 violations caught
    ✗ not caught: no-new-ui-to-classic ← web/pages/violates-imports-classic.tsx
  ```

### Green

- (1) The vitest command: `Test Files  2 passed (2)`, `Tests  5 passed (5)` (four `uiVersion()` cases, `MAX_RATIO`).
- (2) `npm run build`, then `npx playwright test --project chromium-new`: `4 passed (17.2s)`.
- (3) `npx playwright test --project chromium`: `40 passed (5.3m)` (37 + the three ui-switch tests).
- (4) The classic visual tests, inside `npm run verify`: all 27 `visual` tests pass, unchanged.
- (5) `npm run arch`: `dependency-cruiser: 0 violations`, `arch-fixtures: 26/26 violations caught`.
- (6) `node -e` over `dist/web/assets/*.css`: `mixed stylesheets: 0`. The build writes two stylesheets and two font
  files; each holds one family only (IBM Plex or Be Vietnam Pro).
- (7) `npm run ratchets`: `ratchets: ok`. `npm run verify`: exit code `0`; e2e `71 passed (9.8m)` (40 `chromium`,
  4 `chromium-new`, 27 `visual`), contract `114 passed`, api `115 passed`, `UCs with a green e2e: 32/32`.

### Stub check

Each stub rebuilt and run, then put back:

- Flag read, not applied (`dataset.ui` line removed): `npx playwright test ui-switch --project chromium-new` gives
  `3 failed`, each `Expected: "new"`, `Received: ""`.
- `ServerProcess` page opened with `page.goto` instead of `gotoApp`: `1 failed`, `2 passed`;
  `Expected: "new"`, `Received: "classic"`.
- Classic branch loading the new CSS and fonts: `npx playwright test --project visual` gives `6 failed`.
- The rule pointed at a path that matches nothing: `arch-fixtures: 25/26 violations caught`, exit code `1`.

### Notes

- The rule found two real dependencies of shared models on classic files, both type-only:
  `web/features/loop-list/row-model.ts` took `StatusKind` from `web/ui/components.tsx`, and
  `web/features/loop-detail/format.ts` took `LogViewLine` from `web/ui/LogView.tsx`. The row model now uses the run
  status type of the API contract, and `format.ts` declares the line shape it returns (the classic `LogView` accepts it
  as it is). With those two changes, the real code has 0 violations.
- `concurrency.spec.ts` and `list.spec.ts` open no `ServerProcess` page. Their navigations still go through `gotoApp`,
  like the other three files, so a new-UI project can run them later without changes.
- The new routes all show `MissingRoute` (the path as the page title) until each screen's task builds it.

## U14

### Ratchet

New-UI visual pairs (`reports/compare/ds/results/frame.json`): `0` before, `24` after, worst region ratio `0` against
`MAX_RATIO` `0.001`. Behaviour tests (`tests/visual/ds/behaviour.visual.ts`): `0` before, `4` after. Unit tests
(`npx vitest run --project unit`): `Tests  493 passed | 2 skipped (495)` before, `Tests  499 passed | 2 skipped (501)`
after (three `tn()` cases, three `writeThemeChoice` cases). `visual` project: `27` tests before, `38` after (7 frame, 4
behaviour). `chromium` `40` and `chromium-new` `4` unchanged. Arch fixtures `26/26` before and after. `npm run ratchets`
before and after: `native title: 8`, `unknown classes: 0`, `dynamic classes: 4 (not checked)`, `literal styles: 0`,
`css violations: 0`, `e2e expects: 724 (min 712)`, `ratchets: ok`.

### Red

Tests first, nothing built (the plan writes `--project visual <files>`; Playwright reads that as two more projects, so the
runs use `--project=visual`):

- `npx vitest run --project unit web/prefs`:

  ```
  FAIL  |unit| web/prefs/theme.test.ts [ web/prefs/theme.test.ts ]
  Error: Cannot find module './theme' imported from .../web/prefs/theme.test.ts
  FAIL  |unit| web/prefs/messages.test.ts > tn() - plural texts (spec D16) > English: ...
  TypeError: tn is not a function
  (the same for the Vietnamese case and the parameters case)
  Test Files  2 failed | 1 passed (3)
       Tests  3 failed | 8 passed (11)
  ```

- `npm run build`, then
  `npx playwright test --project=visual tests/visual/ds/frame.visual.ts tests/visual/ds/behaviour.visual.ts`:

  ```
  1) behaviour.visual.ts:15 the theme button's tooltip ...      Error: expect(locator).toBeVisible() failed ... element(s) not found
  2) behaviour.visual.ts:46 tapping the theme button ...        Error: expect(locator).toBeVisible() failed ... element(s) not found
  3) behaviour.visual.ts:65 /settings and an unknown URL ...    Error: expect(locator).toBeVisible() failed ... element(s) not found
  4) behaviour.visual.ts:81 the tab bar marks the current tab   Error: expect(locator).toBeVisible() failed ... element(s) not found
  5) frame.visual.ts:57 settings and not found                  Expected: "ok" ... element(s) not found
  6) frame.visual.ts:133 settings, Vietnamese settings and not found   Expected: "ok" ... element(s) not found
  6 failed
  5 did not run
  ```

### Green

- (1) `npx playwright test --project=visual tests/visual/ds/frame.visual.ts`: `7 passed (1.1m)`, exit code `0`;
  `node -e "console.log(require('./reports/compare/ds/results/frame.json').length)"` prints `24`. Every region has `0`
  mismatched pixels (`worstRatio 0`, `maxRatio 0.001`): `settings`, `settings-db-down`, `not-found`, `phone-settings`,
  `phone-vi-settings`, `phone-not-found` compare the top bar (desktop) or the tab bar (phone) and the page, with only
  `settings-address` and `settings-version` masked; `frame-loading`, `frame-disconnected`, `frame-reconnected`,
  `frame-db-down` compare the top bar and the banner; `phone-frame-loading`, `phone-frame-disconnected` compare the tab
  bar and the banner. `frame-loading` and `phone-frame-loading` have no banner in the preview, so their regions are the top
  bar and the tab bar.
- (2) `npx playwright test --project=visual tests/visual/ds/behaviour.visual.ts`: `4 passed (12.6s)`.
- (3) `npx vitest run --project unit web/prefs`: `Test Files  3 passed (3)`, `Tests  14 passed (14)`.
- (4) `npm run ratchets`: `ratchets: ok`.
- (5) The classic visual tests, inside `npm run verify`: all 23 classic `visual` tests pass, unchanged (38 `visual` tests in
  all: 23 classic, 4 design-system page, 7 frame, 4 behaviour).
- (6) `npm run verify`: exit code `0`; design states `120/120`, `dependency-cruiser: 0 violations`,
  `arch-fixtures: 26/26 violations caught`, unit `499 passed | 2 skipped`, contract `114 passed`, api `115 passed`,
  e2e `82 passed (9.0m)` (40 `chromium`, 4 `chromium-new`, 38 `visual`), `UCs with a green e2e: 32/32`.

### Stub check

Each stub rebuilt and run, then put back:

- Empty frame (`Frame` renders only `<Outlet />`): the same two Playwright files give `6 failed`, `5 did not run`; every
  behaviour test fails on `element(s) not found` and both frame tests fail on `Expected: "ok"` (`conn` is missing).
- A tooltip that shows on `mouseenter` and not on a pointer type (hover only): `npx playwright test --project=visual
  tests/visual/ds/behaviour.visual.ts` gives `1 failed`, `3 passed`; the touch test fails with
  `Expected: 0`, `Received: 1` on the tooltip count after the tap.
- A native `title={label}` on the icon button: `npm run ratchets` prints `web/ui/kit/Button.tsx:47 title on <button>`,
  `native title: 9`, `ratchets: failed`, exit code `1`.
- `tn()` that always reads the `.other` text: `3 failed | 11 passed`, for example
  `AssertionError: expected '1 runs' to be '1 run'` and `expected 'Show 1 more runs from this period' to be 'Show 1 more run from this period'`;
  the Vietnamese case fails on the `.zero` text of `repos.loops`.

### Notes

- Two classic tests flaked during `npm run verify`, both outside U14. `tests/e2e/concurrency.spec.ts` UC-32 timed out
  waiting for runs on the first attempt and passes alone and on the next attempt. The classic
  `tests/visual/list.visual.ts` "LOOP_ALREADY_ACTIVE toast" test failed on the second attempt; the same file on a clean
  `main` build fails 3 times in 4 runs and passes alone, so it is flaky already. The third `npm run verify` is the one
  recorded above.
- A font face is fetched the first time text needs it. The first phone `frame-disconnected` run drew the banner in the
  fallback font because the server was killed before the regular face had been fetched. `frame.visual.ts` loads the faces
  (`document.fonts.load`) before it kills the server, so the shot shows the font the page has when it is online.
- Not found has no `h1` element in the approved preview (a bold line in `.empty`), and spec D28 asks for one `h1` per page.
  To keep the preview's pixels, the bold line carries `role="heading" aria-level="1"`. The behaviour test counts
  `getByRole('heading', { level: 1 })`, which matches both an `h1` and that.
- The phone controls test measures a segment of a segmented control as the control it sits in: the `.seg` is 44 tall and
  its segments are 38 tall inside its padding and border (the preview's own sizes). Every other control is measured as
  itself.
- Both points above are recorded as one design-system gap for the owner to rule on:
  https://github.com/hieplam/castraferrum/issues/151.
- The Settings address shows `window.location.origin` and the version shows `__APP_VERSION__` (the `package.json`
  version through Vite `define`); both cells are masked in every comparison, as the plan says.
- `Menu`, `Toggletip`, `Popover`, `Sheet` and `Dialog` are built as the plan lists them but no screen uses them yet; the
  Loops task (U15) is their first user. `Tooltip` is used by the theme button.
- `/` and the other paths whose screen is not built yet show `PendingRoute` (the path as the title); only an unknown path
  shows Not found (`MissingRoute`). The status banner is the first child of each page's `.page`: the frame gives it to
  `Page` through `PageTopProvider`, so the banner sits where the preview draws it.
- The theme-color updater creates `<meta name="theme-color">` when the page has none and runs only in the new UI; the
  `index.html` tag, the manifest and the icons come with the iOS task.

## U15

Status: done. All 20 states (40 pairs, desktop and phone, light and dark) are at `MAX_RATIO` or under, with no mask.

### Sample data of `loops-many` (owner decision, 2026-10-22)

Attempt 1 stopped on `loops-many`: the preview draws `214` runs today, `3` failed in 24 h and the agent line
`acme-api · Claude`, while `seedPreviewMany` gave `130`, `4` and `Claude sonnet`. The owner chose to change the seed, not
the preview (comment on #83). `seedPreviewMany` (`tests/support/preview-world.ts`) now:

- writes no model in the loops' executor config (`{"effort":"medium"}`); the row's agent text says `Claude` when a Claude
  loop names no model (`agentText` in `web/features/loop-list/row-view.tsx`), as the preview draws it;
- moves the earliest failed run of "Verify invoice totals + tax" back 25 hours, so `3` failed in 24 h while the open
  executions' failed counts stay as the classic list draws them;
- adds an earlier, closed execution (#4) of "Check test coverage" whose succeeded runs (one statement) bring today's runs
  to `214`.

The `stat-errors-24h` mask of `loops-many` is gone: the figure now matches. The preview, the frozen shots and the
classic `list-many` shot are unchanged; the classic `list-many` top bar now shows the preview's `214` and `3` too.

### Ratchet

New-UI visual pairs: `24` (`frame.json`) -> `64` (`frame.json` 24 + `loops.json` 40). `npm run ratchets` before and
after: `native title: 8`, `unknown classes: 0`, `dynamic classes: 4 (not checked)`, `literal styles: 0`,
`css violations: 0`, `e2e expects: 724 (min 712)`, `ratchets: ok`. Unit tests unchanged: `499 passed | 2 skipped (501)`.

### Red

`tests/visual/ds/loops.visual.ts` written first, nothing built, then `npm run build` and
`npx playwright test --project=visual tests/visual/ds/loops.visual.ts`: the page rendered the placeholder, `home-empty`
not found, `2 failed`, `9 did not run`.

### Green

- (1) `npx playwright test --project=visual tests/visual/ds/loops.visual.ts`: `12 passed`, exit 0.
  `node -e "console.log(require('./reports/compare/ds/results/loops.json').length)"`: `40`. 52 regions, 28 at 0
  mismatched pixels, worst ratio `0.0002` (`MAX_RATIO` `0.001`); `loops-many` page `7` px light, `2` px dark.
- (2) `npm run ratchets`: `ratchets: ok`.
- (3) The 23 classic visual tests pass unchanged (inside `npm run test:e2e`: the `visual` project `50 passed`).
  One earlier full run hit `list-many` at `4.80 %` off: the server clock runs from `PREVIEW_NOW` while the world is
  seeded, and a slow seed made "exec #3 4 h" read "4 h 1 min". The added runs are now one statement; `list.visual.ts`
  then passed twice in a row (`4 passed`, 19.6 s).
- (4) `npm run verify`: stops at `node scripts/lang-scan.mjs --check-baseline` with `ABOVE BASELINE: docs coupling 9 > 0`,
  the same output as a clean `main` (issue https://github.com/hieplam/castraferrum/issues/153, the open-in-terminal docs; not caused by U15). Every later step of the
  chain was run and exited 0: `arch` `0 violations`, `arch-fixtures: 26/26 violations caught`, `ratchets: ok`, unit
  `499 passed | 2 skipped`, contract `114 passed`, executor contract `7 passed` each, api `115 passed`,
  `npm run build`, e2e `94 passed (9.0m)`, `UCs with a green e2e: 32/32`.

### Stub check

- Summary strip removed and Start or Stop removed from the table row: `loops-overview` fails (`stat-active-loops` not
  found).
- Round Start or Stop not rendered on the phone: `phone-loops-overview-light` `3.06 % off (13890/453960 px)`,
  `-dark` `3.32 %`.
- The old seed (130 runs today, `Claude sonnet`) fails `loops-many` at `0.12 %` off even with `stat-errors-24h` masked.

## U16

Status: done. All 30 states (60 pairs: 21 desktop and 9 phone states, light and dark) are at `MAX_RATIO` or under, with no
mask; the two help behaviour tests pass.

### Sample data of "Issue backlog worker" (reported, not hidden)

The preview draws **Typical run 18:47, average of 9** for "Issue backlog worker", while the nine finished runs of its
active period #3, which the same preview draws on `loop-runs` (25:30, 20:10, 0:58, 1:04, 23:40, 15:51, 5:12, 18:22,
23:04), average **14:52**. The app shows the API's `avgDurationMs`, 14:52. The seed cannot match 18:47 without changing
durations that `loop-runs` and the run cells draw. The digits differ on 143 to 203 pixels of the page region of
`loop-running`, `loop-help`, `loop-menu`, `loop-stop-confirm`, `loop-stopping`, `loop-disconnected` and
`phone-loop-running` (at most `0.020 %`, under `MAX_RATIO`), so Green holds; nothing is masked. Issue
https://github.com/hieplam/castraferrum/issues/156 asks the owner whether to correct the preview's figure and re-shoot.

Resolved on 2026-10-23: the owner chose to correct the preview to 14:52 and re-shoot (see the section "Issue 156"
below and the entry "Typical run correction" in `design/APPROVED.md`).

### Ratchet

- New-UI visual pairs: `64` (`frame.json` 24 + `loops.json` 40) -> `124` (+ `loop.json` 60).
  `reports/compare/ds/report.json`: `"pairs": 124`, `"worstRatio": 0.00024`.
- Behaviour tests (`tests/visual/ds/behaviour.visual.ts`): `4` -> `6`.
- Unit tests: `503 passed | 2 skipped (505)` -> `510 passed | 2 skipped (512)`.
- `npm run ratchets` before and after: `native title: 8`, `unknown classes: 0`, `dynamic classes: 4 (not checked)`,
  `literal styles: 0`, `css violations: 0`, `e2e expects: 724 (min 712)`, `ratchets: ok`.

### Red

- `npx vitest run --project unit web/features/loop-detail/group-runs.test.ts web/ui/kit` (tests written, modules not):
  `Error: Cannot find module './group-runs'`, `Error: Cannot find module './copy'`, `Test Files  2 failed (2)`,
  `Tests  no tests`.
- `npm run build`, then `npx playwright test --project=visual tests/visual/ds/loop.visual.ts` (the routes still showed the
  placeholder): `expect(locator).toBeVisible() failed` on `getByTestId('loop-figures')`, `2 failed`, `6 did not run`.

### Green

- (1) `npx vitest run --project unit web/features/loop-detail/group-runs.test.ts web/ui/kit`: `Test Files  2 passed (2)`,
  `Tests  7 passed (7)` (the four grouping cases; the copy-method cases: a secure context with a clipboard uses the
  clipboard, an insecure context or no clipboard uses the textarea).
- (2) `npx playwright test --project=visual tests/visual/ds/loop.visual.ts`: `8 passed`, exit 0.
  `node -e "console.log(require('./reports/compare/ds/results/loop.json').length)"`: `60`. 92 regions, 76 at 0
  mismatched pixels, worst ratio `0.00024` (`MAX_RATIO` `0.001`): the Typical run figure above, and 18 px (light) and
  6 px (dark) of the Stop dialog's title.
- (3) `npx playwright test --project=visual tests/visual/ds/behaviour.visual.ts`: `6 passed`.
- (4) `npm run ratchets`: `ratchets: ok`.
- (5) The classic visual tests pass unchanged: in the e2e run of (6), the `visual` project passed every classic file. One classic test is flaky on this machine, on `main`'s code too (issue https://github.com/hieplam/castraferrum/issues/157, below).
- (6) `npm run verify`, attempt 1: stopped by the machine (low memory) during `test:e2e`, after 63 e2e tests had passed.
  Attempt 2 ran to the end with exit 1: `states with shots: 120/120`, typecheck, lang-scan baseline, `0 violations`,
  `arch-fixtures: 26/26 violations caught`, `ratchets: ok`, unit `510 passed | 2 skipped (512)`, contract `114 passed`,
  executor contract `7 passed` each, api `115 passed`, api-smoke, build, then e2e `1 failed`, `103 passed (12.4m)`. The one failure is the
  classic `list.visual.ts` "LOOP_ALREADY_ACTIVE toast" test: the list is fetched again between the API start and the click, so
  `row-start` is gone (`element is not visible`). Built from `origin/main`, the same test gave `1 failed, 1 passed` with
  `--repeat-each=2`, so U16 did not cause it (issue https://github.com/hieplam/castraferrum/issues/157). The last two steps of the chain were then
  run on their own: `npm run test:e2e && npm run uc-coverage -- --min 32` -> `104 passed (11.1m)`,
  `UCs with a green e2e: 32/32`, exit 0. (The e2e step already uses one worker: `workers: 1` in `playwright.config.ts`.)

### Stub check

- `groupRuns` and `pageGroups` putting every run in the newest period (ignoring `executionId`): `group-runs.test.ts`
  `3 failed | 1 passed`, the unknown-period case among them.
- `NowCard` and `Figures` not rendered on the loop page: `loop.visual.ts` fails at `loop-running` (`loop-figures`:
  `element(s) not found`).
- `copyMethod` always choosing the clipboard: `copy.test.ts` `2 failed | 1 passed` (the insecure-context case fails).
- `useFocusTrap` doing nothing: the phone help test fails (`Tab 1 left the sheet`).

## U17

Status: done. All 20 states (40 pairs: 17 desktop and 3 phone states, light and dark) are at `MAX_RATIO` or under, with no
mask.

### What changed outside the screen

- `tests/support/preview-transcripts.ts` writes the transcripts of either preview's data.js (`file` = `DS_DATA_JS` for the
  new one) and knows the four sessions the new preview added for the run page (runs 68, 59 of "Issue backlog worker",
  run 4 of "Old schedule test", run 4 of "Clean old artifacts").
- `tests/support/preview-world.ts`: in the new preview's world every run of "Issue backlog worker" up to #68 started with
  the old prompt, as the new preview draws it (`run-interrupted` shows run #59 with the "prompt was edited" note). The
  classic world keeps its rule (#68 and #63 only), so no classic shot changes. The seed changes to match the approved
  preview, never the preview.

### Preview vs app (reported, not hidden)

`run-failed` draws the transcript bar of run 104 as "52 entries" (the whole file), while only the last page of 50 is
loaded. The transcript API gives a page without a total count, so the app prints the loaded entries, "50 entries". The
two digits differ on 36 px (light) and 40 px (dark) of the page region (at most `0.003 %`), under `MAX_RATIO`; nothing is
masked. Issue https://github.com/hieplam/castraferrum/issues/159 asks the owner to choose.

### Ratchet

- New-UI visual pairs: `124` (`frame.json` 24 + `loops.json` 40 + `loop.json` 60) -> `164` (+ `run.json` 40).
  `reports/compare/ds/report.json` after the e2e run of `npm run verify`: `"pairs": 164`, `"worstRatio": 0.00024`.
- `npm run ratchets` before and after: `native title: 8`, `unknown classes: 0`, `dynamic classes: 4 (not checked)`,
  `literal styles: 0`, `css violations: 0`, `e2e expects: 724 (min 712)`, `ratchets: ok`.

### Red

`tests/visual/ds/run.visual.ts` written first. `npm run build`, then
`npx playwright test --project=visual tests/visual/ds/run.visual.ts` (the route still showed the placeholder):
`expect(locator).toHaveAttribute(expected) failed`, `Locator: getByTestId('run-header')`, `Error: element(s) not found`,
`2 failed`, `2 did not run`.

### Green

- (1) `npx playwright test --project=visual tests/visual/ds/run.visual.ts`: `4 passed`, exit 0.
  `node -e "console.log(require('./reports/compare/ds/results/run.json').length)"`: `40`. 48 regions, 20 at 0
  mismatched pixels, worst ratio `0.00012` (`vi-run-transcript`, sub-pixel shaping of Vietnamese text; `MAX_RATIO`
  `0.001`).
- (2) `npm run ratchets`: `ratchets: ok`.
- (3) The classic visual tests pass unchanged: every classic visual file passed in the e2e run of (4), except the known
  flaky `list.visual.ts` "LOOP_ALREADY_ACTIVE toast" test (issue https://github.com/hieplam/castraferrum/issues/157), which passed when re-run alone
  (`1 passed`).
- (4) `npm run verify` ran to the end: `states with shots: 120/120`, typecheck, lang-scan baseline, `0 violations`,
  `arch-fixtures: 26/26 violations caught`, `ratchets: ok`, unit `510 passed | 2 skipped (512)`, contract `114 passed`,
  executor contract `7 passed` each, api `115 passed`, api-smoke, build, then e2e `1 failed`, `107 passed (12.9m)`: the
  one failure is the flaky test of (3) (`locator.click: Test timeout of 90000ms exceeded`). The chain's last two steps were
  then run on their own: `npm run test:e2e && npm run uc-coverage -- --min 32` -> `108 passed (12.2m)`,
  `UCs with a green e2e: 32/32`, exit 0 (`"pairs": 164` in `report.json`). The e2e step already uses one worker.

### Stub check

- Transcript entries drawn as a three-column grid (time, kind, body side by side, an inline grid on `.tx-entry`): the
  phone test fails, `phone-run-transcript-running-light · page: 41.33 % off` (and `phone-run-running`,
  `phone-run-succeeded`).
- The desktop run page without the summary, the facts and the resume command: the first test fails at `run-succeeded`
  (`getByTestId('run-summary')`: `toBeVisible() failed`), after the page regions of `run-transcript-missing` are
  `18.86 %` and `4.63 %` off.

## U18

Status: done. All 25 states (50 pairs: 20 desktop and 5 phone states, light and dark) are at `MAX_RATIO` or under, with no
mask.

### What changed outside the screen

- Kit `web/ui/kit/Field.tsx`: `FieldCell` takes `htmlFor`, `row` (`.fcell.is-row` with its chevron), `count`, `hints` and
  `error` (`error-<field>`); new `Input`, `Textarea`, `Select`, `Stepper`, `StepperCell`, `Chip`, `HintLine`. Settings keeps
  using `FieldCell` as before.
- Kit `NavBar` takes an optional `title` (the editor's phone heading, an `h1` in `.navbar-title`).
- `PageNotFound` takes an optional `testId` (`form-load-error`).
- The real console offers one executor (Claude), a test-mode server also offers Mock; the editor shows the executor choice
  only when the server offers more than one. The preview draws the real console in every state except `form-exec-mock`, so
  the visual test answers `GET /api/executors` with Claude only in those states (a route mock, as the classic test holds
  routes).

### Preview vs app (reported, not hidden)

`form-duplicate` draws the copy's back link as "Issue backlog worker" (the original), while the app's back link leads to the
copy it edits and reads "Issue backlog worker (copy)". 110 px of the page region (139 px light, 145 px dark in all, at most
`0.012 %`), under `MAX_RATIO`; nothing is masked. Issue https://github.com/hieplam/castraferrum/issues/161 asks the owner to
choose.

### Ratchet

- New-UI visual pairs: `164` (`frame.json` 24 + `loops.json` 40 + `loop.json` 60 + `run.json` 40; measured before building:
  `npx playwright test --project=visual tests/visual/ds/` -> `41 passed`, `report.json` `"pairs": 164`) -> `214`
  (+ `form.json` 50; `report.json` after the visual project run of Green (5): `"pairs": 214`, `"worstRatio": 0.00024`).
- `npm run ratchets` before and after: `native title: 8`, `unknown classes: 0`, `dynamic classes: 4 (not checked)`,
  `literal styles: 0`, `css violations: 0`, `e2e expects: 724 (min 712)`, `ratchets: ok`.

### Red

`tests/visual/ds/form.visual.ts` written first. `npm run build`, then
`npx playwright test --project=visual tests/visual/ds/form.visual.ts` (the routes still showed the placeholder):
`expect(locator).toBeVisible() failed`, `Locator: getByTestId('sched-out')`, `Error: element(s) not found`, `2 failed`,
`3 did not run`.

### Green

- (1) `npx playwright test --project=visual tests/visual/ds/form.visual.ts`: `5 passed`, exit 0.
  `node -e "console.log(require('./reports/compare/ds/results/form.json').length)"`: `50`. 64 regions, 28 at 0 mismatched
  pixels, worst ratio `0.00012` (`form-duplicate`, the back link above); the others at most `0.00005` (the stored-cron line).
- (2) `npx vitest run --project unit web/features/loop-form`: `20 passed (20)`; `form-model.ts`, `schedule-draft.ts`,
  `time-zones.ts` and `use-duplicate-loop.ts` are unchanged.
- (3) `npm run ratchets`: `ratchets: ok`.
- (4) The classic visual tests pass unchanged: the visual project run of (5) gave `69 passed`, every classic file included.
- (5) `npm run verify` was stopped by Claude Code for low memory during its e2e step, after every earlier step passed:
  `states with shots: 120/120`, typecheck, lang-scan baseline, `0 violations`, `arch-fixtures: 26/26 violations caught`,
  `ratchets: ok`, unit `510 passed | 2 skipped (512)`, contract `114 passed`, executor contract `7 passed` each, api
  `115 passed`, api-smoke, build. The remaining steps were then run on their own, one project at a time (the e2e step
  already uses one worker): `npx playwright test --project=chromium --project=chromium-new` -> `44 passed (5.2m)`;
  `npx playwright test --project=visual` -> `69 passed (9.7m)`; `npx playwright test --project=chromium --project=chromium-new`
  again (so `reports/e2e.json` holds the e2e projects) -> `44 passed (5.3m)`, then `npm run uc-coverage -- --min 32` ->
  `UCs with a green e2e: 32/32`.

### Stub check

- An editor without the next runs (the `ol.next-runs` of the schedule card left out): the phone test fails,
  `phone-form-sched-weekly-light · page: 1.72 % off` (and `phone-form-new`, `phone-form-sched-daily`, `phone-form-errors`).
- Fields under 16px (`--fs-sm` on `Input` and `Textarea`): the phone test fails at `phone-form-new`,
  `expect(received).toBeGreaterThanOrEqual(expected)`, `Expected: >= 16`, `Received: 14`.

## Issue 156

Status: done. The new preview's Typical run of "Issue backlog worker" is corrected from 18:47 to 14:52 (owner's decision
on https://github.com/hieplam/castraferrum/issues/156, 2026-10-23); the seed is unchanged. A task outside the plan, so it
has no plan entry.

### Red

`npm run build`, then `npx playwright test --project=visual tests/visual/ds/loop.visual.ts` on `main`: `8 passed`, with
the digits mismatched in the page region (`reports/compare/ds/results/loop.json`, light / dark):
`loop-running` 190 / 185, `loop-help` 190 / 185, `loop-menu` 190 / 185, `loop-stop-confirm` 203 / 176,
`loop-stopping` 190 / 185, `loop-disconnected` 190 / 185, `phone-loop-running` 161 / 143. Every other region: 0, except
the `loop-stop-confirm` dialog region (18 / 6).

### Green

- (1) `npm run design:shots -- --design design/ds`: `shot 240 images`; `git diff --stat main -- design/ds/preview/shots`
  lists exactly the 14 shots of the 7 states above, light and dark.
- (2) `npx playwright test --project=visual tests/visual/ds/loop.visual.ts`: `8 passed`. Page region, before -> after:
  `loop-running` 190 -> 0 / 185 -> 0, `loop-help` 190 -> 0 / 185 -> 0, `loop-menu` 190 -> 0 / 185 -> 0,
  `loop-stop-confirm` 203 -> 18 / 176 -> 6, `loop-stopping` 190 -> 0 / 185 -> 0, `loop-disconnected` 190 -> 0 / 185 -> 0,
  `phone-loop-running` 161 -> 0 / 143 -> 0. The 18 / 6 left on `loop-stop-confirm` are the dialog's own pixels, the same
  before and after (dialog region 18 -> 18 / 6 -> 6), not the figure.
- (3) The other new-UI suites pass, one at a time: `tests/visual/ds/loops.visual.ts`, `run.visual.ts`, `form.visual.ts`,
  `frame.visual.ts` (counts in the pull request).
- (4) `npm run ratchets`: `ratchets: ok`.

### Stub check

`avg: 18 * 60 + 47` put back in `design/ds/preview/data.js` and the 7 states re-shot: `loop-running` page 0 -> 190 again
(see the pull request for the literal numbers); the change was then undone.

### Ratchet

Mismatched pixels from the figure, summed over the 14 page regions: 2558 -> 24 (the 24 are the dialog pixels of
`loop-stop-confirm`, unchanged).

