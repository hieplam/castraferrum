// Valid: the service interface for the entry layer.
import type { Instant } from '../../shared/domain/time';
export interface TimeService { now(): Instant }
