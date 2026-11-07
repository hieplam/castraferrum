// The charter of a repository and a goal card (spec 2.13). The charter says what may start with no person. A goal card is one proposed
// goal, written as an issue. The rules here are pure: `GoalCardService` applies them, and it stores `effectiveDoor`, so a model cannot lower a door.

export const CHARTER_FILE = 'goals/charter.json';
export const GOAL_CARD_LABEL = 'goal-card';
/** The decision of issue 216: the refusal window needs at least this many cards accepted with no change. */
export const WINDOW_MIN_ACCEPTED = 3;

export const GOAL_CARD_STATES = ['proposed', 'accepted', 'refused', 'started'] as const;
export type GoalCardState = (typeof GOAL_CARD_STATES)[number];

export const GOAL_CARD_DOORS = ['one-way', 'two-way'] as const;
export type GoalCardDoor = (typeof GOAL_CARD_DOORS)[number];

export type Charter = {
  v: 1;
  purpose: string;
  mayStartAlone: string[];
  neverAlone: string[];
  refusalWindow: { enabled: boolean; hours: number };
  acceptedWithNoChange: number;
};

export type GoalCardRow = { id: string; outcome: string; oracle: string; threshold: string };

export type GoalCard = {
  v: 1;
  title: string;
  rows: GoalCardRow[];
  size: { planWindows: number };
  door: GoalCardDoor;
  next: string[];
};

export type GoalCardParse = { ok: true; card: GoalCard } | { ok: false; reason: string };

class BadShape extends Error {}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
const isPositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

function need(test: boolean, reason: string): asserts test {
  if (!test) throw new BadShape(reason);
}

/** Throws an `Error` that says why the text is not a charter. A bad charter must stop the service, never turn into a default. */
export function parseCharter(text: string): Charter {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('the charter is not JSON');
  }
  if (!isObject(raw) || raw.v !== 1) throw new Error('the charter must be an object with v 1');
  const window = raw.refusalWindow;
  if (typeof raw.purpose !== 'string') throw new Error('the charter needs purpose');
  if (!isTextList(raw.mayStartAlone)) throw new Error('the charter needs mayStartAlone, a list of texts');
  if (!isTextList(raw.neverAlone) || !raw.neverAlone.every(isText)) throw new Error('the charter needs neverAlone, a list of texts');
  if (!isObject(window) || typeof window.enabled !== 'boolean' || !isPositive(window.hours)) throw new Error('the charter needs refusalWindow with enabled and hours');
  if (!Number.isInteger(raw.acceptedWithNoChange) || (raw.acceptedWithNoChange as number) < 0) throw new Error('the charter needs acceptedWithNoChange, a whole number');
  return {
    v: 1,
    purpose: raw.purpose,
    mayStartAlone: raw.mayStartAlone,
    neverAlone: raw.neverAlone,
    refusalWindow: { enabled: window.enabled, hours: window.hours },
    acceptedWithNoChange: raw.acceptedWithNoChange as number,
  };
}

function toRow(raw: unknown): GoalCardRow {
  need(isObject(raw), 'each row must be an object');
  const { id, outcome, oracle, threshold } = raw as Record<string, unknown>;
  need(isText(id), 'each row needs id');
  need(isText(outcome), 'each row needs outcome');
  need(isText(oracle), 'each row needs oracle');
  need(isText(threshold), 'each row needs threshold');
  return { id: id as string, outcome: outcome as string, oracle: oracle as string, threshold: threshold as string };
}

function toCard(raw: unknown): GoalCard {
  need(isObject(raw), 'the card must be an object');
  const { v, title, rows, size, door, next } = raw as Record<string, unknown>;
  need(v === 1, 'v must be 1');
  need(isText(title), 'title must be a text');
  need(Array.isArray(rows), 'rows must be a list');
  need((rows as unknown[]).length > 0, 'rows must hold at least 1 row');
  need(isObject(size) && isPositive(size.planWindows), 'size.planWindows must be above 0');
  need((GOAL_CARD_DOORS as readonly unknown[]).includes(door), 'door must be one-way or two-way');
  need(isTextList(next), 'next must be a list of texts');
  return {
    v: 1,
    title: title as string,
    rows: (rows as unknown[]).map(toRow),
    size: { planWindows: (size as { planWindows: number }).planWindows },
    door: door as GoalCardDoor,
    next: next as string[],
  };
}

/** A body holds a card when it has exactly one fenced `json` block, and that block is a card of spec 2.13. */
export function parseGoalCard(body: string): GoalCardParse {
  const blocks = [...body.matchAll(/^```json[ \t]*\r?\n([\s\S]*?)^```[ \t]*\r?$/gm)];
  if (blocks.length !== 1) return { ok: false, reason: `the body has ${blocks.length} fenced json blocks, it must have 1` };
  let raw: unknown;
  try {
    raw = JSON.parse(blocks[0]![1]!);
  } catch {
    return { ok: false, reason: 'the json block is not JSON' };
  }
  try {
    return { ok: true, card: toCard(raw) };
  } catch (err) {
    if (err instanceof BadShape) return { ok: false, reason: err.message };
    throw err;
  }
}

/** Rule 3: `one-way` when the card says so, or when a `neverAlone` entry occurs in the title or a row outcome, in lower case. */
export function effectiveDoor(card: GoalCard, charter: Charter): GoalCardDoor {
  if (card.door === 'one-way') return 'one-way';
  const texts = [card.title, ...card.rows.map((row) => row.outcome)].map((text) => text.toLowerCase());
  const named = charter.neverAlone.some((entry) => texts.some((text) => text.includes(entry.toLowerCase())));
  return named ? 'one-way' : 'two-way';
}

/** Rule 4: the refusal window works only when the charter enables it and the count is at least 3. */
export function windowOn(charter: Charter): boolean {
  return charter.refusalWindow.enabled && charter.acceptedWithNoChange >= WINDOW_MIN_ACCEPTED;
}

/** Rule 7: `date` gives the UTC day, so one card needs one stable time. */
export function manifestPathOfCard(issue: number, date: Date): string {
  return `goals/${date.toISOString().slice(0, 10)}-card-${issue}.json`;
}

/** Rule 8: in a card, `oracle` is a command and `threshold` is a literal text of its output. A new goal opens at 0 passed. */
export function manifestOfCard(card: GoalCard, { epic, at }: { epic: number; at: Date }): string {
  const goals = card.rows.map((row) => ({ id: row.id, outcome: row.outcome, checks: [{ run: row.oracle, expect: [row.threshold] }] }));
  return `${JSON.stringify({ setup: [], opened: { at: at.toISOString(), passed: 0, total: goals.length }, epic, goals }, null, 2)}\n`;
}

/** The loop prompt of `plan.md` section 6. */
export function goalLoopPrompt(epic: number, githubRepo: string): string {
  return `Run one tick of the epic loop on epic #${epic} of ${githubRepo}, using the epic-loop skill. If that skill is not available, change nothing and reply SKILL MISSING.`;
}

/** The first line names the manifest. A row stays on one line, so a text in a card cannot add a second `Goal manifest:` line. */
export function epicBodyOfCard(card: GoalCard, { manifest, prompt }: { manifest: string; prompt: string }): string {
  const rows = card.rows.map((row) => `- ${row.id}: ${row.outcome}`.replace(/\s+/g, ' '));
  return [`Goal manifest: ${manifest}`, '', ...rows, '', prompt, ''].join('\n');
}

/** Postgres `jsonb` does not keep the order of keys, so two cards compare field by field. */
export function sameCard(a: GoalCard, b: GoalCard): boolean {
  return JSON.stringify(toCard(a)) === JSON.stringify(toCard(b));
}
