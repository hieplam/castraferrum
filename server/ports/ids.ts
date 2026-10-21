/** Issues ids (uuid) for loops, executions and runs — repositories do not generate them, so tests can build deterministic data. */
export interface IdGenerator {
  newId(): string;
}
