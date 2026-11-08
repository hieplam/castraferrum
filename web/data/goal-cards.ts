// The goal cards page (spec 2.13, goals G19 and G20): `GET /api/goal-cards?repoId=`, Accept and Refuse. The server decides every state,
// door and start time; the web shows them. A card can arrive at any tick of the console, so the page reads the list again every few seconds.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GoalCardDto } from '../../shared/contracts/goal-cards';
import { useApi } from './provider';
import { qk } from './query-keys';

const REFRESH_MS = 5000;
/** The history shows at most this many cards. */
export const HISTORY_MAX = 5;

export function useGoalCards(repoId: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.goalCards(repoId), queryFn: () => api.goalCards(repoId), refetchInterval: REFRESH_MS });
}

/** Accept and Refuse: either way the page reads the list again, so a card that was already decided (409) leaves the page too. */
export function useDecideGoalCard(repoId: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, answer }: { id: string; answer: 'accept' | 'refuse' }) => (answer === 'accept' ? api.acceptGoalCard(id) : api.refuseGoalCard(id)),
    onSettled: () => client.invalidateQueries({ queryKey: qk.goalCards(repoId) }),
  });
}

/** The card that waits for an answer, and the other cards (started, accepted, refused) newest decision first, at most `HISTORY_MAX`. */
export function splitGoalCards(items: readonly GoalCardDto[]): { proposed: GoalCardDto | null; history: GoalCardDto[] } {
  const when = (c: GoalCardDto) => (c.decidedAt ?? c.createdAt).getTime();
  const history = items
    .filter((c) => c.state !== 'proposed')
    .sort((a, b) => when(b) - when(a))
    .slice(0, HISTORY_MAX);
  return { proposed: items.find((c) => c.state === 'proposed') ?? null, history };
}

/** `22:14`: the hour and minute of an instant in `timeZone`, with no leading zero on the hour (`9:05`). */
export function fmtHm(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${Number(part('hour'))}:${part('minute')}`;
}
