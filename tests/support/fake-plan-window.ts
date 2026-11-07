// A PlanWindow for service tests: the test sets the value, and `reads` counts the calls.
import type { PlanWindow, PlanWindowValue } from '../../server/ports/plan-window';

export class FakePlanWindow implements PlanWindow {
  reads = 0;
  value: PlanWindowValue = { utilization: null, resetsAt: null };

  async read(): Promise<PlanWindowValue> {
    this.reads++;
    return this.value;
  }
}
