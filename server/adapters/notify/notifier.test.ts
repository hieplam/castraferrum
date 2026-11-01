// The notifiers (spec 2.6). The webhook cases post only to a server that this file starts on 127.0.0.1.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { Notice } from '../../../shared/domain/notice';
import type { NoticeRepository } from '../../ports/notice-repository';
import type { Notifier } from '../../ports/notifier';
import { createMemoryRepositories } from '../memory';
import { FanoutNotifier } from './fanout-notifier';
import { StoreNotifier } from './store-notifier';
import { WEBHOOK_TIMEOUT_MS, WebhookNotifier } from './webhook-notifier';

const AT = new Date('2026-11-01T01:00:00.000Z');
const notice = (over: Partial<Notice> = {}): Notice => ({
  dedupeKey: 'hold:ci',
  kind: 'hold',
  loopId: null,
  messageKey: 'notice.hold',
  params: { reason: 'the CI is red' },
  at: AT,
  ...over,
});
let n = 0;
const ids = { newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
/** A notifier that records what it gets. */
const recorder = (): Notifier & { got: Notice[] } => {
  const got: Notice[] = [];
  return { got, send: async (x) => void got.push(x) };
};

let servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise<void>((ok) => (s.closeAllConnections(), s.close(() => ok())))));
  servers = [];
});
/** A local server; `handler` decides what it answers. Returns its URL. */
async function localServer(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const s = createServer(handler);
  servers.push(s);
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}/hook`;
}

describe('notifiers', () => {
  it('StoreNotifier stores a new notice as unread and passes it on', async () => {
    const repos = createMemoryRepositories();
    const next = recorder();
    await new StoreNotifier({ notices: repos.notices, ids, onNew: next }).send(notice());
    expect(await repos.notices.listUnread(10)).toHaveLength(1);
    expect(next.got).toEqual([notice()]);
  });

  it('StoreNotifier passes on nothing for a key that is already unread, so one cause gives one push', async () => {
    const repos = createMemoryRepositories();
    const next = recorder();
    const store = new StoreNotifier({ notices: repos.notices, ids, onNew: next });
    await store.send(notice());
    await store.send(notice());
    expect(await repos.notices.listUnread(10)).toHaveLength(1);
    expect(next.got).toHaveLength(1);
  });

  it('WebhookNotifier posts { kind, text, at } as JSON', async () => {
    const seen: { method?: string; type?: string; body: string }[] = [];
    const url = await localServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen.push({ method: req.method, type: req.headers['content-type'], body });
        res.writeHead(204).end();
      });
    });
    await new WebhookNotifier(url).send(notice());
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'POST', type: 'application/json' });
    expect(JSON.parse(seen[0]!.body)).toEqual({ kind: 'hold', text: 'On hold: the CI is red', at: AT.toISOString() });
  });

  it('WebhookNotifier send resolves when the webhook answers 500 and when nothing listens', async () => {
    const url500 = await localServer((_req, res) => void res.writeHead(500).end('boom'));
    await expect(new WebhookNotifier(url500).send(notice())).resolves.toBeUndefined();
    const dead = await localServer((_req, res) => void res.end());
    await new Promise<void>((ok) => servers.at(-1)!.close(() => ok())); // the port is now closed: a refused connection
    await expect(new WebhookNotifier(dead).send(notice())).resolves.toBeUndefined();
  });

  it('WebhookNotifier gives up on a webhook that never answers, after the time-out, and send still resolves', async () => {
    expect(WEBHOOK_TIMEOUT_MS).toBe(5000);
    const url = await localServer(() => {
      // Never answers.
    });
    const started = Date.now();
    await expect(new WebhookNotifier(url, { timeoutMs: 100 }).send(notice())).resolves.toBeUndefined();
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(90);
    expect(took).toBeLessThan(3000);
  });

  it('FanoutNotifier calls each target; a target that rejects, and a store whose table fails, never make send reject', async () => {
    const before = recorder();
    const after = recorder();
    const boom: Notifier = { send: () => Promise.reject(new Error('boom')) };
    await expect(new FanoutNotifier([before, boom, after]).send(notice())).resolves.toBeUndefined();
    expect(before.got).toHaveLength(1);
    expect(after.got).toHaveLength(1);

    const repos = createMemoryRepositories();
    const failing: NoticeRepository = { ...repos.notices, insertUnread: () => Promise.reject(new Error('db down')), listUnread: async () => [], markRead: async () => {} };
    const pushed = recorder();
    await expect(new StoreNotifier({ notices: failing, ids, onNew: pushed }).send(notice())).resolves.toBeUndefined();
    expect(pushed.got).toEqual([]);
  });
});
