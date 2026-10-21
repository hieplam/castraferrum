// The other half of the cycle cycle-a <-> cycle-b; dependency-cruiser reports each cycle once (at cycle-a).
import { a } from './cycle-a';
export const b = (): unknown => a;
