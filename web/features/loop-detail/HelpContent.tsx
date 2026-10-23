// What the `?` of Recent runs explains (spec D10, `m-help-*`): a loop, a run, an active period and a session, one definition each.
// The command of the session definition is a `.data` inside the sentence: it never breaks at its hyphens (castraferrum#191).
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';

const TERMS = ['loop', 'run', 'period', 'session'] as const;
const RESUME_COMMAND = 'claude --resume';

export function HelpContent() {
  const t = useT();
  return (
    <>
      {TERMS.map((k) => (
        <div className="def" key={k}>
          <b>{t(`help.${k}` as MessageKey)}</b>
          <span>{t.node(`help.${k}Body` as MessageKey, { cmd: <span className="data">{RESUME_COMMAND}</span> })}</span>
        </div>
      ))}
    </>
  );
}
