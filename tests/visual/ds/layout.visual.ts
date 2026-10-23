// Layout probes of the loop page and the run page that a pixel comparison with the preview cannot catch, because the preview
// had the same defect (U27 acceptance of epic 63: castraferrum#187, castraferrum#189, castraferrum#192, castraferrum#193).
// No shots: computed styles and boxes of the real app, on the new preview's world seeded into the test database.
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import {
  DS_DATA_JS,
  loopId,
  PREVIEW_NOW,
  previewDirs,
  repoId,
  runId,
  seedPreviewWorld,
} from "../../support/preview-world";
import { liveDbUrl, ServerProcess } from "../../support/server-process";
import { PHONE_VIEW, PREVIEW_VIEW } from "./kit";

/** One server for a describe block; `world()` = a clean DB with the preview's world (with history), the clocks at PREVIEW_NOW. */
function useServer() {
  const ctx = {} as {
    sp: ServerProcess;
    db: pg.Pool;
    world(page: Page): Promise<void>;
  };
  test.beforeAll(async () => {
    ctx.sp = await ServerProcess.launch();
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    ctx.world = async (page) => {
      await page.goto("about:blank");
      expect((await ctx.sp.api("POST", "/api/__test/reset")).status).toBe(204);
      expect(
        (
          await ctx.sp.api("POST", "/api/__test/clock", {
            at: PREVIEW_NOW.toISOString(),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await ctx.sp.api("POST", "/api/__test/dirs", {
            paths: previewDirs(DS_DATA_JS),
          })
        ).status,
      ).toBe(204);
      await seedPreviewWorld(ctx.db, { history: true }, DS_DATA_JS);
      await page.clock.setFixedTime(PREVIEW_NOW);
    };
  });
  test.afterAll(async () => {
    await ctx.sp?.stop();
    await ctx.db?.end();
  });
  return ctx;
}

/** A token of design/ds/tokens.css in px, as the page resolves it. */
const tokenPx = (page: Page, name: string) =>
  page.evaluate(
    (n) =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(n),
      ),
    name,
  );

/** The vertical centre of the Now card's dot (or pulse) minus the centre of the first line of its title. */
const dotOffset = (page: Page) =>
  page.getByTestId("now-card").evaluate((card) => {
    const mark = card.querySelector(".now > .dot, .now > .pulse");
    const title = card.querySelector(".now-text b");
    if (!mark || !title) return null;
    const m = mark.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(title);
    const line = range.getClientRects()[0]!;
    return m.top + m.height / 2 - (line.top + line.height / 2);
  });

async function openLoop(page: Page, base: string, key: string) {
  await page.goto(`${base}/loops/${loopId(key, DS_DATA_JS)}`);
  await expect(page.getByTestId("now-card")).toBeVisible();
  await expect(page.getByTestId("recent-runs")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const [size, view] of [
  ["desktop", PREVIEW_VIEW],
  ["phone", PHONE_VIEW],
] as const) {
  test.describe(`${size} layout of the loop and run pages`, () => {
    test.use(view);
    const ctx = useServer();

    test("castraferrum#189: the Now card's dot is centred on its title in every state", async ({
      page,
    }) => {
      await ctx.world(page);
      // running (pulse), waiting (green dot), the last run failed (red dot)
      for (const [key, state] of [
        ["pilot", "active"],
        ["wiki", "waiting"],
        ["crash", "failed"],
      ] as const) {
        await openLoop(page, ctx.sp.baseUrl, key);
        const dy = await dotOffset(page);
        expect(dy, `${key}: no dot in the Now card`).not.toBeNull();
        expect(
          Math.abs(dy!),
          `${key} (${state}): the dot is ${dy!.toFixed(1)} px off the title's centre`,
        ).toBeLessThanOrEqual(1);
      }
    });

    test("castraferrum#187: a standalone log has the card radius, a log inside a card keeps square corners", async ({
      page,
    }) => {
      await ctx.world(page);
      const radius = await (async () => {
        await page.goto(`${ctx.sp.baseUrl}/runs/${runId("pilot", 68, "")}`);
        await expect(page.getByTestId("run-log")).toBeVisible();
        return page
          .getByTestId("run-log")
          .evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
      })();
      expect(radius).toBe(`${await tokenPx(page, "--radius-card")}px`);
      await openLoop(page, ctx.sp.baseUrl, "wiki");
      await expect(page.getByTestId("last-run-log")).toBeVisible();
      expect(
        await page
          .getByTestId("last-run-log")
          .evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
      ).toBe("0px");
    });
  });
}

test.describe("phone loop page: caption and meta line", () => {
  test.use(PHONE_VIEW);
  const ctx = useServer();

  test("castraferrum#192: the Recent runs caption sits under its head, wraps at the caption line height, never breaks a part", async ({
    page,
  }) => {
    await ctx.world(page);
    // pilot: the caption wraps ("... · still active · 10 runs"); crash: it fits on one line
    for (const key of ["pilot", "crash"]) {
      await openLoop(page, ctx.sp.baseUrl, key);
      const m = await page
        .locator(".section-head + .group-cap")
        .evaluate((cap) => {
          const head = cap.previousElementSibling!.getBoundingClientRect();
          const group = cap.nextElementSibling!.getBoundingClientRect();
          const box = cap.getBoundingClientRect();
          // The lines of text (not the link's box, which is a touch target taller than its line).
          const texts: Node[] = [];
          const walk = document.createTreeWalker(cap, NodeFilter.SHOW_TEXT);
          for (let n = walk.nextNode(); n; n = walk.nextNode())
            if (n.textContent?.trim()) texts.push(n);
          const tops = [
            ...new Set(
              texts.flatMap((n) => {
                const r = document.createRange();
                r.selectNodeContents(n);
                return [...r.getClientRects()].map((b) => Math.round(b.top));
              }),
            ),
          ].sort((a, b) => a - b);
          const broken = [...cap.querySelectorAll(".keep")]
            .filter(
              (k) =>
                new Set([...k.getClientRects()].map((r) => Math.round(r.top)))
                  .size > 1,
            )
            .map((k) => k.textContent);
          const steps = tops.slice(1).map((t, i) => t - tops[i]!);
          return {
            above: box.top - head.bottom,
            below: group.top - box.bottom,
            height: box.height,
            lines: tops.length,
            steps,
            broken,
          };
        });
      const gap = await tokenPx(page, "--space-2");
      const line = await tokenPx(page, "--lh-cap");
      expect(Math.round(m.above), `${key}: caption to its head`).toBe(gap);
      expect(Math.round(m.below), `${key}: caption to its group`).toBe(gap);
      expect(Math.round(m.height), `${key}: ${m.lines} caption lines`).toBe(
        m.lines * line,
      );
      for (const step of m.steps)
        expect(step, `${key}: a wrapped caption line`).toBe(line);
      expect(m.broken, `${key}: parts broken across lines`).toEqual([]);
    }
  });

  test("castraferrum#193: the meta line never ends a line with its separator", async ({
    page,
  }) => {
    await ctx.world(page);
    // A repo name of 22 characters, as in the acceptance journey: "Running · lc-fake-claude-journey · Every 30 minutes" wraps at 390 px.
    await ctx.db.query("UPDATE repos SET name = $1 WHERE id = $2", [
      "lc-fake-claude-journey",
      repoId("api", DS_DATA_JS),
    ]);
    await openLoop(page, ctx.sp.baseUrl, "pilot");
    await expect(page.getByTestId("loop-repo")).toHaveText(
      "lc-fake-claude-journey",
    );
    const m = await page.locator(".page-meta").evaluate((meta) => {
      // The top of every visible glyph, in order (the pill's word sits a pixel or two off the text's line: a new line starts 8 px lower).
      const glyphs: { ch: string; top: number }[] = [];
      const walk = document.createTreeWalker(meta, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const text = n.textContent ?? "";
        for (let i = 0; i < text.length; i++) {
          if (!text[i]!.trim()) continue;
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + 1);
          const rect = r.getClientRects()[0];
          if (rect) glyphs.push({ ch: text[i]!, top: Math.round(rect.top) });
        }
      }
      const ends = glyphs
        .filter(
          (g, i) => i + 1 < glyphs.length && glyphs[i + 1]!.top > g.top + 8,
        )
        .map((g) => g.ch);
      return { lines: ends.length + 1, ends };
    });
    expect(
      m.lines,
      "the meta line wraps (the test needs a wrap)",
    ).toBeGreaterThan(1);
    expect(m.ends, "last glyphs of the wrapped lines").not.toContain("·");
  });
});
