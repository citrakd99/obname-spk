/**
 * Uji parser impor PDF SPK (web/spkpdf.js) memakai fixture netral spk-contoh.pdf dan pdf.js bawaan web/vendor.
 * Jalankan:  node backend/test/spkpdf.test.js
 */
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const lib = require(path.join(root, 'web', 'vendor', 'pdfjs', 'pdf.min.js'));
lib.GlobalWorkerOptions.workerSrc = path.join(root, 'web', 'vendor', 'pdfjs', 'pdf.worker.min.js');
const Sp = require(path.join(root, 'web', 'spkpdf.js'));

let n = 0, bad = 0;
const test = async (name, fn) => { try { await fn(); n++; console.log('  ok  ' + name); } catch (e) { bad++; process.exitCode = 1; console.log('  GAGAL  ' + name + '\n        ' + e.message); } };

(async () => {
  const doc = await lib.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'spk-contoh.pdf'))), verbosity: 0 }).promise;
  const pages = await Sp.extractLayout(lib, doc);
  const res = Sp.parseSpk(pages);
  console.log('Parser impor PDF SPK');

  await test('kop SPK terbaca', () => assert.deepStrictEqual(res.header,
    { project: 'PROYEK CONTOH', owner: 'PT OWNER CONTOH', spk: '007', mandor: 'MANDOR CONTOH', pekerjaan: 'SIPIL - GEDUNG A' }));

  await test('8 baris pekerjaan; baris judul/kelompok tidak ikut; satuan dinormalkan', () => {
    assert.strictEqual(res.items.length, 8);
    assert.deepStrictEqual(res.items.map(i => i.sat), ['m³', 'm³', 'm³', 'm²', 'kg', "m'", 'm²', 'm²']);
    assert.deepStrictEqual(res.items.map(i => i.vol), [120, 40.5, 2, 8, 163.3, 10, 48, 120]);
  });

  await test('baris pertama setelah judul kolom di halaman 2 tidak hilang (regresi)', () => {
    const last = res.items[7];
    assert.strictEqual(last.page, 2);
    assert.deepStrictEqual(last.ctx, ['PEKERJAAN FINISHING', 'Lantai']);
  });

  await test('konteks: anak ("- ...") mewarisi kelompok; item tingkat atas tidak', () => {
    assert.deepStrictEqual(res.items[2].ctx, ['PEKERJAAN BETON', 'Struktur Lantai 1', 'Pile Cap ( 1000 x 1000 x 300 mm ) ; 2 Nos']);
    assert.deepStrictEqual(res.items[1].ctx, ['PEKERJAAN TANAH']); // "Urugan pasir" tanpa "-"
    assert.strictEqual(res.items[2].nama, 'Concrete fc 25Mpa');
  });

  await test('deskripsi 3 mode: ringkas, lengkap, nama saja', () => {
    const i = res.items[2];
    assert.strictEqual(Sp.describe(i.ctx, i.nama, 'name'), 'Concrete fc 25Mpa');
    assert.strictEqual(Sp.describe(i.ctx, i.nama, 'short'), 'Struktur Lantai 1 › Pile Cap ( 1000 x 1000 x 300 mm ) ; 2 Nos › Concrete fc 25Mpa');
    assert.strictEqual(Sp.describe(i.ctx, i.nama, 'full'), 'PEKERJAAN BETON › Struktur Lantai 1 › Pile Cap ( 1000 x 1000 x 300 mm ) ; 2 Nos › Concrete fc 25Mpa');
    assert.ok(Sp.describe(['x'.repeat(150), 'y'.repeat(150)], 'nama', 'full').length <= 200);
  });

  await test('spesifikasi multi-baris digabung; angka harga/jumlah benar', () => {
    assert.strictEqual(res.items[2].spesifikasi, 'Beton fc 25 Mpa, proses menggunakan pompa dan talang, include perataan memakai jidar dan gosok manual');
    assert.deepStrictEqual([res.items[0].harga, res.items[0].jumlah], [85000, 10200000]);
    assert.deepStrictEqual([res.items[4].harga, res.items[4].jumlah], [2200, 359251]);
  });

  await test('harga "-" menjadi 0 dan diberi peringatan', () => {
    const it = res.items[5];
    assert.strictEqual(it.harga, 0);
    assert.ok(it.warn.some(w => /Harga satuan kosong/.test(w)));
    assert.strictEqual(res.items.filter(i => i.warn.length).length, 1);
  });

  await test('total PDF cocok dengan jumlah baris', () => {
    assert.strictEqual(res.total.pdf, 25674251);
    assert.strictEqual(res.total.ok, true);
    assert.strictEqual(res.total.diff, 0);
    assert.deepStrictEqual(res.warnings, []);
  });

  await test('retensi dan penandatangan terbaca', () => {
    assert.strictEqual(res.retensi, 5);
    assert.deepStrictEqual(res.signers.map(s => s.name), ['NAMA PM', 'NAMA DIREKTUR', 'NAMA MENGETAHUI', 'NAMA MANDOR']);
  });

  await test('baris hilang -> total tidak cocok dan diperingatkan', () => {
    const p2 = JSON.parse(JSON.stringify(pages));
    // buang semua teks "Cat dinding" (dan angkanya) dari halaman 2
    const row = p2[1].frags.filter(f => /Cat dinding/.test(f.str))[0];
    p2[1].frags = p2[1].frags.filter(f => Math.abs(f.y - row.y) > 6);
    const r = Sp.parseSpk(p2);
    assert.strictEqual(r.items.length, 7);
    assert.strictEqual(r.total.ok, false);
    assert.ok(r.warnings.some(w => /Total PDF/.test(w)));
  });

  await test('bukan PDF SPK -> error yang jelas', () => {
    const fake = [{ n: 1, W: 612, H: 792, frags: [{ str: 'Faktur Penjualan', x: 100, y: 100, w: 50, h: 8 }], hlines: [] }];
    assert.throws(() => Sp.parseSpk(fake), /bukan PDF/);
    assert.throws(() => Sp.parseSpk([]), /kosong/);
  });

  await test('kolom bergeser dari template -> ditolak, bukan salah baca diam-diam', () => {
    const bent = JSON.parse(JSON.stringify(pages));
    bent[0].frags.forEach(f => { if (/^VOLUME$/i.test(f.str.trim())) f.x -= 120; });
    assert.throws(() => Sp.parseSpk(bent), /Susunan kolom/);
  });

  console.log(`\n${n} tes lulus` + (bad ? `, ${bad} GAGAL` : ''));
})().catch(e => { console.error(e); process.exit(1); });
