import puppeteer from "puppeteer";
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r=>setTimeout(r, 1000));
await page.select('#schema-select', '1');
await new Promise(r=>setTimeout(r, 3000));
await page.screenshot({ path: 'debug_loaded.png', fullPage: true });
await browser.close();
