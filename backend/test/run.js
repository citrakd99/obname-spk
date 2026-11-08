/**
 * Uji backend tanpa Google (lihat gas-sim.js). Jalankan:  node backend/test/run.js
 */
const assert = require('assert');
const { createSim } = require('./gas-sim');
const sim = createSim();
const { X, sheets, props, cacheMap } = sim;
const sandbox = {};

const QS = 'kode-qs-rahasia', VIEW = 'kode-view-rahasia';
const call = sim.call;
const qs = (a, p) => call(QS, a, p), view = (a, p) => call(VIEW, a, p);
const ok = (r, msg) => { assert.ok(r.ok, (msg || '') + ' -> ' + JSON.stringify(r)); return r.data; };
const err = (r, code, msg) => { assert.strictEqual(r.ok, false, msg + ' harusnya gagal'); assert.strictEqual(r.error.code, code, msg + ' -> ' + JSON.stringify(r.error)); return r.error; };

let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log('  ok  ' + name); } catch (e) { console.log('  GAGAL  ' + name + '\n        ' + e.message); process.exitCode = 1; } };

/* ---------- data uji (sama dengan mockup) ---------- */
const ITEMS = [
  { no: 1, deskripsi: 'Galian & urugan pondasi', spesifikasi: 'Tanah padat 95%', vol_rab: 120, sat: 'm³', harga: 185000 },
  { no: 2, deskripsi: 'Pek. beton K-300 sloof', spesifikasi: 'Ready mix K-300', vol_rab: 36, sat: 'm³', harga: 1450000 },
  { no: 3, deskripsi: 'Pembesian sloof & kolom', spesifikasi: 'Besi ulir', vol_rab: 2400, sat: 'kg', harga: 16500 },
  { no: 4, deskripsi: 'Pas. dinding bata ringan', spesifikasi: 't=10 cm', vol_rab: 540, sat: 'm²', harga: 128000 },
  { no: 5, deskripsi: 'Plesteran & acian', spesifikasi: 'Tebal 15 mm', vol_rab: 980, sat: 'm²', harga: 62000 }
];
console.log('Backend Obname SPK');

test('belum ada kode akses -> NOT_CONFIGURED', () => { err(call('x', 'login'), 'NOT_CONFIGURED', 'tanpa props'); });

test('setup membuat semua tab, config default, 62 baris produktivitas, idempoten', () => {
  X.setup();
  Object.keys(X.TABLES).forEach(t => assert.ok(sheets[t], 'tab ' + t));
  assert.strictEqual(sheets.Produktivitas.rows.length, 63);
  const cfgRows = sheets.Config.rows.length;
  X.setup();
  assert.strictEqual(sheets.Config.rows.length, cfgRows);
  assert.strictEqual(sheets.Produktivitas.rows.length, 63);
  props.CODE_QS = QS; props.CODE_VIEW = VIEW;
});

test('login: kode salah ditolak, QS dan Viewer dikenali', () => {
  err(call('salah', 'login'), 'BAD_CODE', 'kode salah');
  assert.strictEqual(ok(qs('login')).role, 'qs');
  assert.strictEqual(ok(view('login')).role, 'view');
});

test('request rusak / aksi tak dikenal', () => {
  const bad = JSON.parse(sim.raw('{bukan json'));
  assert.strictEqual(bad.error.code, 'BAD_REQUEST');
  err(qs('hapusSemua'), 'UNKNOWN_ACTION', 'aksi asing');
});

test('Viewer ditolak untuk semua aksi tulis', () => {
  ['saveConfig', 'saveMandor', 'saveSpk', 'saveItem', 'importItems', 'createPeriod', 'savePeriodItems', 'finalizePeriod', 'unlockPeriod', 'saveMap', 'deleteItem', 'getLog', 'checkPeriod']
    .forEach(a => err(view(a, {}), 'FORBIDDEN', a));
});

test('saveConfig: validasi dan penyimpanan (tanggal kembali sebagai teks)', () => {
  err(qs('saveConfig', { values: { pctSpk: 150 } }), 'VALIDATION', 'pctSpk 150');
  err(qs('saveConfig', { values: { rahasia: 'x' } }), 'VALIDATION', 'key asing');
  err(qs('saveConfig', { values: { basis: 'median' } }), 'VALIDATION', 'basis');
  err(qs('saveConfig', { values: { start: '21/09/2026' } }), 'VALIDATION', 'format tanggal');
  ok(qs('saveConfig', { values: { project: 'Proyek Uji', owner: 'PT Owner Uji', start: '2026-09-21', sign1_name: 'Andi' } }));
  const b = ok(qs('bootstrap'));
  assert.strictEqual(b.config.project, 'Proyek Uji');
  assert.strictEqual(b.config.start, '2026-09-21');
  assert.strictEqual(Number(b.config.lembur), 50);
});

let m1, m2, spk1, spk2, bootstrapItems;
test('mandor, SPK (no "001" tetap teks), impor item + volume SPK 80%', () => {
  m1 = ok(qs('saveMandor', { nama: 'Mandor A' })).id; m2 = ok(qs('saveMandor', { nama: 'Mandor B' })).id;
  err(qs('saveMandor', { nama: '  ' }), 'VALIDATION', 'nama kosong');
  spk1 = ok(qs('saveSpk', { no_spk: '001', mandor_id: m1, pekerjaan: 'Sipil - Bld 4' })).id;
  spk2 = ok(qs('saveSpk', { no_spk: '002', mandor_id: m2, pekerjaan: 'Sipil - Bld 5' })).id;
  err(qs('saveSpk', { no_spk: '003', mandor_id: 'm_tidak_ada', pekerjaan: 'x' }), 'NOT_FOUND', 'mandor fiktif');
  assert.strictEqual(ok(qs('importItems', { spk_id: spk1, rows: ITEMS })).imported, 5);
  assert.strictEqual(ok(qs('importItems', { spk_id: spk2, rows: ITEMS })).imported, 5);
  err(qs('importItems', { spk_id: spk1, rows: [ITEMS[0], ITEMS[0]] }), 'VALIDATION', 'no ganda');
  err(qs('importItems', { spk_id: spk1, rows: [{ ...ITEMS[0], harga: -1 }] }), 'VALIDATION', 'harga negatif');
  const b = ok(qs('bootstrap'));
  bootstrapItems = b.items.filter(i => i.spk_id === spk1).sort((a, c) => a.no - c.no);
  assert.deepStrictEqual(bootstrapItems.map(i => i.vol_spk), [96, 28.8, 1920, 432, 784]);
  assert.strictEqual(b.spk.find(s => s.id === spk1).no_spk, '001');
});

let p1, p2;
test('createPeriod tanpa "Mulai periode #1" -> pesan jelas, bukan SERVER_ERROR', () => {
  const m = ok(qs('saveMandor', { nama: 'Mandor Uji Start' })).id;
  const sp = ok(qs('saveSpk', { no_spk: '900', mandor_id: m, pekerjaan: 'x' })).id;
  const cur = ok(qs('bootstrap')).config.start;
  // kosongkan start langsung di sheet (aplikasi melarang mengubah setelah periode ada)
  const rows = sheets.Config.rows; const r = rows.find(x => x[0] === 'start'); const keep = r[1]; r[1] = '';
  err(qs('createPeriod', { spk_id: sp }), 'CONFIG_MISSING', 'start kosong');
  r[1] = keep; assert.strictEqual(ok(qs('bootstrap')).config.start, cur);
});

test('periode: #1 Tracking mulai dari config.start, #2 Forecast, tanggal 14 hari berurutan', () => {
  const a = ok(qs('createPeriod', { spk_id: spk1 }));
  assert.deepStrictEqual([a.no_ke, a.status, a.tgl_mulai, a.tgl_akhir], [1, 'Tracking', '2026-09-21', '2026-10-04']);
  const b = ok(qs('createPeriod', { spk_id: spk1 }));
  assert.deepStrictEqual([b.no_ke, b.status, b.tgl_mulai, b.tgl_akhir], [2, 'Forecast', '2026-10-05', '2026-10-18']);
  p1 = a.id; p2 = b.id;
});

test('savePeriodItems: tolak aktual > sisa, negatif, item asing, aktual saat Forecast', () => {
  const id = i => bootstrapItems[i].id;
  const e1 = err(qs('savePeriodItems', { periode_id: p1, rows: [{ item_id: id(0), vol_aktual: 97 }] }), 'VALIDATION', 'melebihi');
  assert.ok(/melebihi sisa 96/.test(e1.details[0]));
  err(qs('savePeriodItems', { periode_id: p1, rows: [{ item_id: id(0), vol_aktual: -1 }] }), 'VALIDATION', 'negatif');
  err(qs('savePeriodItems', { periode_id: p1, rows: [{ item_id: 'it_x', vol_aktual: 1 }] }), 'VALIDATION', 'item asing');
  err(qs('savePeriodItems', { periode_id: p2, rows: [{ item_id: id(0), vol_aktual: 1 }] }), 'VALIDATION', 'aktual di periode Forecast');
});

test('Final Check: data kosong -> hanya peringatan; aktual valid tersimpan', () => {
  const id = i => bootstrapItems[i].id;
  ok(qs('savePeriodItems', { periode_id: p1, rows: [
    { item_id: id(0), vol_aktual: 48, vol_forecast: 50 }, { item_id: id(1), vol_aktual: 10 },
    { item_id: id(2), vol_aktual: 600 }, { item_id: id(3), vol_aktual: 90 }] }));
  const c = ok(qs('checkPeriod', { periode_id: p1 }));
  assert.strictEqual(c.checks.blockers.length, 0);
  assert.ok(c.checks.warnings.some(w => /Item 5: belum ada/.test(w)));
  assert.strictEqual(c.report.total, 44800000);
  assert.strictEqual(c.report.retensi, 2240000);
  assert.strictEqual(c.report.grand_total, 42560000);
});

test('finalize: wajib ack; periode berikutnya tidak bisa difinalkan lebih dulu', () => {
  err(qs('finalizePeriod', { periode_id: p1 }), 'ACK_REQUIRED', 'tanpa ack');
  err(qs('startTracking', { periode_id: p2 }), 'BAD_STATE', 'masih ada Tracking #1');
  err(qs('finalizePeriod', { periode_id: p2, ack: true }), 'BAD_STATE', 'p2 masih Forecast');
});

test('finalize #1: status Final, snapshot total/retensi, terkunci', () => {
  const r = ok(qs('finalizePeriod', { periode_id: p1, ack: true }));
  assert.strictEqual(r.report.grand_total, 42560000);
  assert.ok(r.warnings.length >= 1);
  const per = ok(qs('bootstrap')).periods.find(p => p.id === p1);
  assert.strictEqual(per.status, 'Final'); assert.strictEqual(Number(per.grand_total), 42560000);
  assert.strictEqual(Number(per.retensi_pct), 5); assert.ok(per.finalized_at);
  err(qs('savePeriodItems', { periode_id: p1, rows: [{ item_id: bootstrapItems[0].id, vol_aktual: 1 }] }), 'BAD_STATE', 'edit Final');
  err(qs('finalizePeriod', { periode_id: p1, ack: true }), 'BAD_STATE', 'final dua kali');
  err(qs('deletePeriod', { periode_id: p1 }), 'BAD_STATE', 'hapus Final');
});

test('data Final terlindungi: harga/persen SPK/hapus item/tanggal mulai', () => {
  const it = bootstrapItems[0];
  err(qs('saveItem', { ...it, harga: 999 }), 'ITEM_LOCKED', 'ubah harga');
  ok(qs('saveItem', { ...it, spesifikasi: 'Tanah padat 98%' }), 'ubah teks boleh');
  err(qs('saveConfig', { values: { pctSpk: 70 } }), 'CONFIG_LOCKED', 'persen SPK');
  err(qs('saveConfig', { values: { start: '2026-10-01' } }), 'CONFIG_LOCKED', 'start');
  err(qs('deleteItem', { id: it.id }), 'ITEM_LOCKED', 'hapus item terpakai');
  err(qs('importItems', { spk_id: spk1, rows: [ITEMS[0]] }), 'ITEM_LOCKED', 'impor ulang');
  ok(qs('saveConfig', { values: { ret: 4 } }), 'retensi masa depan boleh');
  ok(qs('saveConfig', { values: { ret: 5 } }));
});

test('periode #2: vol sebelumnya dari #1 Final, sisa berkurang, aktual > sisa ditolak', () => {
  ok(qs('startTracking', { periode_id: p2 }));
  const c = ok(qs('checkPeriod', { periode_id: p2 })).report.rows;
  assert.deepStrictEqual(c.map(r => r.vol_sebelumnya), [48, 10, 600, 90, 0]);
  assert.deepStrictEqual(c.map(r => r.sisa), [48, 18.8, 1320, 342, 784]);
  err(qs('savePeriodItems', { periode_id: p2, rows: [{ item_id: bootstrapItems[0].id, vol_aktual: 49 }] }), 'VALIDATION', '49 > 48');
  ok(qs('savePeriodItems', { periode_id: p2, rows: [{ item_id: bootstrapItems[0].id, vol_aktual: 20 }] }));
});

test('retensi snapshot: ubah % retensi tidak mengubah periode Final lama', () => {
  ok(qs('saveConfig', { values: { ret: 10 } }));
  const r = ok(qs('getReport', { periode_id: p1 })).report;
  assert.strictEqual(r.retensi_pct, 5); assert.strictEqual(r.grand_total, 42560000);
  ok(qs('saveConfig', { values: { ret: 5 } }));
});

test('getReport: header + penandatangan dari Pengaturan; Viewer hanya Final', () => {
  const r = ok(view('getReport', { periode_id: p1 }));
  assert.deepStrictEqual([r.header.project, r.header.owner, r.header.no_spk, r.header.mandor, r.header.status],
    ['Proyek Uji', 'PT Owner Uji', '001', 'Mandor A', 'Final']);
  assert.deepStrictEqual(r.sign[0], ['Project Manager', 'Andi']);
  assert.deepStrictEqual(r.sign[3], ['Mandor', 'Mandor A']);
  err(view('getReport', { periode_id: p2 }), 'FORBIDDEN', 'viewer lihat draft');
  ok(qs('getReport', { periode_id: p2 }), 'QS boleh lihat draft');
});

test('buka kunci: hanya Final paling akhir, wajib alasan, tercatat di Log', () => {
  ok(qs('finalizePeriod', { periode_id: p2, ack: true }));
  err(qs('unlockPeriod', { periode_id: p1, reason: 'koreksi volume' }), 'BAD_STATE', 'bukan yang terakhir');
  err(qs('unlockPeriod', { periode_id: p2, reason: '' }), 'VALIDATION', 'tanpa alasan');
  ok(qs('unlockPeriod', { periode_id: p2, reason: 'salah input item 1' }));
  assert.strictEqual(ok(qs('bootstrap')).periods.find(p => p.id === p2).status, 'Tracking');
  const log = ok(qs('getLog', { limit: 5 }));
  assert.strictEqual(log[0].aksi, 'unlockPeriod'); assert.ok(/salah input item 1/.test(log[0].detail));
});

test('hapus periode: hanya yang paling akhir dan belum Final', () => {
  const p3 = ok(qs('createPeriod', { spk_id: spk1 })).id;
  err(qs('deletePeriod', { periode_id: p2 }), 'BAD_STATE', 'bukan yang paling akhir');
  ok(qs('deletePeriod', { periode_id: p3 }));
  assert.ok(!ok(qs('bootstrap')).periods.some(p => p.id === p3));
});

test('manpower: sama dengan mockup (12 orang jam normal, 9 orang dengan lembur)', () => {
  const items2 = ok(qs('bootstrap')).items.filter(i => i.spk_id === spk2).sort((a, c) => a.no - c.no);
  const pid = ok(qs('createPeriod', { spk_id: spk2 })).id;
  const fc = [24, 8, 700, 120, 150];
  ok(qs('savePeriodItems', { periode_id: pid, rows: items2.map((it, i) => ({ item_id: it.id, vol_forecast: fc[i] })) }));
  const refs = [['Galian Tanah Biasa (Manual)', 0], ['Cor Beton Manual (Molen)', 0], ['Pemasangan Besi / Rakit di Lokasi', 10], ['Pasang Bata Ringan (Hebel)', 0], ['Plesteran Dinding (Tebal 15-20mm)', 20]];
  refs.forEach(([ref, koef], i) => ok(qs('saveMap', { item_id: items2[i].id, ref, koef })));
  err(qs('saveMap', { item_id: items2[0].id, ref: 'Pekerjaan Fiktif', koef: 0 }), 'NOT_FOUND', 'acuan fiktif');
  err(qs('saveMap', { item_id: items2[0].id, ref: refs[0][0], koef: 80 }), 'VALIDATION', 'koef > 60');
  const normal = ok(view('manpower', { periode_id: pid }));
  assert.strictEqual(normal.puncak, 12);
  assert.deepStrictEqual(normal.per_jabatan, { Pekerja: 2, Tukang: 5, Kenek: 5 });
  assert.strictEqual(normal.hari_kerja, 14);
  const lembur = ok(view('manpower', { periode_id: pid, ot: true }));
  assert.strictEqual(lembur.puncak, 9);
  assert.deepStrictEqual(lembur.per_jabatan, { Pekerja: 1, Tukang: 4, Kenek: 4 });
  assert.strictEqual(lembur.jam_per_hari, 12);
  const i1n = normal.items[0], i1o = lembur.items[0];
  assert.ok(Math.abs(i1n.regu / i1o.regu - 1.5) < 1e-9, 'lembur 50% = kapasitas x1,5');
  assert.ok(Math.abs(i1n.hari_orang - 19.2) < 1e-9);
});

test('manpower: koefisien kesulitan menaikkan kebutuhan; item tanpa acuan diberi error', () => {
  const prod = {}; X.PRODUKTIVITAS_SEED.forEach(r => { prod[r[1]] = { komposisi: r[2], kap_min: r[3], kap_max: r[4], satuan: r[5] }; });
  const cfg = { jam: 8, hariMg: 7, lembur: 50, basis: 'avg' };
  const line = k => [{ item_id: 'a', no: 1, deskripsi: 'x', sat: 'm³', vol: 24, ref: 'Galian Tanah Biasa (Manual)', koef: k }];
  const a = X.manpower_(line(0), prod, cfg, false).items[0].regu, b = X.manpower_(line(30), prod, cfg, false).items[0].regu;
  assert.ok(Math.abs(b / a - 1 / 0.7) < 1e-9);
  const miss = X.manpower_([{ item_id: 'b', no: 2, deskripsi: 'y', sat: 'm²', vol: 5, ref: undefined, koef: 0 }], prod, cfg, false);
  assert.ok(miss.items[0].error); assert.strictEqual(miss.puncak, 0);
  const sat = X.manpower_([{ item_id: 'c', no: 3, deskripsi: 'z', sat: 'kg', vol: 5, ref: 'Galian Tanah Biasa (Manual)', koef: 0 }], prod, cfg, false);
  assert.strictEqual(sat.items[0].satuan_cocok, false);
});

test('kunci percobaan: 10 kode salah -> LOCKED (kode benar pun ditolak sementara)', () => {
  for (let i = 0; i < 10; i++) err(call('tebak' + i, 'login'), 'BAD_CODE', 'tebakan ' + i);
  err(qs('login'), 'LOCKED', 'terkunci');
  delete cacheMap.fails;
  assert.strictEqual(ok(qs('login')).role, 'qs');
});

test('web/logic.js identik dengan backend/Logic.gs (rumus server = rumus aplikasi)', () => {
  const fs = require('fs'), path = require('path');
  const a = fs.readFileSync(path.join(__dirname, '..', 'Logic.gs'), 'utf8');
  const b = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'logic.js'), 'utf8').split('\n').slice(1).join('\n'); // buang baris judul "SALINAN OTOMATIS"
  assert.strictEqual(b, a, 'jalankan: node web/sync-logic.js');
});

test('integritas: tidak ada baris tanpa id/duplikat id', () => {
  ['Mandor', 'SPK', 'SPK_Items', 'Periode'].forEach(t => {
    const ids = sheets[t].rows.slice(1).map(r => r[0]);
    assert.strictEqual(new Set(ids).size, ids.length, t);
    ids.forEach(x => assert.ok(x));
  });
});

console.log(`\n${n} tes lulus` + (process.exitCode ? ', ADA YANG GAGAL' : ''));
