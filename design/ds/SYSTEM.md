# Castraferrum design system - the rules

This file is the written half of the design system of the new UI (epic #63, look C "Soft studio"). The other half is
code: [`tokens.css`](tokens.css) (every value), [`components.css`](components.css) (every class), [`fonts.css`](fonts.css)
and the design-system page [`index.html`](index.html), which draws every component in both themes and in two phone
frames. Read this file first; you should not need to read the CSS to build a screen.

Where this file and [the spec](../../docs/specs/2026-10-21-ui-uplift.md) (section 4) differ, the spec wins and this file
is fixed. Where the spec and the approved reference [`design/reference/`](../reference/README.md) differ, the spec wins.
The values below are copied from the spec; `tests/tools/ds-tokens-spec.test.ts` checks that `tokens.css` holds them.

## Principles

- **Mobile-first.** The phone layout (below 640px) is the base. Tablet (640 to 1023px) and desktop (1024px and up)
  show the same pages and the same components, with more room. Never design a desktop-only control.
- **Tokens only.** A component never writes a colour, size, spacing, radius, duration or layer value. It reads a token
  of `tokens.css`. The only literal lengths allowed are the two breakpoints inside media queries (a media query cannot
  read a custom property): `max-width: 639.98px` (phone) and `min-width: 1024px` (wide). `npm run design:lint` fails on
  anything else.
- **One component per job.** A list is the inset list, a menu is the menu, a confirmation is the sheet or dialog. Do
  not build a second component that does the same job with a different look.
- **No information only in a tooltip.** Tooltips only label icon-only buttons on pointer devices. Explanations use a
  toggletip (a `?` button that opens a popover or a sheet). Native `title` attributes are never used.
- **Sentence case.** Every label, title and button is in sentence case. No uppercase labels with letter spacing.
- **Every control is visible at rest.** Nothing appears only on hover; on the phone every tappable target is at least
  `--size-touch` (44 by 44 CSS pixels).

## Tokens

Every token below is defined in `tokens.css` and listed in [`required-tokens.json`](required-tokens.json);
`npm run design:tokens -- design/ds/tokens.css --pairs design/ds/contrast-pairs.json --require design/ds/required-tokens.json`
fails when one is missing. Colours exist in both themes: light is the default set (`:root, [data-theme="light"]`), dark
is `:root[data-theme="dark"], [data-theme="dark"]`. The other tokens are defined once in `:root`, and the phone values
override them inside `@media (max-width: 639.98px)`.

### Colour tokens

| Token | Light | Dark | What it is for |
|---|---|---|---|
| `--bg` | `#f3ecdc` | `#0f1211` | the page background (paper) |
| `--surface` | `#faf6ec` | `#161b1a` | cards, lists, fields, bars |
| `--raised` | `#fffcf4` | `#1c2321` | menus, popovers, sheets, dialogs |
| `--hover` | `#ece4d2` | `#263230` | hover, on pointer devices only |
| `--pressed` | `#e6dcc6` | `#2c3936` | `:active` on every tappable element |
| `--selected` | `#dfece4` | `#133a34` | the selected cell, the chosen chip |
| `--border` | `#e1d7c2` | `#2c3835` | separators, card edges |
| `--border-strong` | `#8a7e66` | `#74867f` | control edges (fields, buttons), 3:1 or more |
| `--text` | `#2b261e` | `#e7eeeb` | text |
| `--text-muted` | `#57503f` | `#a6b5b0` | secondary text |
| `--text-subtle` | `#665d4a` | `#94a49f` | meta lines, captions (still 4.5:1) |
| `--accent` | `#0f766e` | `#2dd4bf` | primary buttons, the selected rail, focus |
| `--accent-hover` | `#0b5f58` | `#5eead4` | primary button hover and pressed |
| `--accent-fg` | `#ffffff` | `#0f1211` | text on `--accent` |
| `--accent-text` | `#0b5f58` | `#5eead4` | links, the active tab, text buttons |
| `--focus` | `#0f766e` | `#2dd4bf` | the focus ring |
| `--tip-bg` | `#2b261e` | `#2a3533` | tooltip background |
| `--tip-fg` | `#f7f1e3` | `#e7eeeb` | tooltip text |
| `--scrim` | `rgba(43, 38, 30, .42)` | `rgba(0, 0, 0, .62)` | behind sheets and dialogs |
| `--log-bg` | `#1d1a14` | `#0a0d0c` | log and transcript frames (dark in both themes) |
| `--log-text` | `#efe8d8` | `#d5e2de` | log text |
| `--log-dim` | `#a59c88` | `#7f918c` | log times, folded lines |
| `--log-accent` | `#6fd8c6` | `#5eead4` | log head lines, tool names |
| `--log-ok` | `#a9d98f` | `#7bdc6b` | log success lines, assistant entries |
| `--log-err` | `#ff9a8a` | `#ff7d72` | log errors |
| `--run` | `#1d5aa8` | `#8ab8ff` | Running: the dot and the pill text |
| `--run-soft` | `#e2e9f2` | `#14243a` | Running: the pill background |
| `--ok` | `#2e6a26` | `#7bdc6b` | Succeeded, Waiting, connected |
| `--ok-soft` | `#e1e9d3` | `#15260f` | their pill background |
| `--err` | `#b0281f` | `#ff7d72` | Failed, Timed out, errors, Stop |
| `--err-soft` | `#f5ded6` | `#2f1513` | their pill and banner background |
| `--on-err` | `#ffffff` | `#0f1211` | text on a solid `--err` button |
| `--warn` | `#7f5300` | `#f2cd55` | warnings, Folder is gone |
| `--warn-soft` | `#f3e5c3` | `#29240d` | their pill and banner background |
| `--int` | `#6c3da3` | `#cfa8ff` | Stopped by server, Interrupted |
| `--int-soft` | `#ebe0ee` | `#251b33` | their pill background |
| `--skip` | `#5a5f63` | `#a3acb3` | Skipped, Cancelled, Stopped |
| `--skip-soft` | `#ebe4d4` | `#1d2123` | their pill background |
| `--shadow-pop` | a 32px shadow and a border ring | a darker shadow and a border ring | menus, popovers |
| `--shadow-sheet` | a shadow above the sheet | a border ring and a darker shadow | sheets, dialogs |
| `--shadow-tip` | a 16px shadow | a strong border ring and a shadow | tooltips |

No colour token may be added: the colours are exactly the 41 above. A new colour need is a gap (see
[How to change the system](#how-to-change-the-system)).

### Type tokens

| Token | Desktop | Phone | What it is for |
|---|---|---|---|
| `--font-ui` | Be Vietnam Pro, then system fonts | same | words |
| `--font-data` | JetBrains Mono, then system monospace fonts | same | numbers, ids, times, paths, logs |
| `--fs-cap` / `--lh-cap` | 13px / 18px | 13px / 18px | captions, group headers, meta lines |
| `--fs-sm` / `--lh-sm` | 14px / 20px | 14px / 20px | secondary text, buttons |
| `--fs-body` / `--lh-body` | 15px / 23px | 16px / 24px | body text |
| `--fs-h3` / `--lh-h3` | 16px / 24px | 17px / 24px | cell titles |
| `--fs-h2` / `--lh-h2` | 18px / 26px | 20px / 28px | section titles |
| `--fs-title` / `--lh-title` | 24px / 32px | 26px / 32px | the page title |
| `--fs-large` / `--lh-large` | 24px / 32px | 30px / 36px | the large title of a tab root |
| `--fs-num` / `--lh-num` | 28px / 34px | 24px / 30px | big figures |
| `--fs-data` / `--lh-data` | 14px / 20px | 14px / 20px | mono text |
| `--fs-field` | 16px | 16px | every input, textarea and select |
| `--fs-tab` / `--lh-tab` | 12px / 16px | 12px / 16px | tab bar labels only |
| `--fw-regular`, `--fw-medium`, `--fw-semibold`, `--fw-bold` | 400, 500, 600, 700 | same | weights |
| `--track-tight`, `--track-snug` | -0.02em, -0.01em | same | letter spacing of titles |

### Space, radius and border tokens

| Token | Value | What it is for |
|---|---|---|
| `--space-0h`, `--space-1`, `--space-1h`, `--space-2`, `--space-2h`, `--space-3`, `--space-3h`, `--space-4`, `--space-5`, `--space-6`, `--space-8`, `--space-10`, `--space-12` | 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48 px | the only spacing values: padding, gaps, margins |
| `--radius-xs` | 6px | tags, small inner corners |
| `--radius-ctl` | 8px | buttons, fields, menu items |
| `--radius-card` | 12px | cards, groups, dialogs |
| `--radius-sheet` | 18px | the top corners of a sheet |
| `--radius-pill` | 999px | pills, chips, round buttons |
| `--border-w` | 1px | every border and hairline |
| `--rail-w` | 3px | the selected rail of a list cell |
| `--focus-w`, `--focus-gap` | 2px, 2px | the focus ring width and its offset |

### Size tokens

| Token | Desktop | Phone | What it is for |
|---|---|---|---|
| `--size-icon-sm`, `--size-icon`, `--size-icon-md`, `--size-icon-lg`, `--size-icon-tab` | 16, 18, 20, 24, 26 px | same | icons; `--size-icon-tab` in the tab bar |
| `--size-dot`, `--size-pulse` | 7, 10 px | same | the status dot and the running pulse |
| `--size-pill`, `--size-tag` | 22, 20 px | same | pill and tag heights |
| `--size-control-sm` | 30px | 30px | small buttons |
| `--size-control` | 36px | 44px | buttons and fields: 44px tall on the phone |
| `--size-control-lg` | 50px | 50px | large buttons |
| `--size-touch` | 44px | 44px | the smallest tappable target |
| `--size-topbar`, `--size-navbar`, `--size-tabbar` | 56, 52, 56 px | same | the top bar, the navigation bar, the tab bar |
| `--size-row`, `--size-row-sm` | 56, 52 px | same | list cell heights (phone, desktop) |
| `--size-grab-w`, `--size-grab-h` | 36, 5 px | same | the sheet grabber |
| `--size-page`, `--size-page-narrow` | 1200, 720 px | same | page widths |
| `--size-side` | 340px | same | the side column of `.cols` |
| `--size-dialog`, `--size-dialog-wide` | 440, 720 px | same | dialog widths |
| `--size-tip-wide`, `--size-menu` | 340, 220 px | same | the widest tooltip, a menu |
| `--size-tip-arrow` | 5px | same | the tooltip arrow |
| `--size-textarea`, `--size-log`, `--size-tx` | 150, 288, 576 px | same | heights of the prompt field, the log, the transcript |
| `--size-tx-head` | 140px | same | the transcript entry head beside its body, from 1024px |
| `--size-stepper-value` | 52px | same | the value box of a stepper |
| `--size-col-status`, `--size-col-run`, `--size-col-next`, `--size-col-act` | 150, 130, 120, 92 px | same | columns of the desktop Loops table |
| `--size-summary-item` | 220px | same | an item of the Loops summary |
| `--size-cursor-w`, `--size-cursor-h` | 8, 15 px | same | the log cursor |
| `--blur-bar` | 20px | same | the blur behind translucent bars |

### Motion, layer and safe-area tokens

| Token | Value | What it is for |
|---|---|---|
| `--dur-fast`, `--dur-base`, `--dur-sheet` | 100ms, 180ms, 240ms | state changes, hovers, sheets sliding in; 0 under `prefers-reduced-motion: reduce` |
| `--ease` | `cubic-bezier(.2, .7, .2, 1)` | every transition |
| `--z-bar`, `--z-pop`, `--z-sheet`, `--z-toast` | 10, 30, 40, 50 | bars, popovers and menus, sheets and dialogs, toasts |
| `--safe-top`, `--safe-bottom` | the iPhone safe-area insets, `0px` elsewhere | padding of the navigation bar (top), the tab bar, the action bar and sheets (bottom) |

## Type

- Words use `--font-ui` (Be Vietnam Pro 400, 500, 600, 700). Numbers, ids, times, durations, costs, paths and logs use
  `--font-data` (JetBrains Mono 400, 500, 600). Both cover Vietnamese. `fonts.css` self-hosts them.
- Body text is 15px on the desktop and 16px on the phone. The smallest text is 13px (`--fs-cap`), except tab bar
  labels (`--fs-tab`, 12px).
- Every text field is `--fs-field` (16px) on every screen size: iOS Safari zooms into a field under 16px.
- Titles use `--fw-semibold` or `--fw-bold` with `--track-tight` or `--track-snug`. Labels are never uppercase.

## Colour and contrast

- Use the colour tokens by their job in the table above, never by their look: a warning is `--warn`, not "the yellow".
- **The pairs rule.** Text and controls are only drawn on the backgrounds listed for them in
  [`contrast-pairs.json`](contrast-pairs.json) (63 pairs, checked in both themes, so 126 checks):
  - `--text`, `--text-muted`, `--text-subtle` on `--bg`, `--surface`, `--raised`, `--hover`, `--pressed`,
    `--selected`: 4.5:1;
  - `--accent-text` on `--surface`, `--bg`, `--selected`, `--hover`: 4.5:1;
  - `--accent-fg` on `--accent` and `--accent-hover`; `--on-err` on `--err`; `--tip-fg` on `--tip-bg`: 4.5:1;
  - the log colours on `--log-bg`: 4.5:1;
  - each status colour on its own `-soft`, on `--surface`, `--bg` and `--raised`: 4.5:1;
  - `--border-strong` and `--focus` on the backgrounds they sit on: 3:1.
- A new text-on-background combination that is not a listed pair is a gap: add the pair to `contrast-pairs.json` (and
  prove it passes) before you use it.
- `npm run design:tokens` computes every pair and fails below the minimum.

## Interaction states

Defined once (spec 4.4); every component uses the same look for the same state.

| State | How it looks | Where |
|---|---|---|
| Rest | `--surface` (cells, cards, fields) or transparent (ghost and plain buttons, tabs) | everything |
| Hover | background `--hover`, text unchanged; only under `@media (hover: hover) and (pointer: fine)` | cells, rows, buttons, menu items, tabs, segments, links (underline) |
| Pressed | background `--pressed` (`:active`); primary buttons `--accent-hover`; on every device | everything tappable |
| Selected | background `--selected`, a `--rail-w` inset bar in `--accent` on the leading edge for list cells, `--accent-text` for chips and the active tab | the chosen folder, the chosen filter, the active tab or nav link |
| Focus | `outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-gap)` on `:focus-visible`; never removed without a replacement | everything focusable |
| Disabled | 45 % opacity and `cursor: not-allowed`; the label stays readable (a disabled menu item uses `--text-subtle` instead) | buttons, menu items, fields |

- Hover exists only for fine pointers, because iOS keeps a hover style stuck after a tap. Pressed exists everywhere and
  replaces the iOS tap highlight.
- `.is-hover`, `.is-pressed` and `.is-focus` draw those states at rest, for the design-system page and the preview only.
  The app never sets them.

## Components

Every class below is defined in `components.css` and drawn on `index.html`; `tests/tools/ds-catalogue.test.ts` checks
both. The React wrappers live in `web/ui/kit/`, one file per family, take every text as a prop (no i18n, no business
logic) and are built by the app tasks of epic #63 (U14 to U19); the task that builds a wrapper is named in brackets.
Screens put kit components together in `web/features/`. Never add a class that is not in this list.

### App frame

- **Classes:** `.app`, `.topbar`, `.topbar-brand`, `.topbar-nav`, `.topbar-link` (`.is-on`), `.topbar-end`, `.conn`
  (`.is-ok`, `.is-lost`, `.is-db-down`).
- **Use it** once, as the root of the app: `.app` also turns off the iOS tap highlight. The top bar holds the brand, the
  three links (Loops, Repos, Settings), the connection status and the theme button.
- **Do not** put page actions in the top bar; they belong to the page head.
- **Phone:** the top bar is hidden (the tab bar and navigation bar replace it). **Desktop:** a `--size-topbar` bar.
- **States:** hover, focus, the active link (`.is-on`); the connection is ok, lost or the database is down.
- **Wrapper:** the frame is app code, not kit: `web/app/Frame.tsx` and `web/app/TopNav.tsx` (U14).

### Tab bar

- **Classes:** `.tabbar`, `.tabbar-item` (`.is-on`).
- **Use it** for the three tab roots (Loops, Repos, Settings) on the phone. It is a `nav`; the active item has
  `aria-current="page"`.
- **Do not** use it for filters or for sections inside a page (use the segmented control).
- **Phone:** fixed at the bottom, `--size-tabbar` tall plus `--safe-bottom`. **Desktop:** hidden.
- **States:** pressed, active (`.is-on`, `--accent-text`).
- **Wrapper:** `web/app/TabBar.tsx` (U14).

### Navigation bar

- **Classes:** `.navbar`, `.navbar-back`, `.navbar-title`, `.navbar-actions`.
- **Use it** on pushed pages on the phone: a back button (or Cancel, in the accent colour), the page name and at most
  two icon actions. The title is not a heading (the page keeps its one `h1`), except on the editor: there the phone page
  shows no title of its own and the bar title is the `h1` (`<h1 class="navbar-title">`).
- **Do not** use it on tab roots; they show a large title instead.
- **Phone:** `--size-navbar` tall plus `--safe-top`, translucent with `--blur-bar`. **Desktop:** hidden; a back link
  above the page title replaces it.
- **States:** pressed.
- **Wrapper:** `web/ui/kit/Layout.tsx`, with the page (U14).

### Page

- **Classes:** `.page` (`.is-narrow`), `.page-head` (`.is-root`), `.page-title`, `.page-desc`, `.page-meta`, `.large-title`,
  `.backlink`, `.cols`, `.cols-main`, `.cols-side`, `.actionbar`.
- **Use it** for every route: one `.page`, one `h1` (`.page-title`, or `.large-title` on a tab root), then the content.
  The head of a tab root that has an action (Loops: New loop, Repos: Add a repo) is `.page-head.is-root` holding the
  `h1` and that one action; Settings has no action and keeps a plain `.page-head`.
- **Do not** nest pages or put a second `h1` anywhere.
- **Phone:** one column; `.actionbar` is fixed at the bottom and holds the page's main action. In `.page-head.is-root`
  the action is a 44 by 44 `.iconbtn` (the `+`, in `--accent-text`) at the trailing edge, on a row above the large
  title. A page under the tab bar keeps `--size-tabbar` + `--safe-bottom` of bottom padding, so its last cell is never
  hidden. **Desktop:** `.cols` makes two columns from 1024px; `.actionbar` is hidden and its actions sit in
  `.page-head`; in `.page-head.is-root` the action is the `.btn.primary` at the end of the row, beside the title.
- **States:** none.
- **Wrapper:** `web/ui/kit/Layout.tsx`: `Page`, `PageHead`, `LargeTitle`, `BackLink`, `ActionBar`, `Cols`, `useLayout`
  (U14).

### Banner

- **Classes:** `.banner` (`.is-err`, `.is-warn`, `.is-info`), `.banner-text`.
- **Use it** for a state of the whole console or the whole page: disconnected, database down, reconnected.
- **Do not** use it for the result of one action (use a toast) or for a field error (use the hint).
- **Phone:** under the navigation bar. **Desktop:** under the top bar.
- **States:** error, warning, information.
- **Wrapper:** `web/ui/kit/Banner.tsx` (U14).

### Button

- **Classes:** `.btn` (`.primary`, `.danger`, `.danger-solid`, `.ghost`, `.plain`, `.sm`, `.lg`, `.block`), `.iconbtn`
  (`.bordered`), `.act` (`.start`, `.stop`).
- **Use** `.btn.primary` for the one main action of a view, `.btn` for the others, `.danger` for a destructive action
  and `.danger-solid` for its confirmation, `.ghost` and `.plain` for quiet actions, `.iconbtn` for an icon-only action
  (always with an `aria-label` and a tooltip), `.act.start` and `.act.stop` for Start and Stop on a loop row.
- **Do not** put two primary buttons in one view, or use a link for an action.
- **Phone:** `--size-control` is 44px; `.act` is a 44px round button. **Desktop:** 36px tall.
- **States:** every state of [Interaction states](#interaction-states).
- **Wrapper:** `web/ui/kit/Button.tsx`: `Button`, `IconButton`, `ActionButton` (U14).

### Status

- **Classes:** `.pill` (`.s-run`, `.s-ok`, `.s-fail`, `.s-int`, `.s-skip`, `.s-stop`, `.s-warn`, `.s-wait`), `.dot`
  (`.d-ok`, `.d-run`, `.d-fail`, `.d-warn`), `.pulse`, `.result` (`.s-ok`, `.s-fail`, `.s-int`, `.s-skip`).
- **Use** a pill (a dot and a word) for the status of a loop, a run or a repo; a lone `.dot` only next to a word that
  already names the state (the connection). The words are in [Content](#content).
- **`.result`** is the text of a last run in the colour of its status (a loop row: "last run failed 14:00" in `.s-fail`,
  "last run succeeded 12:05" in `.s-ok`); the words stay in the text, the colour only agrees with them. Failed and
  timed out are `.s-fail`, cancelled and skipped `.s-skip`, interrupted `.s-int`. It is drawn on the page and cell
  backgrounds, like the `.s-wait` pill.
- **Do not** show a glyph or a colour alone as a status.
- **Phone and desktop:** the same.
- **States:** the running pulse, off under `prefers-reduced-motion: reduce`.
- **Wrapper:** `web/ui/kit/Pill.tsx` (U14).

### Inset list

- **Classes:** `.group`, `.group-cap`, `.group-note`, `.cell` (`.is-link`, `.is-sel`), `.cell-main`, `.cell-title`
  (`.is-plain`), `.cell-row`, `.cell-meta` (`.is-one-line`, `.is-data`), `.cell-sum`, `.cell-value` (`.is-data`), `.chev`.
- **Use it** for every list (runs, repos, active periods, folders, settings rows) on every screen size, and for the
  Loops list on the phone. A `.cell.is-link` opens a page and shows a `.chev`. A `.group-cap` that heads the runs of one
  active period starts with a `.link` to that period's page (the current period on the loop page), at the caption's size. On
  the phone that link is `--size-touch` tall (task U24).
- **Data text.** A path, an address or a version in a cell is `.cell-meta.is-data` or `.cell-value.is-data`
  (`--font-data`). `.cell-row` wraps its parts onto the next line when they do not fit. A `.cell-meta` made of
  spans (a loop row: repo, short schedule, next run) wraps between its spans, never inside one; `.is-one-line` cuts
  a single long value (a path) with an ellipsis.
- **A cell's menu.** A `⋯` at the trailing edge of a cell (a repo: Delete) opens a popover `.menu` on the desktop and a
  sheet on the phone. A `.group` that holds an open menu of one of its cells stops clipping, so the menu of the last
  cell is not cut by the card (as with the combobox, see Fields).
- **Do not** use a table for these lists.
- **Phone:** cells at least `--size-row` tall, hairlines inset by `--space-4`. **Desktop:** at least `--size-row-sm`.
- **States:** hover, pressed, selected (`.is-sel`, with the rail), focus.
- **Wrapper:** `web/ui/kit/Group.tsx`: `Group`, `Cell` (U14, cell variants at U15).

### Run cell

- **Classes:** `.run-top`, `.run-id`, `.run-meta`, inside a `.cell`.
- **Use it** for one run in Recent runs, All runs and an active period: the run number, its pill, times, and the
  summary cut at two lines (`.cell-sum`). A run without a summary shows a dash, except a failed run: "No summary: the
  session ended with an error."; a running run shows "Still working.".
- **Do not** hide the summary behind a hover.
- **Phone and desktop:** the same, the summary two lines.
- **States:** those of the cell.
- **Wrapper:** the cell variants of `web/ui/kit/Group.tsx`, used by `RunCell.tsx` of the loop page (U16).

### Loops table

- **Classes:** `.toolbar`, `.ltable`, `.ltable-head`, `.ltable-row`, `.ltable-name`, `.ltable-cell`, `.ltable-act`.
- **Use it** for the Loops page only, from 1024px: name and repo, status, the running or latest run, the next run, and
  Start or Stop with a `⋯` menu. `.toolbar` holds the search, the filter and Create loop above it.
- **Do not** use it for any other list.
- **Cells.** Times in `.ltable-cell.data`, the last run in `.ltable-cell.result` (`.s-fail`, `.s-ok`). The second line of
  `.ltable-name` is the repo and the agent ("acme-api · Claude opus").
- **Phone:** not used (cells of the inset list instead). `.toolbar` is a two-column grid: the search field and one
  trailing `.iconbtn.bordered` (the repo filter) share the first row; the `.seg` takes the second row at full width, its
  columns at least as wide as their labels. **Desktop:** from 1024px, columns sized by the `--size-col-*` tokens.
- **States:** hover, focus.
- **Wrapper:** `LoopsTable.tsx` of the Loops page (U15), built from kit buttons and pills.

### Card and figures

- **Classes:** `.card` (`.is-pad`), `.summary`, `.summary-item`, `.stats`, `.stat`, `.stat-label`, `.stat-value`,
  `.stat-sub`, `.now`, `.now-text`, `.now-actions`.
- **Use** `.summary` for the four figures above the Loops list, `.stats` for the figures of a loop or an active period,
  `.now` for the card that says what the loop is doing now. Figures use `--font-data` and `--fs-num`. In `.now-text` the
  title is the `<b>` (a line of its own) and the sentence follows under it; a state with a recovery adds a `.hint.is-err`
  line and puts its actions in `.now-actions` (desktop: buttons beside the text; phone: link cells under the output). The
  last run failed because the repo folder is gone: the hint "The repo folder no longer exists: <path>" and Open Repos next
  to Open run.
- **Do not** put a list inside a card (use a group).
- **Phone:** figures two by two. **Desktop:** four in a row, or two by two in `.cols-side`.
- **States:** none.
- **Wrapper:** `SummaryStrip.tsx` (U15), `NowCard.tsx` and `Figures.tsx` (U16).

### Section head

- **Classes:** `.section-head`, `.help`, `.link`.
- **Use it** above a section: its title, a `?` toggletip (`.help`) that explains it, and a `.link` to more (All runs).
- **Do not** put an explanation in a tooltip.
- **Phone:** `.help` is 44px. **Desktop:** `.help` is 26px with a 44px hit area on coarse pointers.
- **States:** hover, pressed, focus.
- **Wrapper:** `Toggletip` of `web/ui/kit/Overlay.tsx` for `.help` (U14).

### Log

- **Classes:** `.log`, `.log-bar`, `.log-scroll`, `.log-line`, `.log-time`, `.log-head`, `.log-ok`, `.log-err`,
  `.cursor`.
- **Use it** for the live log and the log of a run. It is dark in both themes (`--log-bg`).
- **Do not** use it for prose or for the transcript.
- **Phone:** the time above its line, lines wrap. **Desktop:** the time before its line.
- **States:** paused (following stops when the reader scrolls up).
- **Wrapper:** `web/ui/kit/Log.tsx` (U17).

### Transcript

- **Classes:** `.tx`, `.tx-bar`, `.tx-entry` (`.k-tool`, `.k-assistant`, `.k-think`, `.is-err`), `.tx-head`,
  `.tx-kind`, `.tx-body` (`.is-think`, `.is-code`), `.tx-fold`, `.tx-scroll`, `.tx-end`.
- **Use it** for the transcript of a Claude session on the run page: one entry per block, long blocks folded. The
  entries sit in a `.tx-scroll` frame under the `.tx-bar`: from 640px it is `--size-tx` tall and scrolls; on the phone
  it grows with its entries (the page scrolls). A fold keeps its own small `--font-data` line in `--log-accent`: the
  `.app button` reset has zero specificity, so every component button keeps its own font and colour.
- **Do not** use it for the plain log.
- **Phone:** one entry per block, the head above the body. **Desktop:** head and body side by side from 1024px
  (`--size-tx-head`).
- **States:** folded and open.
- **Wrapper:** `web/ui/kit/Transcript.tsx` (U17).

### Fields

- **Classes:** `.field`, `.label`, `.input` (`.is-data`), `.textarea`, `.select`, `.hint` (`.is-err`, `.is-warn`), `.count`,
  `.search`, `.seg` (`button.is-on`), `.stepper`, `.chip` (`.is-on`), `.chips`, `.switch`, `.switch-track`, `.combo`, `.fcell` (`.is-row`),
  `.form-foot`, `.sched-desc`, `.next-runs`.
- **Use** `.field` with a visible `.label` for every form control outside a card; `.hint` under it for help and errors;
  `.seg` for two to five exclusive choices that fit; `.chip` for filters; `.switch` for an on or off setting; `.stepper` for small numbers; `.fcell` for a
  field as a row of a `.group` (the editor uses these groups on every screen size); `.form-foot` for the editor's Save
  and Cancel.
- **Stepper:** `.stepper` holds Fewer, the value and More. The value is an `output`, or an `input type="number"`
  (`.stepper input`: `--size-stepper-value` wide, no border, centred, `--font-data`, no browser spin buttons). In a
  `.field` the stepper keeps its own width; in a `.cell` it sits at the trailing edge.
- **Row:** `.fcell.is-row` puts the label at the start and the value (a `select`, an `input`, or a `button.select`,
  right-aligned) and a `.chev` at the end; a `.hint` wraps under the row. The editor uses it for Repeat, At, Time zone,
  At minute, Day of the month, the time limit and, on the phone, Effort (the value opens the list of five).
- **Combobox:** `.combo` wraps a select-like button (`button.select`: the text at the start, cut with an ellipsis) and its
  `.menu`, which is as wide as the field. A `.group` that holds an open combobox menu stops clipping, so the menu is
  not cut by the card. A `.menu-item` may hold a `.cell-main` (a name over a path); its meta line is cut, never overlaps.
- **Chips:** `.chips` is a wrapping row of `.chip` with a `--space-2` gap (the seven weekdays).
- **Time:** a time of day is a text field showing 24-hour `HH:MM` (`inputmode="numeric"` and a `pattern`), because the
  browser's `type="time"` shows "02:30 AM" in an English browser.
- **Prompt:** `.textarea` is in `--font-data`.
- **Switch.** A `button.switch` with `role="switch"` and `aria-checked`, holding a `.switch-track` and its label
  (`<button class="switch" role="switch" aria-checked="false"><span class="switch-track"></span>Show hidden folders</button>`).
  The thumb moves to the end and the track turns `--accent` when it is on. Its label says what the setting does, not the
  state. It is at least `--size-control` tall.
- **Data text.** A path or an address in a field is `.input.is-data` (`--font-data`, still `--fs-field`).
- **Do not** use a placeholder as the label, or make a field smaller than `--fs-field`.
- **Phone:** controls 44px tall, 16px text, `.fcell` rows in a `.group`. **Desktop:** 36px tall, 16px text, the same
  groups in `.page.is-narrow`. On the phone every part a finger taps is itself at least `--size-touch` (task U24): a
  `.seg` button and a `.stepper` button are 44px tall inside their frame (the frame grows around them), a `.chip` is at
  least as wide as it is tall, and the value of a `.fcell.is-row` is 44px tall (the row keeps `--size-row`: its padding
  shrinks to `--space-1h`). A field labelled by its cell or a `.search` that is a `label` counts its label as its target.
- **States:** rest, hover, focus, error, disabled.
- **Wrapper:** `web/ui/kit/Field.tsx`: `Segmented`, `Search` (U14); `Input`, `Textarea`, `Select`, `Stepper`, `Chip`,
  `Switch`, `FieldCell` (U18; `Switch` with the folder picker, U19).

### Overlays

- **Classes:** `.scrim`, `.sheet`, `.sheet-grab`, `.dialog` (`.is-wide`), `.dialog-head`, `.dialog-body`,
  `.dialog-foot`, `.menu`, `.menu-item` (`.is-danger`, `.is-on`), `.popover`, `.tooltip` (`.is-below`, `.is-end`),
  `.fullsheet`.
- **Use** one component per job: a menu for a list of actions, a confirmation for a destructive action, a toggletip for
  an explanation, a tooltip only to label an icon-only button on a pointer device (on hover and keyboard focus, closed
  by Escape, linked by `aria-describedby`, never on touch).
- **Do not** ask for confirmation of a safe action. Stop asks only while a run is working.
- **Phone:** menus, confirmations and toggletips open as sheets from the bottom; `.fullsheet` for the folder picker.
  **Desktop:** popover menus, popovers and centred dialogs.
- **States:** open; Escape closes; focus is trapped inside and given back to the opener.
- **Wrapper:** `web/ui/kit/Overlay.tsx`: `Sheet`, `Dialog`, `Menu`, `Popover`, `Tooltip`, `Toggletip` (U14); `FullSheet` (U19).

### Toast

- **Classes:** `.toast-stack`, `.toast` (`.is-err`).
- **Use it** for the result of an action (saved, copied, failed to start). Tests may select it by class.
- **Do not** use it for a state that lasts (use a banner).
- **Phone:** above the tab bar, centred. **Desktop:** bottom right.
- **States:** none; an error toast is `.is-err`.
- **Wrapper:** the shared `web/ui/toast.tsx`, which both UIs use.

### Misc

- **Classes:** `.icon`, `.tag` (`.git`, `.repo`), `.crumbs`, `.empty` (`.is-err`), `.skeleton` (`.is-line`,
  `.is-block`), `.note`, `.cmd` (`.is-wrap`), `.code` (`.is-clamped`), `.pager`, `.pager-nav`, `.def`, `.steps`, `.step`, `.data`.
- **Use** `.icon` for every icon, `.tag` to mark a git folder or a registered repo, `.crumbs` for a path, `.empty` for
  an empty or failed list, `.skeleton` while loading, `.note` for a short aside, `.cmd` for a command with a copy
  button, `.code` for code and prompts, `.def` for definitions, `.steps` and `.step` for numbered how-to steps, `.data` for a time, a run number, a duration or a path inside a sentence
  (`--font-data`, tabular figures, never broken across lines): "last run failed" and a `.data` "14:00".
  `.cmd.is-wrap` wraps a long command (`overflow-wrap: anywhere`) with its copy button under it, so nothing scrolls
  sideways on the phone. `.code.is-clamped` cuts a prompt after five lines with a fade into its own background; the full
  text is one link away (`loopSettings.fullPrompt`). `.pager` pages a list: the range (`--font-data`) and two bordered
  `.iconbtn` (`.pager-nav`), the previous one disabled on page 1. `.def` is a term and its explanation (help sheet and
  popover). `.def.is-compact` is its settings-list variant for the loop page's side card: no divider and no gap, a small
  bold label (`--fs-cap`) with the value right under it in body size and text colour; a repo name is a `<strong>` (bold
  `--font-data`) with its path as a `.data` under it, a schedule is one line "schedule · time zone", and the Prompt
  label is a compact row that holds the `.code.is-clamped`. Rows follow each other with the card's own gap.
- **Do not** use `.skeleton` for longer than a load, or `.note` for an error.
- **Phone and desktop:** the same.
- **States:** none.
- **Wrapper:** `web/ui/kit/Icon.tsx` for `.icon` (U14); the others are plain markup in the feature that needs them.

### Folder picker

- **Classes:** `.picker`, `.picker-bar`, `.picker-tools`, `.picker-places`, `.picker-list`, `.picker-status`, `.picker-foot`,
  `.picker-target`.
- **Use it** only to add a repo. Top to bottom (the same order on both sizes): `.picker-bar` (the path `.field` with its
  error under it, `.iconbtn.bordered` Up, `.btn` Go), `.picker-places` (quick access), `.picker-tools` (the breadcrumb
  `.crumbs`, the filter `.search`, the show-hidden `.switch`), `.picker-list`, `.picker-status`, and `.picker-foot` (the
  `.picker-target` line, the name `.field`, and on the phone the Add repo button).
- **Quick access labels.** "Home", "Desktop", "Documents", "Downloads", then the drives or volumes, then the folders
  that hold registered repos. A label that appears twice is told apart by its parent folder in `--font-data`
  ("Documents - OneDrive", the parent in `.data`).
- **Do not** use it to pick a file.
- **Phone:** a `.fullsheet`; quick access as chips in a row that scrolls sideways; only `.picker-list` shrinks and
  scrolls; `.picker-foot` is a bar fixed at the bottom of the sheet (`--surface`, a hairline above it, `--safe-bottom`).
  **Desktop:** a wide dialog; quick access is a column beside the list, both at most `--size-log` tall and scrolling on
  their own, so the dialog fits a 900px viewport with an error showing; `.picker-foot` has its own gap above the dialog
  footer (Cancel, Add repo).
- **States:** the selected folder (`aria-selected="true"`), git and repo tags.
- **Wrapper:** `AddRepo.tsx` of the Repos page (U19), built from the overlay, the inset list and the fields.

## Layout

- **Frame.** Phone: no top bar; a navigation bar on pushed pages; the tab roots (`/`, `/repos`, `/settings`) show a
  large title; the tab bar is fixed at the bottom. Tablet and desktop: the top bar; no tab bar; a back link above the
  page title on pushed pages.
- **Widths.** `.page` is at most `--size-page` wide, centred, with `--space-8` side padding (desktop) or `--space-4`
  (phone). `.page.is-narrow` (`--size-page-narrow`) is used by the editor, the settings page, the repos page and the
  loop settings page.
- **Two columns** (`.cols`) from 1024px: the loop page (activity left, figures and settings right) and the run page
  (summary, transcript and log left; facts, session and resume command right).
- **Actions.** The main action of a page (Start, Stop loop, Restore, Create loop, Save changes, Add repo) sits in
  `.actionbar` on the phone and in `.page-head` (or `.form-foot` for the editor) from 640px. It is rendered once:
  `useLayout()` picks the place, so no test id appears twice.
- **Bottom padding.** A page with a fixed bar at the bottom keeps padding so its last item is never hidden: the
  `.actionbar` pages and, on the phone, every page under the `.tabbar`.
- **Breakpoints.** Phone below 640px, wide from 1024px. They are the only literal lengths, and only in media queries.

## Content

- Sentence case for every label, title and button. No glyph carries meaning alone; a glyph may decorate a word.
- Numbers, times, durations, ids, costs and paths use `--font-data`: `.data` inside a sentence, `.is-data` on a
  cell value, a cell line or a field.
- **Short schedule.** A loop row on the phone says the schedule in one short line ("every 10 min", "every 2 hours at :05",
  "Mon, Wed, Fri at 08:30"; `describeShort` of `shared/domain/schedule.ts`); the full sentence stays on the desktop
  table and the loop page. A row line is: repo, short schedule, next run.
- **Naming.** The UI says **active period** for the span from Start to Stop. API routes, database names and DTO fields
  keep `execution`, and so does the page URL `/executions/:id`.
- **Statuses.** A status is a pill with a dot and a word:

| Thing | State | Pill | Word |
|---|---|---|---|
| Loop | a run is working | `.s-run` | Running |
| Loop | active, between runs | `.s-wait` | Waiting |
| Loop | stopped by the user | `.s-stop` | Stopped |
| Loop | stopped by a server shutdown | `.s-int` | Stopped by server |
| Loop | archived | `.s-stop` | Archived |
| Loop | Stop pressed, run cancelling | `.s-run` | Stopping |
| Run | running / succeeded / failed / timed out | `.s-run` / `.s-ok` / `.s-fail` / `.s-fail` | Running / Succeeded / Failed / Timed out |
| Run | cancelled / interrupted / skipped | `.s-skip` / `.s-int` / `.s-skip` | Cancelled / Interrupted / Skipped |
| Repo | folder is gone | `.s-warn` | Folder is gone |
| Active period | still active / stopped by you / ended by the server | `.s-run` / `.s-stop` / `.s-int` | Still active / Stopped by you / Ended by server |

The state of an active period is the pill in the head of its page (`period.pill.*`); the lowercase phrase of a cell
(`period.stillActive`, `period.byYou`, `period.byServer`) is for the meta line of a list.

- **Plural keys.** A text that counts something has `.one` and `.other` forms (and `.zero` where the design shows a
  word for zero), read with `tn(base, n)` of `web/prefs`. Never write "1 loops".
- **Existing keys.** Never change the text of an existing key before the cut-over: the classic UI and its reference
  shots use them. The new UI adds new keys (in `shared/i18n/en.ts` and `vi.ts`), and reuses an existing key only when
  its text is exactly what the new design shows. The new keys and their English text are in Appendix B of the spec.
- **Languages.** All text goes through the locale files; no text is written in a component. The Vietnamese option of
  the language setting reads its own name from the locale file (`settings.lang.self`) and carries `lang="vi"` and
  `data-raw`.

## Accessibility

- Contrast as in [Colour and contrast](#colour-and-contrast), in both themes.
- Every interactive element is a real `button`, `a` or form control with a visible label or an `aria-label`.
- Icon-only buttons get an `aria-label` everywhere and the tooltip on pointer devices.
- Sheets and dialogs trap focus, close on Escape and give focus back to the opener.
- The tab bar is a `nav` with `aria-current="page"` on the active tab.
- Every page has exactly one `h1`; the phone navigation bar title is not a heading (except on the editor, where it is
  the page's `h1` and the page shows no other).
- Status pills are text, not colour alone.
- Animations stop under `prefers-reduced-motion: reduce` (the duration tokens become 0).

## iOS

- `web/index.html` has one `<meta name="theme-color">`, whose content the app sets from the computed `--bg` whenever the
  theme changes, and links to `/manifest.webmanifest` and `/apple-touch-icon.png`. Its viewport meta has
  `viewport-fit=cover`.
- The tab bar, the action bar and sheets add `--safe-bottom`; the navigation bar adds `--safe-top`; heights use `dvh`.
- `.app` sets `-webkit-tap-highlight-color: transparent`; the pressed state replaces the tap highlight.
- No control depends on hover, and every target on the phone is at least `--size-touch`.
- The web app manifest is standalone, with the brand mark on the paper background as its icons; on the phone, Settings
  explains Add to Home Screen.
- Copy to clipboard also works over plain HTTP (a phone on the local network): the copy helper falls back to a hidden
  textarea when `navigator.clipboard` does not exist.

## Test ids

- Tests find elements by `data-testid`, never by a class of this system (toasts are the one exception).
- **One id per element, rendered once per page.** An action that moves between the action bar and the page head is
  rendered in one place only (`useLayout()`), so its id never appears twice.
- The ids and their meaning are the contract of spec section 7.1; the new UI keeps every classic id it names and adds
  the new ones listed there. Do not invent an id that the contract lacks without adding it to the spec.
- **`data-status`** on `loop-row`, `row-status`, `loop-status` and `loop-header` uses the loop kinds of both UIs:
  `running` (a run is working), `active` (waiting for the next run), `stopped`, `archived`, `server_down`, and
  `cancelled` while stopping, whatever word the pill shows.
- Run rows and run pills carry the run status: `running`, `succeeded`, `failed`, `timed_out`, `cancelled`,
  `interrupted`, `skipped`.

## How to change the system

The system has no component, state, token or rule for what your change needs? Do not invent one inline, and do not let
the gap slip.

1. Open an issue labelled `design-system` (template "Design system gap") naming the gap and the feature that needs it.
2. Draw the new component or state in `design/ds/index.html` and the preview.
3. Get the owner's approval in [`design/APPROVED.md`](../APPROVED.md).
4. Only then build it in the app.

Until the gap is closed, the feature that needs it is blocked on that issue. A new colour is never added; a new
non-colour value becomes a token in `tokens.css`, `required-tokens.json` and this file, in the same pull request.

## The checklist for every UI pull request

- [ ] The pull request body names the components it used, or the `design-system` issue it opened.
- [ ] `npm run ratchets` is green.
- [ ] Every changed state has a preview state and a visual test.
- [ ] Both themes (light and dark) and both widths (phone 390px and desktop 1440px) were checked.
