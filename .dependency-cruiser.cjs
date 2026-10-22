// Layer rules of the console: they encode the two tables "Server-side layers" and "UI-side layers" of the
// architecture document. When a table changes, change this file in the same PR, and keep at least one deliberately
// violating file per rule in tests/arch-fixtures/ (a line `// violates: <rule name>`); `npm run arch` counts both sides.
//
// Most rules are written as an ALLOW list (`pathNot`): anything not on the list is a violation, including npm
// libraries and Node core modules (node:fs ...); a pure layer must not touch infrastructure by itself.

// Tests next to a file (*.test.ts) build fakes / adapters, so layer rules do not apply to them.
const TEST_FILE = '\\.test\\.tsx?$';
const DB_LIBS = 'node_modules/(@types/)?(drizzle-orm|pg)/';
const SERVER_LIBS = 'node_modules/(@types/)?(fastify|@fastify/[^/]+|fastify-type-provider-zod|drizzle-orm|pg)/';
// Allowed npm packages; also matches the relative path used when running on tests/arch-fixtures/ (../../node_modules/...).
const npm = (names) => `(^|/)node_modules/(${names})/`;
// The classic UI files (scripts/classic-ui-files.json, UI uplift task U13): what the cut-over (U25) deletes.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CLASSIC_UI = `^(${require('./scripts/classic-ui-files.json').map(escape).join('|')})$`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ---------------------------------------------------------------- shared/
    {
      name: 'domain-only-pure-libraries',
      comment: 'shared/domain/ only imports itself, shared/i18n (plain text) and pure libraries (croner, cronstrue); it must run in the browser',
      severity: 'error',
      from: { path: '^shared/domain/', pathNot: TEST_FILE },
      to: { pathNot: `^shared/(domain|i18n)/|${npm('croner|cronstrue')}` },
    },
    {
      name: 'contracts-only-domain-and-zod',
      comment: 'shared/contracts/ (zod schemas for requests, responses and events) only imports shared/domain + zod',
      severity: 'error',
      from: { path: '^shared/contracts/', pathNot: TEST_FILE },
      to: { pathNot: `^shared/(domain|contracts)/|${npm('zod')}` },
    },
    {
      name: 'i18n-text-only',
      comment: 'shared/i18n/ (vi.ts, en.ts) holds text only and imports nothing but itself',
      severity: 'error',
      from: { path: '^shared/i18n/', pathNot: TEST_FILE },
      to: { pathNot: '^shared/i18n/' },
    },

    // ---------------------------------------------------------------- server/
    {
      name: 'ports-interfaces-only',
      comment: 'server/ports/ only declares interfaces: imports shared/domain (+ zod types for the executor config schema)',
      severity: 'error',
      from: { path: '^server/ports/', pathNot: TEST_FILE },
      to: { pathNot: `^(server/ports|shared/domain)/|${npm('zod')}` },
    },
    {
      name: 'services-call-ports-only',
      comment: 'server/services/ only uses shared/domain + server/ports; no adapters, no http/scheduler, no fastify/drizzle/pg, no Node modules',
      severity: 'error',
      from: { path: '^server/services/', pathNot: TEST_FILE },
      to: { pathNot: '^(server/(services|ports)/|shared/domain/)' },
    },
    {
      name: 'services-talk-via-interface',
      comment: 'inside server/services/, the Default... classes only know each other through the interfaces in contracts.ts (LoopService -> RunService, SchedulingService -> RunService, wired in main.ts): no importing another *-service.ts file',
      severity: 'error',
      from: { path: '^server/services/', pathNot: TEST_FILE },
      to: { path: '^server/services/[^/]+-service\\.ts$' },
    },
    {
      name: 'adapters-no-upward-calls',
      comment: 'server/adapters/ implement ports: only import shared/domain + server/ports (+ infrastructure libraries); no services/http/scheduler',
      severity: 'error',
      from: { path: '^server/adapters/', pathNot: TEST_FILE },
      to: { dependencyTypes: ['local'], pathNot: '^(server/(adapters|ports)/|shared/domain/)' },
    },
    {
      name: 'only-claude-executor-uses-agent-sdk',
      comment: 'only server/adapters/executors/claude/ may import @anthropic-ai/claude-agent-sdk; adding a provider means adding a folder, and the SDK does not leak into other layers; tests and tests/support (the fake query) may use the SDK types',
      severity: 'error',
      from: { pathNot: `^server/adapters/executors/claude/|^tests/support/|${TEST_FILE}` },
      to: { path: npm('@anthropic-ai/claude-agent-sdk') },
    },
    {
      name: 'entry-layer-only-service-contracts',
      comment: 'server/http/, server/scheduler/ only call services through the interfaces in server/services/contracts.ts; no adapters, ports or Default... classes',
      severity: 'error',
      from: { path: '^server/(http|scheduler)/', pathNot: TEST_FILE },
      to: { dependencyTypes: ['local'], pathNot: '^(server/$1/|server/services/contracts\\.ts$|shared/)' },
    },
    {
      name: 'entry-layer-no-db',
      comment: 'the entry layer does not use drizzle-orm / pg; the DB only lives behind the repository port',
      severity: 'error',
      from: { path: '^server/(http|scheduler)/', pathNot: TEST_FILE },
      to: { path: DB_LIBS },
    },
    {
      name: 'server-no-web-import',
      comment: 'the rest of server/ (main.ts, config.ts) does not import the UI',
      severity: 'error',
      from: { path: '^server/', pathNot: `^server/(ports|services|adapters|http|scheduler)/|${TEST_FILE}` },
      to: { path: '^web/' },
    },
    {
      name: 'no-import-composition-root',
      comment: 'server/main.ts and web/main.tsx are the wiring roots: nobody may import them',
      severity: 'error',
      from: {},
      to: { path: '^(server/main\\.ts|web/main\\.tsx)$' },
    },

    // ---------------------------------------------------------------- web/
    {
      name: 'web-ui-no-business-knowledge',
      comment: 'web/ui/ (design system) imports no other folder of web/',
      severity: 'error',
      from: { path: '^web/ui/', pathNot: TEST_FILE },
      to: { path: '^web/(?!ui/)' },
    },
    {
      name: 'web-api-no-upward-calls',
      comment: 'web/api/ (LoopsApi, LiveEvents + the Http/Sse versions) does not import ui, data, features or pages',
      severity: 'error',
      from: { path: '^web/api/', pathNot: TEST_FILE },
      to: { path: '^web/(ui|data|features|pages)/' },
    },
    {
      name: 'web-data-no-implementation',
      comment: 'web/data/ (TanStack Query hooks) get the API through context: no importing pages, features, web/api/http-*, web/api/sse-*',
      severity: 'error',
      from: { path: '^web/data/', pathNot: TEST_FILE },
      to: { path: '^web/(pages/|features/|api/(http|sse)-)' },
    },
    {
      name: 'web-features-no-implementation',
      comment: 'web/features/ does not import pages, web/api/http-*, web/api/sse-*',
      severity: 'error',
      from: { path: '^web/features/', pathNot: TEST_FILE },
      to: { path: '^web/(pages/|api/(http|sse)-)' },
    },
    {
      name: 'web-pages-no-api',
      comment: 'web/pages/ only composes features per route and does not import web/api/',
      severity: 'error',
      from: { path: '^web/pages/', pathNot: TEST_FILE },
      to: { path: '^web/api/' },
    },
    {
      name: 'web-prefs-preferences-only',
      comment: 'web/prefs/ (language + light/dark, t(), number/time formatting) only imports itself, shared/i18n, shared/domain and react: every layer may use it, so it must not know any layer',
      severity: 'error',
      from: { path: '^web/prefs/', pathNot: TEST_FILE },
      to: { pathNot: `^(web/prefs|shared/(i18n|domain))/|${npm('react')}` },
    },
    {
      name: 'no-new-ui-to-classic',
      comment: 'nothing new may depend on the classic UI (scripts/classic-ui-files.json): only the listed files themselves, the switch web/app/App.tsx and web/main.tsx import a listed file, so the cut-over deletes them without breaking anything',
      severity: 'error',
      from: { path: '^web/', pathNot: `${CLASSIC_UI}|^web/app/App\\.tsx$|^web/main\\.tsx$` },
      to: { path: CLASSIC_UI },
    },
    {
      name: 'web-no-server-import',
      comment: 'the UI only talks to the server over HTTP (types from shared/contracts) and does not import server/ or server libraries',
      severity: 'error',
      from: { path: '^web/', pathNot: TEST_FILE },
      to: { path: `^server/|${SERVER_LIBS}` },
    },

    // ---------------------------------------------------------------- common
    {
      name: 'no-circular',
      comment: 'no cycles anywhere',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-import-missing-file',
      comment: 'an import that cannot be resolved (mistyped path, missing package), so that none of the rules above can be bypassed',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(tests/arch-fixtures|dist|reports|test-results|node_modules)/' },
    // Also catches `import type`: ports and contracts are mostly types, which vanish after compilation.
    tsPreCompilationDeps: true,
    moduleSystems: ['es6', 'cjs'],
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.d.ts', '.js', '.mjs', '.cjs', '.json'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
