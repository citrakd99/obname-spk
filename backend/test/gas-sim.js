/**
 * Simulator Google Apps Script: memuat semua file .gs ke satu konteks VM dengan tiruan
 * SpreadsheetApp / PropertiesService / CacheService / LockService / Utilities / ContentService.
 * Dipakai oleh run.js (uji) dan dev-server.js (demo lokal untuk aplikasi web). BUKAN untuk produksi.
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

function createSim() {
  const sheets = {}, props = {}, cacheMap = {};
  function makeSheet(name) {
    const rows = [];
    // Sheets mengubah teks tanggal menjadi Date, kecuali kolom yang diformat teks (SPK, Periode)
    const conv = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !['SPK', 'Periode'].includes(name))
      ? new Date(v + 'T00:00:00+07:00') : v;
    const range = {
      setValues(v) { v.forEach((r, i) => { rows[this._r - 1 + i] = r.map(conv); }); return this; },
      getValues() { return rows.slice(this._r - 1, this._r - 1 + this._nr).map(r => r.slice()); },
      setFontWeight() { return this; }, setNumberFormat() { return this; }
    };
    return {
      rows,
      getLastRow: () => rows.length, getLastColumn: () => (rows[0] || []).length,
      getDataRange: () => ({ getValues: () => rows.length ? rows.map(r => r.slice()) : [['']] }),
      appendRow(arr) { rows.push(arr.map(conv)); },
      deleteRow(n) { rows.splice(n - 1, 1); },
      setFrozenRows() {},
      getRange(r, c, nr, nc) {
        if (typeof r === 'string') return { setNumberFormat() { return this; } };
        return Object.assign(Object.create(range), { _r: r, _c: c, _nr: nr || 1, _nc: nc || 1 });
      }
    };
  }
  const sandbox = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: n => sheets[n] || null,
        insertSheet: n => (sheets[n] = makeSheet(n)),
        getSheets: () => Object.values(sheets), deleteSheet() {}
      }),
      openById() { throw new Error('tidak dipakai'); }
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cacheMap[k] || null, put: (k, v) => { cacheMap[k] = v; }, remove: k => { delete cacheMap[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate(d, tz, fmt) {
        const w = new Date(d.getTime() + 7 * 3600e3), p = n => String(n).padStart(2, '0');
        const date = `${w.getUTCFullYear()}-${p(w.getUTCMonth() + 1)}-${p(w.getUTCDate())}`;
        return fmt.indexOf('HH') >= 0 ? `${date}T${p(w.getUTCHours())}:${p(w.getUTCMinutes())}:${p(w.getUTCSeconds())}` : date;
      }
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ getContent: () => s, setMimeType() { return this; } })
    }
  };
  vm.createContext(sandbox);
  const dir = path.join(__dirname, '..');
  ['Logic.gs', 'Db.gs', 'Code.gs', 'Seed.gs', 'Setup.gs'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f }));
  vm.runInContext('globalThis.__x={doPost,doGet,setup,manpower_,PRODUKTIVITAS_SEED,TABLES}', sandbox);
  const X = sandbox.__x;
  const raw = body => X.doPost({ postData: { contents: body } }).getContent();
  const call = (code, action, payload) => JSON.parse(raw(JSON.stringify({ code, action, payload })));
  return { X, sheets, props, cacheMap, raw, call };
}

module.exports = { createSim };
