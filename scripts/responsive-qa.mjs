import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const outputDir = path.resolve("docs/qa-screenshots");

const viewports = [
  { key: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
  { key: "tablet-portrait", width: 768, height: 1024, isMobile: true, hasTouch: true },
  { key: "tablet-landscape", width: 1024, height: 768, isMobile: true, hasTouch: true },
  { key: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false }
];

const backofficeBaseUrl = process.env.BACKOFFICE_BASE_URL ?? "https://pos-preview-phi.vercel.app";

const screens = [
  { key: "backoffice-preview-pos", url: `${backofficeBaseUrl}/preview/pos` },
  { key: "backoffice-dashboard", url: `${backofficeBaseUrl}/dashboard` },
  { key: "backoffice-it-admin", url: `${backofficeBaseUrl}/it-admin` }
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function slug(value) {
  return value.replaceAll("/", "-");
}

async function evaluateMetrics(page, screenKey) {
  return page.evaluate((currentScreenKey) => {
    const root = document.documentElement;
    const overflowPx = Math.max(0, Math.ceil(root.scrollWidth - window.innerWidth));
    const hasOverflow = overflowPx > 0;

    const interactiveSelector = "button,[role='button'],input,select,textarea,a[href]";
    const interactiveElements = Array.from(document.querySelectorAll(interactiveSelector)).filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });

    const smallTargets = interactiveElements
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 60),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      })
      .filter((el) => el.width < 44 || el.height < 44);

    const visibleModals = Array.from(
      document.querySelectorAll("dialog,[role='dialog'],.modal,[data-modal],[data-pin-approval-modal]")
    ).filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });

    const modalIssues = visibleModals
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const fits =
          rect.left >= 0 &&
          rect.top >= 0 &&
          rect.right <= window.innerWidth &&
          rect.bottom <= window.innerHeight;
        return {
          fits,
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      })
      .filter((modal) => !modal.fits);

    const beforeFocusOverflow = Math.max(0, Math.ceil(root.scrollWidth - window.innerWidth));
    const focusable = document.querySelector("input,textarea,select");
    if (focusable instanceof HTMLElement) {
      focusable.focus();
    }
    const afterFocusOverflow = Math.max(0, Math.ceil(root.scrollWidth - window.innerWidth));

    const tables = Array.from(document.querySelectorAll("table"));
    const tableScrollIssues = tables
      .map((table) => {
        const tableWidth = table.scrollWidth;
        let wrapper = table.parentElement;
        let hasHorizontalScrollContainer = false;
        let depth = 0;
        while (wrapper && depth < 4) {
          const style = window.getComputedStyle(wrapper);
          if (style.overflowX === "auto" || style.overflowX === "scroll") {
            hasHorizontalScrollContainer = true;
            break;
          }
          wrapper = wrapper.parentElement;
          depth += 1;
        }
        return { tableWidth, hasHorizontalScrollContainer };
      })
      .filter((item) => item.tableWidth > window.innerWidth && !item.hasHorizontalScrollContainer);

    let cartSidebar = null;
    if (currentScreenKey === "backoffice-preview-pos") {
      const section = document.querySelector("[data-cart-sidebar]");
      if (section) {
        section.scrollIntoView({ block: "center" });
        const rect = section.getBoundingClientRect();
        cartSidebar = {
          found: true,
          horizontallyVisible: rect.left >= 0 && rect.right <= window.innerWidth,
          width: Math.round(rect.width)
        };
      } else {
        cartSidebar = { found: false, horizontallyVisible: false, width: 0 };
      }
    }

    const pinModal = document.querySelector("[data-pin-approval-modal],dialog,[role='dialog']");
    const pinModalPresent = !!pinModal;
    let pinModalFitsViewport = false;
    if (pinModal) {
      const rect = pinModal.getBoundingClientRect();
      pinModalFitsViewport =
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= window.innerWidth &&
        rect.bottom <= window.innerHeight;
    }

    return {
      hasOverflow,
      overflowPx,
      touchTargets: {
        total: interactiveElements.length,
        smallCount: smallTargets.length,
        samples: smallTargets.slice(0, 10)
      },
      modals: {
        visibleCount: visibleModals.length,
        issues: modalIssues
      },
      keyboardLayout: {
        beforeOverflowPx: beforeFocusOverflow,
        afterOverflowPx: afterFocusOverflow,
        brokenByFocus: afterFocusOverflow > beforeFocusOverflow
      },
      tables: {
        count: tables.length,
        scrollIssues: tableScrollIssues.length
      },
      cartSidebar,
      pinModalPresent,
      pinModalFitsViewport
    };
  }, screenKey);
}

async function run() {
  await ensureDir(outputDir);
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const viewport of viewports) {
      const vpDir = path.join(outputDir, viewport.key);
      await ensureDir(vpDir);

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
        deviceScaleFactor: viewport.isMobile ? 2 : 1
      });

      for (const screen of screens) {
        const page = await context.newPage();
        await page.goto(screen.url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(1200);

        const metrics = await evaluateMetrics(page, screen.key);
        const screenshotPath = path.join(vpDir, `${slug(screen.key)}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        if (screen.key === "backoffice-preview-pos") {
          const pinTrigger = page.locator("[data-pin-open]").first();
          if ((await pinTrigger.count()) > 0) {
            await pinTrigger.click();
            await page.waitForTimeout(300);
            const modalMetrics = await evaluateMetrics(page, screen.key);
            metrics.pinModalCheck = {
              opened: modalMetrics.pinModalPresent,
              fitsViewport: modalMetrics.pinModalFitsViewport
            };
            const modalScreenshotPath = path.join(vpDir, `${slug(screen.key)}-pin-modal.png`);
            await page.screenshot({ path: modalScreenshotPath, fullPage: true });
          }
        }

        results.push({
          viewport: viewport.key,
          screen: screen.key,
          url: screen.url,
          screenshot: path.relative(path.resolve("."), screenshotPath).replaceAll("\\", "/"),
          metrics
        });

        await page.close();
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const reportPath = path.join(outputDir, "results.json");
  await fs.writeFile(reportPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`Saved: ${reportPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
