import http from 'node:http';
import { readFile } from 'node:fs/promises';
import stock from '../api/stock.js';
import login from '../api/login.js';
const assets = { '/stock-import-template.csv': ['stock-import-template.csv','text/csv'], '/premium.css': ['premium.css', 'text/css'], '/pijithet-logo.png': ['pijithet-logo.png', 'image/png'], '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/theme.js': ['theme.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'] };
http.createServer(async (req, res) => {
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); };
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/stock' || pathname === '/api/login') {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 512 * 1024) { res.status(413).json({ ok: false, message: 'ข้อมูลเกิน 512 KB' }); return; } chunks.push(chunk); }
      req.body = Buffer.concat(chunks).toString('utf8');
      return await (pathname === '/api/stock' ? stock : login)(req, res);
    }
    const asset = assets[pathname];
    if (!asset) { res.statusCode = 404; res.end('Not found'); return; }
    res.setHeader('Content-Type', asset[1] + (asset[1].startsWith('text/') ? '; charset=utf-8' : ''));
    res.end(await readFile(new URL('../public/' + asset[0], import.meta.url)));
  } catch { res.status(500).json({ ok: false, message: 'Local server error' }); }
}).listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log('http://localhost:' + (process.env.PORT || 3000)));
