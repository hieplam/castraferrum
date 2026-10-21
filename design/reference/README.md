# Approved reference: the UI uplift brainstorm (2026-10-21)

These images are exports of the brainstorm canvas the owner approved on 2026-10-21 ("I approve all", round 2:
mobile-first, look C "Soft studio" with the paper light theme). They are the ratified input of epic #63. The design
system in `design/ds/` and its preview are built to match them, and the owner compares the two at U10.

The canvas itself is a private claude.ai artifact; these files are what the repository keeps of it.

| File | What it shows |
|---|---|
| `m-loops-light.png`, `m-loops-dark.png` | iPhone (390 by 844): the Loops tab |
| `m-loop-light.png`, `m-loop-dark.png` | iPhone: the loop page of a running loop, full scroll |
| `m-stop-light.png`, `m-stop-dark.png` | iPhone: the Stop confirmation sheet |
| `m-help-light.png`, `m-help-dark.png` | iPhone: the help sheet behind the `?` of Recent runs |
| `m-run-light.png`, `m-run-dark.png` | iPhone: the run page with its transcript, full scroll |
| `m-form-light.png` | iPhone: the new-loop editor, full scroll |
| `m-repos-light.png` | iPhone: the Repos tab |
| `m-folder-light.png` | iPhone: adding a repo, the folder picker sheet |
| `m-settings-light.png` | iPhone: the Settings tab |
| `d-loops-light.png` | Desktop (1440): the Loops page |
| `d-loop-light.png`, `d-loop-dark.png` | Desktop: the loop page, with the help popover open |
| `tokens-sheet.png` | Type scale, colours, statuses, buttons, list rows, tabs, menu, tooltip, fields and log, light and dark |
| `canvas.css` | The literal CSS behind the boards (look C only). Not used by the app or the preview. |

Notes:

- Where these images and `docs/specs/2026-10-21-ui-uplift.md` differ, the spec wins. The differences are:
  - four colours adjusted for contrast (spec D2);
  - the four-item summary (D25);
  - the run summary dash (D27);
  - the tabs row in `tokens-sheet.png` shows tab states only: the loop page uses two columns, not tabs.
- Screens and states with no board here (for example the desktop editor or the run page on the desktop) follow the
  spec's sections 4 and 5; the owner approves them with the preview at U10.
- The sample data is the classic preview's world (Sunday 18/10/2026 14:00:42); the console address on the Settings
  board is an example.
