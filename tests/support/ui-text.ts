// Expected UI strings for e2e assertions: take the text from the message catalogue instead of retyping prose.
// `t('key', { n: 3 })` substitutes `{n}` like the web app does; `tv` does the same with the Vietnamese catalogue
// (only for tests that deliberately check the Vietnamese UI).
import { en, type MessageKey } from '../../shared/i18n/en';
import { vi } from '../../shared/i18n/vi';

type Params = Record<string, string | number>;
const fill = (template: string, params: Params): string =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));

export const t = (key: MessageKey, params: Params = {}): string => fill(en[key], params);
export const tv = (key: MessageKey, params: Params = {}): string => fill(vi[key], params);
