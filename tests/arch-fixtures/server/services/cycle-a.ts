// violates: no-circular
import { b } from './cycle-b';
export const a = () => b();
