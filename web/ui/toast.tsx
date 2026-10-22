// Toast in the bottom-right corner (D-UI3: an action the server refused -> a red toast; UC-08: session id copied). Just UI state,
// giving no business knowledge: `useToast().show('✗ …', 'err')`.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from './kit/cx';

export type ToastTone = 'default' | 'err';
type Item = { id: number; text: ReactNode; tone: ToastTone };
type Api = { show(text: ReactNode, tone?: ToastTone, ms?: number): void };

const ToastContext = createContext<Api | null>(null);
export const TOAST_MS = 4_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);
  const show = useCallback((text: ReactNode, tone: ToastTone = 'default', ms = TOAST_MS) => {
    seq.current += 1;
    const id = seq.current;
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), ms);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {items.length > 0 && (
        <div className="toast-stack" role="status">
          {items.map((x) => (
            <span key={x.id} className={cx('toast', x.tone === 'err' && 'is-err')}>
              {x.text}
            </span>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): Api {
  const t = useContext(ToastContext);
  if (!t) throw new Error('useToast() must be inside <ToastProvider>');
  return t;
}
