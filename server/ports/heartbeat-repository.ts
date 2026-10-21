/** The server's heartbeat — recovery uses it as the endedAt of an execution closed because the server went down (D9). */
export interface HeartbeatRepository {
  beat(now: Date): Promise<void>;
  last(): Promise<Date | null>;
}
