/// <reference lib="dom" />
// Probes of the frame drawn by the design system (U27 defects of epic 63): fonts of controls rendered outside `.app`, where the
// text of a control starts, and where an element sits on the page. They read what the browser computed and drew, not classes.
import type { Locator, Page } from '@playwright/test';

/**
 * The controls among `testIds` whose computed font family is not the UI font. The UI font is the family of `body`
 * (`--font-ui` of design/ds/tokens.css); a sheet or a dialog is rendered into `body`, outside `.app`.
 */
export async function offUiFont(page: Page, testIds: string[]): Promise<string[]> {
  return page.evaluate((ids) => {
    const ui = getComputedStyle(document.body).fontFamily;
    const out: string[] = [];
    for (const id of ids) {
      const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
      if (els.length === 0) out.push(`${id}: not rendered`);
      for (const el of els) {
        const family = getComputedStyle(el).fontFamily;
        if (family !== ui) out.push(`${id} "${(el.textContent ?? '').trim().slice(0, 20)}": ${family}`);
      }
    }
    return out;
  }, testIds);
}

/** The left edge, in CSS pixels from the viewport, of the first visible text of `el`: the glyphs, not the box and its padding. */
export async function textLeft(el: Locator): Promise<number> {
  return el.evaluate((node) => {
    const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: (n) => ((n.textContent ?? '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
    const text = walk.nextNode();
    if (!text) throw new Error('no text in the element');
    const range = document.createRange();
    range.selectNodeContents(text);
    return range.getBoundingClientRect().left;
  });
}

/** The box of an element in viewport pixels (throws when it is not rendered). */
export async function box(el: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await el.boundingBox();
  if (!b) throw new Error('the element has no box');
  return b;
}
