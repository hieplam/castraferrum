// Transcript of one run (SPEC-phase-2 § Transcript — Service + API): a page (REST) + an SSE stream.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParams } from '../../shared/contracts/common';
import {
  transcriptEndedEventDto,
  transcriptEntriesEventDto,
  transcriptPageDto,
  transcriptQuery,
  transcriptStreamQuery,
} from '../../shared/contracts/transcript';
import type { RunService, TranscriptService } from '../services/contracts';
import { requireId } from './loop-routes';
import { streamSse, type SseMessage, type SseOptions } from './sse';

export type TranscriptRouteDeps = { transcripts: TranscriptService; runs: RunService; sse: SseOptions };

export const transcriptRoutes: FastifyPluginAsyncZod<TranscriptRouteDeps> = async (app, { transcripts, runs, sse }) => {
  app.get(
    '/api/runs/:id/transcript',
    { schema: { params: idParams, querystring: transcriptQuery, response: { 200: transcriptPageDto } } },
    async (req) => transcripts.page(requireId(req.params.id, 'RUN_NOT_FOUND'), req.query.before ?? null),
  );

  // Each connection gets its own stream (no lock — open 2 tabs and both run). `id:` = byte offset after the last entry; a reconnecting
  // browser sends `Last-Event-ID` itself → follow on from there, no `snapshot` resent, no duplicate entries.
  app.get(
    '/api/runs/:id/transcript/stream',
    { schema: { params: idParams, querystring: transcriptStreamQuery } },
    async (req, reply) => {
      const runId = requireId(req.params.id, 'RUN_NOT_FOUND');
      await runs.get(runId); // RUN_NOT_FOUND → 404 JSON before the stream opens
      const header = req.headers['last-event-id'];
      const lastEventId = typeof header === 'string' && /^\d+$/.test(header) ? Number(header) : null;
      const query = req.query.after ?? null;
      const after = lastEventId !== null && (query === null || lastEventId > query) ? lastEventId : query;
      await streamSse(req, reply, sse, async function* (signal): AsyncGenerator<SseMessage> {
        for await (const ev of transcripts.follow(runId, after, signal)) {
          switch (ev.type) {
            case 'snapshot':
              yield { event: 'snapshot', id: ev.end, data: z.encode(transcriptPageDto, ev) };
              break;
            case 'entries':
              yield { event: 'entries', id: ev.end, data: z.encode(transcriptEntriesEventDto, ev) };
              break;
            case 'missing':
              yield { event: 'missing', data: {} };
              break;
            case 'ended':
              yield { event: 'ended', data: z.encode(transcriptEndedEventDto, { runId, status: ev.status }) };
              break;
          }
        }
      });
    },
  );
};
