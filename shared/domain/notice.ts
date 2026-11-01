// A notice: one line the console shows (and can push to a webhook) when a loop needs the owner's attention.
// `dedupeKey` names the cause. The console keeps at most one unread notice for each key (spec 2.6).
import { en, type MessageKey } from '../i18n/en';

export const NOTICE_KINDS = ['wait', 'hold', 'blocked', 'gate', 'goal_card', 'probe_failed'] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/** The notice texts are the i18n keys that start with `notice.`; each takes the parameter `{reason}`. */
export type NoticeMessageKey = Extract<MessageKey, `notice.${string}`>;

export type Notice = {
  dedupeKey: string;
  kind: NoticeKind;
  /** The loop that the notice is about, or `null` for a notice about the whole console. */
  loopId: string | null;
  messageKey: NoticeMessageKey;
  params: Record<string, string>;
  at: Date;
};

/** `GET /api/notices` returns at most this many unread notices, newest first. */
export const NOTICE_LIST_LIMIT = 100;

/** The English text of a notice: the message of `key` with each `{name}` replaced by `params.name`. An unknown key gives the key. */
export function noticeText(key: string, params: Record<string, string>): string {
  const template: string | undefined = (en as Record<string, string>)[key];
  if (template === undefined) return key;
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => params[name] ?? '');
}
