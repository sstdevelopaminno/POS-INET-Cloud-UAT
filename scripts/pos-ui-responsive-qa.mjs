import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outputDir = path.resolve("docs/qa-screenshots/pos-ui-unified");
const targetUrl = process.env.POS_UI_QA_URL ?? "http://localhost:3000/preview/pos";

const viewports = [
  { key: "desktop-1440x900", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { key: "laptop-1366x768", width: 1366, height: 768, isMobile: false, hasTouch: false },
  { key: "ipad-landscape-1180x820", width: 1180, height: 820, isMobile: true, hasTouch: true },
  { key: "ipad-portrait-820x1180", width: 820, height: 1180, isMobile: true, hasTouch: true },
  { key: "android-tablet-landscape-1280x800", width: 1280, height: 800, isMobile: true, hasTouch: true },
  { key: "android-tablet-portrait-800x1280", width: 800, height: 1280, isMobile: true, hasTouch: true },
  { key: "mobile-portrait-390x844", width: 390, height: 844, isMobile: true, hasTouch: true },
  { key: "mobile-landscape-844x390", width: 844, height: 390, isMobile: true, hasTouch: true }
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function evaluateMetrics(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const overflowPx = Math.max(0, Math.ceil(root.scrollWidth - window.innerWidth));
    const hasOverflow = overflowPx > 0;

    const selector = "button,[role='button'],input,select,textarea,a[href]";
    const interactiveElements = Array.from(document.querySelectorAll(selector)).filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });

    const smallTargets = interactiveElements
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 48),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      })
      .filter((item) => item.width < 44 || item.height < 44);

    const dialogs = Array.from(document.querySelectorAll("dialog,[role='dialog']"));
    const modalIssues = dialogs
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          fits:
            rect.left >= 0 &&
            rect.top >= 0 &&
            rect.right <= window.innerWidth &&
            rect.bottom <= window.innerHeight
        };
      })
      .filter((entry) => !entry.fits);

    return {
      hasOverflow,
      overflowPx,
      smallTargetCount: smallTargets.length,
      smallTargetSamples: smallTargets.slice(0, 8),
      modalIssues
    };
  });
}

async function run() {
  await ensureDir(outputDir);
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
        deviceScaleFactor: viewport.isMobile ? 2 : 1
      });
      const page = await context.newPage();
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      const metrics = await evaluateMetrics(page);
      const filePath = path.join(outputDir, `${viewport.key}.png`);
      await page.screenshot({ path: filePath, fullPage: true });
      results.push({
        viewport: viewport.key,
        width: viewport.width,
        height: viewport.height,
        screenshot: path.relative(path.resolve("."), filePath).replaceAll("\\", "/"),
        metrics
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const reportPath = path.join(outputDir, "results.json");
  await fs.writeFile(reportPath, JSON.stringify({ url: targetUrl, generatedAt: new Date().toISOString(), results }, null, 2), "utf8");
  console.log(`Saved screenshots and report to ${outputDir}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

