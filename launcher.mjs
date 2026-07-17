import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8765;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
};

const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.error(`[launcher] Static server on http://localhost:${PORT}`);
});

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader', '--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle0' });

    await page.waitForFunction(
        () => {
            const t = document.querySelector('div') || {};
            return document.body.innerText.includes('bridge connected');
        },
        { timeout: 30000 }
    ).catch(() => console.error('[launcher] timeout waiting for bridge — continuing anyway'));

    console.error('[launcher] Browser launched, game page loaded, bridge should be connected');
})();
