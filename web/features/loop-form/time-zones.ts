// IANA time-zone list for the "Time zone" field of the form: every time zone the browser knows, the label carrying the current UTC offset
// (`Asia/Ho_Chi_Minh (UTC+07:00)` - like the preview). The loop's time zone is always in the list, even when the browser calls
// it by another name (Chromium lists `Asia/Saigon` instead of `Asia/Ho_Chi_Minh`).
import { DEFAULTS } from './form-model';

let cached: string[] | null = null;
function supported(): string[] {
  if (!cached) {
    try {
      cached = Intl.supportedValuesOf('timeZone');
    } catch {
      cached = [];
    }
  }
  return cached;
}

/** The browser's canonical name for a time zone (`Asia/Ho_Chi_Minh` -> `Asia/Saigon`); an odd name -> itself. */
function canonical(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return tz;
  }
}

/**
 * Time zones to choose from: every browser time zone + the selected one + the default + UTC, sorted by name. When a browser name is
 * an alias of the selected / default time zone (`Asia/Saigon` = `Asia/Ho_Chi_Minh`) show the name the loop stored, not two rows.
 */
export function tzOptions(current: string): string[] {
  const preferred = [current, DEFAULTS.timezone, 'UTC'].filter(Boolean);
  const byCanon = new Map(preferred.map((z) => [canonical(z), z] as const).reverse());
  const all = supported().map((z) => byCanon.get(canonical(z)) ?? z);
  return [...new Set([...preferred, ...all])].sort((a, b) => a.localeCompare(b));
}

/** `UTC+07:00`, `UTC-04:00`, `UTC+00:00` - the offset of the time zone at instant `at`. */
export function utcOffset(timeZone: string, at: Date): string {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const m = /^GMT([+-]\d{2}:\d{2})$/.exec(name);
    return `UTC${m ? m[1] : '+00:00'}`;
  } catch {
    return 'UTC?';
  }
}

export function tzLabel(timeZone: string, at: Date): string {
  return `${timeZone} (${utcOffset(timeZone, at)})`;
}
