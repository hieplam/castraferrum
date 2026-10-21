import type { ExecutorDescriptor, ExecutorRegistry, LoopExecutor } from '../../ports/executor';

/** Fixed list of executors, wired in main.ts (phase 1: Mock; phase 2 adds the Claude Agent SDK). */
export class StaticExecutorRegistry implements ExecutorRegistry {
  readonly #byKind = new Map<string, LoopExecutor>();

  constructor(executors: readonly LoopExecutor[]) {
    for (const e of executors) {
      if (this.#byKind.has(e.kind)) throw new Error(`Duplicate executor kind "${e.kind}"`);
      this.#byKind.set(e.kind, e);
    }
  }

  find(kind: string): LoopExecutor | null {
    return this.#byKind.get(kind) ?? null;
  }

  list(): ExecutorDescriptor[] {
    return [...this.#byKind.values()].map((e) => e.describe());
  }
}
