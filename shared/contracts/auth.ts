// Request / response of the sign-in API (remote-access spec D3, section 5): `GET /api/auth/session`, `POST /api/auth/login`,
// `POST /api/auth/logout`.
import { z } from 'zod';

/** The name of the session cookie (spec D3). */
export const SESSION_COOKIE = 'castra_session';

/** `POST /api/auth/login`. The limits only stop a huge body; the values themselves are compared, never echoed. */
export const loginRequest = z.object({
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(1024),
});
export type LoginRequest = z.infer<typeof loginRequest>;

/** `GET /api/auth/session`: whether sign-in is on, and whether this browser holds a session (with its user). */
export const authSessionDto = z.object({
  required: z.boolean(),
  signedIn: z.boolean(),
  username: z.string().optional(),
});
export type AuthSessionDto = z.infer<typeof authSessionDto>;
