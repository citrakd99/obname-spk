'use strict';
/* Tampilan layar lebar: kartu, grid, dan tabel. Dipanggil lewat VIEWS di app.js.
   Memakai helper global dari app.js ($, esc, fmt, rp, num, S, ctx, rep, api, toast, dialog, ...) saat dijalankan. */

const head = (title, sub, actions) =>
  `<div class="page-h"><div><h1>${title}</h1>${sub ? `<div class="mut" style="margin-top:2px">${sub}</div>` : ''}</div><div class="toolbar">${actions || ''}</div></div>`;
const spkLine = c => `SPK ${esc(c.spk.no_spk)} · ${esc(c.mandor.nama)} · ${esc(c.spk.pekerjaan)}`;
const chipsOf = (list, cur, act) => list.length > 1 ? `<div class="seg">${list.map(x => `<button class="${x.id === cur ? 'on' : ''}" data-act="${act}" data-id="${x.id}">#${x.no_ke}${x.status === 'Final' ? ' 🔒' : ''}</button>`).join('')}</div>` : '';

/* ---------- BERANDA ---------- */
function vDash() {
  const c = needSpk(); if (!c) return;
  const { cfg, items, periods } = c;
  const spkVal = items.reduce((a, i) => a + volSpk_(i, cfg) * num_(i.harga), 0);
  const finals = periods.filter(p => p.status === 'Final');
  const done = finals.reduce((a, p) => a + num_(p.total), 0), ret = finals.reduce((a, p) => a + num_(p.retensi), 0);
  const act = activePeriod(c), r = act ? rep(act) : null;
  const reps = periods.map(p => ({ p, r: rep(p) }));
  const fcAll = reps.filter(x => x.p.status !== 'Final').reduce((a, x) => a + x.r.total_forecast, 0);
  const bars = reps.slice(-10).map(x => ({ l: '#' + x.p.no_ke, v: x.p.status === 'Final' ? num_(x.p.total) : x.r.total_forecast, t: x.p.status === 'Final' ? 'a' : x.p.status === 'Tracking' ? 'f' : 'd' }));
  const mx = Math.max(1, ...bars.map(b => b.v));
  const pct = x => spkVal ? Math.min(100, x / spkVal * 100) : 0;
  V(`${head('Beranda', spkLine(c))}
  <div class="cards">
    <div class="card"><div class="k">Nilai SPK</div><div class="v">${rp(spkVal)}</div><div class="mut">${items.length} item pekerjaan</div></div>
    <div class="card"><div class="k">Terobname (final)</div><div class="v">${rp(done)}</div><div class="bar2"><div style="width:${pct(done)}%"></div></div><div class="mut" style="margin-top:4px">${Math.round(pct(done))}% dari SPK</div></div>
    <div class="card"><div class="k">Sisa nilai SPK</div><div class="v">${rp(spkVal - done)}</div></div>
    <div class="card"><div class="k">Retensi tertahan</div><div class="v">${rp(ret)}</div><div class="mut">${num_(cfg.ret)}% per periode</div></div>
  </div>
  <div class="split" style="margin-top:14px">
    ${act ? `<div class="card"><div class="row"><b>Periode #${act.no_ke}</b>${pillOf(act.status)}</div><div class="mut">${esc(pRange(act))}</div>
      <div class="row" style="margin-top:12px"><div><div class="k mut">Forecast</div><b style="font-size:17px">${rp(r.total_forecast)}</b></div><div style="text-align:right"><div class="k mut">Aktual</div><b style="font-size:17px">${rp(r.total)}</b></div></div>
      <div class="bar2"><div style="width:${r.total_forecast ? Math.min(100, r.total / r.total_forecast * 100) : 0}%"></div></div>
      <div class="mut" style="margin-top:4px">Realisasi ${r.total_forecast ? Math.round(r.total / r.total_forecast * 100) : 0}% dari forecast</div>
      ${S.role === 'qs' && act.status !== 'Final' ? '<div class="actions"><button class="btn" data-nav="input">✍️ Update progres</button></div>' : ''}</div>`
      : `<div class="card"><div class="mut">Belum ada periode. ${S.role === 'qs' ? 'Buka di menu Periode.' : ''}</div></div>`}
    <div class="card"><div class="row"><b>Forecast &amp; realisasi per 2 minggu</b></div>
      ${bars.length ? `<div class="chart" style="margin-top:10px">${bars.map(b => `<div class="c"><div class="b ${b.t}" style="height:${b.v / mx * 88}%" title="${rp(b.v)}"></div>${b.l}</div>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--pri2)"></i>Final</span><span><i style="background:var(--fc)"></i>Berjalan (forecast)</span><span><i style="border:1px dashed var(--fc)"></i>Forecast</span></div>
      <div class="mut" style="margin-top:6px">Jika semua forecast tercapai, kumulatif ≈ ${Math.round(pct(done + fcAll))}% nilai SPK.</div>` : '<div class="mut" style="margin-top:8px">Belum ada data periode.</div>'}</div>
  </div>
  <h3>Semua periode</h3>${periodsTable(c, reps, false)}`);
}

function periodsTable(c, reps, withActions) {
  if (!reps.length) return '<div class="empty">Belum ada periode.</div>';
  const qs = S.role === 'qs', last = c.periods[c.periods.length - 1], finalLast = lastOf(c, 'Final');
  return `<div class="tblwrap"><table class="tbl"><thead><tr><th>#</th><th>Tanggal</th><th>Status</th><th class="r">Forecast</th><th class="r">Aktual</th><th class="r">Grand total (−retensi)</th>${withActions ? '<th>Aksi</th>' : ''}</tr></thead><tbody>
  ${[...reps].reverse().map(({ p, r }) => {
    const fin = p.status === 'Final';
    const acts = [];
    if (withActions) {
      if (fin) {
        acts.push(`<button class="btn sm sec" data-act="pdf" data-id="${p.id}">PDF</button>`);
        if (qs && finalLast && finalLast.id === p.id) acts.push(`<button class="btn sm sec" data-act="unlock" data-id="${p.id}">Buka kunci</button>`);
      } else if (qs) {
        if (p.status === 'Tracking') acts.push(`<button class="btn sm" data-act="inp" data-id="${p.id}">Input</button><button class="btn sm sec" data-act="fin" data-id="${p.id}">Final Check</button>`);
        else {
          acts.push(`<button class="btn sm sec" data-act="inp" data-id="${p.id}">Forecast</button>`);
          const ok = !c.periods.some(x => x.no_ke < p.no_ke && x.status !== 'Final') && !c.periods.some(x => x.status === 'Tracking');
          if (ok) acts.push(`<button class="btn sm" data-act="trk" data-id="${p.id}">Mulai Tracking</button>`);
        }
        if (last && last.id === p.id) acts.push(`<button class="btn sm sec" data-act="delp" data-id="${p.id}">Hapus</button>`);
      }
    }
    return `<tr><td><b>#${p.no_ke}</b></td><td>${esc(pRange(p))}</td><td>${pillOf(p.status)}</td><td class="r">${rp(r.total_forecast)}</td>
      <td class="r">${p.status === 'Forecast' ? '<span class="dim">–</span>' : rp(fin ? num_(p.total) : r.total)}</td>
      <td class="r">${p.status === 'Forecast' ? '<span class="dim">–</span>' : rp(fin ? num_(p.grand_total) : r.grand_total)}</td>${withActions ? `<td><div class="toolbar">${acts.join('')}</div></td>` : ''}</tr>`;
  }).join('')}</tbody></table></div>`;
}

/* ---------- PERIODE ---------- */
function vPer() {
  const c = needSpk(); if (!c) return;
  const reps = c.periods.map(p => ({ p, r: rep(p) }));
  V(`${head('Periode 2 mingguan', spkLine(c), S.role === 'qs' ? '<button class="btn" data-act="newp">＋ Buka periode berikutnya</button>' : '')}
  ${periodsTable(c, reps, true)}
  <p class="mut" style="margin-top:10px">Alur: Forecast → Tracking (isi aktual) → Final Check → Final (terkunci, PDF siap). Hanya satu periode Tracking pada satu waktu.</p>`);
}

/* ---------- INPUT (forecast & aktual dalam satu tabel) ---------- */
function vInput() {
  const c = needSpk(); if (!c) return;
  const open = c.periods.filter(p => p.status !== 'Final');
  if (!open.length) return V(`${head('Input', spkLine(c))}<div class="empty">Tidak ada periode aktif.<br>Buka periode berikutnya di menu Periode.<br><button class="btn" data-nav="per">Ke menu Periode</button></div>`);
  const p = open.find(x => x.id === S.pid) || open.find(x => x.status === 'Tracking') || open[0];
  S.pid = p.id;
  const r = rep(p), dr = draftOf(p.id), trk = p.status === 'Tracking';
  S.inp = { p, r, trk };
  V(`${head(`Input · Periode #${p.no_ke} ${pillOf(p.status)}`, `${esc(pRange(p))} · ${spkLine(c)}`,
    `${chipsOf(open, p.id, 'pickp')}<button class="btn sec" id="btnSave" data-act="save">Simpan</button>${trk ? `<button class="btn" data-act="fin" data-id="${p.id}">Final Check →</button>` : `<button class="btn" data-act="trk" data-id="${p.id}">Mulai Tracking</button>`}`)}
  <div class="cards" id="inCards"></div>
  <div class="tblwrap" style="margin-top:14px"><table class="tbl"><thead><tr>
    <th class="c">No</th><th>Deskripsi pekerjaan</th><th class="c">Sat</th><th class="r">Vol SPK</th><th class="r">Sebelumnya</th><th class="r">Sisa</th>
    <th class="r">Forecast</th><th class="r">Aktual${trk ? '' : ' <span class="mut">(setelah Tracking)</span>'}</th><th class="r">Aktual vs forecast</th><th class="r">Jumlah forecast</th><th class="r">Jumlah aktual</th></tr></thead>
  <tbody>${r.rows.map(row => {
    const d = dr[row.item_id] || {};
    const fv = d.vol_forecast !== undefined ? d.vol_forecast : row.vol_forecast, av = d.vol_aktual !== undefined ? d.vol_aktual : row.vol_aktual;
    return `<tr data-row="${esc(row.item_id)}"><td class="c"><span class="no">${esc(row.no)}</span></td><td><b>${esc(row.deskripsi)}</b><span class="mut">${esc(row.spesifikasi)}</span></td>
      <td class="c">${esc(row.sat)}</td><td class="r">${fmt(row.vol_spk)}</td><td class="r dim">${fmt(row.vol_sebelumnya)}</td><td class="r"><b>${fmt(row.sisa)}</b></td>
      <td class="r"><input class="cell" type="number" inputmode="decimal" min="0" step="0.01" data-item="${esc(row.item_id)}" data-key="vol_forecast" value="${fv ? fv : ''}"><span class="errtxt" data-ef></span></td>
      <td class="r"><input class="cell" type="number" inputmode="decimal" min="0" step="0.01" data-item="${esc(row.item_id)}" data-key="vol_aktual" value="${av ? av : ''}" ${trk ? '' : 'disabled'}><span class="errtxt" data-ea></span></td>
      <td class="r" data-sel></td><td class="r" data-jf></td><td class="r" data-ja></td></tr>`;
  }).join('')}</tbody>
  <tfoot><tr><td colspan="9" class="r">TOTAL</td><td class="r" id="tfF"></td><td class="r" id="tfA"></td></tr></tfoot></table></div>
  <p class="mut" style="margin-top:8px">Tekan Enter untuk pindah ke baris berikutnya pada kolom yang sama. Isian melebihi <b>Sisa</b> ditolak dan ditandai merah. Perubahan baru tersimpan setelah klik <b>Simpan</b> atau <b>Final Check</b>.</p>`);
  updInput();
}
function updInput() {
  const { p, r, trk } = S.inp, dr = draftOf(p.id);
  let tf = 0, ta = 0, bad = false;
  r.rows.forEach(row => {
    const el = $(`[data-row="${CSS.escape(row.item_id)}"]`); if (!el) return;
    const d = dr[row.item_id] || {};
    const fv = d.vol_forecast !== undefined ? d.vol_forecast : row.vol_forecast, av = d.vol_aktual !== undefined ? d.vol_aktual : row.vol_aktual;
    const fo = fv > row.sisa + 1e-9, ao = av > row.sisa + 1e-9;
    $('[data-key="vol_forecast"]', el).classList.toggle('bad', fo); $('[data-key="vol_aktual"]', el).classList.toggle('bad', ao);
    $('[data-ef]', el).textContent = fo ? `maks ${fmt(row.sisa)}` : ''; $('[data-ea]', el).textContent = ao ? `maks ${fmt(row.sisa)}` : '';
    if (fo || ao) bad = true;
    const jf = fo ? 0 : fv * row.harga, ja = ao ? 0 : av * row.harga;
    tf += jf; ta += ja;
    $('[data-jf]', el).textContent = num(jf); $('[data-ja]', el).textContent = trk || av ? num(ja) : '–';
    const df = fv > 0 && av > 0 ? (av - fv) / fv * 100 : null;
    $('[data-sel]', el).innerHTML = df === null ? '<span class="dim">–</span>' : `<span style="color:${Math.abs(df) > 20 ? 'var(--warn)' : 'inherit'}">${df > 0 ? '+' : ''}${df.toFixed(0)}%</span>`;
  });
  const retPct = num_(r.retensi_pct), ret = Math.round(ta * retPct / 100);
  $('#tfF').textContent = num(tf); $('#tfA').textContent = num(ta);
  $('#inCards').innerHTML = `<div class="card"><div class="k">Total forecast</div><div class="v">${rp(tf)}</div></div>
    <div class="card"><div class="k">Total aktual</div><div class="v">${rp(ta)}</div>${tf ? `<div class="bar2"><div style="width:${Math.min(100, ta / tf * 100)}%"></div></div>` : ''}</div>
    <div class="card"><div class="k">Retensi ${fmt(retPct)}%</div><div class="v">− ${rp(ret)}</div></div>
    <div class="card"><div class="k">Grand total pengajuan</div><div class="v" style="color:var(--pri)">${rp(ta - ret)}</div></div>`;
  $('#btnSave').disabled = bad;
}

/* ---------- FINAL CHECK ---------- */
async function vFinal() {
  const c = needSpk(); if (!c) return;
  const p = c.periods.find(x => x.id === S.pid && x.status === 'Tracking') || lastOf(c, 'Tracking');
  if (!p) return V(`${head('Final Check', spkLine(c))}<div class="empty">Tidak ada periode berstatus Tracking untuk difinalkan.</div>`);
  S.pid = p.id;
  V('<div class="empty">Memeriksa…</div>');
  if (!(await saveDraft(p))) { if (pendingCount()) return V('<div class="empty">Tidak ada koneksi.<br>Perubahan tersimpan di perangkat. Sambungkan internet lalu ulangi Final Check.</div>'); return go('input'); }
  const out = await api('checkPeriod', { periode_id: p.id });
  const { report, checks } = out.data, blk = checks.blockers.length;
  S.finBlock = blk > 0;
  V(`${head(`Final Check · Periode #${p.no_ke} ${pillOf(p.status)}`, `${esc(pRange(p))} · ${spkLine(c)}`)}
  <div class="two">
    <div class="card">
      <div class="chk2"><span>${blk ? '❌' : '✅'}</span><div><b>Volume aktual ≤ sisa volume</b>${checks.blockers.map(x => `<div class="mut" style="color:var(--bad)">${esc(x)}</div>`).join('')}</div></div>
      <div class="chk2"><span>${checks.warnings.length ? '⚠️' : '✅'}</span><div><b>Kelengkapan &amp; selisih forecast (±20%)</b>${checks.warnings.map(x => `<div class="mut">${esc(x)}</div>`).join('') || '<div class="mut">Tidak ada catatan</div>'}</div></div>
      <div class="chk2"><span>✅</span><div><b>Retensi ${fmt(report.retensi_pct)}% terhitung</b><div class="mut">Total ${rp(report.total)} · Retensi ${rp(report.retensi)} · Grand total ${rp(report.grand_total)}</div></div></div>
    </div>
    <div class="card">
      <div class="k mut">Grand total pengajuan</div><div class="v" style="font-size:26px;color:var(--pri)">${rp(report.grand_total)}</div>
      <label class="chk"><input type="checkbox" id="ack"> Saya sudah cek semua volume di lapangan</label>
      <div class="actions"><button class="btn" id="btnFin" data-act="finalize" data-id="${p.id}" disabled>🔒 Finalkan &amp; kunci periode</button><button class="btn sec" data-nav="input">Kembali ke Input</button></div>
      <p class="mut" style="margin-top:10px">Setelah final, periode terkunci dan menjadi "Vol sebelumnya" periode berikutnya.</p>
    </div>
  </div>
  <h3>Rincian yang akan diajukan</h3>
  <div class="tblwrap"><table class="tbl"><thead><tr><th class="c">No</th><th>Deskripsi</th><th class="c">Sat</th><th class="r">Sisa</th><th class="r">Vol aktual</th><th class="r">Harga sat.</th><th class="r">Jumlah</th></tr></thead><tbody>
  ${report.rows.map(r => `<tr><td class="c"><span class="no">${esc(r.no)}</span></td><td>${esc(r.deskripsi)}</td><td class="c">${esc(r.sat)}</td><td class="r">${fmt(r.sisa)}</td><td class="r"><b>${fmt(r.vol_aktual)}</b></td><td class="r">${num(r.harga)}</td><td class="r">${num(r.jumlah)}</td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="6" class="r">TOTAL</td><td class="r">${num(report.total)}</td></tr></tfoot></table></div>`);
}

/* ---------- MASTER ---------- */
function vSpk() {
  const c = needSpk(); if (!c) return;
  const { cfg, items } = c, qs = S.role === 'qs';
  const total = items.reduce((a, i) => a + volSpk_(i, cfg) * num_(i.harga), 0);
  V(`${head('Master SPK', spkLine(c), qs ? '<button class="btn sec" data-act="pdfimp">📄 Impor dari PDF SPK</button><button class="btn sec" data-act="import">⇪ Tempel dari Excel</button><button class="btn" data-act="additem">＋ Tambah item</button>' : '')}
  <div class="cards" style="margin-bottom:14px"><div class="card"><div class="k">Total nilai SPK</div><div class="v">${rp(total)}</div></div>
    <div class="card"><div class="k">Item pekerjaan</div><div class="v">${items.length}</div></div>
    <div class="card"><div class="k">Volume SPK</div><div class="v">${num_(cfg.pctSpk)}% <span class="mut">dari RAB</span></div></div></div>
  ${items.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th class="c">No</th><th>Deskripsi pekerjaan</th><th>Spesifikasi teknis</th><th class="r">Vol RAB</th><th class="r">Vol SPK</th><th class="c">Sat</th><th class="r">Harga sat.</th><th class="r">Jumlah SPK</th>${qs ? '<th></th>' : ''}</tr></thead><tbody>
  ${items.map(i => {
    const vs = volSpk_(i, cfg), ov = i.vol_spk_override !== '' && i.vol_spk_override != null;
    return `<tr ${qs ? `class="row-click" data-act="edititem" data-id="${esc(i.id)}"` : ''}><td class="c"><span class="no">${esc(i.no)}</span></td><td><b>${esc(i.deskripsi)}</b></td><td><span class="mut" style="max-width:340px">${esc(i.spesifikasi)}</span></td>
      <td class="r">${fmt(i.vol_rab)}</td><td class="r"><b>${fmt(vs)}</b>${ov ? ' <span class="mut" title="Volume SPK diisi manual">✎</span>' : ''}</td><td class="c">${esc(i.sat)}</td><td class="r">${num(i.harga)}</td><td class="r">${num(vs * num_(i.harga))}</td>${qs ? '<td class="dim">Ubah ›</td>' : ''}</tr>`;
  }).join('')}</tbody><tfoot><tr><td colspan="7" class="r">TOTAL</td><td class="r">${num(total)}</td>${qs ? '<td></td>' : ''}</tr></tfoot></table></div>` : '<div class="empty">Belum ada item pekerjaan.</div>'}`);
}
function itemDialog(it) {
  const c = ctx(), nextNo = c.items.reduce((a, i) => Math.max(a, +i.no), 0) + 1, v = it || { no: nextNo, deskripsi: '', spesifikasi: '', vol_rab: '', vol_spk_override: '', sat: '', harga: '' };
  const f = (id, label, val, type) => `<label>${label}</label><input id="${id}" type="${type || 'text'}" ${type === 'number' ? 'inputmode="decimal" step="any" min="0"' : ''} value="${esc(val)}">`;
  const btns = [{ label: 'Batal' }];
  if (it) btns.push({ label: 'Hapus', cls: 'bad', run: async () => { await api('deleteItem', { id: it.id }); toast('Item dihapus', 'ok'); await reload(); } });
  btns.push({ label: 'Simpan', cls: '', run: async d => {
    const g = id => $('#' + id, d).value;
    await api('saveItem', { id: it ? it.id : undefined, spk_id: S.spkId, no: g('iNo'), deskripsi: g('iDes'), spesifikasi: g('iSpe'), vol_rab: g('iRab'), vol_spk_override: g('iOv'), sat: g('iSat'), harga: g('iHrg') });
    toast('Item tersimpan', 'ok'); await reload();
  } });
  dialog(it ? 'Ubah item' : 'Tambah item', f('iNo', 'No', v.no, 'number') + f('iDes', 'Deskripsi pekerjaan', v.deskripsi) + f('iSpe', 'Spesifikasi teknis', v.spesifikasi) +
    `<div class="grid2"><div>${f('iRab', 'Volume RAB', v.vol_rab, 'number')}</div><div>${f('iSat', 'Satuan', v.sat)}</div></div>` +
    f('iOv', `Volume SPK manual (kosong = RAB × ${num_(c.cfg.pctSpk)}%)`, v.vol_spk_override, 'number') + f('iHrg', 'Harga satuan (Rp)', v.harga, 'number'), btns);
}
function parseNumId(s) {
  s = String(s).trim().replace(/^Rp\s*/i, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d+,\d+$/.test(s)) return Number(s.replace(',', '.'));
  return Number(s.replace(/,/g, ''));
}
function importDialog() {
  dialog('Impor item dari Excel', `<p class="mut">Salin baris dari Excel (tanpa judul kolom) lalu tempel di bawah. Urutan kolom: <b>No · Deskripsi · Spesifikasi · Volume RAB · Satuan · Harga satuan</b>.</p>
    <textarea id="impTa" placeholder="1&#9;Galian tanah&#9;Tanah biasa&#9;120&#9;m³&#9;185000"></textarea>
    <label class="chk"><input type="checkbox" id="impRep"> Ganti semua item SPK ini (hapus yang lama)</label>`, [
    { label: 'Batal' },
    { label: 'Impor', cls: '', run: async d => {
      const rows = $('#impTa', d).value.split(/\r?\n/).map(l => l.split('\t')).filter(c => c.length >= 6 && /^\d+$/.test(c[0].trim()))
        .map(c => ({ no: +c[0], deskripsi: c[1].trim(), spesifikasi: c[2].trim(), vol_rab: parseNumId(c[3]), sat: c[4].trim(), harga: parseNumId(c[5]) }));
      if (!rows.length) throw new Error('Tidak ada baris valid. Pastikan 6 kolom dipisah tab dan kolom pertama berupa nomor.');
      const out = await api('importItems', { spk_id: S.spkId, rows, replace: $('#impRep', d).checked });
      toast(out.data.imported + ' item diimpor', 'ok'); await reload();
    } }]);
}

/* ---------- MANPOWER ---------- */
function vMan() {
  const c = needSpk(); if (!c) return;
  if (!c.periods.length) return V(`${head('Forecast Manpower', spkLine(c))}<div class="empty">Belum ada periode. Forecast manpower dihitung dari volume forecast per periode.</div>`);
  const p = c.periods.find(x => x.id === S.manPid) || activePeriod(c); S.manPid = p.id;
  const dis = S.role !== 'qs' ? 'disabled' : '';
  const cats = [...new Set(S.data.produktivitas.map(x => x.kategori))];
  const mapOf = id => S.data.map.find(m => m.item_id === id) || { ref: '', koef: 0 };
  const r = rep(p);
  V(`${head('Forecast Manpower', `Acuan: Standar Produktivitas Pekerjaan CSA &amp; MEP · ${spkLine(c)}`,
    `${chipsOf(c.periods.slice(-8), p.id, 'manp')}<div class="seg"><button class="${!S.manOT ? 'on' : ''}" data-act="ot" data-v="0">Jam normal</button><button class="${S.manOT ? 'on' : ''}" data-act="ot" data-v="1">Dengan lembur</button></div>`)}
  <div class="card" id="manSum" style="margin-bottom:14px"></div>
  <div class="tblwrap"><table class="tbl"><thead><tr><th class="c">No</th><th>Pekerjaan</th><th class="r">Vol forecast</th><th>Acuan produktivitas</th><th>Standar</th><th>Koefisien kesulitan</th><th class="r">Kap. efektif/hari</th><th class="r">Regu</th><th>Tenaga kerja</th><th class="r">Hari-orang</th></tr></thead><tbody>
  ${r.rows.map(row => {
    const m = mapOf(row.item_id);
    return `<tr data-mi="${esc(row.item_id)}"><td class="c"><span class="no">${esc(row.no)}</span></td><td><b>${esc(row.deskripsi)}</b></td><td class="r">${fmt(row.vol_forecast)} ${esc(row.sat)}</td>
      <td><select data-mref="${esc(row.item_id)}" ${dis}><option value="">— pilih acuan —</option>${cats.map(k => `<optgroup label="${esc(k)}">${S.data.produktivitas.filter(x => x.kategori === k).map(x => `<option ${x.pekerjaan === m.ref ? 'selected' : ''}>${esc(x.pekerjaan)}</option>`).join('')}</optgroup>`).join('')}</select></td>
      <td data-ms style="min-width:150px"></td>
      <td style="white-space:nowrap"><input class="cell" style="width:70px" type="number" min="0" max="60" step="1" inputmode="numeric" data-mk="${esc(row.item_id)}" value="${num_(m.koef)}" ${dis}> %
        <span class="mini">${[0, 10, 20, 30].map(v => `<button data-act="koef" data-id="${esc(row.item_id)}" data-v="${v}" ${dis}>${v}</button>`).join('')}</span></td>
      <td class="r" data-c="eff"></td><td class="r" data-c="regu"></td><td data-c="ten"></td><td class="r" data-c="pd"></td></tr>`;
  }).join('')}</tbody></table></div>
  <div class="two" style="margin-top:14px"><div class="card"><div class="mut"><b>Cara hitung</b><br>Kapasitas efektif = kapasitas standar × (1 − koefisien%) × (jam kerja ÷ 8). Lembur menambah jam per hari. Regu = Vol forecast ÷ kapasitas efektif ÷ hari kerja periode. Orang = regu × komposisi (dibulatkan ke atas per item).</div></div>
  <div class="card"><div class="mut"><b>Panduan standar:</b> area tinggi (plafon tinggi, eksterior gedung bertingkat) menurunkan kapasitas 20–30%. Bila material sulit/jauh, ubah rasio menjadi 1 Tukang : 2 Kenek.</div></div></div>`);
  updMan();
}
function manLines() {
  const c = ctx(), p = c.periods.find(x => x.id === S.manPid), r = rep(p);
  return r.rows.map(row => {
    const m = S.data.map.find(x => x.item_id === row.item_id) || {};
    return { item_id: row.item_id, no: row.no, deskripsi: row.deskripsi, sat: row.sat, vol: row.vol_forecast, ref: m.ref, koef: m.koef };
  });
}
function updMan() {
  const c = ctx(), cfg = c.cfg, prod = {};
  S.data.produktivitas.forEach(x => { prod[x.pekerjaan] = x; });
  const lines = manLines(), res = manpower_(lines, prod, cfg, S.manOT);
  const peakN = manpower_(lines, prod, cfg, false).puncak, peakO = manpower_(lines, prod, cfg, true).puncak;
  res.items.forEach(it => {
    const el = $(`[data-mi="${CSS.escape(it.item_id)}"]`); if (!el) return;
    const cell = k => $(`[data-c="${k}"]`, el);
    if (it.error) { $('[data-ms]', el).innerHTML = '<span class="warnx">Pilih acuan produktivitas</span>'; ['eff', 'regu', 'ten', 'pd'].forEach(k => { cell(k).innerHTML = ''; }); return; }
    const p = prod[it.acuan], warn = [];
    if (!it.satuan_cocok) warn.push(`⚠ satuan SPK (${esc(it.sat)}) ≠ standar (${esc(it.satuan_acuan)})`);
    if (it.koefisien > 30) warn.push('⚠ di atas rentang 20–30%');
    $('[data-ms]', el).innerHTML = `<span class="mut">${fmt(p.kap_min)}–${fmt(p.kap_max)} ${esc(p.satuan)}/hari/regu<br>${esc(p.komposisi)}</span>` + (warn.length ? `<br><span class="warnx">${warn.join('<br>')}</span>` : '');
    cell('eff').textContent = fmt(it.kapasitas_efektif); cell('regu').textContent = fmt(it.regu);
    cell('ten').innerHTML = it.tenaga.map(h => `<span class="chip"><b>${h.orang}</b> ${esc(h.jabatan)}</span>`).join('');
    cell('pd').textContent = fmt(it.hari_orang);
  });
  const p = c.periods.find(x => x.id === S.manPid);
  $('#manSum').innerHTML = `<div class="row" style="align-items:flex-start;flex-wrap:wrap;gap:20px">
    <div><div class="k mut">Kebutuhan puncak (Periode #${p.no_ke})</div><div class="v" style="font-size:28px">${res.puncak} orang</div>
      <div style="margin-top:4px">${Object.keys(res.per_jabatan).map(k => `<span class="chip"><b>${res.per_jabatan[k]}</b> ${esc(k)}</span>`).join('') || '<span class="mut">Belum ada item dengan acuan</span>'}</div></div>
    <div><div class="k mut">Perbandingan skenario</div><div style="font-size:16px;font-weight:700;margin-top:4px">Jam normal ${peakN} orang · Dengan lembur ${peakO} orang</div>
      <div class="mut" style="margin-top:4px">Rata-rata teoritis ${fmt(res.rata_rata_per_hari)} orang/hari · total ${fmt(res.hari_orang)} hari-orang</div></div>
    <div class="mut" style="max-width:380px">${esc(pRange(p))} · ${res.hari_kerja} hari kerja (${num_(cfg.hariMg)} hr/mgg) · ${fmt(res.jam_per_hari)} jam/hari${S.manOT ? ` (lembur +${num_(cfg.lembur)}%)` : ''} · basis kapasitas ${({ min: 'minimum', avg: 'rata-rata', max: 'maksimum' })[cfg.basis] || cfg.basis}</div></div>`;
}
const mapTimers = {};
function setMap(itemId, patch) {
  let m = S.data.map.find(x => x.item_id === itemId);
  if (!m) { m = { item_id: itemId, ref: '', koef: 0 }; S.data.map.push(m); }
  Object.assign(m, patch);
  updMan();
  clearTimeout(mapTimers[itemId]);
  if (!m.ref) return;
  mapTimers[itemId] = setTimeout(async () => {
    try { await api('saveMap', { item_id: itemId, ref: m.ref, koef: m.koef }); toast('Tersimpan', 'ok'); }
    catch (e) { showErr(e); }
  }, 600);
}

/* ---------- PDF ---------- */
async function vPdf() {
  const c = needSpk(); if (!c) return;
  const list = c.periods.filter(p => S.role === 'qs' || p.status === 'Final');
  if (!list.length) return V(`${head('PDF pengajuan', spkLine(c))}<div class="empty">${S.role === 'qs' ? 'Belum ada periode.' : 'Belum ada periode Final untuk dilihat.'}</div>`);
  const p = list.find(x => x.id === S.pdfPid) || lastOf({ periods: list }, 'Final') || list[list.length - 1];
  S.pdfPid = p.id;
  V('<div class="empty">Memuat…</div>');
  const out = await api('getReport', { periode_id: p.id });
  S.pdf = out.data;
  const fin = out.data.header.status === 'Final';
  V(`${head(`PDF pengajuan · Periode #${p.no_ke} ${pillOf(p.status)}`, spkLine(c),
    `${chipsOf(list.slice(-8), p.id, 'pdfp')}<button class="btn" data-act="print">⬇ Simpan PDF</button><button class="btn sec" data-act="print">🖨 Cetak</button>`)}
  <div class="lock ${fin ? '' : 'draft'}">${fin ? '🔒 Periode final — siap diajukan.' : 'Draft — belum final. PDF diberi watermark "DRAFT".'}
    <span class="mut" style="margin-left:8px">Di dialog cetak pilih tujuan "Simpan sebagai PDF" (A4, landscape sudah diatur otomatis).</span></div>
  <div id="paperBox"><div class="paper" id="paper">${paperHTML(out.data)}</div></div>`);
  fitPaper();
}
function paperHTML(d) {
  const h = d.header, r = d.report, fin = h.status === 'Final';
  let rows = r.rows.map(i => `<tr><td class="c">${esc(i.no)}</td><td>${esc(i.deskripsi)}</td><td>${esc(i.spesifikasi)}</td><td class="r">${fmt(i.vol_rab)}</td><td class="r">${fmt(i.vol_spk)}</td><td class="c">${esc(i.sat)}</td><td class="r">${num(i.harga)}</td><td class="r">${fmt(i.sisa)}</td><td class="r">${fmt(i.vol_sebelumnya)}</td><td class="r">${i.vol_aktual ? fmt(i.vol_aktual) : ''}</td><td class="r">${i.vol_aktual ? num(i.jumlah) : ''}</td></tr>`).join('');
  for (let k = r.rows.length; k < 13; k++) rows += '<tr class="blank">' + '<td></td>'.repeat(11) + '</tr>';
  return `${fin ? '' : '<div class="wm">DRAFT</div>'}
  <h2>OBNAME MANDOR</h2>
  <table class="info" style="width:auto"><tr><td>PROJECT</td><td>= ${esc(h.project)}</td></tr><tr><td>OWNER</td><td>= ${esc(h.owner)}</td></tr><tr><td>SPK</td><td>= ${esc(h.no_spk)}</td></tr><tr><td>MANDOR</td><td>= ${esc(String(h.mandor).toUpperCase())}</td></tr><tr><td>PEKERJAAN</td><td>= ${esc(h.pekerjaan)}</td></tr><tr><td>PERIODE</td><td>= #${h.no_ke} · ${esc(dRange(h.tgl_mulai, h.tgl_akhir))}</td></tr></table>
  <table class="tb" style="margin-top:8px">
  <colgroup><col style="width:4%"><col style="width:19%"><col style="width:14%"><col style="width:7%"><col style="width:7%"><col style="width:5%"><col style="width:9%"><col style="width:8%"><col style="width:8%"><col style="width:8%"><col style="width:11%"></colgroup>
  <tr><th rowspan="2">NO.</th><th rowspan="2">DESKRIPSI PEKERJAAN</th><th rowspan="2">Spesifikasi Teknis</th><th rowspan="2">VOLUME<br>RAB</th><th rowspan="2">VOLUME<br>SPK</th><th rowspan="2">SAT.</th><th rowspan="2">HARGA SAT.</th><th colspan="3">OBNAME</th><th rowspan="2">JUMLAH<br>PENGAJUAN</th></tr>
  <tr><th>SISA VOLUME OBNAME</th><th>VOL SEBELUMNYA</th><th>VOL PENGAJUAN</th></tr>
  <tr class="nm"><td></td><td></td><td></td><td>1</td><td>2 = 1 × ${fmt(h.pctSpk)}%</td><td></td><td>3</td><td>4 ( DATA )</td><td>5 ( DATA )</td><td>6 ( INPUT )</td><td>7 = 6 × 3</td></tr>
  ${rows}
  <tr class="tot"><td colspan="10" class="r">TOTAL</td><td class="r">${num(r.total)}</td></tr>
  <tr><td colspan="10" class="r">RETENSI ${fmt(r.retensi_pct)}%</td><td class="r">${num(r.retensi)}</td></tr>
  <tr class="tot"><td colspan="10" class="r">GRAND TOTAL</td><td class="r">${num(r.grand_total)}</td></tr>
  </table>
  <div class="sign">${d.sign.map(s => `<div>${esc(s[0])}<b>${esc(s[1])}</b></div>`).join('')}</div>`;
}
function fitPaper() {
  const box = $('#paperBox'), p = $('#paper'); if (!box || !p) return;
  const avail = box.parentElement.clientWidth, sc = Math.min(1.3, avail / 1060);
  p.style.transform = `scale(${sc})`; box.style.width = (1060 * sc) + 'px'; box.style.height = (p.offsetHeight * sc) + 'px';
}
function doPrint() {
  if (!S.pdf) return;
  const h = S.pdf.header, old = document.title;
  document.title = `Obname SPK ${h.no_spk} ${h.mandor} Periode ${h.no_ke}`.replace(/[\\/:*?"<>|]/g, '');
  $('#printRoot').innerHTML = '<div class="paper">' + paperHTML(S.pdf) + '</div>';
  window.print();
  setTimeout(() => { document.title = old; }, 500);
}

/* ---------- PENGATURAN ---------- */
async function vSet() {
  const d = S.data, cfg = d.config, f = (k, label, type, extra) => `<label>${label}</label><input data-cfg="${k}" type="${type || 'text'}" value="${esc(cfg[k])}" ${extra || ''}>`;
  V(`${head('⚙ Pengaturan', 'Dipakai di layar dan PDF. Tersimpan di Google Sheet (tab Config).', '<button class="btn" data-act="savecfg">Simpan pengaturan</button>')}
  <div class="three">
    <div class="card"><h2>Proyek</h2>${f('project', 'Nama proyek')}${f('owner', 'Owner / pemberi kerja')}${f('start', 'Mulai periode #1', 'date')}
      <div class="mut" style="margin-top:6px">Tanggal mulai terkunci setelah periode dibuat.</div></div>
    <div class="card"><h2>Hitungan</h2>
      <div class="grid2"><div>${f('pctSpk', 'Volume SPK (% dari RAB)', 'number', 'min="1" max="100"')}</div><div>${f('ret', 'Retensi (%)', 'number', 'min="0" max="100" step="0.5"')}</div></div>
      <div class="grid2"><div>${f('jam', 'Jam normal per hari', 'number', 'min="1" max="24" step="0.5"')}</div><div>${f('hariMg', 'Hari kerja per minggu', 'number', 'min="1" max="7"')}</div></div>
      <div class="grid2"><div>${f('lembur', 'Lembur (% tambahan jam)', 'number', 'min="0" max="100"')}</div><div><label>Basis kapasitas manpower</label><select data-cfg="basis">${[['min', 'Minimum (konservatif)'], ['avg', 'Rata-rata'], ['max', 'Maksimum']].map(o => `<option value="${o[0]}" ${cfg.basis === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div></div>
      <div class="mut" style="margin-top:6px">Persen SPK terkunci setelah ada periode Final.</div></div>
    <div class="card"><h2>Penandatangan di PDF</h2>
      ${[1, 2, 3].map(n => `<div class="grid2"><div>${f('sign' + n + '_label', 'Jabatan')}</div><div>${f('sign' + n + '_name', 'Nama')}</div></div>`).join('')}
      <div class="mut" style="margin-top:6px">Penandatangan ke-4 (Mandor) otomatis mengikuti mandor SPK.</div></div>
    <div class="card"><h2>Pekerja harian</h2>
      ${f('hse_sheet_id', 'ID spreadsheet HSE (daftar pekerja, tab Worker)')}
      <div class="mut">Bagian di antara <code>/d/</code> dan <code>/edit</code> pada alamat spreadsheet. Hanya dibaca; akun pemasang backend cukup punya akses lihat.</div>
      <div class="grid2"><div>${f('jam_masuk_std', 'Jam masuk standar', 'time')}</div><div>${f('jam_pulang_std', 'Jam pulang standar', 'time')}</div></div>
      <div class="grid2"><div>${f('istirahat', 'Istirahat (jam, 12:00–13:00)', 'number', 'min="0" max="4" step="0.5"')}</div><div>${f('lembur_bulat', 'Pembulatan lembur (jam)', 'number', 'min="0.1" max="2" step="0.25"')}</div></div>
      ${f('lembur_maks', 'Maksimal lembur per hari (jam)', 'number', 'min="0" max="12" step="0.5"')}
      <div class="mut" style="margin-top:6px">Jam normal per hari memakai "Jam normal per hari" di kartu Hitungan.</div>
      <div class="mut" style="margin-top:10px"><b>Penandatangan PDF klaim harian</b></div>
      ${[1, 2, 3].map(n => `<div class="grid2"><div>${f('hsign' + n + '_label', 'Jabatan')}</div><div>${f('hsign' + n + '_name', 'Nama')}</div></div>`).join('')}</div>
    <div class="card"><div class="row"><h2>Mandor</h2><button class="btn sm sec" data-act="addm">＋ Tambah</button></div>
      ${d.mandor.map(m => `<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line)"><span>${esc(m.nama)}</span><span class="toolbar"><button class="btn sm sec" data-act="renm" data-id="${esc(m.id)}">Ubah</button><button class="btn sm sec" data-act="delm" data-id="${esc(m.id)}">Hapus</button></span></div>`).join('') || '<div class="mut" style="margin-top:8px">Belum ada mandor.</div>'}</div>
    <div class="card"><div class="row"><h2>SPK</h2><span class="toolbar"><button class="btn sm sec" data-act="pdfimp">📄 Impor PDF</button><button class="btn sm sec" data-act="addspk">＋ Tambah</button></span></div>
      ${d.spk.map(s => `<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line)"><span><b>SPK ${esc(s.no_spk)}</b><div class="mut">${esc((d.mandor.find(m => m.id === s.mandor_id) || {}).nama || '?')} · ${esc(s.pekerjaan)}</div></span><button class="btn sm sec" data-act="edspk" data-id="${esc(s.id)}">Ubah</button></div>`).join('') || '<div class="mut" style="margin-top:8px">Belum ada SPK.</div>'}</div>
    <div class="card"><h2>Server</h2><div class="mut" style="margin-top:6px">Alamat Web App</div><div style="word-break:break-all;font-size:13px">${esc(S.url)}</div>
      <div class="actions"><button class="btn sm sec" data-act="chgurl">Ubah alamat server</button><button class="btn sm sec" data-act="log">Lihat log aktivitas</button></div></div>
  </div>`);
}
function spkDialog(s) {
  const d = S.data;
  if (!d.mandor.length) return toast('Tambah mandor dulu', 'bad');
  dialog(s ? 'Ubah SPK' : 'Tambah SPK', `<label>No. SPK</label><input id="sNo" value="${esc(s ? s.no_spk : '')}"><label>Mandor</label><select id="sMd">${d.mandor.map(m => `<option value="${esc(m.id)}" ${s && s.mandor_id === m.id ? 'selected' : ''}>${esc(m.nama)}</option>`).join('')}</select><label>Pekerjaan</label><input id="sPk" value="${esc(s ? s.pekerjaan : '')}">`, [
    { label: 'Batal' },
    { label: 'Simpan', cls: '', run: async dl => {
      const r = await api('saveSpk', { id: s ? s.id : undefined, no_spk: $('#sNo', dl).value, mandor_id: $('#sMd', dl).value, pekerjaan: $('#sPk', dl).value });
      if (!s) { S.spkId = r.data.id; store.set('obname.spk', S.spkId); }
      toast('SPK tersimpan', 'ok'); await reload();
    } }]);
}
