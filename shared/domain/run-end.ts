// The run-end signal (spec 2.3): the last non-empty line of a run's final result text is one JSON object.

export interface RunEnd {
  /** The `result` word, kept as written (for example `DONE`, `PR_OPEN`, `RESOURCE_DOWN`, or an unknown word). */
  result: string;
  /** The pull request URL, or null when the line has none or a non-string value. */
  pr: string | null;
  /** The resource name of a `RESOURCE_DOWN` line, or null. */
  resource: string | null;
}

/** A line that is only a code fence: three or more backticks, with or without a language word. */
const FENCE_ONLY = /^`{3,}[\w-]*$/;

/** Moves `i` up to the nearest line at or above it that has a visible character, or -1. */
function skipBlank(lines: string[], i: number): number {
  while (i >= 0 && (lines[i] ?? '').trim() === '') i--;
  return i;
}

/** Returns the line to read: the last non-empty line, or the one before it when the last is only a code fence. */
function signalLine(text: string): string | null {
  const lines = text.split(/\r\n|\r|\n/);
  let i = skipBlank(lines, lines.length - 1);
  if (i >= 0 && FENCE_ONLY.test((lines[i] ?? '').trim())) i = skipBlank(lines, i - 1);
  return i < 0 ? null : (lines[i] ?? '').trim();
}

/** Removes the backticks that wrap the whole line, for example a line written as an inline code span. */
function stripOuterBackticks(line: string): string {
  return line.replace(/^`+/, '').replace(/`+$/, '').trim();
}

/** Parses the run-end signal. Returns null unless the last non-empty line is a JSON object with a string `result`. */
export function parseRunEnd(text: string): RunEnd | null {
  const line = signalLine(text);
  if (line === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(stripOuterBackticks(line));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.result !== 'string') return null;
  return {
    result: obj.result,
    pr: typeof obj.pr === 'string' ? obj.pr : null,
    resource: typeof obj.resource === 'string' ? obj.resource : null,
  };
}
