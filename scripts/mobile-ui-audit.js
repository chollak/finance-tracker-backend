#!/usr/bin/env node
/*
 * Mobile UI screenshot audit for Finance Tracker Mini App.
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3000 npm run design:audit
 *   VIEWPORT_WIDTH=390 VIEWPORT_HEIGHT=844 npm run design:audit
 *   AUTH_MODE=telegram TELEGRAM_USER_ID=131184740 npm run design:audit
 *   ROUTES=/transactions/add,/budgets/add,/debts/add npm run design:audit
 *   SCROLL_TO=bottom npm run design:audit
 *
 * The script expects a running app. It does not start servers.
 * Playwright is resolved from project deps, PLAYWRIGHT_REQUIRE_PATH, or Hermes' npx cache.
 */

const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  const candidates = [
    'playwright',
    process.env.PLAYWRIGHT_REQUIRE_PATH,
    '/home/shukur/.npm/_npx/e41f203b7505f1fb/node_modules/playwright',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_error) {
      // Try the next candidate.
    }
  }

  throw new Error(
    'Playwright package not found. Install it or set PLAYWRIGHT_REQUIRE_PATH to a Playwright module path.'
  );
}

const { chromium } = loadPlaywright();

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3000';
const width = Number(process.env.VIEWPORT_WIDTH || 390);
const height = Number(process.env.VIEWPORT_HEIGHT || 844);
const authMode = process.env.AUTH_MODE || 'guest';
const telegramUserId = process.env.TELEGRAM_USER_ID || '597843119';
const telegramUserName = process.env.TELEGRAM_USER_NAME || 'Design QA';
const scrollTo = process.env.SCROLL_TO || 'top';
const outDir = process.env.OUT_DIR || path.resolve(process.cwd(), 'tmp/mobile-ui-audit');

const defaultRoutes = [
  { name: 'home', path: '/' },
  { name: 'transactions', path: '/transactions' },
  { name: 'budgets', path: '/budgets' },
  { name: 'debts', path: '/debts' },
  { name: 'more', path: '/more' },
  { name: 'add-transaction', path: '/transactions/add' },
  { name: 'add-budget', path: '/budgets/add' },
  { name: 'add-debt', path: '/debts/add' },
  { name: 'analytics', path: '/analytics' },
];

const requestedPaths = (process.env.ROUTES || '')
  .split(',')
  .map((routePath) => routePath.trim())
  .filter(Boolean);
const routes = requestedPaths.length
  ? defaultRoutes.filter((route) => requestedPaths.includes(route.path) || requestedPaths.includes(route.name))
  : defaultRoutes;

if (requestedPaths.length && routes.length !== requestedPaths.length) {
  const known = defaultRoutes.flatMap((route) => [route.path, route.name]).join(', ');
  throw new Error(`Unknown ROUTES entry. Requested: ${requestedPaths.join(', ')}. Known: ${known}`);
}

function rect(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: Math.round(r.x * 10) / 10,
    y: Math.round(r.y * 10) / 10,
    w: Math.round(r.width * 10) / 10,
    h: Math.round(r.height * 10) / 10,
  };
}

(async () => {
  fs.mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const route of routes) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    if (authMode === 'telegram') {
      await page.addInitScript(({ userId, userName }) => {
        window.localStorage.setItem(
          'finance-tracker-user',
          JSON.stringify({
            state: {
              userId,
              userName,
              userType: 'telegram',
              telegramId: userId,
            },
            version: 0,
          })
        );
      }, { userId: telegramUserId, userName: telegramUserName });

      // Browser screenshots run outside Telegram, so there is no real initData.
      // Add the dev auth header at the network layer to avoid false 401s while
      // still keeping the token out of logs and screenshots.
      await page.route('**/api/**', async (routeRequest) => {
        const request = routeRequest.request();
        await routeRequest.continue({
          headers: {
            ...request.headers(),
            'x-dev-user-id': telegramUserId,
          },
        });
      });
    }

    const consoleErrors = [];
    const badResponses = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('response', (res) => {
      const url = res.url();
      if (res.status() >= 400 && !url.includes('favicon') && !url.includes('manifest')) {
        badResponses.push(`${res.status()} ${url}`);
      }
    });

    const url = `${baseUrl}${route.path}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(700);

    if (scrollTo === 'bottom') {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
    } else if (scrollTo !== 'top') {
      throw new Error(`Unsupported SCROLL_TO value: ${scrollTo}`);
    }

    const screenshot = path.join(outDir, 'screenshots', `${route.name}-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });

    const metrics = await page.evaluate((routeName) => {
      const rectOf = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x * 10) / 10,
          y: Math.round(r.y * 10) / 10,
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
        };
      };

      const navButton = document.querySelector('nav button[aria-label="Добавить транзакцию"]');
      const navButtonRect = navButton ? rectOf('nav button[aria-label="Добавить транзакцию"]') : null;

      const actions = [...document.querySelectorAll('button,a')].map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
          aria: el.getAttribute('aria-label'),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          pos: cs.position,
          display: cs.display,
        };
      }).filter((item) => item.pos === 'fixed' || item.y > innerHeight - 150);

      return {
        routeName,
        path: location.pathname,
        viewport: { w: innerWidth, h: innerHeight },
        scroll: {
          y: scrollY,
          h: document.documentElement.scrollHeight,
          canScroll: document.documentElement.scrollHeight > innerHeight + 2,
        },
        h1: rectOf('h1'),
        tabList: rectOf('[role="tablist"]'),
        navButton: navButtonRect && {
          ...navButtonRect,
          centerX: navButtonRect.x + navButtonRect.w / 2,
          viewportCenterX: innerWidth / 2,
        },
        navLabels: [...document.querySelectorAll('nav span')].map((el) => el.textContent),
        bottomActions: actions,
      };
    }, route.name);

    results.push({ route, url, screenshot, consoleErrors, badResponses, metrics });
    await page.close();
  }

  await browser.close();

  const metricsPath = path.join(outDir, 'metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify(results, null, 2));

  const summary = results.map((result) => ({
    route: result.route.path,
    screenshot: result.screenshot,
    consoleErrors: result.consoleErrors.length,
    badResponses: result.badResponses,
    h1: result.metrics.h1,
    tabList: result.metrics.tabList,
    navButton: result.metrics.navButton,
    scroll: result.metrics.scroll,
  }));

  const issueCount = results.reduce(
    (count, result) => count + result.consoleErrors.length + result.badResponses.length,
    0
  );

  console.log(JSON.stringify({ baseUrl, viewport: { width, height }, authMode, scrollTo, outDir, metricsPath, issueCount, summary }, null, 2));

  if (issueCount > 0) {
    process.exitCode = 1;
  }
})();
