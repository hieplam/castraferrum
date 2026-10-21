/** The service's single source of time (D4): run deadlines, schedule ticks and log timestamps all read from here, so tests can fast-forward. */
export interface Clock {
  now(): Date;
}
