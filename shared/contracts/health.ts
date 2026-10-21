import { z } from 'zod';

/** GET /api/health - 200 when everything is alive, 503 when the DB does not answer. */
export const healthResponse = z.object({
  ok: z.boolean(),
  db: z.enum(['up', 'down']),
});
export type HealthResponse = z.infer<typeof healthResponse>;
