import { createServer } from 'http';
import { readFileSync, statSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { chromium, devices } from 'playwright';

const PORT = 4399;
const DIST_DIR = join(process.cwd(), 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Simple static file server
const server = createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  if (!extname(urlPath)) {
    if (existsSync(join(DIST_DIR, urlPath + '.html'))) {
      urlPath += '.html';
    } else if (existsSync(join(DIST_DIR, urlPath, 'index.html'))) {
      urlPath = join(urlPath, 'index.html');
    }
  }

  const filePath = join(DIST_DIR, urlPath);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(readFileSync(filePath));
});

server.listen(PORT, async () => {
  console.log(`Test server running at http://localhost:${PORT}`);

  try {
    let browser;
    try {
      browser = await chromium.launch({ headless: true, channel: 'chrome' });
    } catch {
      browser = await chromium.launch({ headless: true, channel: 'msedge' });
    }
    
    // Simulate Samsung Galaxy A55: 360 x 800 viewport, 3.0 dpr, mobile userAgent
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
      deviceScaleFactor: 3.0,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A556B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
    });

    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Evaluate viewport metrics
    const metrics = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const h1FontSize = h1 ? window.getComputedStyle(h1).fontSize : null;
      const bodyFontSize = window.getComputedStyle(document.body).fontSize;
      const ctaBtn = document.querySelector('button.btn-monochrome-primary');
      const ctaHeight = ctaBtn ? ctaBtn.getBoundingClientRect().height : null;
      const ctaWidth = ctaBtn ? ctaBtn.getBoundingClientRect().width : null;

      return {
        innerWidth: window.innerWidth,
        outerWidth: window.outerWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
        h1FontSize,
        bodyFontSize,
        ctaHeight,
        ctaWidth,
        isOverflowing: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    console.log('Mobile Viewport Metrics:', JSON.stringify(metrics, null, 2));

    const screenshotPath = join(DIST_DIR, 'mobile-screenshot-a55-full.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved full page screenshot to ${screenshotPath}`);

    await browser.close();

    if (metrics.isOverflowing) {
      console.error('FAIL: Page has horizontal overflow on 360px mobile viewport!');
      process.exitCode = 1;
    } else {
      console.log('PASS: Page successfully rendered in mobile viewport without horizontal overflow.');
    }
  } catch (err) {
    console.error('Playwright Test Failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
