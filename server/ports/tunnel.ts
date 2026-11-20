/**
 * The state of the tunnel (remote-access spec D10): `off` when the console runs without `--cloudflare`, `connecting` from the
 * start of `cloudflared` until its `/ready` answers 200, `connected` after that, `down` after it exits.
 */
export type TunnelState = 'off' | 'connecting' | 'connected' | 'down';

/** Reads the state of the tunnel. The health service needs only this. */
export interface TunnelStatus {
  state(): TunnelState;
}

/**
 * Runs the tunnel connector as a child process (spec D9). `start()` resolves once the process has started and rejects when the
 * program cannot start (for example `ENOENT`, with the install command in the message). `stop()` ends the process and resolves
 * when it has exited. After an unexpected exit, the runner starts the process again after a backoff.
 */
export interface TunnelRunner extends TunnelStatus {
  start(): Promise<void>;
  stop(): Promise<void>;
}
