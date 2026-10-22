// Buttons (`.btn`, `.iconbtn`, `.act`). An icon-only button always has an `aria-label` (its `label`) and, on a pointer device, the
// tooltip of the same text. Never a native `title`: the lint (`npm run design:lint`) fails on it.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import { Tooltip } from './Overlay';

type Native = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'className' | 'children' | 'aria-label'>;

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'danger-solid' | 'ghost' | 'plain';
const VARIANT: Record<ButtonVariant, string | false> = {
  default: false,
  primary: 'primary',
  danger: 'danger',
  'danger-solid': 'danger-solid',
  ghost: 'ghost',
  plain: 'plain',
};

export function Button({
  variant = 'default',
  size,
  block,
  icon,
  type = 'button',
  children,
  ...rest
}: Native & { variant?: ButtonVariant; size?: 'sm' | 'lg'; block?: boolean; icon?: IconName; children: ReactNode }) {
  return (
    <button type={type} className={cx('btn', VARIANT[variant], size === 'sm' && 'sm', size === 'lg' && 'lg', block && 'block')} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

/** An icon-only button: `label` is its accessible name and its tooltip (hover and keyboard focus, never on touch). */
export function IconButton({
  icon,
  label,
  bordered,
  tooltip = 'above',
  type = 'button',
  ...rest
}: Native & { icon: IconName; label: string; bordered?: boolean; tooltip?: 'above' | 'below' | 'below-end' | false }) {
  const button = (anchor: Record<string, unknown>) => (
    <button type={type} className={cx('iconbtn', bordered && 'bordered')} aria-label={label} {...anchor} {...rest}>
      <Icon name={icon} />
    </button>
  );
  if (tooltip === false) return button({});
  return (
    <Tooltip text={label} below={tooltip !== 'above'} end={tooltip === 'below-end'}>
      {button}
    </Tooltip>
  );
}

/** The round Start or Stop of a loop row. */
export function ActionButton({ kind, label, ...rest }: Native & { kind: 'start' | 'stop'; label: string }) {
  return (
    <button type="button" className={cx('act', kind === 'start' ? 'start' : 'stop')} aria-label={label} {...rest}>
      <Icon name={kind === 'start' ? 'play' : 'stop'} />
    </button>
  );
}
