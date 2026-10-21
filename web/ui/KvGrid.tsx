// KvGrid - the grid of figure cells of the design system (`.kv`, `.label`, `.v`, `.v.big`, `.sub`), exactly the structure of the approved preview
// (design/preview/preview.js -> kvCell). The column count goes through the variable `--kv-cols` of the `.kv` class itself (layout data, not a
// new token). No business knowledge, no i18n.
import type { CSSProperties, ReactNode } from 'react';

export function KvGrid({ cols, children, testId }: { cols: number; children: ReactNode; testId?: string }) {
  return (
    <div className="kv" style={{ '--kv-cols': cols } as CSSProperties} data-testid={testId}>
      {children}
    </div>
  );
}

/** One cell: an UPPERCASE label, a value (`big` = large text), a sub line (empty = not drawn). */
export function KvCell({ label, value, sub, big = true, testId }: { label: ReactNode; value: ReactNode; sub?: ReactNode; big?: boolean; testId?: string }) {
  return (
    <div data-testid={testId}>
      <div className="label">{label}</div>
      <div className={big ? 'v big' : 'v'}>{value}</div>
      {sub !== undefined && sub !== null && sub !== '' && <div className="sub">{sub}</div>}
    </div>
  );
}
