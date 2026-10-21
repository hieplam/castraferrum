// Writes an AsyncIterable out as `text/event-stream` (SSE). When the listener disconnects or the server shuts down → the signal aborts → the service
// unregisters from the bus and the iterable ends; no loop outlives the stream.
import type { FastifyReply, FastifyRequest } from 'fastify';

export type SseMessage = { event?: string; id?: string | number; data: unknown };

export type SseOptions = {
  /** `:ping` heartbeat (keeps the connection alive through proxies and helps the browser notice a lost connection). Defaults to 15 seconds. */
  heartbeatMs: number;
  /** Server shutting down: abort every stream (`app.close()` should not wait for SSE streams, which never end on their own). */
  shutdown: AbortSignal;
};

/** One SSE frame. `data` is single-line JSON (JSON.stringify never produces a real newline). */
export function formatSse(msg: SseMessage): string {
  let out = '';
  if (msg.event) out += `event: ${msg.event}\n`;
  if (msg.id !== undefined) out += `id: ${msg.id}\n`;
  return `${out}data: ${JSON.stringify(msg.data)}\n\n`;
}

/**
 * Takes over the response (Fastify sends nothing more itself), writes the SSE headers + a comment line so the browser sees `open` at once,
 * then pushes each event of `stream(signal)`. Ends when the iterable finishes (sending `tail` if any), the listener disconnects, or the server shuts down.
 */
export async function streamSse(
  req: FastifyRequest,
  reply: FastifyReply,
  opts: SseOptions,
  stream: (signal: AbortSignal) => AsyncIterable<SseMessage>,
  tail?: () => Promise<SseMessage | null>,
): Promise<void> {
  const res = reply.raw;
  const controller = new AbortController();
  const abort = () => controller.abort();
  res.on('close', abort); // the listener closed the tab / EventSource.close()
  opts.shutdown.addEventListener('abort', abort, { once: true });
  if (opts.shutdown.aborted) abort();

  reply.hijack();
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(':ok\n\n');
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(':ping\n\n');
  }, opts.heartbeatMs);

  try {
    for await (const msg of stream(controller.signal)) {
      if (controller.signal.aborted || res.writableEnded) break;
      res.write(formatSse(msg));
    }
    if (!controller.signal.aborted && tail) {
      const last = await tail();
      if (last && !res.writableEnded) res.write(formatSse(last));
    }
  } catch (err) {
    if (!controller.signal.aborted) req.log.error(err, 'SSE stream failed');
  } finally {
    clearInterval(heartbeat);
    res.off('close', abort);
    opts.shutdown.removeEventListener('abort', abort);
    controller.abort();
    if (!res.writableEnded) res.end();
  }
}
