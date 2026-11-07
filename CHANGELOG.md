# Changelog

## [0.7.0](https://github.com/hieplam/castraferrum/compare/v0.6.0...v0.7.0) (2026-11-07)


### Features

* **gate:** gate pages and repository switch (K12) ([#379](https://github.com/hieplam/castraferrum/issues/379)) ([4d5ee09](https://github.com/hieplam/castraferrum/commit/4d5ee098e70c54278cec2d8751179bad23f3cfee))
* **goal-cards:** an accepted card becomes epic, manifest PR and loop (W5) ([#390](https://github.com/hieplam/castraferrum/issues/390)) ([23c00ca](https://github.com/hieplam/castraferrum/commit/23c00ca1480cbff48b9604c489e78b171288e245))
* **tools:** a worktree sweep removes the worktrees of finished tasks ([#406](https://github.com/hieplam/castraferrum/issues/406)) ([b0766a0](https://github.com/hieplam/castraferrum/commit/b0766a082528ab1ecb4db82ab1c2f91b5063f59f))
* **web:** loop state, editor fields and holds of a loop with a probe (P15) ([#392](https://github.com/hieplam/castraferrum/issues/392)) ([b6ccdd9](https://github.com/hieplam/castraferrum/commit/b6ccdd94b274b418343adc625e02b2b66d1287c6))


### Bug Fixes

* **gate:** a fork pull request or a stranger's text never acts by itself ([#400](https://github.com/hieplam/castraferrum/issues/400)) ([139c17e](https://github.com/hieplam/castraferrum/commit/139c17e5e55f520d8283d57bd2a266af93ac3b64))
* **gate:** background git and gh calls never open a login window ([#404](https://github.com/hieplam/castraferrum/issues/404)) ([dd0787c](https://github.com/hieplam/castraferrum/commit/dd0787c2c1875f7cb1e6b9dbe8ea1e3a6ec59be7))
* **gate:** fetches of one repository folder run one after another ([#394](https://github.com/hieplam/castraferrum/issues/394)) ([2ab7fbe](https://github.com/hieplam/castraferrum/commit/2ab7fbec247a3b06198c7f075f080d01a47b8148))

## [0.6.0](https://github.com/hieplam/castraferrum/compare/v0.5.0...v0.6.0) (2026-11-02)


### Features

* **goal-cards:** charter, goal card and GoalCardService (W1) ([#384](https://github.com/hieplam/castraferrum/issues/384)) ([5c2fdf2](https://github.com/hieplam/castraferrum/commit/5c2fdf294510d24885c84612c28ae1f0d38b75ad))
* **goals:** goal-writer-probe asks for one writing run (W2) ([#386](https://github.com/hieplam/castraferrum/issues/386)) ([5b167c5](https://github.com/hieplam/castraferrum/commit/5b167c52ac74e9034fa0b3fa373d01cbd1fbc84b))


### Bug Fixes

* **gate:** a hand-over to a missing pull request releases the claim ([#380](https://github.com/hieplam/castraferrum/issues/380)) ([c0392bb](https://github.com/hieplam/castraferrum/commit/c0392bb82c56e1c69d4a5eeaeaf7ccfb2c8663ee))
* **goal-cards:** a proposed card whose issue a person closed becomes refused ([#389](https://github.com/hieplam/castraferrum/issues/389)) ([c2679bb](https://github.com/hieplam/castraferrum/commit/c2679bbe4417d7aa80b2cefdbf705138d2add429))
* **test:** test runs keep their temp folders out of reach of Storage Sense ([#388](https://github.com/hieplam/castraferrum/issues/388)) ([1f03ef3](https://github.com/hieplam/castraferrum/commit/1f03ef31d9596c2b559b2b0c5fd58d5c1da6f8ac))

## [0.5.0](https://github.com/hieplam/castraferrum/compare/v0.4.0...v0.5.0) (2026-11-01)


### Features

* **executor:** review tool profile for a process-review run (R4) ([#368](https://github.com/hieplam/castraferrum/issues/368)) ([1ccdb37](https://github.com/hieplam/castraferrum/commit/1ccdb3796b8aecf9fc32da85a73152ccfa0998e9))
* **gate:** failure feed, red main, ratify (K6) ([#340](https://github.com/hieplam/castraferrum/issues/340)) ([23ac1c1](https://github.com/hieplam/castraferrum/commit/23ac1c16b8f32d58783499e3bbd778857c2385ed))
* **gate:** hand a PR_OPEN claim to the gate at the end of a run (K7) ([#375](https://github.com/hieplam/castraferrum/issues/375)) ([af406dc](https://github.com/hieplam/castraferrum/commit/af406dc4a1e30bcf8d5fd0bceff465309cfbde25))
* **goals:** goal number after a merge, loop-goals comment and fall issue (T2) ([#367](https://github.com/hieplam/castraferrum/issues/367)) ([6ae503d](https://github.com/hieplam/castraferrum/commit/6ae503d0e5239220470971209f37eccbd17ec77d))
* **hold:** a usage limit holds a run, and the same session resumes (P8) ([#370](https://github.com/hieplam/castraferrum/issues/370)) ([c46f661](https://github.com/hieplam/castraferrum/commit/c46f661bb7c7985775171e50965da3ddda428f92))
* **probe:** wait, blocked, plan and done actions, goal_met period end (P10) ([#372](https://github.com/hieplam/castraferrum/issues/372)) ([45ec264](https://github.com/hieplam/castraferrum/commit/45ec26415f5ca9ffe4cadaa0856e757b1f9a5a0f))
* **process:** gate refusals and loop-release comments as review input (R8) ([#338](https://github.com/hieplam/castraferrum/issues/338)) ([00e849e](https://github.com/hieplam/castraferrum/commit/00e849e9c419253ea17335fbb51a531d1889456f))
* **process:** model run and recorded replay of the review (R6) ([#369](https://github.com/hieplam/castraferrum/issues/369)) ([03b9401](https://github.com/hieplam/castraferrum/commit/03b940124c1865bf99c331a670cb9cefd00feb06))
* **process:** scoreboard API and page (R9) ([#363](https://github.com/hieplam/castraferrum/issues/363)) ([539a274](https://github.com/hieplam/castraferrum/commit/539a274fd97777b7715b925fbd5d403c689608ac))
* **recovery:** a resume loop stays active over a restart (P11) ([#376](https://github.com/hieplam/castraferrum/issues/376)) ([2d68034](https://github.com/hieplam/castraferrum/commit/2d68034572315bac494d22313425032e46c3cf87))


### Bug Fixes

* **gate:** show a ratified merge in the final status and the audit ([#371](https://github.com/hieplam/castraferrum/issues/371)) ([2f013fe](https://github.com/hieplam/castraferrum/commit/2f013fe1e9f9e78e18a4b7eca7f809fd6b059046))
* **goals:** goal rows read agent-plugins from a gate-worktree checkout ([#374](https://github.com/hieplam/castraferrum/issues/374)) ([23709cd](https://github.com/hieplam/castraferrum/commit/23709cd524c968f8d82e5c2fe8f5c1532c198787))
* **test:** UC-23 gives the same result for each timing of the minute mark ([#378](https://github.com/hieplam/castraferrum/issues/378)) ([0c3c7cb](https://github.com/hieplam/castraferrum/commit/0c3c7cbceecb6b205ecafebac24f5d26b6276b02))

## [0.4.0](https://github.com/hieplam/castraferrum/compare/v0.3.0...v0.4.0) (2026-11-01)


### Features

* **design:** status rows and preview states of the goal-driven loop ([#286](https://github.com/hieplam/castraferrum/issues/286)) ([d219690](https://github.com/hieplam/castraferrum/commit/d21969052cdc04cdebedc9136ba00be05e13091b))
* **executor:** merge guard hook for a gated run (K8) ([#334](https://github.com/hieplam/castraferrum/issues/334)) ([dfdc1de](https://github.com/hieplam/castraferrum/commit/dfdc1de372e5e7188d6e308b6e6a2e609edf8701))
* **executor:** usage_limit event and resume of a session (P7) ([#322](https://github.com/hieplam/castraferrum/issues/322)) ([9d55780](https://github.com/hieplam/castraferrum/commit/9d55780684c2f24c357c1be1b614a9a4c021096d))
* gate data files and the scope guard (K1) ([#252](https://github.com/hieplam/castraferrum/issues/252)) ([bdcc279](https://github.com/hieplam/castraferrum/commit/bdcc2791091a18193aebfae5ed4f3017684c2b4e))
* **gate:** gate tables, repo_gate and claim owner (K2) ([#318](https://github.com/hieplam/castraferrum/issues/318)) ([b492d93](https://github.com/hieplam/castraferrum/commit/b492d9391d0a604814b7ce94a3387a6aa2f7f52e))
* **gate:** GateService, queue and steps (K5) ([#321](https://github.com/hieplam/castraferrum/issues/321)) ([85ed546](https://github.com/hieplam/castraferrum/commit/85ed546e94cee46a1175091d5def40b53422f14c))
* **gate:** GateWorkspace, worktree and stub restore (K4) ([#312](https://github.com/hieplam/castraferrum/issues/312)) ([40c1451](https://github.com/hieplam/castraferrum/commit/40c1451d3936599603580ff24fd690b90e9b16b4))
* **gate:** GitHost port and gh adapter (K3) ([#301](https://github.com/hieplam/castraferrum/issues/301)) ([8d54ca3](https://github.com/hieplam/castraferrum/commit/8d54ca3541d43c4310bf079602cf43c8078c9d6e))
* **goal-check:** --json, score, cadence and d7 for goal manifests ([#281](https://github.com/hieplam/castraferrum/issues/281)) ([41826db](https://github.com/hieplam/castraferrum/commit/41826db8bb6c8d5fe991c59ad8d47a9ba23fd280))
* **goals:** goal manifest of the goal-driven loop epic, red at 2 of 29 ([#261](https://github.com/hieplam/castraferrum/issues/261)) ([db10732](https://github.com/hieplam/castraferrum/commit/db10732986dfd44ab0e2a64d33b66d2ceb3a6d82))
* **goals:** goals/health.json with the audit row (T5) ([#335](https://github.com/hieplam/castraferrum/issues/335)) ([61f4eb5](https://github.com/hieplam/castraferrum/commit/61f4eb57546cc425b62bf5306bcaac581faee83f))
* **goals:** guard the files that verify and npm ci reach (issue 251) ([#277](https://github.com/hieplam/castraferrum/issues/277)) ([40470e0](https://github.com/hieplam/castraferrum/commit/40470e0c8ef4a57fdefd41d2df0a82b72f132154))
* **goals:** standing goals and the failure fingerprint (T4) ([#309](https://github.com/hieplam/castraferrum/issues/309)) ([f851d05](https://github.com/hieplam/castraferrum/commit/f851d05a6f232b64d79e12a7de4978c4ae39c0fb))
* **logon-task:** print Task Scheduler XML for a log-on start, never install ([#296](https://github.com/hieplam/castraferrum/issues/296)) ([4f7bb01](https://github.com/hieplam/castraferrum/commit/4f7bb01fc41ac9b68ce1f24c3ced3da39a3efb79))
* **merge-audit:** find a merge that went around the gate ([#302](https://github.com/hieplam/castraferrum/issues/302)) ([1b90ddf](https://github.com/hieplam/castraferrum/commit/1b90ddfbdd082b164ff10b3b5bc9427e513de355))
* **metrics:** baseline of each ratchet, read-only on runs (issue 225) ([#253](https://github.com/hieplam/castraferrum/issues/253)) ([25d527c](https://github.com/hieplam/castraferrum/commit/25d527c79e618bc89028a48b5925ba9372b05375))
* probe line and run-end parsers ([#250](https://github.com/hieplam/castraferrum/issues/250)) ([6417577](https://github.com/hieplam/castraferrum/commit/6417577c24dc29c4295944c0b2e8e1fc9707c19e))
* **probe:** claim, start and release on the tick (P5) ([#313](https://github.com/hieplam/castraferrum/issues/313)) ([044ea54](https://github.com/hieplam/castraferrum/commit/044ea54db0240a8cfc3988666f0596e0f911843d))
* **probe:** ProbeService tick, background ticker, ADR 0004 ([#300](https://github.com/hieplam/castraferrum/issues/300)) ([cdaea11](https://github.com/hieplam/castraferrum/commit/cdaea116ca2edc73e90b5e3efabf01e7a2834fc4))
* **probe:** slot, lane env and the lifecycle line of a claimed run (P6) ([#316](https://github.com/hieplam/castraferrum/issues/316)) ([076c6a3](https://github.com/hieplam/castraferrum/commit/076c6a34022227acc40574ca6a7ede7aab419629))
* **process-review:** file one issue per repeated cause, and say when a review is due ([#278](https://github.com/hieplam/castraferrum/issues/278)) ([f698f91](https://github.com/hieplam/castraferrum/commit/f698f9174e8aa9d5ed4d04283dd832e6d9bc9fae))
* **process-review:** first-pass rules, fingerprints and prompt (R5) ([#314](https://github.com/hieplam/castraferrum/issues/314)) ([c2652bd](https://github.com/hieplam/castraferrum/commit/c2652bd9a993f9cb8a3091cbe6ef92d77a831647))
* **rule-lint:** count rule lines and refuse a new one with no check ([#276](https://github.com/hieplam/castraferrum/issues/276)) ([5888100](https://github.com/hieplam/castraferrum/commit/588810027fb919f5849ff6b39cb53aa2cf0467c7))
* **server:** add CommandRunner port and NodeCommandRunner adapter ([#260](https://github.com/hieplam/castraferrum/issues/260)) ([b021e71](https://github.com/hieplam/castraferrum/commit/b021e714267e1a0e042609e4b2ef8af552b4c998))
* **server:** GET /api/process/events for the process review (R2) ([#298](https://github.com/hieplam/castraferrum/issues/298)) ([1a434ab](https://github.com/hieplam/castraferrum/commit/1a434abaac7b28ec3878ce8951706e309bbf4879))
* **server:** notifier, notices and webhook push (P9) ([#293](https://github.com/hieplam/castraferrum/issues/293)) ([d7a7647](https://github.com/hieplam/castraferrum/commit/d7a7647d68e95e71ba962aa2399a0b67ed63a5b8))
* **server:** probe settings table and routes ([#275](https://github.com/hieplam/castraferrum/issues/275)) ([e9c88e0](https://github.com/hieplam/castraferrum/commit/e9c88e0d19e59f33d2a4247983f20ac17fe31e7c))


### Bug Fixes

* a phone note or card that a captioned group carries sits 8 px under it, as the editor board draws (U27 defect, epic 63) ([#208](https://github.com/hieplam/castraferrum/issues/208)) ([fe70aff](https://github.com/hieplam/castraferrum/commit/fe70aff1de03462c12c1488729759ef57b3d0346))
* a phone section head sits 8 px above what it heads, as the run board draws (U27 defect, epic 63) ([#210](https://github.com/hieplam/castraferrum/issues/210)) ([efee09e](https://github.com/hieplam/castraferrum/commit/efee09e6e4a19d0599dad81a6ec886e66e28c113))
* database-down list, repos-loading top bar and tall phone shots (U27 defects, epic 63) ([#203](https://github.com/hieplam/castraferrum/issues/203)) ([606dcb3](https://github.com/hieplam/castraferrum/commit/606dcb310182dc8b90c86906b9e427d402628a80))
* every phone section caption sits 8 px above what it captions, as the boards draw (U27 defect, epic 63) ([#206](https://github.com/hieplam/castraferrum/issues/206)) ([98e5dd5](https://github.com/hieplam/castraferrum/commit/98e5dd53a2368deeb9d611ebf40cebef1a4faeb8))
* **gate:** a restart after the merge no longer marks a merged PR as failed ([#337](https://github.com/hieplam/castraferrum/issues/337)) ([7b2a137](https://github.com/hieplam/castraferrum/commit/7b2a1379ad86bd35a527c3590e5237b5e0ad1980))
* **gate:** run a gate line with double quotes as written on Windows ([#319](https://github.com/hieplam/castraferrum/issues/319)) ([1fb4b3a](https://github.com/hieplam/castraferrum/commit/1fb4b3a9e9da1efe290da53bc5e8614ccd6f3495))
* **goals:** create the standing-goal label before the first issue ([#315](https://github.com/hieplam/castraferrum/issues/315)) ([bbb5a4d](https://github.com/hieplam/castraferrum/commit/bbb5a4d1f581de7c277dc3cfc99d31af6ce01912))
* overlays keep the UI font, phone frame gutter and title row, Repo menu covers its row (U27 defects, epic 63) ([#201](https://github.com/hieplam/castraferrum/issues/201)) ([5a82ddc](https://github.com/hieplam/castraferrum/commit/5a82ddc9d7ba8496632bbb24270819d4aa53b10f))
* page layout defects of the U27 acceptance (log radius, Now dot, phone caption and meta line) ([#200](https://github.com/hieplam/castraferrum/issues/200)) ([01bf652](https://github.com/hieplam/castraferrum/commit/01bf65258fa530022dce4eb97f9115c3ed2a4874))
* raise the unit test limit to 30 s for tests that start a real process (issue 271) ([#273](https://github.com/hieplam/castraferrum/issues/273)) ([165ee8b](https://github.com/hieplam/castraferrum/commit/165ee8be8bdf0ec8dba2e722729857981739bbba))
* singular counts, counts and commands that never split, interrupted is not failed (U27 defects, epic 63) ([#204](https://github.com/hieplam/castraferrum/issues/204)) ([27e1398](https://github.com/hieplam/castraferrum/commit/27e13983ed436bdffbf5c07c510d6b86f5c73782))
* **tests:** give the arch-fixtures dependency checks a 60 s limit ([#258](https://github.com/hieplam/castraferrum/issues/258)) ([bc582e1](https://github.com/hieplam/castraferrum/commit/bc582e144fea6c0518f25ce81a16faf7982eef82))
* **tests:** give the database test projects a 30 s limit (issue 271) ([#317](https://github.com/hieplam/castraferrum/issues/317)) ([83ff7ea](https://github.com/hieplam/castraferrum/commit/83ff7ea7d21a3f7f103d6b6d3716beb4d5202dcd))
* the folder picker keeps a path typed before its opening folder loads ([#178](https://github.com/hieplam/castraferrum/issues/178)) ([6114d8f](https://github.com/hieplam/castraferrum/commit/6114d8fee6467d8aca988ae6d3f0c0b993861962))
* UC-05 and the list rows expect the time the row shows on any day ([#181](https://github.com/hieplam/castraferrum/issues/181)) ([9e96b54](https://github.com/hieplam/castraferrum/commit/9e96b54871c66cc52a6bec2d923e03062e921df3))

## [0.3.0](https://github.com/hieplam/castraferrum/compare/v0.2.0...v0.3.0) (2026-10-23)


### Features

* cut-over to the new UI only (U25, epic 63) ([#173](https://github.com/hieplam/castraferrum/issues/173)) ([63cf76c](https://github.com/hieplam/castraferrum/commit/63cf76ce758347fbb29efbb826ae30a54819291d))
* freeze the new reference shots (U11, epic [#63](https://github.com/hieplam/castraferrum/issues/63)) ([#137](https://github.com/hieplam/castraferrum/issues/137)) ([4e735ab](https://github.com/hieplam/castraferrum/commit/4e735abbd162c02a39919e5a5e6f995448f981a2))
* phone, iOS and installability, UC-34 (U24, epic 63) ([#171](https://github.com/hieplam/castraferrum/issues/171)) ([6e2b878](https://github.com/hieplam/castraferrum/commit/6e2b878a37cfd89534a5b2016cae98b96a1fc378))
* the desktop loop settings card matches the board (U10 fixes, epic [#63](https://github.com/hieplam/castraferrum/issues/63)) ([#135](https://github.com/hieplam/castraferrum/issues/135)) ([02bf715](https://github.com/hieplam/castraferrum/commit/02bf715e7a90646376d1a7ba534ec94ddf9fd8b4))
* the new editor (U18, epic 63) ([#162](https://github.com/hieplam/castraferrum/issues/162)) ([94bdb7a](https://github.com/hieplam/castraferrum/commit/94bdb7a7a80a0f7f7f5cc661a503215197b29082))
* the new frame, Settings and Not found (U14, epic [#63](https://github.com/hieplam/castraferrum/issues/63)) ([#152](https://github.com/hieplam/castraferrum/issues/152)) ([7d15bf2](https://github.com/hieplam/castraferrum/commit/7d15bf29a22c49136aba7fea06245dc262e4156c))
* the new loop page, All runs, loop settings and active period (U16, epic 63) ([#158](https://github.com/hieplam/castraferrum/issues/158)) ([21dcf63](https://github.com/hieplam/castraferrum/commit/21dcf6396606f93601801a2b0d3ffed141514f54))
* the new Loops page (U15, epic 63) ([#154](https://github.com/hieplam/castraferrum/issues/154)) ([5497823](https://github.com/hieplam/castraferrum/commit/5497823f92d9bd9cff3c0e15501d96f62ba8b547))
* the new Repos page and folder picker (U19, epic 63) ([#166](https://github.com/hieplam/castraferrum/issues/166)) ([f7f7ab8](https://github.com/hieplam/castraferrum/commit/f7f7ab8850eacb323ace663ae82e59ddcf838d84))
* the new run page and transcript (U17, epic 63) ([#160](https://github.com/hieplam/castraferrum/issues/160)) ([502d6ad](https://github.com/hieplam/castraferrum/commit/502d6ad47fd7a7b9ca09a35c87b013e5a717727d))


### Bug Fixes

* correct three sample differences of the new preview (castraferrum[#156](https://github.com/hieplam/castraferrum/issues/156), castraferrum[#159](https://github.com/hieplam/castraferrum/issues/159), castraferrum[#161](https://github.com/hieplam/castraferrum/issues/161)) ([#163](https://github.com/hieplam/castraferrum/issues/163)) ([18c301a](https://github.com/hieplam/castraferrum/commit/18c301a5c90c7b205862bd16c60e31e9ba4ae8a7))
* let the history scan pin one commit message by its full SHA ([#155](https://github.com/hieplam/castraferrum/issues/155)) ([1dae74b](https://github.com/hieplam/castraferrum/commit/1dae74bea195ac864bae92321185308b2ab7a35d))
* the wide dialog and full-height sheet demos fit their frame (U10 fixes, epic [#63](https://github.com/hieplam/castraferrum/issues/63)) ([#132](https://github.com/hieplam/castraferrum/issues/132)) ([72e3a0c](https://github.com/hieplam/castraferrum/commit/72e3a0c005722e8283a7ac10764bad16dc7aa8e8))

## [0.2.0](https://github.com/hieplam/castraferrum/compare/v0.1.0...v0.2.0) (2026-10-22)


### Features

* baseline numbers and the measuring tools for the UI uplift (U0, epic castraferrum[#63](https://github.com/hieplam/castraferrum/issues/63)) ([#98](https://github.com/hieplam/castraferrum/issues/98)) ([c09e46c](https://github.com/hieplam/castraferrum/commit/c09e46c5c67f213e96759e2fef013012d7a912f6))
* design-system components, fonts and the design-system page (U3, epic castraferrum[#63](https://github.com/hieplam/castraferrum/issues/63)) ([e003ccb](https://github.com/hieplam/castraferrum/commit/e003ccb5762af85a62a091fb3a4bd17f8f375252)), closes [#70](https://github.com/hieplam/castraferrum/issues/70)
* design-system tokens of the UI uplift (U2, epic [#63](https://github.com/hieplam/castraferrum/issues/63)) ([#102](https://github.com/hieplam/castraferrum/issues/102)) ([60c2c1d](https://github.com/hieplam/castraferrum/commit/60c2c1df971358e78dcecb16bd2dfc554f08a0a2))
* editor cards, field rows, combobox and a desktop design-system page (U10 fixes, epic [#63](https://github.com/hieplam/castraferrum/issues/63)) ([#128](https://github.com/hieplam/castraferrum/issues/128)) ([17cec3f](https://github.com/hieplam/castraferrum/commit/17cec3fb9be7e00e87a2944d25ebf219a17c2c2d))
* loop, active period and run page fixes (U10 fixes, epic [#63](https://github.com/hieplam/castraferrum/issues/63)) ([#129](https://github.com/hieplam/castraferrum/issues/129)) ([5083c08](https://github.com/hieplam/castraferrum/commit/5083c089b8402cd18a9ccedc26e6e12d91b59a9c))
* Loops, Repos and Settings match the approved boards (U10 fixes, epic [#63](https://github.com/hieplam/castraferrum/issues/63)) ([#130](https://github.com/hieplam/castraferrum/issues/130)) ([e0ade14](https://github.com/hieplam/castraferrum/commit/e0ade146249e330aadb18d1ce76b4bc52dc9f160))
* new preview editor (U8, epic castraferrum[#63](https://github.com/hieplam/castraferrum/issues/63)) ([#113](https://github.com/hieplam/castraferrum/issues/113)) ([8ef6141](https://github.com/hieplam/castraferrum/commit/8ef61416fe1a3e628662e61add4a61bd4036e753))
* new preview loop page, All runs, loop settings and active period (U6, epic castraferrum[#63](https://github.com/hieplam/castraferrum/issues/63)) ([5766b27](https://github.com/hieplam/castraferrum/commit/5766b27a075d213e259d943c49545fbe5df4364c))
* new preview repos, folder picker and settings (U9, epic castraferrum[#63](https://github.com/hieplam/castraferrum/issues/63)) ([#115](https://github.com/hieplam/castraferrum/issues/115)) ([7605d0b](https://github.com/hieplam/castraferrum/commit/7605d0bb80bcd985f3b8e8f08b956c1d6ecd1c3a))
* new preview run page and transcript (U7, epic castraferrum[#63](https://github.com/hieplam/castraferrum/issues/63)) ([e05b507](https://github.com/hieplam/castraferrum/commit/e05b50731273906e8e217066797852b2b526b065))
* new preview scaffolding, frame and Loops page (U5, epic castraferrum[#63](https://github.com/hieplam/castraferrum/issues/63)) ([#107](https://github.com/hieplam/castraferrum/issues/107)) ([f038251](https://github.com/hieplam/castraferrum/commit/f0382519a8c4fa748fc369924d441c4f3d07901c)), closes [#72](https://github.com/hieplam/castraferrum/issues/72)
* new-UI switch and test plumbing (U13, epic castraferrum[#63](https://github.com/hieplam/castraferrum/issues/63)) ([#117](https://github.com/hieplam/castraferrum/issues/117)) ([1e8f4f9](https://github.com/hieplam/castraferrum/commit/1e8f4f99aa97683a9b03661dc265e8bdd10cbd54)), closes [#81](https://github.com/hieplam/castraferrum/issues/81)


### Bug Fixes

* give the four empty dark tokens of the classic UI their values (U1, epic [#63](https://github.com/hieplam/castraferrum/issues/63)) ([#99](https://github.com/hieplam/castraferrum/issues/99)) ([ca3a176](https://github.com/hieplam/castraferrum/commit/ca3a1769edf4fc5ec15cef534ddcc0eabaf50b28)), closes [#67](https://github.com/hieplam/castraferrum/issues/67)
* the language scanner no longer flags this repository's own references ([#126](https://github.com/hieplam/castraferrum/issues/126)) ([e50bab2](https://github.com/hieplam/castraferrum/commit/e50bab2bf26fbe107e183b494423d9628bf68037))
