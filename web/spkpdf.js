/* spkpdf.js — baca PDF "SURAT PERINTAH KERJA (SPK)" (template FM/05-03) menjadi daftar item.
 *
 * Dua tahap:
 *  1) extractLayout(pdfjsLib, pdfDoc) : teks berposisi + garis horizontal tabel tiap halaman (butuh pdf.js 3.x)
 *  2) parseSpk(pages)                 : fungsi murni -> { header, items, total, warnings, retensi, signers }
 *
 * Baris tabel ditentukan dari garis border yang tergambar di PDF (bukan dari tebakan jarak teks), sehingga sel
 * bertingkat (deskripsi/spesifikasi 2–4 baris) tetap jatuh ke baris yang benar. Seluruh pembacaan terjadi di browser;
 * isi PDF tidak dikirim ke mana pun.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpkPdf = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- 1) ekstraksi (pdf.js) ---------- */
  function mul(a, b) { // terapkan a lalu b (konvensi PDF, vektor-baris)
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
      a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
  }

  /** Garis horizontal (y ke bawah, x dari tepi kiri halaman) dari operator gambar halaman. */
  function horizontalLines(lib, opList, vx0, vy1) {
    const OPS = lib.OPS, out = [];
    let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
    const pt = (x, y) => [x * ctm[0] + y * ctm[2] + ctm[4], x * ctm[1] + y * ctm[3] + ctm[5]];
    const seg = (x0, y0, x1, y1) => {
      const p = pt(x0, y0), q = pt(x1, y1);
      if (Math.abs(p[1] - q[1]) < 0.4 && Math.abs(p[0] - q[0]) > 2) out.push({ y: vy1 - p[1], x0: Math.min(p[0], q[0]) - vx0, x1: Math.max(p[0], q[0]) - vx0 });
    };
    const rect = (x, y, w, h) => {
      const c = [pt(x, y), pt(x + w, y), pt(x, y + h), pt(x + w, y + h)];
      const xs = c.map(p => p[0]), ys = c.map(p => p[1]);
      const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
      if (bh < 1.6 && bw > 2) out.push({ y: vy1 - (Math.max(...ys) + Math.min(...ys)) / 2, x0: Math.min(...xs) - vx0, x1: Math.max(...xs) - vx0 });
    };
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i], a = opList.argsArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop(); }
      else if (fn === OPS.transform) ctm = mul(a, ctm);
      else if (fn === OPS.constructPath) {
        const ops = a[0], c = a[1]; let k = 0, cx = 0, cy = 0, sx = 0, sy = 0;
        for (let j = 0; j < ops.length; j++) {
          const op = ops[j];
          if (op === OPS.moveTo) { cx = c[k++]; cy = c[k++]; sx = cx; sy = cy; }
          else if (op === OPS.lineTo) { const nx = c[k++], ny = c[k++]; seg(cx, cy, nx, ny); cx = nx; cy = ny; }
          else if (op === OPS.curveTo) k += 6;
          else if (op === OPS.curveTo2 || op === OPS.curveTo3) k += 4;
          else if (op === OPS.closePath) { seg(cx, cy, sx, sy); cx = sx; cy = sy; }
          else if (op === OPS.rectangle) { const x = c[k++], y = c[k++], w = c[k++], h = c[k++]; rect(x, y, w, h); }
        }
      }
    }
    return out;
  }

  async function extractLayout(lib, doc) {
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const v = page.view, vx0 = v[0], vy1 = v[3], W = v[2] - v[0], H = v[3] - v[1];
      const tc = await page.getTextContent();
      const frags = [];
      tc.items.forEach(it => {
        if (!it.str || !it.str.trim()) return;
        const t = it.transform, h = Math.abs(it.height) || Math.abs(t[3]) || 8;
        frags.push({ str: it.str, x: t[4] - vx0, y: vy1 - t[5] - h * 0.3, w: it.width || 0, h: h });
      });
      const hlines = horizontalLines(lib, await page.getOperatorList(), vx0, vy1);
      pages.push({ n: n, W: W, H: H, frags: frags, hlines: hlines });
    }
    return pages;
  }

  /* ---------- 2) parser ---------- */
  const clean = s => String(s == null ? '' : s)
    .replace(/(\d)�(\d)/g, '$1–$2').replace(/�(?=\d)/g, 'Ø').replace(/\s+/g, ' ').trim();
  const parseNum = s => {
    s = String(s == null ? '' : s).replace(/Rp/gi, '').replace(/\s/g, '');
    if (s === '' || s === '-') return 0;
    const n = Number(s.replace(/,/g, ''));
    return isNaN(n) ? NaN : n;
  };
  const isNumText = s => /^[\d.,]+$/.test(String(s).trim()) && /\d/.test(s);
  const normUnit = u => ({ m2: 'm²', m3: 'm³', kg: 'kg' }[String(u).toLowerCase()] || String(u).trim());

  function cluster(vals, tol) {
    const v = vals.slice().sort((a, b) => a - b), out = [];
    v.forEach(x => {
      const last = out[out.length - 1];
      if (last && x - last.max <= tol) { last.sum += x; last.n++; last.max = x; } else out.push({ sum: x, n: 1, max: x });
    });
    return out.map(c => ({ v: c.sum / c.n, n: c.n }));
  }
  const fail = msg => { const e = new Error(msg); e.spk = true; return e; };

  const HEADS = [['NO.', 0], ['DESKRIPSI PEKERJAAN', 1], ['SPESIFIKASI TEKNIS', 2], ['VOLUME', 3], ['SAT.', 4], ['HARGA SAT.', 5], ['JUMLAH', 6]];
  const FRACTIONS = [0.052, 0.091, 0.355, 0.548, 0.642, 0.676, 0.8, 0.947]; // cadangan: proporsi template FM/05-03

  function findHeaderCells(page) {
    const found = {};
    page.frags.forEach(f => {
      const t = f.str.trim().toUpperCase();
      HEADS.forEach(h => { if (t === h[0] && !found[h[1]]) found[h[1]] = f; });
    });
    return Object.keys(found).length === HEADS.length ? found : null;
  }

  function columnEdges(page, hdr) {
    const hy = hdr[3].y;
    const ends = [];
    page.hlines.forEach(l => { if (Math.abs(l.y - hy) <= 20 && l.x1 - l.x0 > 8) { ends.push(l.x0); ends.push(l.x1); } });
    let edges = cluster(ends, 1.5).filter(c => c.n >= 2).map(c => c.v);
    if (edges.length !== 8) edges = FRACTIONS.map(f => f * page.W);
    // setiap judul kolom harus berada di kolom yang benar; kalau tidak, template tidak cocok
    for (let c = 0; c < 7; c++) {
      const f = hdr[c], cx = f.x + f.w / 2;
      if (cx < edges[c] - 2 || cx > edges[c + 1] + 2) throw fail('Susunan kolom tabel tidak sama dengan template SPK (FM/05-03).');
    }
    return edges;
  }

  const colOf = (x, edges) => { for (let c = 0; c < 7; c++) if (x >= edges[c] - 1 && x < edges[c + 1] - 0.5) return c; return -1; };
  function cellsOfBand(frags, edges) {
    const cols = [[], [], [], [], [], [], []];
    frags.forEach(f => { const c = colOf(f.x, edges); if (c >= 0) cols[c].push(f); });
    return cols.map(list => {
      list.sort((a, b) => Math.abs(a.y - b.y) > 2.5 ? a.y - b.y : a.x - b.x);
      return clean(list.map(f => f.str).join(' '));
    });
  }

  function parseHeader(page) {
    const labels = ['PROJECT', 'OWNER', 'SPK', 'MANDOR', 'PEKERJAAN'], out = {};
    labels.forEach(lb => {
      const l = page.frags.find(f => f.str.trim().toUpperCase() === lb && f.x < page.W * 0.25 && f.y < page.H * 0.35);
      if (!l) return;
      const line = page.frags.filter(f => Math.abs(f.y - l.y) < 3 && f !== l && f.x > l.x + 10).sort((a, b) => a.x - b.x);
      const vals = line.filter(f => f.str.trim() !== '=');
      out[lb] = clean(vals.map(f => f.str).join(' '));
    });
    return out;
  }

  function parseSigners(pages) {
    const names = ['Project Manager', 'Direktur', 'Mengetahui', 'Mandor'];
    for (let p = pages.length - 1; p >= 0; p--) {
      const fr = pages[p].frags, labs = names.map(n => fr.find(f => f.str.trim() === n && f.x > pages[p].W * 0.05));
      if (labs.some(l => !l)) continue;
      return labs.map((l, i) => {
        const cx = l.x + l.w / 2;
        const cand = fr.filter(f => f.y > l.y + 8 && f.y < l.y + 90 && Math.abs(f.x + f.w / 2 - cx) < 70 && /^[A-Z][A-Z .'\-]+$/.test(f.str.trim()))
          .sort((a, b) => a.y - b.y)[0];
        return { label: names[i], name: cand ? clean(cand.str) : '' };
      });
    }
    return [];
  }

  /** Deskripsi item dari konteks (bagian › sub › kelompok) + nama. mode: 'full' | 'short' (2 konteks terakhir) | 'name'. */
  function describe(ctx, name, mode) {
    let parts = mode === 'name' ? [] : mode === 'full' ? ctx.slice() : ctx.slice(-2);
    parts = parts.concat([name]).filter(Boolean);
    parts = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
    while (parts.join(' › ').length > 200 && parts.length > 1) parts.splice(0, 1); // buang konteks terjauh dulu
    return parts.join(' › ').slice(0, 200);
  }

  function parseSpk(pages) {
    if (!pages || !pages.length) throw fail('PDF kosong.');
    const all = pages.map(p => p.frags.map(f => f.str).join(' ')).join(' ');
    if (!/SURAT\s+PERINTAH\s+KERJA/i.test(all)) throw fail('Ini bukan PDF "Surat Perintah Kerja (SPK)" sesuai template.');
    const header = parseHeader(pages[0]);
    if (!header.SPK || !header.MANDOR) throw fail('Kop SPK (nomor SPK / mandor) tidak terbaca.');

    const items = [], warnings = [];
    let section = '', sub = '', chain = [], lastWasItem = false, totalPdf = null, done = false, rowsSeen = 0;
    for (let pi = 0; pi < pages.length && !done; pi++) {
      const page = pages[pi], hdr = findHeaderCells(page);
      if (!hdr) { if (pi === 0) throw fail('Judul kolom tabel (NO., DESKRIPSI, VOLUME, SAT., HARGA, JUMLAH) tidak ditemukan.'); continue; }
      const edges = columnEdges(page, hdr);
      // batas bawah judul kolom kadang tidak tergambar sebagai garis (sel berwarna) -> pakai posisi teks judul + setengah tinggi sel
      const headBottom = hdr[3].y + 12;
      const wide = page.hlines.filter(l => l.x1 - l.x0 >= 15 && l.x1 > edges[0] && l.x0 < edges[7] && l.y > headBottom + 3);
      const bounds = cluster(wide.map(l => l.y), 0.8).map(c => c.v);
      bounds.unshift(headBottom);
      if (bounds.length < 2) throw fail('Garis baris tabel tidak terbaca pada halaman ' + page.n + '.');
      for (let b = 0; b + 1 < bounds.length && !done; b++) {
        const y0 = bounds[b], y1 = bounds[b + 1];
        const fr = page.frags.filter(f => f.y > y0 && f.y < y1 && f.x >= edges[0] - 1 && f.x < edges[7]);
        if (!fr.length) continue;
        const [no, desc, spec, vol, sat, harga, jumlah] = cellsOfBand(fr, edges);
        rowsSeen++;
        if (/\bTOTAL\b/i.test([no, desc, spec, vol, sat, harga].join(' ')) || /^TOTAL$/i.test(jumlah)) {
          const n = parseNum(jumlah.replace(/TOTAL/i, ''));
          if (n > 0) totalPdf = n;
          done = true; break;
        }
        const isItem = isNumText(vol) && sat !== '';
        if (!isItem) {
          const t = desc;
          if (/^\d+$/.test(no)) { section = t; sub = ''; chain = []; lastWasItem = false; }
          else if (/^[a-z]$/i.test(no)) { sub = t; chain = []; lastWasItem = false; }
          else if (t) { if (lastWasItem) chain = []; chain.push(t); lastWasItem = false; }
          continue;
        }
        const child = /^[-–•]\s*/.test(desc), name = desc.replace(/^[-–•]\s*/, '');
        const it = {
          no: items.length + 1, page: page.n, section: section,
          ctx: [section, sub].concat(child ? chain : []).filter(Boolean), nama: name,
          deskripsi: '',
          spesifikasi: spec.slice(0, 200), sat: normUnit(sat),
          vol: parseNum(vol), harga: parseNum(harga), jumlah: parseNum(jumlah), warn: []
        };
        if (isNaN(it.vol) || isNaN(it.harga) || isNaN(it.jumlah)) it.warn.push('Angka tidak terbaca dengan benar');
        else {
          if (!(it.vol > 0)) it.warn.push('Volume 0');
          if (!(it.harga > 0)) it.warn.push('Harga satuan kosong');
          if (it.harga > 0 && it.jumlah > 0) {
            const calc = it.vol * it.harga, d = Math.abs(calc - it.jumlah) / it.jumlah;
            if (d > 0.005) it.warn.push('Jumlah di PDF berbeda ' + (d * 100).toFixed(1) + '% dari volume × harga');
          } else if (it.harga > 0 && !(it.jumlah > 0)) it.warn.push('Jumlah di PDF kosong');
        }
        it.deskripsi = describe(it.ctx, name, 'short');
        items.push(it);
        lastWasItem = child; if (!child) chain = [];
      }
    }
    if (!items.length) throw fail('Tidak ada baris pekerjaan (dengan volume, satuan, dan harga) yang terbaca.');
    if (totalPdf === null) warnings.push('Baris TOTAL tidak ditemukan; jumlah tidak bisa dicocokkan dengan PDF.');
    const sumJumlah = items.reduce((a, i) => a + (isNaN(i.jumlah) ? 0 : i.jumlah), 0);
    // tiap jumlah di PDF dibulatkan ke rupiah, jadi selisih kecil (±0,5 per baris) wajar
    const tol = Math.max(1, items.length * 0.5);
    const total = { pdf: totalPdf, items: sumJumlah, ok: totalPdf !== null && Math.abs(totalPdf - sumJumlah) <= tol, diff: totalPdf === null ? null : totalPdf - sumJumlah };
    if (totalPdf !== null && !total.ok) warnings.push('Total PDF ' + Math.round(totalPdf).toLocaleString('id-ID') + ' ≠ jumlah baris terbaca ' + Math.round(sumJumlah).toLocaleString('id-ID') + ' — ada baris yang terlewat atau salah baca. Periksa sebelum impor.');

    const m = all.match(/Retensi\s+(\d+(?:[.,]\d+)?)\s*%/i);
    return {
      header: { project: header.PROJECT || '', owner: header.OWNER || '', spk: header.SPK, mandor: header.MANDOR, pekerjaan: header.PEKERJAAN || '' },
      items: items, total: total, warnings: warnings,
      retensi: m ? Number(m[1].replace(',', '.')) : null,
      signers: parseSigners(pages), rows: rowsSeen
    };
  }

  return { extractLayout: extractLayout, parseSpk: parseSpk, describe: describe, _cluster: cluster };
});
