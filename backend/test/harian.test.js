/**
 * Uji modul pekerja harian (Harian.gs + rumus di Logic.gs) dengan spreadsheet HSE tiruan.
 * Jalankan:  node backend/test/harian.test.js
 */
const assert = require('assert');
const { createSim } = require('./gas-sim');
const sim = createSim();
const { sheets, props, X } = sim;
X.setup();
props.CODE_QS = 'qs-uji'; props.CODE_VIEW = 'view-uji';
const qs = (a, p) => sim.call('qs-uji', a, p), view = (a, p) => sim.call('view-uji', a, p);
const ok = (r, m) => { assert.ok(r.ok, (m || '') + ' -> ' + JSON.stringify(r)); return r.data; };
const err = (r, code, m) => { assert.strictEqual(r.ok, false, m + ' harusnya gagal'); assert.strictEqual(r.error.code, code, m + ' -> ' + JSON.stringify(r.error)); return r.error; };
let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log('  ok  ' + name); } catch (e) { process.exitCode = 1; console.log('  GAGAL  ' + name + '\n        ' + e.message); } };

const HSE_ID = 'hse-uji-123';
const HEAD = ['id', 'name', 'ktp', 'gender', 'category', 'company', 'induction', 'induction_date', 'violation', 'work_status', 'trainings', 'certifications', 'notes', 'created_by', 'created_at', 'updated_by', 'updated_at', 'violation_date', 'position'];
const row = (id, name, cat, ind, pos) => [id, name, '3201xxxx', 'L', cat, 'CV Contoh', ind, '', '', 'Aktif', '', '', '', '', '', '', '', '', pos];
const hse = sim.addExternal(HSE_ID, {
  Worker: [HEAD,
    row('W-001', 'Pekerja A', 'Pekerja', 'Ya', 'Tukang Besi'),
    row('W-002', 'Pekerja B', 'Pekerja', 'Ya', 'Helper / Kenek'),
    row('W-003', 'Staf C', 'Staff', 'Ya', 'Site Engineer'),
    row('W-004', 'Pekerja D', 'Subcon', '', 'Electrician')],     // belum induction
  Config: [['key', 'value'], ['pin', 'RAHASIA']]                 // tidak boleh terbaca
});

console.log('Modul pekerja harian');

test('sync tanpa ID HSE -> pesan jelas; ID salah -> HSE_UNREACHABLE', () => {
  ok(qs('saveConfig', { values: { start: '2026-09-21' } }));
  err(qs('syncHse'), 'CONFIG_MISSING', 'tanpa id');
  ok(qs('saveConfig', { values: { hse_sheet_id: 'salah' } }));
  err(qs('syncHse'), 'HSE_UNREACHABLE', 'id salah');
  ok(qs('saveConfig', { values: { hse_sheet_id: HSE_ID } }));
});

test('sync menyalin semua pekerja HSE (campuran) sebagai bukan-harian; tidak menyalin KTP', () => {
  const r = ok(qs('syncHse'));
  assert.deepStrictEqual([r.total, r.baru, r.diperbarui, r.hilang], [4, 4, 0, 0]);
  const p = ok(qs('bootstrap')).pekerja;
  assert.strictEqual(p.length, 4);
  assert.ok(p.every(x => x.harian === false && x.di_hse === true));
  assert.ok(!JSON.stringify(sheets.Pekerja.rows).includes('3201xxxx'), 'KTP tidak boleh tersalin');
  assert.strictEqual(p.find(x => x.id === 'W-001').position, 'Tukang Besi');
});

test('Viewer tidak bisa sync / ubah pekerja / absen / finalkan', () => {
  ['syncHse', 'savePekerja', 'saveAbsen', 'finalizeHarian', 'unlockHarian'].forEach(a => err(view(a, {}), 'FORBIDDEN', a));
});

test('tandai harian + rate; mode lembur manual wajib isi rate', () => {
  ok(qs('savePekerja', { id: 'W-001', harian: true, rate_harian: 160000 }));
  ok(qs('savePekerja', { id: 'W-002', harian: true, rate_harian: 120000, lembur_mode: 'manual', rate_lembur_jam: 20000 }));
  ok(qs('savePekerja', { id: 'W-004', harian: true, rate_harian: 150000 }));
  err(qs('savePekerja', { id: 'W-001', lembur_mode: 'manual' }), 'VALIDATION', 'manual tanpa rate');
  err(qs('savePekerja', { id: 'W-001', rate_harian: -5 }), 'VALIDATION', 'rate negatif');
  err(qs('savePekerja', { id: 'W-999', harian: true }), 'NOT_FOUND', 'id asing');
});

test('absensi: ditolak bila bukan harian / belum induction / tidak ada di HSE', () => {
  const e = err(qs('saveAbsen', { tanggal: '2026-11-03', rows: [
    { worker_id: 'W-003', hadir: true, jam_masuk: '08:00', jam_pulang: '17:00' },
    { worker_id: 'W-004', hadir: true, jam_masuk: '08:00', jam_pulang: '17:00' },
    { worker_id: 'W-777', hadir: true, jam_masuk: '08:00', jam_pulang: '17:00' }] }), 'VALIDATION', 'tidak layak');
  assert.ok(e.details.some(d => /Staf C: .*tidak ditandai/.test(d)));
  assert.ok(e.details.some(d => /Pekerja D: belum induction/.test(d)));
  assert.ok(e.details.some(d => /W-777: tidak terdaftar di daftar pekerja HSE/.test(d)));
});

test('absensi: validasi jam & hari manual; tanggal sebelum mulai ditolak', () => {
  err(qs('saveAbsen', { tanggal: '2026-11-03', rows: [{ worker_id: 'W-001', hadir: true, jam_masuk: '17:00', jam_pulang: '08:00' }] }), 'VALIDATION', 'pulang < masuk');
  err(qs('saveAbsen', { tanggal: '2026-11-03', rows: [{ worker_id: 'W-001', hadir: true, jam_masuk: '8', jam_pulang: '17:00' }] }), 'VALIDATION', 'format jam');
  err(qs('saveAbsen', { tanggal: '2026-11-03', rows: [{ worker_id: 'W-001', hadir: true, jam_masuk: '08:00', jam_pulang: '12:00', hari_mode: 'manual', hari_manual: 2 }] }), 'VALIDATION', 'hari > 1');
  err(qs('saveAbsen', { tanggal: '2026-01-01', rows: [] }), 'VALIDATION', 'sebelum mulai');
});

let res;
test('hitungan upah: normal, lembur auto/manual, pembulatan 0,5 & maks 4, kurang jam = 1 hari + peringatan, hari manual', () => {
  ok(qs('saveAbsen', { tanggal: '2026-11-03', rows: [
    { worker_id: 'W-001', hadir: true, jam_masuk: '08:00', jam_pulang: '17:00' },           // 8 jam
    { worker_id: 'W-002', hadir: true, jam_masuk: '08:00', jam_pulang: '20:40' }] }));      // 11,67 jam -> lembur 3,5
  ok(qs('saveAbsen', { tanggal: '2026-11-04', rows: [
    { worker_id: 'W-001', hadir: true, jam_masuk: '07:00', jam_pulang: '23:00' },           // 15 jam -> lembur maks 4
    { worker_id: 'W-002', hadir: true, jam_masuk: '08:00', jam_pulang: '13:00' }] }));      // 4 jam -> auto 1 hari + peringatan
  res = ok(qs('saveAbsen', { tanggal: '2026-11-05', rows: [
    { worker_id: 'W-001', hadir: true, jam_masuk: '08:00', jam_pulang: '12:00', hari_mode: 'manual', hari_manual: 0.5 },
    { worker_id: 'W-002', hadir: false }] }));
  const A = res.rekap.pekerja.find(p => p.worker_id === 'W-001'), B = res.rekap.pekerja.find(p => p.worker_id === 'W-002');
  // A: 1 + 1 + 0,5 hari × 160.000 ; lembur 4 jam × 20.000 (auto = 160.000 / 8)
  assert.deepStrictEqual([A.hadir, A.hari, A.jam_lembur, A.upah_normal, A.upah_lembur, A.total], [3, 2.5, 4, 400000, 80000, 480000]);
  // B: 2 hari × 120.000 ; lembur 3,5 jam × 20.000 (manual)
  assert.deepStrictEqual([B.hadir, B.hari, B.jam_lembur, B.upah_normal, B.upah_lembur, B.total], [2, 2, 3.5, 240000, 70000, 310000]);
  assert.strictEqual(res.rekap.total.total, 790000);
  assert.ok(res.rekap.warnings.some(w => /Pekerja B: kerja 4 jam/.test(w)));
  assert.strictEqual(res.rekap.warnings.length, 1, 'hari manual tidak diberi peringatan');
  assert.deepStrictEqual([res.periode.no_ke, res.periode.tgl_mulai, res.periode.tgl_akhir, res.periode.status], [4, '2026-11-02', '2026-11-15', 'Terbuka']);
});

test('jam disimpan sebagai teks dan nama/jabatan disnapshot di absensi', () => {
  const a = res.absen.find(x => x.worker_id === 'W-001' && x.tanggal === '2026-11-03');
  assert.deepStrictEqual([a.jam_masuk, a.jam_pulang, a.nama, a.jabatan], ['08:00', '17:00', 'Pekerja A', 'Tukang Besi']);
  assert.ok(!res.absen.some(x => x.worker_id === 'W-002' && x.tanggal === '2026-11-05'), 'hadir:false menghapus');
});

test('viewer tidak bisa melihat periode yang belum Final', () => {
  err(view('getHarian', { no_ke: 4 }), 'FORBIDDEN', 'viewer draft');
});

test('finalisasi: wajib ack, snapshot rate; perubahan rate sesudahnya tidak mengubah klaim', () => {
  err(qs('finalizeHarian', { no_ke: 4 }), 'ACK_REQUIRED', 'tanpa ack');
  err(qs('finalizeHarian', { no_ke: 5, ack: true }), 'CHECK_FAILED', 'periode kosong');
  const f = ok(qs('finalizeHarian', { no_ke: 4, ack: true }));
  assert.strictEqual(f.periode.status, 'Final');
  ok(qs('savePekerja', { id: 'W-001', rate_harian: 999999 }));
  ok(qs('saveConfig', { values: { lembur_maks: 1 } }));
  const v = ok(view('getHarian', { no_ke: 4 }));
  assert.strictEqual(v.rekap.total.total, 790000);
  assert.strictEqual(v.rekap.pekerja.find(p => p.worker_id === 'W-001').rate_harian, 160000);
  err(qs('saveAbsen', { tanggal: '2026-11-06', rows: [{ worker_id: 'W-001', hadir: true, jam_masuk: '08:00', jam_pulang: '17:00' }] }), 'BAD_STATE', 'absen di periode Final');
  ok(qs('saveConfig', { values: { lembur_maks: 4 } }));
  ok(qs('savePekerja', { id: 'W-001', rate_harian: 160000 }));
});

test('buka kunci: wajib alasan, kembali Terbuka, tercatat di log', () => {
  err(qs('unlockHarian', { no_ke: 4, reason: '' }), 'VALIDATION', 'tanpa alasan');
  ok(qs('unlockHarian', { no_ke: 4, reason: 'koreksi jam pulang' }));
  assert.strictEqual(ok(qs('getHarian', { no_ke: 4 })).periode.status, 'Terbuka');
  assert.strictEqual(sheets.Harian_Klaim.rows.length, 1, 'snapshot dihapus (tinggal header)');
  assert.ok(ok(qs('getLog', { limit: 3 })).some(l => l.aksi === 'unlockHarian'));
});

test('sync ulang: tanda harian & rate tetap; pekerja yang hilang dari HSE tidak bisa diabsen', () => {
  hse.Worker.rows.splice(2, 1); // hapus W-002 dari HSE
  hse.Worker.rows[1][1] = 'Pekerja A Baru';
  const r = ok(qs('syncHse'));
  assert.deepStrictEqual([r.baru, r.diperbarui, r.hilang], [0, 1, 1]);
  const p = ok(qs('bootstrap')).pekerja, a = p.find(x => x.id === 'W-001'), b = p.find(x => x.id === 'W-002');
  assert.deepStrictEqual([a.nama, a.harian, a.rate_harian], ['Pekerja A Baru', true, 160000]);
  assert.strictEqual(b.di_hse, false);
  const e = err(qs('saveAbsen', { tanggal: '2026-11-06', rows: [{ worker_id: 'W-002', hadir: true, jam_masuk: '08:00', jam_pulang: '17:00' }] }), 'VALIDATION', 'hilang dari HSE');
  assert.ok(/sudah tidak ada di daftar HSE/.test(e.details[0]));
});

test('bootstrap tetap jalan di deploy lama tanpa tab harian', () => {
  ['Pekerja', 'Harian_Periode'].forEach(t => { sheets['__bak_' + t] = sheets[t]; delete sheets[t]; });
  const b = ok(qs('bootstrap'));
  assert.deepStrictEqual([b.pekerja, b.harianPeriods], [[], []]);
  ['Pekerja', 'Harian_Periode'].forEach(t => { sheets[t] = sheets['__bak_' + t]; delete sheets['__bak_' + t]; });
});

test('saveConfig: jam standar harus HH:MM', () => {
  err(qs('saveConfig', { values: { jam_masuk_std: '8 pagi' } }), 'VALIDATION', 'jam salah');
  ok(qs('saveConfig', { values: { jam_masuk_std: '07:30' } }));
});

console.log(`\n${n} tes lulus` + (process.exitCode ? ', ADA YANG GAGAL' : ''));
