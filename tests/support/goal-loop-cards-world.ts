// The world of the goal cards page (goals G19 and G20): the sample of `goalLoop.cards` in design/ds/preview/data.js, built for real.
// The repo `api` gets one `proposed` card (two-way with the start time of the sample, or one-way with none) and the three earlier cards
// of the sample. The page of this world must equal the approved `card-two-way` and `card-one-way` shots. Z2 imports `seedCard`.
import { writeFileSync } from 'node:fs';
import type pg from 'pg';
import type { FakeGh } from './fake-gh-kit';
import { type TestApi } from './goal-loop-score-world';
import { DS_DATA_JS, previewData, pvTime, PREVIEW_NOW, repoId, seedPreviewWorld, uuid } from './preview-world';

type SampleCard = { door: 'one-way' | 'two-way'; title: string; size: number; startAt?: string; rows: [string, string, string, string][]; next: string };
type Sample = { twoWay: SampleCard; oneWay: SampleCard; history: [string, string, string][] };

/** The name that shows for the repo of the cards: it is a name only, no test reaches it. */
const GITHUB_REPO = 'hieplam/tribe';
/** The issue number of the proposed card, and of the three earlier cards of the sample (newest first). */
export const PROPOSED_ISSUE = 41;
const HISTORY_ISSUES = [40, 39, 38];

/** The id of the row of the card in `state` (`proposed` or one of the sample history states). */
export const goalCardId = (state: string): string => uuid(`goal card ${state}`);

const sample = (): Sample => (previewData(DS_DATA_JS) as unknown as { goalLoop: { cards: Sample } }).goalLoop.cards;

/** The `card` JSON of the sample: `{"v":1,"title","rows","size","door","next"}` of spec 2.13. */
function cardOf(c: SampleCard): Record<string, unknown> {
  return {
    v: 1,
    title: c.title,
    rows: c.rows.map(([id, outcome, oracle, threshold]) => ({ id, outcome, oracle, threshold })),
    size: { planWindows: c.size },
    door: c.door,
    next: [c.next.replace(/^Then: /, '')],
  };
}

/** The text of the issue of a card: one fenced `json` block, as `E card` writes it. */
export const issueBodyOf = (card: Record<string, unknown>): string => `Goal card\n\n\`\`\`json\n${JSON.stringify(card, null, 2)}\n\`\`\`\n`;

/**
 * Resets the console, sets its clock to `PREVIEW_NOW`, seeds the world of the preview, then inserts the cards of the sample for the repo `api`:
 * the `proposed` card of `door` and the three earlier cards. With `gh` the issue of the proposed card also exists in the fake GitHub, so Accept
 * and Refuse (which read and close the issue) find it. Returns the folder of the repo `api`.
 */
export async function seedCard(sp: TestApi, db: pg.Pool, door: 'one-way' | 'two-way', gh?: FakeGh): Promise<{ path: string }> {
  expectOk(await sp.api('POST', '/api/__test/reset'));
  expectOk(await sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() }));
  await seedPreviewWorld(db, {}, DS_DATA_JS);
  const cards = sample();
  const repo = repoId('api', DS_DATA_JS);
  const picked = door === 'two-way' ? cards.twoWay : cards.oneWay;
  const proposed = cardOf(picked);
  const startAfter = picked.startAt ? pvTime(picked.startAt) : null;
  await insertCard(db, { id: goalCardId('proposed'), repo, issue: PROPOSED_ISSUE, title: picked.title, door, card: proposed, state: 'proposed', startAfter, decidedAt: null });
  for (const [i, [state, title, day]] of cards.history.entries()) {
    const earlier = { ...cardOf(cards.twoWay), title, door: 'two-way' };
    await insertCard(db, { id: goalCardId(state), repo, issue: HISTORY_ISSUES[i]!, title, door: 'two-way', card: earlier, state, startAfter: null, decidedAt: pvTime(`${day} 12:00`) });
  }
  if (gh) {
    const world = gh.read();
    world.labels.push('goal-card');
    world.issues.push({
      number: PROPOSED_ISSUE,
      title: `Goal card: ${picked.title}`,
      body: issueBodyOf(proposed),
      state: 'OPEN',
      labels: [{ name: 'goal-card' }],
      comments: [],
      url: `https://github.com/${GITHUB_REPO}/issues/${PROPOSED_ISSUE}`,
      createdAt: PREVIEW_NOW.toISOString(),
      updatedAt: PREVIEW_NOW.toISOString(),
      closedAt: null,
    });
    writeFileSync(gh.world, JSON.stringify(world, null, 2));
  }
  const path = (await db.query<{ path: string }>('SELECT path FROM repos WHERE id = $1', [repo])).rows[0]!.path;
  return { path };
}

type Row = { id: string; repo: string; issue: number; title: string; door: string; card: Record<string, unknown>; state: string; startAfter: Date | null; decidedAt: Date | null };

async function insertCard(db: pg.Pool, r: Row): Promise<void> {
  await db.query(
    `INSERT INTO goal_cards (id, repo_id, github_repo, issue_number, title, door, card, state, start_after, changed, created_at, decided_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, $11)`,
    [r.id, r.repo, GITHUB_REPO, r.issue, r.title, r.door, JSON.stringify(r.card), r.state, r.startAfter, new Date(PREVIEW_NOW.getTime() - 3_600_000), r.decidedAt],
  );
}

function expectOk(res: { status: number }): void {
  if (res.status >= 300) throw new Error(`test route answered ${res.status}`);
}
