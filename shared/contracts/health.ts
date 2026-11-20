import { z } from 'zod';

/**
 * GET /api/health - 200 when everything is alive, 503 when the DB does not answer. `tunnel` is the state of the Cloudflare tunnel
 * (remote-access spec D10): `off` without `--cloudflare`. It does not change `ok`.
 */
export const healthResponse = z.object({
  ok: z.boolean(),
  db: z.enum(['up', 'down']),
  tunnel: z.enum(['off', 'connecting', 'connected', 'down']),
});
export type HealthResponse = z.infer<typeof healthResponse>;
