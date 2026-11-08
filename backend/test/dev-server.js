/**
 * Server demo LOKAL: menyajikan folder pwa/ dan meniru endpoint Apps Script di POST /exec
 * memakai kode .gs asli + sheet tiruan (data hilang saat server dimatikan).
 * Jalankan:  node backend/test/dev-server.js        (port 8787, atau PORT=...)
 * Kode demo: QS = QS-DEMO , Viewer = VIEW-DEMO   (hanya untuk lokal)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { createSim } = require('./gas-sim');

const sim = createSim();
sim.X.setup();
sim.props.CODE_QS = 'QS-DEMO'; sim.props.CODE_VIEW = 'VIEW-DEMO';
const qs = (a, p) => { const r = sim.call('QS-DEMO', a, p); if (!r.ok) throw new Error(a + ': ' + JSON.stringify(r.error)); return r.data; };

if (process.env.SEED !== '0') {
  // data contoh (placeholder netral) supaya PWA langsung bisa dicoba
  qs('saveConfig', { values: { project: 'Proyek Contoh', owner: 'Owner Contoh', start: '2026-09-21', sign1_name: 'Nama PM', sign2_name: 'Nama Direktur', sign3_name: 'Nama Pihak Mengetahui' } });
  const m1 = qs('saveMandor', { nama: 'Mandor A' }).id, m2 = qs('saveMandor', { nama: 'Mandor B' }).id;
  const spk1 = qs('saveSpk', { no_spk: '001', mandor_id: m1, pekerjaan: 'Sipil - Building 4' }).id;
  qs('saveSpk', { no_spk: '002', mandor_id: m2, pekerjaan: 'Sipil - Building 5' });
  const items = [
    { no: 1, deskripsi: 'Galian & urugan pondasi', spesifikasi: 'Tanah padat 95%', vol_rab: 120, sat: 'm³', harga: 185000 },
    { no: 2, deskripsi: 'Pek. beton K-300 sloof', spesifikasi: 'Ready mix K-300', vol_rab: 36, sat: 'm³', harga: 1450000 },
    { no: 3, deskripsi: 'Pembesian sloof & kolom', spesifikasi: 'Besi ulir D13/D10', vol_rab: 2400, sat: 'kg', harga: 16500 },
    { no: 4, deskripsi: 'Pas. dinding bata ringan', spesifikasi: 't=10 cm, spesi MU', vol_rab: 540, sat: 'm²', harga: 128000 },
    { no: 5, deskripsi: 'Plesteran & acian', spesifikasi: 'Tebal 15 mm', vol_rab: 980, sat: 'm²', harga: 62000 }
  ];
  qs('importItems', { spk_id: spk1, rows: items });
  const its = qs('bootstrap').items.filter(i => i.spk_id === spk1).sort((a, b) => a.no - b.no);
  const p1 = qs('createPeriod', { spk_id: spk1 }).id;
  qs('savePeriodItems', { periode_id: p1, rows: its.map((it, i) => ({ item_id: it.id, vol_aktual: [48, 10, 600, 90, 0][i], vol_forecast: [50, 10, 600, 90, 0][i] })) });
  qs('finalizePeriod', { periode_id: p1, ack: true });
  const p2 = qs('createPeriod', { spk_id: spk1 }).id;
  qs('savePeriodItems', { periode_id: p2, rows: its.map((it, i) => ({ item_id: it.id, vol_forecast: [24, 8, 700, 120, 150][i], vol_aktual: [20, 6, 500, 100, 0][i] })) });
  qs('createPeriod', { spk_id: spk1 });
  [['Galian Tanah Biasa (Manual)', 0], ['Cor Beton Manual (Molen)', 0], ['Pemasangan Besi / Rakit di Lokasi', 10], ['Pasang Bata Ringan (Hebel)', 0], ['Plesteran Dinding (Tebal 15-20mm)', 20]]
    .forEach(([ref, koef], i) => qs('saveMap', { item_id: its[i].id, ref, koef }));
}

const root = path.join(__dirname, '..', '..', 'pwa');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (url.pathname === '/exec') {
    if (req.method === 'GET') { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); return res.end('{"ok":true,"service":"obname-spk","dev":true}'); }
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(sim.raw(body)); });
    return;
  }
  let f = path.normalize(path.join(root, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}).listen(process.env.PORT || 8787, () => console.log('Demo di http://localhost:' + (process.env.PORT || 8787) + '  (QS-DEMO / VIEW-DEMO)  API: /exec'));
