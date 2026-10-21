// Valid: a hook receives the API through an interface.
import type { LoopsApi } from '../api/loops-api';
export function useNow(api: LoopsApi) { return api.now(); }
