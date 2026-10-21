// Valid: the UI-side API interface, with types from shared/contracts.
import type { InstantDto } from '../../shared/contracts/dto';
export interface LoopsApi { now(): Promise<InstantDto> }
