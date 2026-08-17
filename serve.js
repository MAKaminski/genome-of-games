// Local preview: node serve.js  ->  http://localhost:3000
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, 'out');
const MIME = { '.html':'text/html;charset=utf-8', '.css':'text/css', '.js':'text/javascript',
  '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.xml':'application/xml', '.txt':'text/plain' };
http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(ROOT, u);
  if (!path.extname(f)) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { f = path.join(ROOT, '404.html'); res.writeHead(404, {'Content-Type':'text/html'}); }
  else res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(3000, () => console.log('→ http://localhost:3000'));
