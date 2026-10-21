# ADR 0003: hand-written i18n

- Status: accepted

## Context

The UI ships in two fixed languages, English and Vietnamese, on a handful of screens. An i18n library would add
a dependency, a build step and runtime behaviour (plural rules, lazy loading) that two languages do not need.

## Decision

The texts live in `shared/i18n/en.ts` and `shared/i18n/vi.ts`, both keyed by the same set of message keys; a
single `t(key, params)` function substitutes `{param}` placeholders. The key type makes a key missing from one of the files a type error, and a unit test
also compares the key sets and rejects empty strings. The chosen language and the light or dark mode are stored in the browser
(`localStorage`) and applied as `lang` and `data-theme` on `<html>`.

Schedule sentences ("Every 30 minutes") are generated for the five schedule builder shapes in both languages; the
Advanced cron shape uses `cronstrue`.

## Consequences

- Vietnamese text is allowed only in `vi.ts` and its schedule texts; the language scanner treats it anywhere
  else as a regression.
- Adding a language means one new file, one more key type and a toggle entry; adding a message means editing
  both files or the build fails.
- No pluralisation or formatting engine: callers pass ready values, and `web/prefs/format.ts` formats numbers,
  durations and times.
