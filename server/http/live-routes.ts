// SSE (ARCHITECTURE.md § Events to the UI): `/api/events` (state) + `/api/runs/:id/logs/stream` (logs).
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParams } from '../../shared/contracts/common';
import { logStreamEndDto, stateEventDto } from '../../shared/contracts/events';
import { eventsQuery, logLineDto, logsQuery } from '../../shared/contracts/loops';
import type { LiveService, RunService } from '../services/contracts';
import { requireId } from './loop-routes';
import { streamSse, type SseMessage, type SseOptions } from './sse';

export type LiveRouteDeps = { live: LiveService; runs: RunService; sse: SseOptions };

export const liveRoutes: FastifyPluginAsyncZod<LiveRouteDeps> = async (app, { live, runs, sse }) => {
  // State events (no logs). On reconnect the UI reloads everything (old events are not replayed).
  app.get('/api/events', { schema: { querystring: eventsQuery } }, async (req, reply) => {
    const { loopId } = req.query;
    await streamSse(req, reply, sse, async function* (signal): AsyncGenerator<SseMessage> {
      for await (const ev of live.events(loopId ? { loopId } : {}, signal)) {
        const dto = z.encode(stateEventDto, ev as z.output<typeof stateEventDto>);
        yield { event: dto.type, data: dto };
      }
    });
  });

  // Logs of one run: replay stored logs with seq > after, then follow; when the run ends → `event: end`, then close.
  // A reconnecting browser sends `Last-Event-ID` (= last seq received) itself → no duplicate lines.
  app.get('/api/runs/:id/logs/stream', { schema: { params: idParams, querystring: logsQuery } }, async (req, reply) => {
    const runId = requireId(req.params.id, 'RUN_NOT_FOUND');
    await runs.get(runId); // RUN_NOT_FOUND → 404 JSON before the stream opens
    const lastEventId = Number(req.headers['last-event-id']);
    const after = Number.isInteger(lastEventId) && lastEventId > req.query.after ? lastEventId : req.query.after;
    await streamSse(
      req,
      reply,
      sse,
      async function* (signal): AsyncGenerator<SseMessage> {
        for await (const line of live.runLogs(runId, after, signal)) {
          yield { event: 'log', id: line.seq, data: z.encode(logLineDto, line) };
        }
      },
      async () => {
        const run = await runs.get(runId);
        return { event: 'end', data: z.encode(logStreamEndDto, { runId, status: run.status }) };
      },
    );
  });
};
