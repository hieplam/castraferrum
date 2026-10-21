/** Asks whether the data store still answers. Never throws: not answering = `false`. */
export interface DbProbe {
  ping(): Promise<boolean>;
}
