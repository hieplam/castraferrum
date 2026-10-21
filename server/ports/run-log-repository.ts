import type { LogLevel, LogLine } from '../../shared/domain/run';

export type { LogLine } from '../../shared/domain/run';
export type NewLogLine = { at: Date; level: LogLevel; message: string; data?: unknown };

export interface RunLogRepository {
  /** Assigns increasing seq values within the run (1, 2, ...), continuing after existing lines. Throws `RUN_NOT_FOUND`. */
  append(runId: string, lines: NewLogLine[]): Promise<LogLine[]>;
  /** Lines with seq > afterSeq, ascending, at most `limit`. */
  list(runId: string, afterSeq: number, limit: number): Promise<LogLine[]>;
}
