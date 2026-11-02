# Castraferrum - HTTP API

All routes live under `/api`. Request and response shapes are zod schemas in `shared/contracts/` (one schema
validates the request, encodes the response and types the browser client). Timestamps are ISO strings.
Errors share one envelope with a stable code and a status taken from one table in `server/http/`
(`STATUS_OF`); the codes a route can return are listed in the last column.

The table below is the API surface. `tests/api/api-surface.test.ts` parses it: every row must have a registered
route in the real composition (`composeServer`), and every error code in the table (plus every code in
`shared/contracts`) must be asserted by at least one API test. Adding a route or a code without implementing and
testing it turns that test red. Keep one route per row in the format
`| METHOD | path | description | codes |`; a row such as `/start` `/stop` lists extra paths that share the
prefix of the first path.

| Method | Path | Description | Error codes |
|---|---|---|---|
| GET | `/loops?status=&q=&archived=` | list with current-execution figures, running run and next run | - |
| GET | `/stats?tz=` | overview bar (UC-03): running loops, running runs, runs today (from midnight in time zone `tz`), errors in 24 hours, plus the loop count of each list tab | `VALIDATION_FAILED` |
| POST | `/loops` | create (UC-01) | `VALIDATION_FAILED`, `LOOP_NAME_TAKEN` |
| GET | `/loops/:id` | detail with figures (plus `longestExecution`, `runCount`) | `LOOP_NOT_FOUND` |
| PUT | `/loops/:id` | edit, carrying `version` (UC-09) | `VERSION_CONFLICT`, `VALIDATION_FAILED` |
| POST | `/loops/:id/start`, `/stop`, `/duplicate`, `/archive`, `/restore` | UC-04, 05, 10, 11, 11. Start of a loop with a probe gives no run and `nextRunAt: null`: the probe decides | `LOOP_ALREADY_ACTIVE`, `LOOP_NOT_ACTIVE`, `LOOP_ARCHIVED`, `LOOP_IS_ACTIVE` |
| GET | `/loops/:id/executions?cursor=` | execution history, cursor paged | - |
| GET | `/executions/:id` | execution detail with its runs and `sessionIds` (UC-08) | `EXECUTION_NOT_FOUND` |
| GET | `/loops/:id/runs?cursor=` | run history, cursor paged | - |
| GET | `/runs/:id` | run detail | `RUN_NOT_FOUND` |
| GET | `/runs/:id/logs?after=` | stored log lines from sequence number `after` | - |
| GET | `/events?loopId=` | SSE: `loop.*`, `execution.started/ended`, `run.started/finished/skipped` (no log lines) | - |
| GET | `/runs/:id/logs/stream` | SSE: replay the stored log, then follow live | - |
| GET | `/schedule/preview?cron=&tz=&lang=` | schedule sentence plus the next five runs (the UI computes the same with the shared domain function) | `INVALID_CRON` |
| GET | `/executors` | executor list with configuration schemas | - |
| GET | `/health` | `{ ok, db }` | - |
| GET | `/repos` | repo list `{ items: [{ id, name, path, createdAt, exists, loopCount }] }`, ordered by name (`exists` = the directory still exists, `loopCount` = loops using it) | - |
| POST | `/repos` | register `{ path, name? }` (UC-19), answers 201 with the repo | `VALIDATION_FAILED`, `REPO_PATH_TAKEN`, `REPO_NAME_TAKEN` |
| DELETE | `/repos/:id` | delete (UC-20), answers 204 | `REPO_NOT_FOUND`, `REPO_IN_USE` |
| GET | `/folders?path=` | the **Browse...** dialog of the Repo page (UC-29): one directory and its subdirectories `{ path, name, parent, crumbs, git, repo, entries: [{ name, path, git, hidden, repo }], truncated, unreadable }`; an empty path means the home directory and `~` is accepted | `VALIDATION_FAILED` |
| GET | `/folders/places` | quick-access column of the Browse dialog: `{ platform, home, places, roots, nearRepos }` | - |
| GET | `/runs/:id/transcript?before=` | one transcript page of a run `{ entries, start, end, hasMore }`; without `before` it is the last page, scrolling up sends the `start` of the page on screen | `RUN_NOT_FOUND`, `TRANSCRIPT_NOT_FOUND`, `VALIDATION_FAILED` |
| GET | `/runs/:id/transcript/stream` | SSE `snapshot`, `entries`, `missing`, `ended` (`id` = byte offset after the last entry; reconnect with `Last-Event-ID`) | `RUN_NOT_FOUND` |
| GET | `/loops/:id/probe` | the probe of the loop `{ probe: { loopId, command, claim, release, resources, laneEnv, laneBasePort, restartPolicy, state, lastLine, lastProbeAt } }`; a loop with no probe gives `{ probe: null }` | `LOOP_NOT_FOUND` |
| PUT | `/loops/:id/probe` | save the probe `{ command, claim?, release?, resources?, laneEnv?, laneBasePort?, restartPolicy? }` (each command is an argv array, no shell); answers 200 with `{ probe }`. The loop must be stopped and not archived. `details.issues` can hold `claim:missingKey`, `release:missingKey`, `release:missingReason`, `resources:reserved`, `laneEnv:missingBasePort` | `LOOP_NOT_FOUND`, `LOOP_IS_ACTIVE`, `LOOP_ARCHIVED`, `VALIDATION_FAILED` |
| DELETE | `/loops/:id/probe` | delete the probe, answers 204 (a loop with no probe is not an error). The loop must be stopped and not archived | `LOOP_NOT_FOUND`, `LOOP_IS_ACTIVE`, `LOOP_ARCHIVED` |
| POST | `/gate/jobs` | UC-35. Queue a PR for the gate `{ repoId, prNumber, taskKey? }`; the task key defaults to the first issue that the PR closes. Answers 201 with `{ outcome: "queued", jobId, headSha, taskKey }`, or 200 with `outcome: "duplicate"` when the same head is already queued or running | `GATE_OFF`, `REPO_NOT_FOUND` |
| POST | `/gate/jobs/:id/ratify` | UC-36. A person accepts a guarded change: a job in `needs_ratification` takes the queue again and skips only `checkScope`, for its own head commit. Answers 200 with `{ jobId, state: "queued", headSha }`. A run cannot call it: the merge guard refuses the path. A PR from a fork (`isCrossRepository` true) is never in `needs_ratification`: it ends `failed` at `scope` with the reason `a pull request from a fork needs a person`, so this route refuses it (the owner's rule comes first over the gate) | `GATE_JOB_NOT_FOUND`, `GATE_JOB_NOT_RATIFIABLE` (the job is in another state, or another job of the same head is queued or running: ratify again after that job ends) |
| GET | `/goal-cards?repoId=` | the goal cards, newest first: `{ items: [{ id, repoId, githubRepo, issueNumber, title, door, card, state, startAfter, changed, epicNumber, prNumber, loopId, createdAt, decidedAt }], acceptedWithNoChange }`. With no `repoId` it lists every repository. `state` is `proposed`, `accepted`, `refused` or `started`. `door` is the stored `one-way` or `two-way`, which can be higher than the door of `card`. `acceptedWithNoChange` is the count of listed cards that are accepted or started with `changed` false. A person copies it to `goals/charter.json` in a ratified PR | `REPO_NOT_FOUND` (`repoId` is not an id) |
| POST | `/goal-cards/:id/accept` | the one-word yes for a `proposed` card. The server reads the issue again: an edited card is stored and sets `changed`, and a body that is no longer a card makes the state `refused`. Answers 200 with the card. The next tick starts an accepted card | `GOAL_CARD_NOT_FOUND`, `GOAL_CARD_NOT_OPEN` (the card is not `proposed`), `GIT_HOST_FAILED` |
| POST | `/goal-cards/:id/refuse` | the no for a `proposed` card. It closes the issue, and answers 200 with the card. If the close fails, the answer is 502, the card stays `refused`, and the next tick closes the issue | `GOAL_CARD_NOT_FOUND`, `GOAL_CARD_NOT_OPEN`, `GIT_HOST_FAILED` |
| GET | `/notices` | unread notices, newest first, at most 100: `{ items: [{ id, dedupeKey, kind, loopId, messageKey, params, at }] }`; `kind` is `wait`, `hold`, `blocked`, `gate`, `goal_card` or `probe_failed`; `messageKey` is an i18n key such as `notice.hold` that takes `params.reason` | - |
| POST | `/notices/:id/read` | marks one notice read, answers 204; a later notice with the same `dedupeKey` is a new unread notice | `NOTICE_NOT_FOUND` |
| GET | `/process/events?from=&to=` | the run events of a period for the process review: `{ events: [{ id, at, loop, status, text }] }`, oldest first. `from` and `to` are ISO dates; a run is in the range when `from <= started_at < to`; every status counts. `id` is the run id, `loop` the loop id. `text` joins the non-empty `error`, `summary` and `skip_reason` with a newline, each cut at 2000 characters, or is `''`. The body holds no loop name, prompt or path | `VALIDATION_FAILED` (a date is missing or not ISO, `from` is not before `to`, or the range is over 31 days) |
| GET | `/process/signals?from=&to=&repo=` | the refused gate jobs and the `loop-release:` comments of a period for the process review: `{ gate: Item[], comments: Item[] }` with `Item = { id, at, kind, text }`, oldest first. `from` and `to` are ISO dates and `repo` is `owner/name`; the range rules are those of `/process/events`. A gate item is a job in state `failed` or `needs_ratification` with `from <= finished_at < to`: `id` is `gate:<job id>`, `kind` is `gate`, and `text` is `<failed step>: <first failing line of the output tail of that step>`. A comment item is a comment of `repo` that starts with `loop-release:`, whose author association is `OWNER`, `MEMBER` or `COLLABORATOR`, and that was made in the range (a comment of a stranger is data and is dropped): `id` is `comment:<issue>:<comment id>`, `kind` is `comment`, and `text` is the lines before the first blank line, plus the `loop-found:` line if there is one. Each `text` is cut at 2000 characters. An item holds no loop name, prompt, path, PR number, commit or repository id. A failed or cut-off `gh` call gives 502, never empty lists | `VALIDATION_FAILED` (a date or `repo` is missing or bad, `from` is not before `to`, or the range is over 31 days), `GIT_HOST_FAILED` |
| GET | `/process/scoreboard?tz=` | the repeats of each known cause before and after the date its check merged: `{ figures, weeks, causes }`. The server reads `reports/process-review/*.json` of every registered repository (a file that is not JSON or not spec 2.12 is ignored) and groups the clusters by `fingerprint`. A `runIds` entry gives a date: a run id gives `started_at` of the run, `gate:<job id>` gives `finished_at` of the job, a `comment:` id and an unknown id give none. `repeats` is the number of dated ids. `checkMergedAt` is the date of the oldest commit that added the file `check.name` (`git log --diff-filter=A`), or `null` for a cause with no check, a name that starts with `-` or holds `..`, or a file with no commit. `before` counts dated ids before it, `after` the ids at or after it; with `null` both are 0. `figures.causes` counts causes with a dated id in the 30 days before now, `checks` the causes with a date, `before` and `after` the sums over those causes. `weeks` are the 5 weeks that end with the week of now, oldest first, each from Monday 00:00 in `tz` (default `Asia/Ho_Chi_Minh`). `causes` are sorted by `repeats`, largest first, then by `cause` | `VALIDATION_FAILED` (`tz` is not a time zone) |

The console keeps at most one unread notice for each `dedupeKey`. If the variable `LOOPS_NOTIFY_WEBHOOK` holds an
`http://` or `https://` URL, each new unread notice is also posted there once as JSON `{ kind, text, at }` (`text` is
the English text, the wait is at most 5 seconds, a failed post is dropped). When the variable is unset, nothing is posted.

## Test-mode routes

Present only when the server starts with `LOOPS_TEST_MODE=1` against a database whose name ends in `_test`.
They are not part of the product surface: `POST /api/__test/clock` (move the offset clock),
`POST /api/__test/reset` (truncate every table, restart the ticker), `POST /api/__test/dirs` and
`POST /api/__test/folders` (override the directory probe and the folder browser), `POST /api/__test/repo-gate`
(write the `repo_gate` row of a repository).

## SSE framing

- The stream opens with a `:ok` comment so the browser sees `open`, and sends a `:ping` comment every 15 seconds.
- Each event is `event: <type>` followed by `data: <one-line JSON>`.
- The log stream numbers each line (`id: <seq>`), ends with `event: end` and `{ runId, status }` when the run
  finishes, and resumes from `Last-Event-ID`. A server shutdown closes streams without `end`.
- The transcript stream uses the byte offset after the last entry as `id`.
