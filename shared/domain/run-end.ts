// The run-end signal (spec 2.3): the last non-empty line of a run's final result text is one JSON object.

export interface RunEnd {
  /** The `result` word, kept as written (for example `DONE`, `PR_OPEN`, `RESOURCE_DOWN`, or an unknown word). */
  result: string;
  /** The pull request URL, or null when the line has none or a non-string value. */
  pr: string | null;
  /** The resource name of a `RESOURCE_DOWN` line, or null. */
  resource: string | null;
}

/** Returns the last line of `text` that has a visible character, or null. */
function lastNonEmptyLine(text: string): string | null {
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = (lines[i] ?? '').trim();
    if (line !== '') return line;
  }
  return null;
}

/** Removes the backticks that wrap the whole line, for example a line written as an inline code span. */
function stripOuterBackticks(line: string): string {
  return line.replace(/^`+/, '').replace(/`+$/, '').trim();
}

/** Parses the run-end signal. Returns null unless the last non-empty line is a JSON object with a string `result`. */
export function parseRunEnd(text: string): RunEnd | null {
  const line = lastNonEmptyLine(text);
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
