// Compares a shot of the real app with the approved preview shot by REGION (a story only owns some regions, e.g. the top
// bar, the banner, the main pane at "/"): pixelmatch on every region; masked areas (`mask` — parts owned by another story,
// e.g. the overview figures) are left out of the count.
// Diff image: compared regions show mismatched pixels in red, masked areas in grey, everything outside the regions faded.
import { readFileSync, writeFileSync } from 'node:fs';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/** Mismatch threshold per region (mismatched pixels / compared pixels), for the classic and the new UI. Ratchet: may only go down. */
export const MAX_RATIO = 0.001;

export type Rect = { x: number; y: number; width: number; height: number };
export type Region = { name: string; rect: Rect; mask?: Rect[] };
export type RegionResult = { name: string; rect: Rect; pixels: number; mismatched: number; ratio: number };

const round = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
const inside = (x: number, y: number, r: Rect) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

function crop(png: PNG, r: Rect): Buffer {
  const out = Buffer.alloc(r.width * r.height * 4);
  for (let y = 0; y < r.height; y++) {
    const sy = r.y + y;
    if (sy >= png.height) continue;
    const w = Math.max(0, Math.min(r.width, png.width - r.x));
    png.data.copy(out, y * r.width * 4, (sy * png.width + r.x) * 4, (sy * png.width + r.x + w) * 4);
  }
  return out;
}

/** Compares `actualPath` (app) with `expectedPath` (preview) on the regions; writes the diff image to `diffPath`. */
export function compareRegions(expectedPath: string, actualPath: string, regions: Region[], diffPath: string): RegionResult[] {
  const exp = PNG.sync.read(readFileSync(expectedPath));
  const act = PNG.sync.read(readFileSync(actualPath));
  const diff = new PNG({ width: act.width, height: act.height });
  // diff background: the app image faded (to see which areas are not compared)
  for (let i = 0; i < act.data.length; i += 4) {
    const g = Math.round((act.data[i]! + act.data[i + 1]! + act.data[i + 2]!) / 3);
    diff.data[i] = diff.data[i + 1] = diff.data[i + 2] = 255 - Math.round((255 - g) * 0.15);
    diff.data[i + 3] = 255;
  }
  const results: RegionResult[] = [];
  for (const region of regions) {
    const r = round(region.rect);
    const masks = (region.mask ?? []).map(round);
    const a = crop(exp, r);
    const b = crop(act, r);
    // masked area: copy the preview pixels onto the app so they do not count as mismatched
    let maskedPx = 0;
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        if (masks.some((m) => inside(r.x + x, r.y + y, m))) {
          const o = (y * r.width + x) * 4;
          a.copy(b, o, o, o + 4);
          maskedPx++;
        }
      }
    }
    const out = Buffer.alloc(r.width * r.height * 4);
    const mismatched = pixelmatch(a, b, out, r.width, r.height, { threshold: 0.1, includeAA: false, alpha: 0.2 });
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        const gx = r.x + x;
        const gy = r.y + y;
        if (gx >= diff.width || gy >= diff.height) continue;
        const o = (y * r.width + x) * 4;
        const d = (gy * diff.width + gx) * 4;
        if (masks.some((m) => inside(gx, gy, m))) {
          diff.data[d] = diff.data[d + 1] = diff.data[d + 2] = 200;
        } else {
          out.copy(diff.data, d, o, o + 4);
        }
      }
    }
    const pixels = r.width * r.height - maskedPx;
    results.push({ name: region.name, rect: r, pixels, mismatched, ratio: pixels ? mismatched / pixels : 0 });
  }
  writeFileSync(diffPath, PNG.sync.write(diff));
  return results;
}
