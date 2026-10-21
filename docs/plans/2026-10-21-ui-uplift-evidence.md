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
