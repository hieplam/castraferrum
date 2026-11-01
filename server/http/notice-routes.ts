// Notice routes (spec 2.6): the unread list, and marking one notice read.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParams } from '../../shared/contracts/common';
import { noticeListDto } from '../../shared/contracts/notices';
import type { NoticeService } from '../services/contracts';
import { requireId } from './loop-routes';

export type NoticeRouteDeps = { notices: NoticeService };

export const noticeRoutes: FastifyPluginAsyncZod<NoticeRouteDeps> = async (app, { notices }) => {
  app.get('/api/notices', { schema: { response: { 200: noticeListDto } } }, async () => ({ items: await notices.listUnread() }));

  app.post('/api/notices/:id/read', { schema: { params: idParams } }, async (req, reply) => {
    await notices.markRead(requireId(req.params.id, 'NOTICE_NOT_FOUND'));
    return reply.code(204).send();
  });
};
