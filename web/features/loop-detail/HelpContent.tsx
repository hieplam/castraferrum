// What the `?` of Recent runs explains (spec D10, `m-help-*`): a loop, a run, an active period and a session, one definition each.
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';

const TERMS = ['loop', 'run', 'period', 'session'] as const;

export function HelpContent() {
  const t = useT();
  return (
    <>
      {TERMS.map((k) => (
        <div className="def" key={k}>
          <b>{t(`help.${k}` as MessageKey)}</b>
          <span>{t(`help.${k}Body` as MessageKey)}</span>
        </div>
      ))}
    </>
  );
}
