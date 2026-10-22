// The three steps under "Create your first loop" (UC-03, first launch).
import { useT } from '../../prefs/prefs';

export function HowItWorks() {
  const t = useT();
  return (
    <ol className="steps">
      {([1, 2, 3] as const).map((i) => (
        <li className="step" key={i}>
          <span>
            <b>{t(`howto.${i}.title`)}</b>
            {t(`howto.${i}.body`)}
          </span>
        </li>
      ))}
    </ol>
  );
}
