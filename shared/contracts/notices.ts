// Request / response of the notice API (spec 2.6): `GET /api/notices`, `POST /api/notices/:id/read`.
import { z } from 'zod';
import { NOTICE_KINDS } from '../domain/notice';
import { isoDate, listOf } from './common';

export const noticeDto = z.object({
  id: z.string(),
  dedupeKey: z.string(),
  kind: z.enum(NOTICE_KINDS),
  loopId: z.string().nullable(),
  /** The i18n key of the text, for example `notice.hold`. The web translates it with `params`. */
  messageKey: z.string(),
  params: z.record(z.string(), z.string()),
  at: isoDate,
});
export type NoticeDto = z.output<typeof noticeDto>;
export const noticeListDto = listOf(noticeDto);
