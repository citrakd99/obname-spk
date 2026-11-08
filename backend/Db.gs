/** Lapisan akses Google Sheet. Skema tab ada di TABLES; Setup.gs membuatnya. */
const TZ = 'Asia/Jakarta';

const TABLES = {
  Config: ['key', 'value'],
  Mandor: ['id', 'nama'],
  SPK: ['id', 'no_spk', 'mandor_id', 'pekerjaan'],
  SPK_Items: ['id', 'spk_id', 'no', 'deskripsi', 'spesifikasi', 'vol_rab', 'vol_spk_override', 'sat', 'harga'],
  Periode: ['id', 'spk_id', 'no_ke', 'tgl_mulai', 'tgl_akhir', 'status', 'total', 'retensi_pct', 'retensi', 'grand_total', 'finalized_at'],
  Periode_Items: ['periode_id', 'item_id', 'vol_forecast', 'vol_aktual', 'catatan'],
  Produktivitas: ['kategori', 'pekerjaan', 'komposisi', 'kap_min', 'kap_max', 'satuan'],
  Produktivitas_Map: ['item_id', 'ref', 'koef'],
  Log: ['waktu', 'peran', 'aksi', 'detail']
};

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw apiError_('NOT_SETUP', 'Tab "' + name + '" belum ada. Jalankan setup() dulu.');
  return sh;
}

function cell_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return v;
}

/** Baca satu tab menjadi array objek (+ _row = nomor baris di sheet). */
function readTable_(name) {
  const values = sheet_(name).getDataRange().getValues();
  const head = TABLES[name];
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    const o = { _row: r + 1 };
    head.forEach(function (h, c) { o[h] = cell_(row[c]); });
    out.push(o);
  }
  return out;
}

function toArr_(name, obj) {
  return TABLES[name].map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : obj[h]; });
}

function appendRow_(name, obj) {
  sheet_(name).appendRow(toArr_(name, obj));
  return obj;
}

/** Ganti seluruh baris di nomor `row` dengan objek (kolom yang tidak ada diisi kosong). */
function writeRow_(name, row, obj) {
  const arr = toArr_(name, obj);
  sheet_(name).getRange(row, 1, 1, arr.length).setValues([arr]);
}

function patchRow_(name, existing, patch) {
  const merged = {};
  TABLES[name].forEach(function (h) { merged[h] = existing[h]; });
  Object.keys(patch).forEach(function (k) { merged[k] = patch[k]; });
  writeRow_(name, existing._row, merged);
  merged._row = existing._row;
  return merged;
}

/** Hapus baris yang cocok, dari bawah ke atas agar nomor baris tidak bergeser. */
function deleteRows_(name, pred) {
  const rows = readTable_(name).filter(pred).sort(function (a, b) { return b._row - a._row; });
  const sh = sheet_(name);
  rows.forEach(function (r) { sh.deleteRow(r._row); });
  return rows.length;
}

function newId_(prefix) { return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function nowIso_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }

function appendLog_(role, aksi, detail) {
  appendRow_('Log', { waktu: nowIso_(), peran: role, aksi: aksi, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
}

/** Config sebagai objek {key: value}. */
function getConfig_() {
  const cfg = {};
  readTable_('Config').forEach(function (r) { cfg[r.key] = r.value; });
  return cfg;
}
