/**
 * Modul pekerja harian: salin daftar pekerja dari spreadsheet HSE (hanya baca), tandai harian + rate,
 * absensi jam masuk/pulang, rekap & klaim per periode 2 mingguan (kalender sama dengan obname).
 * Aksi di sini digabung ke router di Code.gs (lihat doPost). Peran ditulis literal karena urutan muat file.
 */
const HARIAN_ACTIONS = {
  /** Baca tab Worker di spreadsheet HSE lalu salin ke tab Pekerja. Tanda harian & rate milik aplikasi ini tidak disentuh. */
  syncHse: { roles: ['qs'], write: true, fn: function () {
    const cfg = Object.assign({}, CONFIG_DEFAULTS, getConfig_());
    const sid = String(cfg.hse_sheet_id || '').trim();
    if (!sid) throw apiError_('CONFIG_MISSING', 'Isi "ID spreadsheet HSE" di Pengaturan dulu');
    let sh;
    try { sh = SpreadsheetApp.openById(sid).getSheetByName('Worker'); }
    catch (e) { throw apiError_('HSE_UNREACHABLE', 'Spreadsheet HSE tidak bisa dibuka. Cek ID dan pastikan akun pemasang backend punya akses (lihat saja cukup).'); }
    if (!sh) throw apiError_('HSE_UNREACHABLE', 'Tab "Worker" tidak ditemukan di spreadsheet HSE');
    const v = sh.getDataRange().getValues();
    const head = (v[0] || []).map(function (h) { return String(h).trim().toLowerCase(); });
    const ix = function (k) { return head.indexOf(k); };
    if (ix('id') < 0 || ix('name') < 0) throw apiError_('HSE_FORMAT', 'Kolom "id" / "name" tidak ditemukan di tab Worker');
    const get = function (row, k) { const i = ix(k); return i < 0 ? '' : cell_(row[i]); };
    const hse = {};
    for (let r = 1; r < v.length; r++) {
      const id = String(get(v[r], 'id')).trim();
      if (!id) continue;
      const ind = get(v[r], 'induction');
      hse[id] = {
        nama: String(get(v[r], 'name')).trim().slice(0, 120), position: String(get(v[r], 'position')).trim().slice(0, 80),
        company: String(get(v[r], 'company')).trim().slice(0, 120), category: String(get(v[r], 'category')).trim().slice(0, 60),
        induction: ind !== '' ? String(ind) : String(get(v[r], 'induction_date') || ''), work_status: String(get(v[r], 'work_status')).trim().slice(0, 40)
      };
    }
    const now = nowIso_(), mine = readTable_('Pekerja'), seen = {};
    let baru = 0, diperbarui = 0, hilang = 0;
    mine.forEach(function (p) {
      seen[p.id] = true;
      const h = hse[p.id];
      if (h) {
        const patch = { di_hse: true, synced_at: now };
        let changed = !isTrue_(p.di_hse);
        Object.keys(h).forEach(function (k) { if (String(p[k]) !== String(h[k])) { patch[k] = h[k]; changed = true; } });
        if (changed) { patchRow_('Pekerja', p, patch); diperbarui++; }
      } else if (isTrue_(p.di_hse)) { patchRow_('Pekerja', p, { di_hse: false, synced_at: now }); hilang++; }
    });
    Object.keys(hse).forEach(function (id) {
      if (seen[id]) return;
      appendRow_('Pekerja', Object.assign({ id: id }, hse[id], { di_hse: true, harian: false, rate_harian: '', lembur_mode: 'auto', rate_lembur_jam: '', catatan: '', synced_at: now }));
      baru++;
    });
    appendLog_('qs', 'syncHse', { total: Object.keys(hse).length, baru: baru, diperbarui: diperbarui, hilang: hilang });
    return { total: Object.keys(hse).length, baru: baru, diperbarui: diperbarui, hilang: hilang, synced_at: now };
  } },

  /** Ubah tanda harian, rate, mode lembur. Data dari HSE (nama, jabatan, induction) tidak bisa diubah di sini. */
  savePekerja: { roles: ['qs'], write: true, fn: function (p) {
    const ex = mustFind_('Pekerja', function (r) { return r.id === String(p.id); }, 'Pekerja');
    const patch = {};
    if (p.harian !== undefined) patch.harian = p.harian === true;
    if (p.rate_harian !== undefined) patch.rate_harian = p.rate_harian === '' ? '' : reqNum_(p.rate_harian, 'Rate harian', 0, 100000000);
    if (p.lembur_mode !== undefined) {
      if (['auto', 'manual'].indexOf(p.lembur_mode) < 0) throw apiError_('VALIDATION', 'Mode lembur harus auto atau manual');
      patch.lembur_mode = p.lembur_mode;
    }
    if (p.rate_lembur_jam !== undefined) patch.rate_lembur_jam = p.rate_lembur_jam === '' ? '' : reqNum_(p.rate_lembur_jam, 'Rate lembur per jam', 0, 100000000);
    if (p.catatan !== undefined) patch.catatan = String(p.catatan).slice(0, 200);
    const after = Object.assign({}, ex, patch);
    if (after.lembur_mode === 'manual' && after.rate_lembur_jam === '') throw apiError_('VALIDATION', 'Isi rate lembur per jam untuk mode manual');
    const out = patchRow_('Pekerja', ex, patch);
    delete out._row;
    return out;
  } },

  /** Absensi & rekap satu periode. Viewer hanya periode Final. */
  getHarian: { roles: ['qs', 'view'], write: false, fn: function (p, a) {
    const cfg = Object.assign({}, CONFIG_DEFAULTS, getConfig_());
    if (!cfg.start) throw apiError_('CONFIG_MISSING', 'Isi "Mulai periode #1" di Pengaturan dulu');
    const no = Math.floor(reqNum_(p.no_ke, 'Nomor periode', 1, 1000));
    const per = harianPeriode_(no, cfg);
    if (a.role === 'view' && per.status !== 'Final') throw apiError_('FORBIDDEN', 'Viewer hanya bisa melihat periode Final');
    return harianBuild_(no, per, cfg);
  } },

  /** rows = [{worker_id, hadir, jam_masuk, jam_pulang, hari_mode, hari_manual, catatan}] untuk satu tanggal. */
  saveAbsen: { roles: ['qs'], write: true, fn: function (p) {
    const cfg = Object.assign({}, CONFIG_DEFAULTS, getConfig_());
    const tgl = String(p.tanggal || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) throw apiError_('VALIDATION', 'Tanggal harus yyyy-mm-dd');
    const no = harianNo_(tgl, cfg);
    if (!no) throw apiError_('VALIDATION', 'Tanggal sebelum "Mulai periode #1" atau tanggal mulai belum diisi');
    if (harianPeriode_(no, cfg).status === 'Final') throw apiError_('BAD_STATE', 'Periode #' + no + ' sudah Final dan terkunci');
    if (!Array.isArray(p.rows)) throw apiError_('VALIDATION', 'rows harus array');
    const byId = {}; readTable_('Pekerja').forEach(function (w) { byId[w.id] = w; });
    const existing = readTable_('Harian_Absen').filter(function (r) { return r.tanggal === tgl; });
    const errors = [], keep = [], drop = [];
    p.rows.forEach(function (r) {
      const id = String(r.worker_id || ''), w = byId[id];
      if (r.hadir !== true) { drop.push(id); return; }
      const why = harianEligible_(w);
      if (why.length) { errors.push((w ? w.nama : id) + ': ' + why.join(', ')); return; }
      const rec = { jam_masuk: String(r.jam_masuk || '').trim(), jam_pulang: String(r.jam_pulang || '').trim(),
        hari_mode: r.hari_mode === 'manual' ? 'manual' : 'auto', hari_manual: r.hari_mode === 'manual' ? Number(r.hari_manual) : '' };
      if (rec.hari_mode === 'manual' && (isNaN(rec.hari_manual) || rec.hari_manual < 0 || rec.hari_manual > 1))
        { errors.push(w.nama + ': hari manual harus 0 sampai 1'); return; }
      const c = harianDay_(rec, w, cfg);
      if (c.err) { errors.push(w.nama + ': ' + c.err); return; }
      keep.push(Object.assign({ tanggal: tgl, worker_id: id, nama: w.nama, jabatan: w.position, catatan: String(r.catatan || '').slice(0, 200), updated_at: nowIso_() }, rec));
    });
    if (errors.length) throw apiError_('VALIDATION', 'Ada absensi yang tidak valid', errors);
    keep.forEach(function (rec) {
      const ex = existing.filter(function (e) { return e.worker_id === rec.worker_id; })[0];
      if (ex) patchRow_('Harian_Absen', ex, rec); else appendRow_('Harian_Absen', rec);
    });
    if (drop.length) deleteRows_('Harian_Absen', function (r) { return r.tanggal === tgl && drop.indexOf(r.worker_id) >= 0; });
    return harianBuild_(no, harianPeriode_(no, cfg), cfg);
  } },

  finalizeHarian: { roles: ['qs'], write: true, fn: function (p) {
    if (p.ack !== true) throw apiError_('ACK_REQUIRED', 'Konfirmasi "sudah dicocokkan" wajib');
    const cfg = Object.assign({}, CONFIG_DEFAULTS, getConfig_());
    const no = Math.floor(reqNum_(p.no_ke, 'Nomor periode', 1, 1000));
    const per = harianPeriode_(no, cfg);
    if (per.status === 'Final') throw apiError_('BAD_STATE', 'Periode sudah Final');
    const rek = harianRekap_(no, readTable_('Pekerja'), readTable_('Harian_Absen'), cfg);
    if (rek.errors.length) throw apiError_('CHECK_FAILED', 'Masih ada absensi yang salah', rek.errors);
    if (!rek.pekerja.length) throw apiError_('CHECK_FAILED', 'Belum ada absensi di periode ini');
    const params = JSON.stringify({ jam: num_(cfg.jam), istirahat: num_(cfg.istirahat), lembur_bulat: num_(cfg.lembur_bulat), lembur_maks: num_(cfg.lembur_maks) });
    const row = { no_ke: no, tgl_mulai: rek.tgl_mulai, tgl_akhir: rek.tgl_akhir, status: 'Final', total: rek.total.total, params: params, finalized_at: nowIso_() };
    const ex = readTable_('Harian_Periode').filter(function (r) { return num_(r.no_ke) === no; })[0];
    if (ex) patchRow_('Harian_Periode', ex, row); else appendRow_('Harian_Periode', row);
    deleteRows_('Harian_Klaim', function (r) { return num_(r.no_ke) === no; });
    rek.pekerja.forEach(function (w) {
      appendRow_('Harian_Klaim', { no_ke: no, worker_id: w.worker_id, nama: w.nama, jabatan: w.jabatan, hadir: w.hadir, hari: w.hari,
        jam_normal: w.jam_normal, jam_lembur: w.jam_lembur, rate_harian: w.rate_harian, rate_lembur: w.rate_lembur,
        upah_normal: w.upah_normal, upah_lembur: w.upah_lembur, total: w.total });
    });
    appendLog_('qs', 'finalizeHarian', { no_ke: no, pekerja: rek.pekerja.length, total: rek.total.total });
    return harianBuild_(no, harianPeriode_(no, cfg), cfg);
  } },

  unlockHarian: { roles: ['qs'], write: true, fn: function (p) {
    const reason = reqStr_(p.reason, 'Alasan buka kunci', 300);
    if (reason.length < 5) throw apiError_('VALIDATION', 'Alasan terlalu singkat');
    const no = Math.floor(reqNum_(p.no_ke, 'Nomor periode', 1, 1000));
    const rows = readTable_('Harian_Periode');
    const ex = rows.filter(function (r) { return num_(r.no_ke) === no && r.status === 'Final'; })[0];
    if (!ex) throw apiError_('BAD_STATE', 'Periode belum Final');
    if (rows.some(function (r) { return num_(r.no_ke) > no && r.status === 'Final'; })) throw apiError_('BAD_STATE', 'Hanya periode Final paling akhir yang bisa dibuka');
    patchRow_('Harian_Periode', ex, { status: 'Terbuka', finalized_at: '' });
    deleteRows_('Harian_Klaim', function (r) { return num_(r.no_ke) === no; });
    appendLog_('qs', 'unlockHarian', { no_ke: no, alasan: reason });
    return { no_ke: no, status: 'Terbuka' };
  } }
};

/** Status periode harian (baris Harian_Periode bila ada; selain itu Terbuka). */
function harianPeriode_(no, cfg) {
  const r = tryTable_('Harian_Periode').filter(function (x) { return num_(x.no_ke) === no; })[0];
  const dt = harianDates_(no, cfg);
  return r ? { no_ke: no, tgl_mulai: dt.tgl_mulai, tgl_akhir: dt.tgl_akhir, status: r.status || 'Terbuka', total: num_(r.total), params: r.params, finalized_at: r.finalized_at }
    : { no_ke: no, tgl_mulai: dt.tgl_mulai, tgl_akhir: dt.tgl_akhir, status: 'Terbuka' };
}

/**
 * Data lengkap periode: absensi + rekap. Periode Final memakai rate & parameter yang disimpan saat final (snapshot),
 * sehingga perubahan rate/aturan sesudahnya tidak mengubah klaim lama.
 */
function harianBuild_(no, per, cfg) {
  const absenAll = readTable_('Harian_Absen');
  let workers = readTable_('Pekerja'), useCfg = cfg;
  if (per.status === 'Final') {
    const snap = readTable_('Harian_Klaim').filter(function (k) { return num_(k.no_ke) === no; });
    workers = snap.map(function (k) { return { id: k.worker_id, nama: k.nama, position: k.jabatan, rate_harian: num_(k.rate_harian), lembur_mode: 'manual', rate_lembur_jam: num_(k.rate_lembur) }; });
    try { useCfg = Object.assign({}, cfg, JSON.parse(per.params || '{}')); } catch (e) { useCfg = cfg; }
  }
  const rek = harianRekap_(no, workers, absenAll, useCfg);
  const clean = function (r) { const o = Object.assign({}, r); delete o._row; return o; };
  return {
    periode: per, rekap: rek,
    absen: absenAll.filter(function (a) { return a.tanggal >= per.tgl_mulai && a.tanggal <= per.tgl_akhir; }).map(clean),
    header: { project: cfg.project, owner: cfg.owner },
    sign: [[cfg.hsign1_label, cfg.hsign1_name], [cfg.hsign2_label, cfg.hsign2_name], [cfg.hsign3_label, cfg.hsign3_name]]
  };
}
