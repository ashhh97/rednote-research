import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const authDir = path.resolve(process.env.XHS_AUTH_DIR || "xhs-auth-test");
const storageStatePath = path.join(authDir, "storage-state.json");
const waitMs = Number(process.argv.find((arg) => arg.startsWith("--wait="))?.split("=")[1] || 300000);
const browserPath = process.env.XHS_BROWSER_PATH || "";
const webOrigin = process.env.XHS_WEB_ORIGIN || "https://www.rednote.com";

await mkdir(authDir, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  ...(browserPath ? { executablePath: browserPath } : {}),
  args: ["--disable-blink-features=AutomationControlled"]
});

const context = await browser.newContext({
  viewport: { width: 1365, height: 900 },
  locale: "zh-CN",
  ...(existsSync(storageStatePath) ? { storageState: storageStatePath } : {}),
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
});

const page = await context.newPage();
await page.goto(`${webOrigin}/explore`, { waitUntil: "commit", timeout: 30000 }).catch(() => {});
await page.waitForTimeout(3000);
await clickLoginButton(page);

const start = Date.now();
let authStatus = await getAuthStatus(page).catch((error) => ({ error: error.message }));
let lastProgressAt = 0;
let domUsableSince = 0;
while (Date.now() - start < waitMs) {
  authStatus = await getAuthStatus(page).catch((error) => ({ error: error.message }));
  const domLoggedIn = await isDomLoggedIn(page).catch(() => false);
  if (domLoggedIn && authStatus.guest !== true && !domUsableSince) domUsableSince = Date.now();
  if (!domLoggedIn || authStatus.guest === true) domUsableSince = 0;
  const domUsableLongEnough = domUsableSince && Date.now() - domUsableSince > 12000;

  if (authStatus.loggedIn || domUsableLongEnough) {
    await context.storageState({ path: storageStatePath });
    console.log(JSON.stringify({
      ok: true,
      authDir,
      storageStatePath,
      authStatus: {
        ...authStatus,
        loggedIn: authStatus.loggedIn,
        domLoggedIn,
        usableByDom: Boolean(domUsableLongEnough)
      },
      message: authStatus.loggedIn
        ? "登录态已保存，可以运行 scripts/test-xhs.js 采集详情。"
        : "页面已保持登录可用，但 user/me 接口未返回完整身份；已保存状态，请用 scripts/test-xhs.js 实测详情采集。"
    }, null, 2));
    await browser.close();
    process.exit(0);
  }
  if (Date.now() - lastProgressAt > 15000) {
    lastProgressAt = Date.now();
    console.log(JSON.stringify({
      waiting: true,
      elapsedSeconds: Math.round((Date.now() - start) / 1000),
      authStatus,
      domLoggedIn,
      domUsableSeconds: domUsableSince ? Math.round((Date.now() - domUsableSince) / 1000) : 0,
      note: domLoggedIn && authStatus.guest === true ? "页面出现“我”但接口仍是游客态，不能算登录成功。" : undefined
    }));
  }
  await page.waitForTimeout(3000);
}

await context.storageState({ path: storageStatePath }).catch(() => {});
const domLoggedIn = await isDomLoggedIn(page).catch(() => false);
console.log(JSON.stringify({
  ok: false,
  authDir,
  storageStatePath,
  authStatus: { ...authStatus, domLoggedIn },
  message: "等待超时，仍未检测到有效登录态。请确认页面没有安全限制或登录失败提示。"
}, null, 2));
await browser.close();
process.exit(1);

async function clickLoginButton(page) {
  for (const selector of ["button:has-text('登录')", "text=登录", ".login-btn", "[class*='login']"]) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible({ timeout: 1500 }).catch(() => false)) {
      await locator.click({ timeout: 3000 }).catch(() => {});
      return;
    }
  }
}

async function getAuthStatus(page) {
  return page.evaluate(async () => {
    const endpoints = [
      "https://webapi.rednote.com/api/sns/web/v2/user/me",
      "https://edith.xiaohongshu.com/api/sns/web/v2/user/me"
    ];
    const attempts = [];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { credentials: "include" });
        const json = await response.json();
        const data = json?.data || {};
        const hasGuest = Object.prototype.hasOwnProperty.call(data, "guest");
        const hasIdentity = Boolean(data.user_id || data.nickname || data.red_id);
        const status = {
          endpoint,
          checked: true,
          loggedIn: data.guest === false && hasIdentity,
          guest: hasGuest ? data.guest : null,
          userId: data.user_id || "",
          nickname: data.nickname || "",
          redId: data.red_id || ""
        };
        attempts.push(status);
        if (status.loggedIn) return { ...status, attempts };
      } catch (error) {
        attempts.push({ endpoint, error: error.message });
      }
    }
    const best = attempts.find((attempt) => attempt.checked) || { checked: false, loggedIn: false, guest: null, userId: "", nickname: "" };
    return { ...best, attempts };
  });
}

async function isDomLoggedIn(page) {
  return page.locator("text=我").first().isVisible({ timeout: 1000 }).catch(() => false);
}
