// Valid: a port is only an interface over domain types.
import type { Instant } from '../../shared/domain/time';
export interface Clock { now(): Instant }
