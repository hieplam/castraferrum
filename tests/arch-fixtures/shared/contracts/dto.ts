// Valid: contracts use domain + zod.
import { z } from 'zod';
import type { Instant } from '../domain/time';
export const instantDto = z.object({ epochMs: z.number() });
export type InstantDto = Instant;
