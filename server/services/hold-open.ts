import type { HoldRepository } from '../ports/hold-repository';
import type { IdGenerator } from '../ports/ids';
import type { Notifier } from '../ports/notifier';

export type HoldOpenDeps = { holds: HoldRepository; notifier: Notifier; ids: IdGenerator };

export type HoldOpenInput = { resource: string; reason: string; until: Date | null; openedByRunId: string | null; now: Date };

/**
 * Decision 43. `RunService` cannot call `HoldService`, so every caller shares this helper. One cause gives one hold and one notice: only `opened` sends a
 * notice. On `kept`, a known `until` can raise the stored one, and a null keeps it. A time at or before now says nothing about the future, so it counts as null.
 */
export async function openHold(d: HoldOpenDeps, input: HoldOpenInput): Promise<'opened' | 'kept'> {
  const { resource, reason, openedByRunId, now } = input;
  const until = input.until && input.until.getTime() > now.getTime() ? input.until : null;
  const answer = await d.holds.open({ id: d.ids.newId(), resource, reason, openedAt: now, until, openedByRunId });
  if (answer === 'kept') {
    if (until) await d.holds.raiseUntil(resource, until);
    return answer;
  }
  await d.notifier.send({ dedupeKey: `hold:${resource}`, kind: 'hold', loopId: null, messageKey: until ? 'notice.hold' : 'notice.holdNoEnd', params: { reason }, at: now });
  return answer;
}
