// The fingerprint of a standing-goal failure (spec 2.11). It finds the same regression again across passes, so a repeat
// updates one issue. This is a shared contract: the same input must always give the same hash, because the hash is
// stored in issue bodies. shared/domain must run in the browser, so sha256 is written here: `node:crypto` is not allowed,
// and Web Crypto is asynchronous.

const FAILING_LINE = /\b(fail(ed|ure|s)?|error|not ok)\b|^\s*[✗×]/i;

/** The first line with a failing word. Else the last non-empty line. Else an empty text. */
export function firstFailingLine(text: string): string {
  const lines = text.split(/\r?\n/);
  return lines.find((l) => FAILING_LINE.test(l)) ?? lines.filter((l) => l.trim() !== '').pop() ?? '';
}

/** Lower case, with each timestamp, path, hex run of 7 or more and number replaced by `n`. The order of the steps is part of the contract. */
export function normalize(line: string): string {
  return line
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}[t ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?z?/g, 'n')
    .replace(/(?:[a-z]:)?[\w.@~-]*(?:[\\/][\w.@~-]+)+/g, 'n')
    .replace(/\b[0-9a-f]{7,}\b/g, 'n')
    .replace(/\d+(\.\d+)?/g, 'n')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first 12 hex characters of the sha256 of `repo`, `rowId` and the normalized first failing line of `text`. */
export function fingerprint(repo: string, rowId: string, text: string): string {
  return sha256Hex(`${repo}\n${rowId}\n${normalize(firstFailingLine(text))}`).slice(0, 12);
}

/** The first 32 bits of the fractional parts of the cube roots of the first 64 primes (FIPS 180-4). */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
  0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
  0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** The sha256 of the UTF-8 bytes of `text`, as 64 lower-case hex characters. */
export function sha256Hex(text: string): string {
  const message = new TextEncoder().encode(text);
  const blocks = Math.ceil((message.length + 9) / 64);
  const data = new Uint8Array(blocks * 64);
  data.set(message);
  data[message.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(data.length - 8, Math.floor(message.length / 2 ** 29));
  view.setUint32(data.length - 4, message.length * 8);

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  for (let block = 0; block < blocks; block++) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(block * 64 + t * 4);
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15]!;
      const y = w[t - 2]!;
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as [number, number, number, number, number, number, number, number];
    for (let t = 0; t < 64; t++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + K[t]! + w[t]!) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => {
      h[i] = (h[i]! + v) | 0;
    });
  }
  return h.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}
