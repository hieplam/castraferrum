// violates: web-api-no-upward-calls
import { LoopTable } from '../features/LoopTable';
export const leak = LoopTable;
