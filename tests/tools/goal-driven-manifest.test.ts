import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');

type Check = { run?: string; file?: string; contains?: string; expect?: string[]; exit?: number };
type Goal = { id: string; outcome: string; checks: Check[] };
type Manifest = { setup: string[]; opened: { at: string; passed: number; total: number }; goals: Goal[] };

const manifest = JSON.parse(read('goals/2026-11-01-goal-driven-loop.json')) as Manifest;

// The goal table is section 1 of the spec: one row per goal, `| G<k> | <Outcome> | <Oracle> | ...`.
function specOutcomes(): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of read('docs/specs/2026-11-01-goal-driven-loop.md').split(/\r?\n/)) {
    const m = /^\| (G\d+) \| ([^|]+) \|/.exec(line);
    if (m?.[1] && m[2]) rows.set(m[1], m[2].trim());
  }
  return rows;
}

describe('goal manifest of the goal-driven loop epic', () => {
  it('ids are G1 to G29 once each, except the dropped G21', () => {
    const want = Array.from({ length: 29 }, (_, i) => `G${i + 1}`).filter((id) => id !== 'G21');
    expect(manifest.goals.map((g) => g.id)).toEqual(want);
  });

  it('outcomes equal the spec table', () => {
    const table = specOutcomes();
    // G21 stays in the spec table as a dropped row (decision 54) and has no manifest goal.
    table.delete('G21');
    expect(table.size).toBe(28);
    for (const g of manifest.goals) expect(g.outcome, g.id).toBe(table.get(g.id));
  });

  it('every goal has a check that can fail', () => {
    for (const g of manifest.goals) {
      expect(g.checks.length, `${g.id} has checks`).toBeGreaterThan(0);
      for (const c of g.checks) {
        // A check that can fail runs a command or reads a file, and states what it must see.
        const proves = c.run !== undefined ? (c.expect?.length ?? 0) > 0 : c.file !== undefined && !!c.contains;
        expect(proves, `${g.id} ${c.run ?? c.file} states its expected text`).toBe(true);
        expect(c.run === undefined || c.run.trim() !== 'node -e 0', `${g.id} is not a stub`).toBe(true);
      }
    }
  });

  it('opened total is 28', () => {
    expect(manifest.opened).toEqual({ at: '2026-11-01T00:00:00Z', passed: 0, total: 28 });
    expect(manifest.opened.total).toBe(manifest.goals.length);
  });
});
