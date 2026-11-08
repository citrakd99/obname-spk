/**
 * Logika murni (tanpa API Apps Script) supaya bisa diuji di Node.
 * Rumus mengikuti workbook spk-obname:
 *   Vol SPK        = Vol RAB x persen SPK (atau override)
 *   Vol sebelumnya = jumlah vol aktual periode berstatus Final (no_ke lebih kecil)
 *   Sisa volume    = Vol SPK - Vol sebelumnya
 *   Jumlah         = Vol aktual x Harga satuan
 *   Retensi        = Total x persen retensi ; Grand total = Total - Retensi
 */
const STATUS = { FORECAST: 'Forecast', TRACKING: 'Tracking', FINAL: 'Final' };
const EPS = 1e-9;

function num_(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function round2_(n) { return Math.round(n * 100) / 100; }
function roundRp_(n) { return Math.round(n); }

function addDays_(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function volSpk_(item, cfg) {
  const ov = item.vol_spk_override;
  if (ov !== '' && ov !== null && ov !== undefined && !isNaN(parseFloat(ov))) return round2_(parseFloat(ov));
  return round2_(num_(item.vol_rab) * num_(cfg.pctSpk) / 100);
}

/** { item_id: total aktual dari periode Final dengan no_ke < noKe } */
function prevVolumes_(spkId, noKe, periods, periodItems) {
  const finalIds = {};
  periods.forEach(function (p) {
    if (p.spk_id === spkId && p.status === STATUS.FINAL && num_(p.no_ke) < noKe) finalIds[p.id] = true;
  });
  const out = {};
  periodItems.forEach(function (pi) {
    if (finalIds[pi.periode_id]) out[pi.item_id] = round2_((out[pi.item_id] || 0) + num_(pi.vol_aktual));
  });
  return out;
}

/** Tanggal mulai/akhir periode berikutnya untuk satu SPK (periode = 14 hari). */
function nextPeriodDates_(spkPeriods, cfg) {
  let start;
  if (spkPeriods.length) {
    const last = spkPeriods.reduce(function (a, b) { return num_(a.no_ke) > num_(b.no_ke) ? a : b; });
    start = addDays_(last.tgl_akhir, 1);
  } else {
    start = cfg.start;
  }
  if (!start) throw new Error('Tanggal mulai periode #1 belum diatur di Config (key: start)');
  return { tgl_mulai: start, tgl_akhir: addDays_(start, 13) };
}

function buildReport_(period, items, periodItems, periods, cfg) {
  const prev = prevVolumes_(period.spk_id, num_(period.no_ke), periods, periodItems);
  const mine = {};
  periodItems.forEach(function (pi) { if (pi.periode_id === period.id) mine[pi.item_id] = pi; });
  const rows = items
    .filter(function (i) { return i.spk_id === period.spk_id; })
    .sort(function (a, b) { return num_(a.no) - num_(b.no); })
    .map(function (i) {
      const vs = volSpk_(i, cfg), pv = prev[i.id] || 0, sisa = round2_(vs - pv);
      const m = mine[i.id] || {};
      const fc = num_(m.vol_forecast), ak = num_(m.vol_aktual), h = num_(i.harga);
      return {
        item_id: i.id, no: i.no, deskripsi: i.deskripsi, spesifikasi: i.spesifikasi, sat: i.sat,
        vol_rab: num_(i.vol_rab), vol_spk: vs, harga: h,
        vol_sebelumnya: pv, sisa: sisa,
        vol_forecast: fc, vol_aktual: ak,
        jumlah: roundRp_(ak * h), jumlah_forecast: roundRp_(fc * h),
        melebihi: ak > sisa + EPS, forecast_melebihi: fc > sisa + EPS,
        catatan: m.catatan || ''
      };
    });
  const retPct = period.status === STATUS.FINAL && period.retensi_pct !== '' && period.retensi_pct !== undefined
    ? num_(period.retensi_pct) : num_(cfg.ret);
  const total = rows.reduce(function (a, r) { return a + r.jumlah; }, 0);
  const retensi = roundRp_(total * retPct / 100);
  const totalFc = rows.reduce(function (a, r) { return a + r.jumlah_forecast; }, 0);
  return {
    period: period, rows: rows, retensi_pct: retPct,
    total: total, retensi: retensi, grand_total: total - retensi,
    total_forecast: totalFc
  };
}

/** Blocker = menolak finalisasi. Warning = hanya peringatan (ditampilkan di Final Check). */
function finalizeChecks_(report) {
  const blockers = [], warnings = [];
  report.rows.forEach(function (r) {
    if (r.vol_aktual < 0) blockers.push('Item ' + r.no + ': volume aktual negatif');
    if (r.melebihi) blockers.push('Item ' + r.no + ': aktual ' + r.vol_aktual + ' melebihi sisa ' + r.sisa);
    if (!(r.vol_aktual > 0)) warnings.push('Item ' + r.no + ': belum ada volume aktual');
    if (r.vol_forecast > 0 && Math.abs(r.vol_aktual - r.vol_forecast) / r.vol_forecast > 0.2)
      warnings.push('Item ' + r.no + ': selisih aktual vs forecast > 20%');
  });
  return { blockers: blockers, warnings: warnings };
}

/* ---------- Forecast manpower ---------- */
function parseKomposisi_(s) {
  return String(s).split('+').map(function (p) {
    const m = p.trim().match(/^(\d+)\s+(.+)$/);
    if (!m) throw new Error('Komposisi tidak valid: ' + s);
    return [m[2].trim(), parseInt(m[1], 10)];
  });
}
function hourFactor_(cfg, ot) { return num_(cfg.jam) * (1 + (ot ? num_(cfg.lembur) / 100 : 0)) / 8; } // standar = 8 jam
function periodDays_(cfg) { return num_(cfg.hariMg) * 2; }

/**
 * lines: [{item_id,no,deskripsi,sat,vol,ref,koef}]; prodByName: {pekerjaan: {komposisi,kap_min,kap_max,satuan}}
 */
function manpower_(lines, prodByName, cfg, ot) {
  const days = periodDays_(cfg), hf = hourFactor_(cfg, ot);
  const perJabatan = {};
  let pd = 0;
  const items = lines.map(function (l) {
    const p = prodByName[l.ref];
    if (!p) return { item_id: l.item_id, no: l.no, deskripsi: l.deskripsi, error: 'Acuan produktivitas belum dipilih' };
    const kmin = num_(p.kap_min), kmax = num_(p.kap_max);
    const cap = cfg.basis === 'min' ? kmin : cfg.basis === 'max' ? kmax : (kmin + kmax) / 2;
    const koef = num_(l.koef);
    const eff = cap * (1 - koef / 100) * hf;
    const vol = num_(l.vol);
    const crewDays = eff > 0 ? vol / eff : 0;
    const crews = crewDays / days;
    const comp = parseKomposisi_(p.komposisi);
    const heads = comp.map(function (c) {
      return { jabatan: c[0], orang: Math.max(0, Math.ceil(crews * c[1] - EPS)) };
    });
    heads.forEach(function (h) { perJabatan[h.jabatan] = (perJabatan[h.jabatan] || 0) + h.orang; });
    const persons = comp.reduce(function (a, c) { return a + c[1]; }, 0);
    const hariOrang = crewDays * persons;
    pd += hariOrang;
    return {
      item_id: l.item_id, no: l.no, deskripsi: l.deskripsi, sat: l.sat, vol: vol,
      acuan: l.ref, satuan_acuan: p.satuan, satuan_cocok: p.satuan === l.sat,
      koefisien: koef, kapasitas_standar: cap, kapasitas_efektif: eff,
      hari_regu: crewDays, regu: crews, tenaga: heads, hari_orang: hariOrang
    };
  });
  const puncak = Object.keys(perJabatan).reduce(function (a, k) { return a + perJabatan[k]; }, 0);
  return {
    hari_kerja: days, jam_per_hari: num_(cfg.jam) * (1 + (ot ? num_(cfg.lembur) / 100 : 0)),
    lembur: !!ot, items: items, per_jabatan: perJabatan, puncak: puncak,
    hari_orang: pd, rata_rata_per_hari: days > 0 ? pd / days : 0
  };
}

/* ---------- Pekerja harian ---------- */
// Daftar pekerja berasal dari spreadsheet HSE (tab Worker), disalin ke tab Pekerja. Hanya yang ditandai harian,
// sudah induction, masih ada di HSE, dan punya rate yang boleh diabsen.
function isTrue_(v) { return v === true || /^(true|ya|y|yes|1)$/i.test(String(v == null ? '' : v).trim()); }
function inductionOk_(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return !!s && !/^(0|no|n|tidak|belum|false|-|x)$/.test(s);
}
function hhmm_(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t == null ? '' : t).trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}
function harianEligible_(w) {
  if (!w) return ['tidak terdaftar di daftar pekerja HSE'];
  const r = [];
  if (!isTrue_(w.di_hse)) r.push('sudah tidak ada di daftar HSE');
  if (!isTrue_(w.harian)) r.push('tidak ditandai sebagai pekerja harian');
  if (!inductionOk_(w.induction)) r.push('belum induction');
  if (!(num_(w.rate_harian) > 0)) r.push('rate harian belum diisi');
  return r;
}
/** Rate lembur per jam: auto = rate harian ÷ jam normal; manual = angka yang diisi. */
function lemburRate_(w, cfg) {
  return w.lembur_mode === 'manual' ? num_(w.rate_lembur_jam) : num_(w.rate_harian) / (num_(cfg.jam) || 8);
}
/**
 * Upah satu hari. rec: {jam_masuk, jam_pulang, hari_mode ('auto'|'manual'), hari_manual}
 * auto: dibayar 1 hari penuh walau kurang dari jam normal (diberi tanda `kurang`); manual: hari = hari_manual.
 */
function harianDay_(rec, w, cfg) {
  const a = hhmm_(rec.jam_masuk), b = hhmm_(rec.jam_pulang), J = num_(cfg.jam) || 8;
  if (a === null || b === null) return { err: 'jam masuk/pulang harus format HH:MM' };
  if (b <= a) return { err: 'jam pulang harus setelah jam masuk' };
  let jam = (b - a) / 60;
  if (a <= 12 * 60 && b >= 13 * 60) jam -= num_(cfg.istirahat);
  jam = Math.max(0, jam);
  const normal = Math.min(jam, J), bulat = num_(cfg.lembur_bulat) || 0.5;
  let lembur = Math.floor(Math.max(0, jam - J) / bulat + EPS) * bulat;
  lembur = Math.min(lembur, num_(cfg.lembur_maks));
  const manual = rec.hari_mode === 'manual';
  const hari = manual ? num_(rec.hari_manual) : 1;
  const rate = num_(w.rate_harian), rl = lemburRate_(w, cfg);
  const un = roundRp_(hari * rate), ul = roundRp_(lembur * rl);
  return { jam: round2_(jam), normal: round2_(normal), lembur: lembur, hari: hari, manual: manual, kurang: normal < J - EPS,
    rate: rate, rate_lembur: rl, upah_normal: un, upah_lembur: ul, total: un + ul };
}
function harianNo_(date, cfg) {
  if (!cfg.start || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return null;
  const d = (Date.parse(date + 'T00:00:00Z') - Date.parse(cfg.start + 'T00:00:00Z')) / 864e5;
  return d < 0 ? null : Math.floor(d / 14) + 1;
}
function harianDates_(no, cfg) { const s = addDays_(cfg.start, (no - 1) * 14); return { tgl_mulai: s, tgl_akhir: addDays_(s, 13) }; }

/** Rekap satu periode. workers: daftar pekerja (rate dipakai dari sini); absen: semua baris absensi. */
function harianRekap_(no, workers, absen, cfg) {
  const dt = harianDates_(no, cfg), J = num_(cfg.jam) || 8, byW = {}, per = {}, errors = [], warnings = [];
  workers.forEach(function (w) { byW[w.id] = w; });
  absen.filter(function (a) { return a.tanggal >= dt.tgl_mulai && a.tanggal <= dt.tgl_akhir; })
    .sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0; })
    .forEach(function (a) {
      const w = byW[a.worker_id] || { id: a.worker_id, nama: a.nama, rate_harian: 0 };
      let p = per[a.worker_id];
      if (!p) p = per[a.worker_id] = { worker_id: a.worker_id, nama: a.nama || w.nama, jabatan: a.jabatan || w.position || '',
        rate_harian: num_(w.rate_harian), rate_lembur: lemburRate_(w, cfg), hadir: 0, hari: 0, jam_normal: 0, jam_lembur: 0,
        upah_normal: 0, upah_lembur: 0, total: 0, days: [] };
      const c = harianDay_(a, w, cfg);
      const base = { tanggal: a.tanggal, jam_masuk: a.jam_masuk, jam_pulang: a.jam_pulang, hari_mode: a.hari_mode || 'auto', catatan: a.catatan || '' };
      if (c.err) { errors.push(a.tanggal + ' · ' + p.nama + ': ' + c.err); p.days.push(Object.assign(base, { err: c.err })); return; }
      if (c.kurang && !c.manual) warnings.push(a.tanggal + ' · ' + p.nama + ': kerja ' + c.jam + ' jam (< ' + J + ') dihitung 1 hari penuh');
      p.hadir++; p.hari += c.hari; p.jam_normal += c.normal; p.jam_lembur += c.lembur;
      p.upah_normal += c.upah_normal; p.upah_lembur += c.upah_lembur; p.total += c.total;
      p.days.push(Object.assign(base, c));
    });
  const list = Object.keys(per).map(function (k) { return per[k]; }).sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama)); });
  const total = list.reduce(function (s, p) {
    s.hari += p.hari; s.jam_lembur += p.jam_lembur; s.upah_normal += p.upah_normal; s.upah_lembur += p.upah_lembur; s.total += p.total; return s;
  }, { hari: 0, jam_lembur: 0, upah_normal: 0, upah_lembur: 0, total: 0 });
  return { no_ke: no, tgl_mulai: dt.tgl_mulai, tgl_akhir: dt.tgl_akhir, pekerja: list, total: total, errors: errors, warnings: warnings };
}

/** Ambil ID spreadsheet dari ID polos atau alamat lengkap (…/spreadsheets/d/<ID>/edit…). */
function sheetIdOf_(v) {
  const s = String(v == null ? '' : v).trim();
  const m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(s) || /[?&]id=([a-zA-Z0-9_-]{20,})/.exec(s);
  return m ? m[1] : s;
}
