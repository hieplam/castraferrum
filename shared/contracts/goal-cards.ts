// Request / response of the goal cards (`GET /api/goal-cards`, `POST /api/goal-cards/:id/accept`, `.../refuse`, spec 2.13).
import { z } from 'zod';
import { GOAL_CARD_DOORS, GOAL_CARD_STATES } from '../domain/goal-card';
import { isoDate } from './common';

export const goalCardListQuery = z.object({ repoId: z.string().optional() });

export const goalCardDto = z.object({
  id: z.string(),
  repoId: z.string(),
  githubRepo: z.string(),
  issueNumber: z.number().int(),
  title: z.string(),
  door: z.enum(GOAL_CARD_DOORS),
  card: z.object({
    v: z.literal(1),
    title: z.string(),
    rows: z.array(z.object({ id: z.string(), outcome: z.string(), oracle: z.string(), threshold: z.string() })),
    size: z.object({ planWindows: z.number() }),
    door: z.enum(GOAL_CARD_DOORS),
    next: z.array(z.string()),
  }),
  state: z.enum(GOAL_CARD_STATES),
  startAfter: isoDate.nullable(),
  changed: z.boolean(),
  epicNumber: z.number().int().nullable(),
  prNumber: z.number().int().nullable(),
  loopId: z.string().nullable(),
  createdAt: isoDate,
  decidedAt: isoDate.nullable(),
});

export const goalCardListDto = z.object({
  items: z.array(goalCardDto),
  /** The count of accepted or started cards with `changed` false. A person copies it to the charter in a ratified PR. */
  acceptedWithNoChange: z.number().int(),
});
