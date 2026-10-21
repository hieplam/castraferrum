// Valid: an adapter implements a port and may use Node modules and infrastructure libraries.
import { performance } from 'node:perf_hooks';
import type { Clock } from '../ports/clock';
export class SystemClock implements Clock { now() { return { epochMs: performance.timeOrigin + performance.now() }; } }
