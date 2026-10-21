// Estimated cost of a Claude turn (`cost_usd` as the SDK reports it - not money charged, SPEC-phase-2). One way to write it for
// the executor log line (D-UI18) and the Cost column / cell of the UI (D-UI16): `$1.92` as in the approved preview; below one cent keep 4
// digits (`$0.0039`) so a small haiku turn does not show as `$0.00`.
import { viRepoMissingLegacyPrefix } from '../i18n/vi';

export function formatUsd(cost: number): string {
  return cost > 0 && cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

/** Error text of a turn that the Claude executor reports when the repo folder is gone (UC-23) - the UI recognises it to suggest the Repos page (D-UI19). */
export const REPO_MISSING_PREFIX = 'Repo does not exist: ';

/** Error texts of the same condition recorded by earlier versions (turn rows keep the old Vietnamese text). */
export const REPO_MISSING_PREFIXES: readonly string[] = [REPO_MISSING_PREFIX, viRepoMissingLegacyPrefix];
