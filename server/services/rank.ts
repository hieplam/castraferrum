import { parseProbeLine, type ProbeRecord } from '../../shared/domain/goal-loop';
import type { LoopRecord } from '../ports/loop-repository';
import type { PlanWindowValue } from '../ports/plan-window';

const WINDOW_END_MS = 45 * 60_000;
const UTILIZATION_LIMIT = 90;

/**
 * Rule 6: a loop with a smaller rank that is active, not archived, and last printed `take` or `plan`, in any repository, because a rank is per account.
 * A loop at its token budget starts no run, so it does not count: its stored line stays, and it must not stop the lower ranks.
 */
export function higherRankLive(self: Pick<ProbeRecord, 'rank'>, probes: ProbeRecord[], loops: Pick<LoopRecord, 'id' | 'status' | 'archivedAt'>[]): boolean {
  const live = new Set(loops.filter((l) => l.status === 'active' && !l.archivedAt).map((l) => l.id));
  return probes.some((p) => p.rank < self.rank && live.has(p.loopId) && p.state !== 'budget_limited' && printsWork(p.lastLine));
}

function printsWork(lastLine: string | null): boolean {
  if (lastLine === null) return false;
  const parsed = parseProbeLine(lastLine);
  return parsed.ok && (parsed.line.action === 'take' || parsed.line.action === 'plan');
}

/**
 * Spec 2.14. With no higher loop a run starts, and `window` is `null` because nobody read it. Otherwise a run starts only at the end of the window,
 * with room left: `resetsAt` under 45 min away and `utilization` under 90. A value that is not known refuses.
 */
export function mayStart({ higherLive, window, now }: { higherLive: boolean; window: PlanWindowValue | null; now: Date }): boolean {
  if (!higherLive) return true;
  if (window === null || window.utilization === null || window.resetsAt === null) return false;
  return window.resetsAt.getTime() - now.getTime() < WINDOW_END_MS && window.utilization < UTILIZATION_LIMIT;
}
