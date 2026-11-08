/**
 * Obname SPK API (Google Apps Script Web App).
 *
 * Permintaan : POST  Content-Type: text/plain  body JSON {"code":"...","action":"...","payload":{...}}
 * Jawaban    : {"ok":true,"role":"qs|view","data":...}  atau  {"ok":false,"error":{"code","message","details"}}
 *
 * Peran ditentukan KODE AKSES yang disimpan di Script Properties (CODE_QS, CODE_VIEW).
 * Kode tidak ada di frontend; server mencocokkannya pada setiap permintaan.
 */
const API_VERSION = '1.1.0'; // naikkan setiap ada perubahan API; aplikasi web memeriksa versi minimum
const MAX_FAILS = 10;           // gagal login berturut-turut sebelum dikunci
const LOCK_SECONDS = 600;       // lama kunci (10 menit)

function apiError_(code, message, details) {
  const e = new Error(message);
  e.isApi = true; e.code = code; e.details = details;
  return e;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(code, message, details) {
  return { ok: false, error: { code: code, message: message, details: details || null } };
}

function doGet() { return json_({ ok: true, service: 'obname-spk', version: API_VERSION }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return json_(fail_('BAD_REQUEST', 'Body bukan JSON yang valid')); }

  const auth = authenticate_(req.code);
  if (!auth.ok) return json_(auth);

  const def = ACTIONS[req.action] || (typeof HARIAN_ACTIONS !== 'undefined' ? HARIAN_ACTIONS[req.action] : undefined);
  if (!def) return json_(fail_('UNKNOWN_ACTION', 'Aksi tidak dikenal: ' + req.action));
  if (def.roles.indexOf(auth.role) < 0) return json_(fail_('FORBIDDEN', 'Peran "' + auth.role + '" tidak boleh menjalankan ' + req.action));

  try {
    const run = function () { return def.fn(req.payload || {}, auth); };
    const data = def.write ? withLock_(run) : run();
    return json_({ ok: true, role: auth.role, data: data });
  } catch (err) {
    if (err && err.isApi) return json_(fail_(err.code, err.message, err.details));
    console.error(err && err.stack ? err.stack : err);
    return json_(fail_('SERVER_ERROR', 'Terjadi kesalahan di server'));
  }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw apiError_('BUSY', 'Server sedang sibuk, coba lagi');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- Autentikasi kode akses ---------- */
function safeEqual_(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function authenticate_(code) {
  const cache = CacheService.getScriptCache();
  if (Number(cache.get('fails') || 0) >= MAX_FAILS)
    return fail_('LOCKED', 'Terlalu banyak percobaan salah. Coba lagi beberapa menit lagi.');
  const props = PropertiesService.getScriptProperties();
  const qs = props.getProperty('CODE_QS'), view = props.getProperty('CODE_VIEW');
  if (!qs || !view) return fail_('NOT_CONFIGURED', 'Kode akses belum dipasang di Script Properties (CODE_QS, CODE_VIEW)');
  code = String(code === undefined || code === null ? '' : code);
  let role = null;
  // keduanya selalu dibandingkan agar waktu respons tidak membocorkan kode mana yang benar
  const isQs = safeEqual_(code, qs), isView = safeEqual_(code, view);
  if (isQs) role = 'qs'; else if (isView) role = 'view';
  if (!role) {
    cache.put('fails', String(Number(cache.get('fails') || 0) + 1), LOCK_SECONDS);
    return fail_('BAD_CODE', 'Kode akses salah');
  }
  cache.remove('fails');
  return { ok: true, role: role };
}

/* ---------- Validasi ---------- */
function reqStr_(v, name, max) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (!s) throw apiError_('VALIDATION', name + ' wajib diisi');
  if (s.length > (max || 200)) throw apiError_('VALIDATION', name + ' terlalu panjang');
  return s;
}
function reqNum_(v, name, min, max) {
  if (v === '' || v === null || v === undefined || isNaN(Number(v))) throw apiError_('VALIDATION', name + ' harus angka');
  const n = Number(v);
  if (min !== undefined && n < min) throw apiError_('VALIDATION', name + ' minimal ' + min);
  if (max !== undefined && n > max) throw apiError_('VALIDATION', name + ' maksimal ' + max);
  return n;
}
function mustFind_(table, pred, label) {
  const r = readTable_(table).filter(pred)[0];
  if (!r) throw apiError_('NOT_FOUND', label + ' tidak ditemukan');
  return r;
}

const CONFIG_SCHEMA = {
  project: 's', owner: 's', pekerjaan_default: 's',
  pctSpk: [1, 100], ret: [0, 100], jam: [1, 24], hariMg: [1, 7], lembur: [0, 100],
  basis: ['min', 'avg', 'max'], start: 'd',
  sign1_label: 's', sign1_name: 's', sign2_label: 's', sign2_name: 's', sign3_label: 's', sign3_name: 's',
  hse_sheet_id: 's', jam_masuk_std: 't', jam_pulang_std: 't', istirahat: [0, 4], lembur_bulat: [0.1, 2], lembur_maks: [0, 12],
  hsign1_label: 's', hsign1_name: 's', hsign2_label: 's', hsign2_name: 's', hsign3_label: 's', hsign3_name: 's'
};
const CONFIG_DEFAULTS = {
  project: 'Nama Proyek', owner: 'Nama Owner / Pemberi Kerja', pekerjaan_default: '',
  pctSpk: 80, ret: 5, jam: 8, hariMg: 7, lembur: 50, basis: 'avg', start: '',
  sign1_label: 'Project Manager', sign1_name: '', sign2_label: 'Direktur', sign2_name: '', sign3_label: 'Mengetahui', sign3_name: '',
  hse_sheet_id: '', jam_masuk_std: '08:00', jam_pulang_std: '17:00', istirahat: 1, lembur_bulat: 0.5, lembur_maks: 4,
  hsign1_label: 'Dibuat (QS)', hsign1_name: '', hsign2_label: 'Diperiksa (SM)', hsign2_name: '', hsign3_label: 'Disetujui (PM)', hsign3_name: ''
};

function hasFinal_(spkId) {
  return readTable_('Periode').some(function (p) { return (!spkId || p.spk_id === spkId) && p.status === STATUS.FINAL; });
}

/* ---------- Aksi ---------- */
const QS = ['qs'], ALL = ['qs', 'view'];
const ACTIONS = {
  login: { roles: ALL, write: false, fn: function (p, a) { return { role: a.role, version: API_VERSION }; } },

  bootstrap: { roles: ALL, write: false, fn: function () {
    const cfg = Object.assign({}, CONFIG_DEFAULTS, getConfig_());
    const clean = function (r) { const o = Object.assign({}, r); delete o._row; return o; };
    const items = readTable_('SPK_Items').map(function (i) { const o = clean(i); o.vol_spk = volSpk_(i, cfg); return o; });
    return {
      version: API_VERSION,
      config: cfg,
      mandor: readTable_('Mandor').map(clean),
      spk: readTable_('SPK').map(clean),
      items: items,
      periods: readTable_('Periode').map(clean),
      periodItems: readTable_('Periode_Items').map(clean),
      produktivitas: readTable_('Produktivitas').map(clean),
      map: readTable_('Produktivitas_Map').map(clean),
      pekerja: tryTable_('Pekerja').map(clean),
      harianPeriods: tryTable_('Harian_Periode').map(clean)
    };
  } },

  saveConfig: { roles: QS, write: true, fn: function (p) {
    const cfg = Object.assign({}, CONFIG_DEFAULTS, getConfig_());
    const incoming = p.values || {};
    Object.keys(incoming).forEach(function (k) {
      const rule = CONFIG_SCHEMA[k];
      if (!rule) throw apiError_('VALIDATION', 'Pengaturan tidak dikenal: ' + k);
      let v = incoming[k];
      if (rule === 's') v = v === null || v === undefined ? '' : String(v).trim().slice(0, 200);
      else if (rule === 't') { v = String(v || '').trim(); if (hhmm_(v) === null) throw apiError_('VALIDATION', k + ' harus jam HH:MM'); }
      else if (rule === 'd') { v = String(v || ''); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw apiError_('VALIDATION', k + ' harus yyyy-mm-dd'); }
      else if (Array.isArray(rule) && typeof rule[0] === 'string') { if (rule.indexOf(v) < 0) throw apiError_('VALIDATION', k + ' harus salah satu: ' + rule.join(', ')); }
      else v = reqNum_(v, k, rule[0], rule[1]);
      if (k === 'pctSpk' && Number(v) !== Number(cfg.pctSpk) && hasFinal_()) throw apiError_('CONFIG_LOCKED', 'Persen SPK tidak bisa diubah setelah ada periode Final');
      if (k === 'start' && String(v) !== String(cfg.start) && readTable_('Periode').length) throw apiError_('CONFIG_LOCKED', 'Tanggal mulai tidak bisa diubah setelah periode dibuat');
      cfg[k] = v;
    });
    const rows = readTable_('Config');
    Object.keys(cfg).forEach(function (k) {
      const ex = rows.filter(function (r) { return r.key === k; })[0];
      if (ex) { if (String(ex.value) !== String(cfg[k])) patchRow_('Config', ex, { value: cfg[k] }); }
      else appendRow_('Config', { key: k, value: cfg[k] });
    });
    appendLog_('qs', 'saveConfig', Object.keys(incoming));
    return cfg;
  } },

  saveMandor: { roles: QS, write: true, fn: function (p) {
    const nama = reqStr_(p.nama, 'Nama mandor', 100);
    if (p.id) { const ex = mustFind_('Mandor', function (r) { return r.id === p.id; }, 'Mandor'); patchRow_('Mandor', ex, { nama: nama }); return { id: p.id, nama: nama }; }
    const row = { id: newId_('m'), nama: nama };
    appendRow_('Mandor', row); return row;
  } },

  deleteMandor: { roles: QS, write: true, fn: function (p) {
    if (readTable_('SPK').some(function (s) { return s.mandor_id === p.id; })) throw apiError_('IN_USE', 'Mandor masih dipakai SPK');
    if (!deleteRows_('Mandor', function (r) { return r.id === p.id; })) throw apiError_('NOT_FOUND', 'Mandor tidak ditemukan');
    return { deleted: p.id };
  } },

  saveSpk: { roles: QS, write: true, fn: function (p) {
    const row = {
      no_spk: reqStr_(p.no_spk, 'No. SPK', 50),
      mandor_id: mustFind_('Mandor', function (r) { return r.id === p.mandor_id; }, 'Mandor').id,
      pekerjaan: reqStr_(p.pekerjaan, 'Pekerjaan', 200)
    };
    if (p.id) { const ex = mustFind_('SPK', function (r) { return r.id === p.id; }, 'SPK'); patchRow_('SPK', ex, row); row.id = p.id; return row; }
    row.id = newId_('spk'); appendRow_('SPK', row); return row;
  } },

  saveItem: { roles: QS, write: true, fn: function (p) { return saveItem_(p); } },

  /** Impor massal dari Excel: rows = [{no,deskripsi,spesifikasi,vol_rab,sat,harga,vol_spk_override?}] */
  importItems: { roles: QS, write: true, fn: function (p) {
    mustFind_('SPK', function (r) { return r.id === p.spk_id; }, 'SPK');
    if (hasFinal_(p.spk_id)) throw apiError_('ITEM_LOCKED', 'SPK ini sudah punya periode Final; impor massal ditolak');
    if (!Array.isArray(p.rows) || !p.rows.length) throw apiError_('VALIDATION', 'rows kosong');
    const clean = p.rows.map(function (r, i) {
      try { return validateItem_(Object.assign({}, r, { spk_id: p.spk_id })); }
      catch (e) { throw apiError_('VALIDATION', 'Baris ' + (i + 1) + ': ' + e.message); }
    });
    const nos = {};
    clean.forEach(function (r) { if (nos[r.no]) throw apiError_('VALIDATION', 'No item ganda: ' + r.no); nos[r.no] = 1; });
    if (p.replace) deleteRows_('SPK_Items', function (r) { return r.spk_id === p.spk_id; });
    clean.forEach(function (r) { r.id = newId_('it'); appendRow_('SPK_Items', r); });
    appendLog_('qs', 'importItems', { spk_id: p.spk_id, jumlah: clean.length });
    return { imported: clean.length };
  } },

  deleteItem: { roles: QS, write: true, fn: function (p) {
    const it = mustFind_('SPK_Items', function (r) { return r.id === p.id; }, 'Item');
    if (itemUsedInFinal_(it)) throw apiError_('ITEM_LOCKED', 'Item sudah dipakai periode Final');
    deleteRows_('SPK_Items', function (r) { return r.id === p.id; });
    deleteRows_('Periode_Items', function (r) { return r.item_id === p.id; });
    deleteRows_('Produktivitas_Map', function (r) { return r.item_id === p.id; });
    return { deleted: p.id };
  } },

  createPeriod: { roles: QS, write: true, fn: function (p) {
    mustFind_('SPK', function (r) { return r.id === p.spk_id; }, 'SPK');
    const cfg = Object.assign({}, CONFIG_DEFAULTS, getConfig_());
    const all = readTable_('Periode').filter(function (x) { return x.spk_id === p.spk_id; });
    if (!all.length && !cfg.start) throw apiError_('CONFIG_MISSING', 'Isi "Mulai periode #1" di Pengaturan dulu');
    const dates = nextPeriodDates_(all, cfg);
    const nextNo = all.reduce(function (a, x) { return Math.max(a, num_(x.no_ke)); }, 0) + 1;
    const anyOpen = all.some(function (x) { return x.status !== STATUS.FINAL; });
    const row = { id: newId_('p'), spk_id: p.spk_id, no_ke: nextNo, tgl_mulai: dates.tgl_mulai, tgl_akhir: dates.tgl_akhir,
      status: anyOpen ? STATUS.FORECAST : STATUS.TRACKING };
    appendRow_('Periode', row);
    appendLog_('qs', 'createPeriod', { id: row.id, no_ke: nextNo, status: row.status });
    return row;
  } },

  startTracking: { roles: QS, write: true, fn: function (p) {
    const per = mustFind_('Periode', function (r) { return r.id === p.periode_id; }, 'Periode');
    if (per.status !== STATUS.FORECAST) throw apiError_('BAD_STATE', 'Hanya periode berstatus Forecast yang bisa mulai Tracking');
    const sib = readTable_('Periode').filter(function (x) { return x.spk_id === per.spk_id && x.id !== per.id; });
    if (sib.some(function (x) { return x.status === STATUS.TRACKING; })) throw apiError_('BAD_STATE', 'Masih ada periode Tracking lain pada SPK ini');
    if (sib.some(function (x) { return num_(x.no_ke) < num_(per.no_ke) && x.status !== STATUS.FINAL; })) throw apiError_('BAD_STATE', 'Periode sebelumnya belum Final');
    patchRow_('Periode', per, { status: STATUS.TRACKING });
    appendLog_('qs', 'startTracking', { id: per.id });
    return { id: per.id, status: STATUS.TRACKING };
  } },

  deletePeriod: { roles: QS, write: true, fn: function (p) {
    const per = mustFind_('Periode', function (r) { return r.id === p.periode_id; }, 'Periode');
    if (per.status === STATUS.FINAL) throw apiError_('BAD_STATE', 'Periode Final tidak bisa dihapus (buka kunci dulu)');
    const later = readTable_('Periode').some(function (x) { return x.spk_id === per.spk_id && num_(x.no_ke) > num_(per.no_ke); });
    if (later) throw apiError_('BAD_STATE', 'Hanya periode paling akhir yang boleh dihapus');
    deleteRows_('Periode_Items', function (r) { return r.periode_id === per.id; });
    deleteRows_('Periode', function (r) { return r.id === per.id; });
    appendLog_('qs', 'deletePeriod', { id: per.id, no_ke: per.no_ke });
    return { deleted: per.id };
  } },

  /** rows = [{item_id, vol_forecast?, vol_aktual?, catatan?}] — hanya field yang dikirim yang diubah. */
  savePeriodItems: { roles: QS, write: true, fn: function (p) {
    const per = mustFind_('Periode', function (r) { return r.id === p.periode_id; }, 'Periode');
    if (per.status === STATUS.FINAL) throw apiError_('BAD_STATE', 'Periode sudah Final dan terkunci');
    if (!Array.isArray(p.rows)) throw apiError_('VALIDATION', 'rows harus array');
    const cfg = Object.assign({}, CONFIG_DEFAULTS, getConfig_());
    const periods = readTable_('Periode'), pItems = readTable_('Periode_Items'), items = readTable_('SPK_Items');
    const base = buildReport_(per, items, pItems, periods, cfg);
    const byItem = {}; base.rows.forEach(function (r) { byItem[r.item_id] = r; });
    const errors = [];
    p.rows.forEach(function (r) {
      const b = byItem[r.item_id];
      if (!b) { errors.push('Item tidak termasuk SPK ini: ' + r.item_id); return; }
      if (r.vol_aktual !== undefined) {
        if (per.status !== STATUS.TRACKING) errors.push('Item ' + b.no + ': volume aktual hanya bisa diisi saat status Tracking');
        const v = Number(r.vol_aktual);
        if (isNaN(v) || v < 0) errors.push('Item ' + b.no + ': aktual harus angka >= 0');
        else if (v > b.sisa + EPS) errors.push('Item ' + b.no + ': aktual ' + v + ' melebihi sisa ' + b.sisa);
      }
      if (r.vol_forecast !== undefined) {
        const v = Number(r.vol_forecast);
        if (isNaN(v) || v < 0) errors.push('Item ' + b.no + ': forecast harus angka >= 0');
        else if (v > b.sisa + EPS) errors.push('Item ' + b.no + ': forecast ' + v + ' melebihi sisa ' + b.sisa);
      }
    });
    if (errors.length) throw apiError_('VALIDATION', 'Ada data yang tidak valid', errors);
    p.rows.forEach(function (r) {
      const ex = pItems.filter(function (x) { return x.periode_id === per.id && x.item_id === r.item_id; })[0];
      const patch = {};
      if (r.vol_forecast !== undefined) patch.vol_forecast = Number(r.vol_forecast);
      if (r.vol_aktual !== undefined) patch.vol_aktual = Number(r.vol_aktual);
      if (r.catatan !== undefined) patch.catatan = String(r.catatan).slice(0, 300);
      if (ex) patchRow_('Periode_Items', ex, patch);
      else appendRow_('Periode_Items', Object.assign({ periode_id: per.id, item_id: r.item_id, vol_forecast: 0, vol_aktual: 0, catatan: '' }, patch));
    });
    return buildReport_(per, items, readTable_('Periode_Items'), periods, cfg);
  } },

  /** Final Check (blocker + peringatan) tanpa mengubah data. */
  checkPeriod: { roles: QS, write: false, fn: function (p) {
    const per = mustFind_('Periode', function (r) { return r.id === p.periode_id; }, 'Periode');
    const cfg = Object.assign({}, CONFIG_DEFAULTS, getConfig_());
    const report = buildReport_(per, readTable_('SPK_Items'), readTable_('Periode_Items'), readTable_('Periode'), cfg);
    return { report: report, checks: finalizeChecks_(report) };
  } },

  finalizePeriod: { roles: QS, write: true, fn: function (p) {
    if (p.ack !== true) throw apiError_('ACK_REQUIRED', 'Konfirmasi "sudah cek lapangan" wajib');
    const per = mustFind_('Periode', function (r) { return r.id === p.periode_id; }, 'Periode');
    if (per.status !== STATUS.TRACKING) throw apiError_('BAD_STATE', 'Hanya periode Tracking yang bisa difinalkan');
    const periods = readTable_('Periode');
    if (periods.some(function (x) { return x.spk_id === per.spk_id && num_(x.no_ke) < num_(per.no_ke) && x.status !== STATUS.FINAL; }))
      throw apiError_('BAD_STATE', 'Periode sebelumnya belum Final');
    const cfg = Object.assign({}, CONFIG_DEFAULTS, getConfig_());
    const report = buildReport_(per, readTable_('SPK_Items'), readTable_('Periode_Items'), periods, cfg);
    const checks = finalizeChecks_(report);
    if (checks.blockers.length) throw apiError_('CHECK_FAILED', 'Final Check gagal', checks.blockers);
    patchRow_('Periode', per, { status: STATUS.FINAL, total: report.total, retensi_pct: report.retensi_pct, retensi: report.retensi,
      grand_total: report.grand_total, finalized_at: nowIso_() });
    appendLog_('qs', 'finalizePeriod', { id: per.id, no_ke: per.no_ke, total: report.total, grand_total: report.grand_total });
    const fin = readTable_('Periode').filter(function (x) { return x.id === per.id; })[0];
    return { report: buildReport_(fin, readTable_('SPK_Items'), readTable_('Periode_Items'), readTable_('Periode'), cfg), warnings: checks.warnings };
  } },

  unlockPeriod: { roles: QS, write: true, fn: function (p) {
    const reason = reqStr_(p.reason, 'Alasan buka kunci', 300);
    if (reason.length < 5) throw apiError_('VALIDATION', 'Alasan terlalu singkat');
    const per = mustFind_('Periode', function (r) { return r.id === p.periode_id; }, 'Periode');
    if (per.status !== STATUS.FINAL) throw apiError_('BAD_STATE', 'Periode belum Final');
    const sib = readTable_('Periode').filter(function (x) { return x.spk_id === per.spk_id && x.id !== per.id; });
    if (sib.some(function (x) { return num_(x.no_ke) > num_(per.no_ke) && x.status === STATUS.FINAL; })) throw apiError_('BAD_STATE', 'Hanya periode Final paling akhir yang bisa dibuka');
    if (sib.some(function (x) { return x.status === STATUS.TRACKING; })) throw apiError_('BAD_STATE', 'Masih ada periode Tracking lain pada SPK ini');
    patchRow_('Periode', per, { status: STATUS.TRACKING, finalized_at: '' });
    appendLog_('qs', 'unlockPeriod', { id: per.id, no_ke: per.no_ke, alasan: reason });
    return { id: per.id, status: STATUS.TRACKING };
  } },

  /** Data untuk PDF. Viewer hanya boleh periode Final. */
  getReport: { roles: ALL, write: false, fn: function (p, a) {
    const per = mustFind_('Periode', function (r) { return r.id === p.periode_id; }, 'Periode');
    if (a.role === 'view' && per.status !== STATUS.FINAL) throw apiError_('FORBIDDEN', 'Viewer hanya bisa melihat periode Final');
    const cfg = Object.assign({}, CONFIG_DEFAULTS, getConfig_());
    const spk = mustFind_('SPK', function (r) { return r.id === per.spk_id; }, 'SPK');
    const mandor = readTable_('Mandor').filter(function (m) { return m.id === spk.mandor_id; })[0] || { nama: '' };
    const report = buildReport_(per, readTable_('SPK_Items'), readTable_('Periode_Items'), readTable_('Periode'), cfg);
    return {
      header: { project: cfg.project, owner: cfg.owner, no_spk: spk.no_spk, mandor: mandor.nama, pekerjaan: spk.pekerjaan,
        no_ke: per.no_ke, tgl_mulai: per.tgl_mulai, tgl_akhir: per.tgl_akhir, status: per.status, pctSpk: cfg.pctSpk },
      sign: [[cfg.sign1_label, cfg.sign1_name], [cfg.sign2_label, cfg.sign2_name], [cfg.sign3_label, cfg.sign3_name], ['Mandor', mandor.nama]],
      report: { rows: report.rows, total: report.total, retensi_pct: report.retensi_pct, retensi: report.retensi, grand_total: report.grand_total }
    };
  } },

  saveMap: { roles: QS, write: true, fn: function (p) {
    mustFind_('SPK_Items', function (r) { return r.id === p.item_id; }, 'Item');
    const ref = reqStr_(p.ref, 'Acuan produktivitas', 200);
    mustFind_('Produktivitas', function (r) { return r.pekerjaan === ref; }, 'Acuan produktivitas');
    const koef = reqNum_(p.koef, 'Koefisien', 0, 60);
    const ex = readTable_('Produktivitas_Map').filter(function (r) { return r.item_id === p.item_id; })[0];
    if (ex) patchRow_('Produktivitas_Map', ex, { ref: ref, koef: koef });
    else appendRow_('Produktivitas_Map', { item_id: p.item_id, ref: ref, koef: koef });
    return { item_id: p.item_id, ref: ref, koef: koef };
  } },

  /** Forecast manpower: volume dari vol_forecast periode terpilih. ot = true -> dengan lembur. */
  manpower: { roles: ALL, write: false, fn: function (p) {
    const per = mustFind_('Periode', function (r) { return r.id === p.periode_id; }, 'Periode');
    const cfg = Object.assign({}, CONFIG_DEFAULTS, getConfig_());
    const report = buildReport_(per, readTable_('SPK_Items'), readTable_('Periode_Items'), readTable_('Periode'), cfg);
    const maps = {}; readTable_('Produktivitas_Map').forEach(function (m) { maps[m.item_id] = m; });
    const prod = {}; readTable_('Produktivitas').forEach(function (x) { prod[x.pekerjaan] = x; });
    const lines = report.rows.map(function (r) {
      const m = maps[r.item_id] || {};
      return { item_id: r.item_id, no: r.no, deskripsi: r.deskripsi, sat: r.sat, vol: r.vol_forecast, ref: m.ref, koef: m.koef };
    });
    return manpower_(lines, prod, cfg, p.ot === true);
  } },

  getLog: { roles: QS, write: false, fn: function (p) {
    const n = Math.min(Math.max(Number(p.limit) || 50, 1), 500);
    return readTable_('Log').slice(-n).reverse().map(function (r) { return { waktu: r.waktu, peran: r.peran, aksi: r.aksi, detail: r.detail }; });
  } }
};

/* ---------- Item ---------- */
function validateItem_(r) {
  return {
    spk_id: r.spk_id,
    no: reqNum_(r.no, 'No item', 1),
    deskripsi: reqStr_(r.deskripsi, 'Deskripsi', 200),
    spesifikasi: r.spesifikasi ? String(r.spesifikasi).slice(0, 200) : '',
    vol_rab: reqNum_(r.vol_rab, 'Volume RAB', 0),
    vol_spk_override: r.vol_spk_override === '' || r.vol_spk_override === undefined || r.vol_spk_override === null ? '' : reqNum_(r.vol_spk_override, 'Volume SPK', 0),
    sat: reqStr_(r.sat, 'Satuan', 20),
    harga: reqNum_(r.harga, 'Harga satuan', 0)
  };
}

function itemUsedInFinal_(item) {
  const finals = {};
  readTable_('Periode').forEach(function (p) { if (p.status === STATUS.FINAL) finals[p.id] = true; });
  return readTable_('Periode_Items').some(function (pi) { return pi.item_id === item.id && finals[pi.periode_id]; });
}

function saveItem_(p) {
  mustFind_('SPK', function (r) { return r.id === p.spk_id; }, 'SPK');
  const row = validateItem_(p);
  const dup = readTable_('SPK_Items').filter(function (r) { return r.spk_id === row.spk_id && num_(r.no) === row.no && r.id !== p.id; })[0];
  if (dup) throw apiError_('VALIDATION', 'No item ' + row.no + ' sudah dipakai');
  if (p.id) {
    const ex = mustFind_('SPK_Items', function (r) { return r.id === p.id; }, 'Item');
    if (itemUsedInFinal_(ex)) {
      ['vol_rab', 'vol_spk_override', 'sat', 'harga'].forEach(function (k) {
        if (String(ex[k]) !== String(row[k])) throw apiError_('ITEM_LOCKED', 'Item sudah dipakai periode Final; ' + k + ' tidak bisa diubah');
      });
    }
    patchRow_('SPK_Items', ex, row); row.id = p.id; return row;
  }
  row.id = newId_('it'); appendRow_('SPK_Items', row); return row;
}
