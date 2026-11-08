'use strict';
/* Impor SPK dari PDF: pilih file -> baca di browser (pdf.js + spkpdf.js) -> pratinjau -> impor lewat API.
   Memakai helper global dari app.js saat dijalankan. */

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-lib="${src}"]`)) return res();
    const el = document.createElement('script'); el.src = src; el.dataset.lib = src; el.onload = res;
    el.onerror = () => rej(new Error('Gagal memuat pembaca PDF (perlu koneksi internet)'));
    document.head.appendChild(el);
  });
}
async function handlePdf(file) {
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) return toast('File terlalu besar (maks 15 MB)', 'bad');
  busy(1);
  try {
    await loadScript('vendor/pdfjs/pdf.min.js'); await loadScript('spkpdf.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = await SpkPdf.extractLayout(pdfjsLib, doc);
    importDialog2(SpkPdf.parseSpk(pages), file.name);
  } catch (e) {
    if (e.spk) toast(e.message, 'bad'); else { console.error(e); toast('PDF tidak bisa dibaca: ' + (e.message || e), 'bad'); }
  } finally { busy(-1); $('#pdfIn').value = ''; }
}
const r2 = n => Math.round(n * 100) / 100;
function importDialog2(res, fileName) {
  const d = S.data, cfg = d.config, h = res.header, qn = s => String(s || '').trim().toLowerCase();
  const mandorHit = d.mandor.find(m => qn(m.nama) === qn(h.mandor));
  const match = mandorHit && d.spk.find(s => qn(s.no_spk) === qn(h.spk) && s.mandor_id === mandorHit.id);
  const cur = S.spkId ? d.spk.find(s => s.id === S.spkId) : null;
  const hasFinal = id => d.periods.some(p => p.spk_id === id && p.status === 'Final');
  const targets = [];
  if (match) targets.push(['match', `Perbarui SPK ${match.no_spk} · ${h.mandor} yang sudah ada (ganti semua item)`, match.id]);
  else targets.push(['new', `Buat SPK baru: ${h.spk} · ${h.mandor}${mandorHit ? '' : ' (mandor baru)'}`, null]);
  if (match) targets.push(['new', 'Buat SPK baru (nomor/mandor sama, terpisah)', null]);
  if (cur && (!match || cur.id !== match.id)) targets.push(['current', `Tambahkan ke SPK terpilih: ${cur.no_spk} (item lama dipertahankan)`, cur.id]);
  const sel = res.items.map(() => true), desc = res.items.map(i => i.deskripsi);
  const m = { ctxMode: 'short', basis: 'spk', target: 0 };
  const placeholder = cfg.project === 'Nama Proyek' || !cfg.project;
  const diffSign = res.signers.slice(0, 3).some((s, i) => s.name && s.name !== cfg['sign' + (i + 1) + '_name']);
  const totalLine = res.total.pdf === null ? '<span class="warnx">⚠ Baris TOTAL tidak ditemukan di PDF</span>'
    : res.total.ok ? `✅ Total cocok dengan PDF: <b>${rp(res.total.pdf)}</b>${res.total.diff ? ` <span class="mut">(selisih pembulatan ${num(res.total.diff)})</span>` : ''}`
      : `<span style="color:var(--bad)">❌ Total PDF ${rp(res.total.pdf)} ≠ jumlah baris terbaca ${rp(res.total.items)}</span>`;
  const rowHtml = (i, k) => `<div class="imp-row"><label class="chk" style="margin:0"><input type="checkbox" data-isel="${k}" checked><span class="no" style="background:var(--soft);color:var(--pri);border-radius:7px;padding:1px 8px;font-weight:700;font-size:12px">${i.no}</span></label>
    <div style="flex:1;min-width:0"><input data-idesc="${k}" value="${esc(desc[k])}" style="font-size:13px;padding:6px 8px">
    <div class="mut">${fmt(i.vol)} ${esc(i.sat)} × ${num(i.harga)} = <b>${num(i.jumlah)}</b>${i.warn.length ? ` <span class="warnx">⚠ ${esc(i.warn.join('; '))}</span>` : ''}</div></div></div>`;
  const nWarn = res.items.filter(i => i.warn.length).length;
  dialog('Impor SPK dari PDF', `
    <div class="mut" style="margin-bottom:6px">${esc(fileName)} · ${res.items.length} baris pekerjaan terbaca</div>
    <div class="card" style="margin:0 0 8px;font-size:13px;padding:10px 12px"><b>${esc(h.project)}</b> · ${esc(h.owner)}<br>SPK <b>${esc(h.spk)}</b> · ${esc(h.mandor)} · ${esc(h.pekerjaan)}</div>
    <div style="font-size:13px;margin-bottom:6px">${totalLine}${nWarn ? `<br><span class="warnx">⚠ ${nWarn} baris punya catatan (lihat di daftar)</span>` : ''}</div>
    ${res.warnings.filter(w => !/^Total PDF/.test(w)).map(w => `<div class="warnx">${esc(w)}</div>`).join('')}
    <label>Tujuan impor</label>
    <select id="impT">${targets.map((t, k) => `<option value="${k}">${esc(t[1])}</option>`).join('')}</select>
    <div class="err" id="impTW" style="min-height:0"></div>
    <div class="grid2"><div><label>Volume di PDF adalah</label><select id="impB"><option value="spk">Volume SPK (RAB dihitung ÷ ${num_(cfg.pctSpk)}%)</option><option value="rab">Volume RAB (SPK = RAB × ${num_(cfg.pctSpk)}%)</option></select></div>
    <div><label>Konteks di deskripsi</label><select id="impC"><option value="short">Ringkas (2 tingkat)</option><option value="full">Lengkap</option><option value="name">Nama saja</option></select></div></div>
    <label class="chk"><input type="checkbox" id="impP" ${placeholder ? 'checked' : ''}> Isi nama proyek &amp; owner dari PDF (sekarang: ${esc(cfg.project)})</label>
    ${res.retensi != null && res.retensi !== num_(cfg.ret) ? `<label class="chk"><input type="checkbox" id="impR" checked> Atur retensi menjadi ${res.retensi}% sesuai PDF (sekarang ${num_(cfg.ret)}%)</label>` : ''}
    ${diffSign ? `<label class="chk"><input type="checkbox" id="impS" ${placeholder ? 'checked' : ''}> Isi penandatangan dari PDF (${esc(res.signers.slice(0, 3).map(s => s.name).join(', '))})</label>` : ''}
    <div class="row" style="margin-top:10px"><b id="impCnt"></b><button class="btn sm sec" type="button" id="impAll">Pilih semua / kosongkan</button></div>
    <div class="imp-list" id="impList">${res.items.map(rowHtml).join('')}</div>`, [
    { label: 'Batal' },
    { label: 'Impor', cls: '', run: async () => { await runImport(res, targets, m, sel, desc); } }], true);
  const dl = $('#dlg'), upd = () => {
    const n = sel.filter(Boolean).length;
    $('#impCnt').textContent = `${n} dari ${res.items.length} item dipilih`;
    const t = targets[m.target], blocked = t[2] && t[0] !== 'new' && hasFinal(t[2]);
    $('#impTW').textContent = blocked ? 'SPK tujuan sudah punya periode Final — item tidak bisa diganti/ditambah.' : '';
    const ok = [...dl.querySelectorAll('#dbtn button')].find(b => b.textContent === 'Impor'); if (ok) ok.disabled = !n || blocked;
  };
  $('#impT').onchange = e => { m.target = +e.target.value; upd(); };
  $('#impB').onchange = e => { m.basis = e.target.value; };
  $('#impC').onchange = e => {
    m.ctxMode = e.target.value;
    res.items.forEach((i, k) => { desc[k] = SpkPdf.describe(i.ctx, i.nama, m.ctxMode); const el = dl.querySelector(`[data-idesc="${k}"]`); if (el) el.value = desc[k]; });
  };
  $('#impList').addEventListener('input', e => { if (e.target.matches('[data-idesc]')) desc[+e.target.dataset.idesc] = e.target.value; });
  $('#impList').addEventListener('change', e => { if (e.target.matches('[data-isel]')) { sel[+e.target.dataset.isel] = e.target.checked; upd(); } });
  $('#impAll').onclick = () => { const on = sel.some(x => !x); sel.fill(on); dl.querySelectorAll('[data-isel]').forEach(c => { c.checked = on; }); upd(); };
  upd();
}
async function runImport(res, targets, m, sel, desc) {
  const dl = $('#dlg'), cfg = S.data.config, h = res.header, pct = num_(cfg.pctSpk) || 80;
  const t = targets[m.target], kind = t[0];
  let spkId = t[2];
  if (kind === 'new') {
    let md = S.data.mandor.find(x => x.nama.trim().toLowerCase() === h.mandor.trim().toLowerCase());
    if (!md) md = (await api('saveMandor', { nama: h.mandor })).data;
    spkId = (await api('saveSpk', { no_spk: h.spk, mandor_id: md.id, pekerjaan: h.pekerjaan || '-' })).data.id;
  }
  const existing = S.data.items.filter(i => i.spk_id === spkId);
  const base = kind === 'current' ? existing.reduce((a, i) => Math.max(a, +i.no), 0) : 0;
  const rows = res.items.map((i, k) => ({ i, k })).filter(x => sel[x.k]).map((x, n) => ({
    no: base + n + 1, deskripsi: String(desc[x.k] || x.i.nama).slice(0, 200), spesifikasi: x.i.spesifikasi, sat: x.i.sat || '-', harga: x.i.harga,
    vol_rab: m.basis === 'spk' ? r2(x.i.vol * 100 / pct) : x.i.vol, vol_spk_override: m.basis === 'spk' ? x.i.vol : ''
  }));
  const out = await api('importItems', { spk_id: spkId, rows, replace: kind !== 'current' });
  const values = {};
  if ($('#impP', dl) && $('#impP', dl).checked) { if (h.project) values.project = h.project; if (h.owner) values.owner = h.owner; }
  if ($('#impR', dl) && $('#impR', dl).checked) values.ret = res.retensi;
  if ($('#impS', dl) && $('#impS', dl).checked) res.signers.slice(0, 3).forEach((s, i) => { values['sign' + (i + 1) + '_label'] = s.label; values['sign' + (i + 1) + '_name'] = s.name; });
  if (Object.keys(values).length) { try { await api('saveConfig', { values }); } catch (e) { showErr(e); } }
  S.spkId = spkId; store.set('obname.spk', spkId); S.pid = null; S.pdfPid = null; S.manPid = null;
  toast(`${out.data.imported} item diimpor ke SPK ${h.spk}`, 'ok');
  await reload(); go('spk');
}
