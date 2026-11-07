// Shared business errors: thrown by repositories / services, the entry layer maps `code` to an HTTP status (SPEC, API contract).
// The UI translates by `code`, not by `message`.

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'LOOP_NOT_FOUND'
  | 'LOOP_NAME_TAKEN'
  | 'VERSION_CONFLICT'
  | 'LOOP_ALREADY_ACTIVE'
  | 'LOOP_NOT_ACTIVE'
  | 'LOOP_ARCHIVED'
  | 'LOOP_IS_ACTIVE'
  | 'EXECUTION_NOT_FOUND'
  | 'RUN_NOT_FOUND'
  /** Phase 2: the repo registered for a loop. */
  | 'REPO_NOT_FOUND'
  | 'REPO_NAME_TAKEN'
  | 'REPO_PATH_TAKEN'
  /** Deleting a repo that loops still use (archived ones included) - `details.loops` = the names of those loops. */
  | 'REPO_IN_USE'
  /** Transcript: the turn has no session, or the JSONL file of the session was not found. */
  | 'TRANSCRIPT_NOT_FOUND'
  /** Marking a notice as read: no notice has this id. */
  | 'NOTICE_NOT_FOUND'
  | 'GATE_OFF'
  /** Turning the gate on: the folder of the repo has no `origin` remote on github.com. */
  | 'GATE_NO_REMOTE'
  /** A call to the Git host (GitHub) failed, so a list that needs it cannot be complete. */
  | 'GIT_HOST_FAILED'
  | 'GATE_JOB_NOT_FOUND'
  | 'GATE_JOB_NOT_RATIFIABLE'
  | 'GOAL_CARD_NOT_FOUND'
  /** A yes or a no reached a card that is not `proposed`. */
  | 'GOAL_CARD_NOT_OPEN';

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(err: unknown, code?: ErrorCode): err is DomainError {
  return err instanceof DomainError && (code === undefined || err.code === code);
}
