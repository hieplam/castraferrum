// iOS and installability (UI uplift, task U24; spec 4.9, D13): the web app manifest, the three PNG icons and the links in the
// HTML head that let the console be added to the Home Screen. Reads the committed files; the PNG sizes come from their headers.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PUBLIC = `${ROOT}web/public/`;
/** The light `--bg` of the new system (design/ds/tokens.css): the paper the icons and the browser chrome use. */
const PAPER = '#f3ecdc';

type Manifest = {
  name?: string;
  short_name?: string;
  display?: string;
  start_url?: string;
  background_color?: string;
  theme_color?: string;
  icons?: { src: string; sizes: string; type: string; purpose?: string }[];
};

/** Width and height of a PNG, read from its IHDR chunk (bytes 16 to 24, after the 8-byte signature and the chunk head). */
function pngSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(b.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

describe('web app manifest (spec 4.9)', () => {
  const path = `${PUBLIC}manifest.webmanifest`;

  it('exists in web/public, so the build serves it at /manifest.webmanifest', () => {
    expect(existsSync(path)).toBe(true);
  });

  it('names the app, opens standalone at / on the paper colour', () => {
    const m = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
    expect(m.name).toBe('Castraferrum');
    expect(m.short_name).toBe('Castraferrum');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.background_color).toBe(PAPER);
    expect(m.theme_color).toBe(PAPER);
  });

  it('lists the 192 and 512 px PNG icons, and each file exists with that size', () => {
    const m = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
    const icons = m.icons ?? [];
    expect(icons.map((i) => i.sizes).sort()).toEqual(['192x192', '512x512']);
    for (const icon of icons) {
      expect(icon.type).toBe('image/png');
      expect(icon.src.startsWith('/')).toBe(true);
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(`${PUBLIC}${icon.src.slice(1)}`)).toEqual({ width: w, height: h });
    }
  });
});

describe('icons (spec 4.9)', () => {
  it.each([
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ])('%s is a %i px square PNG', (file, size) => {
    expect(pngSize(`${PUBLIC}${file}`)).toEqual({ width: size, height: size });
  });

  it('are drawn from web/public/icon.svg: the teal bar on the paper', () => {
    const svg = readFileSync(`${PUBLIC}icon.svg`, 'utf8');
    expect(svg).toContain(PAPER);
    expect(svg).toContain('#0f766e');
  });
});

describe('web/index.html head (spec 4.9)', () => {
  const html = readFileSync(`${ROOT}web/index.html`, 'utf8');

  it('has one theme-color meta on the paper colour (the app updates it with the theme)', () => {
    const metas = html.match(/<meta\s+name="theme-color"[^>]*>/g) ?? [];
    expect(metas).toHaveLength(1);
    expect(metas[0]).toContain(`content="${PAPER}"`);
  });

  it('links the manifest and the apple-touch-icon', () => {
    expect(html).toMatch(/<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"\s*\/?>/);
    expect(html).toMatch(/<link\s+rel="apple-touch-icon"\s+href="\/apple-touch-icon\.png"\s*\/?>/);
  });

  it('leaves viewport-fit=cover to web/main.tsx, which adds it for the new UI only', () => {
    expect(html).not.toContain('viewport-fit');
    const main = readFileSync(`${ROOT}web/main.tsx`, 'utf8');
    expect(main).toMatch(/viewport-fit=cover/);
  });
});
