'use strict';
/* Modul pekerja harian: Daftar pekerja (salinan HSE + tanda harian & rate), Absensi harian, Rekap & klaim + PDF.
   Memakai helper global dari app.js / views.js / logic.js saat dijalankan. */

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const dLong = s => { const d = new Date(s + 'T00:00:00Z'); return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const dShort = s => { const d = new Date(s + 'T00:00:00Z'); return `${HARI[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
const hPill = st => st === 'Final' ? '<span class="pill p-ok">Final 🔒</span>' : '<span class="pill p-tr">Terbuka</span>';
const needStart = (title) => {
  if (S.data.config.start) return false;
  V(`${head(title, '')}<div class="empty">Isi <b>Mulai periode #1</b> di Pengaturan dulu — periode harian memakai kalender 2 mingguan yang sama dengan obname.${S.role === 'qs' ? '<br><button class="btn" data-nav="set">Ke Pengaturan</button>' : ''}</div>`);
  return true;
};
function eligPill(p) {
  if (!isTrue_(p.harian)) return '<span class="pill" style="background:var(--soft);color:var(--mut)">Bukan harian</span>';
  const why = harianEligible_(p);
  return why.length ? `<span class="pill p-tr" title="${esc(why.join(', '))}">⚠ ${esc(why.join(', '))}</span>` : '<span class="pill p-ok">Siap diabsen</span>';
}

/* ---------- DAFTAR PEKERJA ---------- */
function vPek() {
  const d = S.data, cfg = d.config, all = d.pekerja || [], qs = S.role === 'qs', dis = qs ? '' : 'disabled';
  const f = S.pekF || 'harian', q = (S.pekQ || '').trim().toLowerCase();
  const rows = all.filter(p => f === 'semua' || (f === 'harian' ? isTrue_(p.harian) : !isTrue_(p.harian)))
    .filter(p => !q || `${p.nama} ${p.id} ${p.position} ${p.company} ${p.category}`.toLowerCase().includes(q))
    .sort((a, b) => String(a.nama).localeCompare(String(b.nama)));
  const inHse = all.filter(p => isTrue_(p.di_hse)).length, har = all.filter(p => isTrue_(p.harian)), siap = har.filter(p => !harianEligible_(p).length);
  const last = all.reduce((m, p) => (p.synced_at > m ? p.synced_at : m), '');
  const J = num_(cfg.jam) || 8;
  V(`${head('Daftar pekerja harian', `Sumber: spreadsheet HSE, tab Worker (hanya dibaca)${last ? ' · sinkron terakhir ' + esc(String(last).replace('T', ' ')) : ''}`,
    qs ? '<button class="btn" data-act="synchse">⟳ Sinkronkan dari HSE</button>' : '')}
  ${!cfg.hse_sheet_id ? `<div class="lock draft">ID spreadsheet HSE belum diisi. ${qs ? 'Isi di <a href="#set">Pengaturan → Pekerja harian</a>, lalu klik Sinkronkan.' : ''}</div>` : ''}
  <div class="cards" style="margin-bottom:14px">
    <div class="card"><div class="k">Pekerja di daftar HSE</div><div class="v">${inHse}</div><div class="mut">campuran staf, harian &amp; subkon</div></div>
    <div class="card"><div class="k">Ditandai harian</div><div class="v">${har.length}</div></div>
    <div class="card"><div class="k">Siap diabsen</div><div class="v" style="color:var(--ok)">${siap.length}</div></div>
    <div class="card"><div class="k">Harian perlu dilengkapi</div><div class="v" style="color:${har.length - siap.length ? 'var(--warn)' : 'inherit'}">${har.length - siap.length}</div><div class="mut">rate kosong / belum induction / hilang dari HSE</div></div>
  </div>
  ${all.length ? `<div class="page-h" style="margin-bottom:10px"><div class="seg">${[['harian', 'Pekerja harian'], ['bukan', 'Bukan harian'], ['semua', 'Semua']].map(x => `<button class="${f === x[0] ? 'on' : ''}" data-act="pekf" data-v="${x[0]}">${x[1]}</button>`).join('')}</div>
    <input id="pekQ" placeholder="Cari nama, ID, jabatan, perusahaan…" value="${esc(S.pekQ || '')}" style="max-width:340px"></div>
  <div class="tblwrap"><table class="tbl"><thead><tr><th>ID HSE</th><th>Nama</th><th>Jabatan</th><th>Perusahaan</th><th>Kategori</th><th>Induction</th><th class="c">Harian?</th><th class="r">Rate harian</th><th>Lembur / jam</th><th>Status</th></tr></thead><tbody>
  ${rows.map(p => {
    const auto = p.lembur_mode !== 'manual', autoVal = num_(p.rate_harian) / J;
    return `<tr data-pk="${esc(p.id)}" ${isTrue_(p.di_hse) ? '' : 'style="opacity:.55"'}><td>${esc(p.id)}</td><td><b>${esc(p.nama)}</b>${isTrue_(p.di_hse) ? '' : '<span class="mut">tidak ada lagi di HSE</span>'}</td><td>${esc(p.position)}</td><td>${esc(p.company)}</td><td>${esc(p.category)}</td>
      <td>${inductionOk_(p.induction) ? '<span class="pill p-ok">Sudah</span>' : '<span class="pill p-bad">Belum</span>'}</td>
      <td class="c"><input type="checkbox" data-pf="harian" ${isTrue_(p.harian) ? 'checked' : ''} ${dis}></td>
      <td class="r"><input class="cell" type="number" min="0" step="1000" data-pf="rate_harian" value="${p.rate_harian === '' ? '' : num_(p.rate_harian)}" placeholder="isi rate" ${dis}></td>
      <td style="white-space:nowrap"><select data-pf="lembur_mode" style="min-width:0;width:auto" ${dis}><option value="auto" ${auto ? 'selected' : ''}>Auto</option><option value="manual" ${auto ? '' : 'selected'}>Manual</option></select>
        <input class="cell" type="number" min="0" step="500" data-pf="rate_lembur_jam" value="${auto ? (autoVal ? Math.round(autoVal) : '') : num_(p.rate_lembur_jam)}" ${auto || !qs ? 'disabled' : ''} title="${auto ? `otomatis = rate harian ÷ ${J} jam` : 'diisi manual'}"></td>
      <td data-st>${eligPill(p)}</td></tr>`;
  }).join('') || `<tr><td colspan="10" class="dim c" style="padding:30px">Tidak ada pekerja untuk filter ini.</td></tr>`}</tbody></table></div>
  <p class="mut" style="margin-top:8px">Hanya pekerja dari daftar HSE yang bisa ditandai harian. Nama, jabatan, perusahaan &amp; induction mengikuti HSE (diperbarui saat sinkron); tanda harian dan rate milik aplikasi ini dan tidak terhapus saat sinkron. Syarat diabsen: ditandai harian, sudah induction, masih ada di HSE, rate harian &gt; 0.</p>`
    : `<div class="empty">Belum ada data pekerja.${qs && cfg.hse_sheet_id ? '<br><button class="btn" data-act="synchse">⟳ Sinkronkan dari HSE</button>' : ''}</div>`}`);
}
const pekTimers = {};
function pekChanged(tr) {
  const id = tr.dataset.pk, p = S.data.pekerja.find(x => x.id === id), g = k => $(`[data-pf="${k}"]`, tr);
  const patch = { harian: g('harian').checked, rate_harian: g('rate_harian').value === '' ? '' : Number(g('rate_harian').value), lembur_mode: g('lembur_mode').value };
  const J = num_(S.data.config.jam) || 8, rl = g('rate_lembur_jam');
  if (patch.lembur_mode === 'manual') { rl.disabled = false; patch.rate_lembur_jam = rl.value === '' ? '' : Number(rl.value); }
  else { rl.disabled = true; rl.value = patch.rate_harian ? Math.round(patch.rate_harian / J) : ''; }
  Object.assign(p, patch);
  $('[data-st]', tr).innerHTML = eligPill(p);
  clearTimeout(pekTimers[id]);
  if (patch.lembur_mode === 'manual' && patch.rate_lembur_jam === '') return; // tunggu rate lembur diisi
  pekTimers[id] = setTimeout(async () => {
    try { await api('savePekerja', Object.assign({ id }, patch)); toast('Tersimpan: ' + p.nama, 'ok'); S.hData = null; }
    catch (e) { showErr(e); }
  }, 600);
}

/* ---------- ABSENSI HARIAN ---------- */
async function loadHarian(no) {
  if (!S.hData || S.hData.periode.no_ke !== no) { V('<div class="empty">Memuat…</div>'); S.hData = (await api('getHarian', { no_ke: no })).data; S.absDraft = {}; }
  return S.hData;
}
function absDraftOf(date) {
  S.absDraft = S.absDraft || {};
  if (!S.absDraft[date]) {
    const m = {};
    (S.hData.absen || []).filter(a => a.tanggal === date).forEach(a => {
      m[a.worker_id] = { hadir: true, jam_masuk: a.jam_masuk, jam_pulang: a.jam_pulang, hari_mode: a.hari_mode || 'auto', hari_manual: a.hari_manual === '' ? 1 : num_(a.hari_manual) };
    });
    S.absDraft[date] = m;
  }
  return S.absDraft[date];
}
async function vAbsen() {
  if (needStart('Absensi harian')) return;
  const cfg = S.data.config, t = todayStr();
  const date = S.hDate || (t < cfg.start ? cfg.start : t); S.hDate = date;
  const no = harianNo_(date, cfg), H = await loadHarian(no), fin = H.periode.status === 'Final';
  const workers = (S.data.pekerja || []).filter(p => isTrue_(p.harian)).sort((a, b) => String(a.nama).localeCompare(String(b.nama)));
  const dr = absDraftOf(date), dis = fin ? 'disabled' : '';
  // pekerja yang punya absensi tetapi sudah tidak ditandai harian tetap ditampilkan agar bisa dihapus
  Object.keys(dr).forEach(id => { if (!workers.some(w => w.id === id)) { const p = (S.data.pekerja || []).find(x => x.id === id) || { id, nama: id, harian: false }; workers.push(p); } });
  V(`${head(`Absensi harian · ${esc(dLong(date))}`, `Periode #${no} · ${esc(dRange(H.periode.tgl_mulai, H.periode.tgl_akhir))} · ${hPill(H.periode.status)} · jam normal ${num_(cfg.jam)} · istirahat ${fmt(cfg.istirahat)} jam (12:00–13:00) · lembur dibulatkan ${fmt(cfg.lembur_bulat)} jam, maks ${fmt(cfg.lembur_maks)}`,
    `<button class="btn sec" data-act="hday" data-v="-1">◀</button><input type="date" id="hDateIn" value="${date}" min="${cfg.start}" style="width:auto"><button class="btn sec" data-act="hday" data-v="1">▶</button>
     ${fin ? '' : `<button class="btn sec" data-act="hauto">Isi otomatis ${esc(cfg.jam_masuk_std)}–${esc(cfg.jam_pulang_std)}</button><button class="btn" id="hSave" data-act="hsave">Simpan</button>`}`)}
  ${fin ? '<div class="lock">🔒 Periode ini sudah Final — absensi terkunci. Buka kunci di menu Rekap &amp; klaim bila perlu koreksi.</div>' : ''}
  <div class="cards" id="abCards" style="margin-bottom:14px"></div>
  ${workers.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Pekerja</th><th>Jabatan</th><th class="c">Hadir</th><th class="c">Jam masuk</th><th class="c">Jam pulang</th><th class="r">Jam kerja</th><th class="r">Normal</th><th class="r">Lembur</th><th>Hitungan hari</th><th class="r">Upah normal</th><th class="r">Upah lembur</th><th class="r">Total</th></tr></thead><tbody>
  ${workers.map(w => {
    const why = harianEligible_(w), r = dr[w.id] || {}, on = !!r.hadir, lock = fin || (why.length && !on) ? 'disabled' : '';
    return `<tr data-ab="${esc(w.id)}"><td><b>${esc(w.nama)}</b><span class="mut">${esc(w.id)}${why.length ? ' · <span style="color:var(--warn)">' + esc(why.join(', ')) + '</span>' : ''}</span></td><td>${esc(w.position || '')}</td>
      <td class="c"><input type="checkbox" data-af="hadir" ${on ? 'checked' : ''} ${lock}></td>
      <td class="c"><input type="time" class="cell" style="width:104px;text-align:center" data-af="jam_masuk" value="${esc(r.jam_masuk || '')}" ${on && !fin ? '' : 'disabled'}></td>
      <td class="c"><input type="time" class="cell" style="width:104px;text-align:center" data-af="jam_pulang" value="${esc(r.jam_pulang || '')}" ${on && !fin ? '' : 'disabled'}></td>
      <td class="r" data-c="jam"></td><td class="r" data-c="normal"></td><td class="r" data-c="lembur"></td>
      <td style="white-space:nowrap"><select data-af="hari_mode" style="min-width:0;width:auto" ${on && !fin ? '' : 'disabled'}><option value="auto" ${r.hari_mode !== 'manual' ? 'selected' : ''}>Auto (1 hari)</option><option value="manual" ${r.hari_mode === 'manual' ? 'selected' : ''}>Manual</option></select>
        <input type="number" class="cell" style="width:64px" min="0" max="1" step="0.25" data-af="hari_manual" value="${r.hari_mode === 'manual' ? r.hari_manual : 1}" ${on && !fin && r.hari_mode === 'manual' ? '' : 'disabled'}> hari<span class="errtxt" data-w></span></td>
      <td class="r" data-c="un"></td><td class="r" data-c="ul"></td><td class="r" data-c="tot"></td></tr>`;
  }).join('')}</tbody><tfoot><tr><td colspan="9" class="r">TOTAL HARI INI</td><td class="r" id="abN"></td><td class="r" id="abL"></td><td class="r" id="abT"></td></tr></tfoot></table></div>
  <p class="mut" style="margin-top:8px">Hitungan hari <b>Auto</b> = dibayar 1 hari penuh walau kurang dari ${num_(cfg.jam)} jam (diberi peringatan ⚠). Pilih <b>Manual</b> untuk mengisi sendiri (mis. 0,5 hari). Hanya pekerja yang ditandai harian, sudah induction, masih ada di HSE, dan punya rate yang bisa diabsen.</p>`
    : `<div class="empty">Belum ada pekerja harian.<br>Tandai pekerja di menu <b>Daftar pekerja</b> (centang "Harian?" dan isi rate).<br><button class="btn" data-nav="pek">Ke Daftar pekerja</button></div>`}`);
  updAbsen();
}
function updAbsen() {
  const cfg = S.data.config, dr = absDraftOf(S.hDate);
  let N = 0, L = 0, T = 0, h = 0, jl = 0, warn = 0, bad = false;
  document.querySelectorAll('tr[data-ab]').forEach(tr => {
    const id = tr.dataset.ab, w = (S.data.pekerja || []).find(x => x.id === id) || {}, r = dr[id], cell = k => $(`[data-c="${k}"]`, tr);
    const clear = txt => { ['jam', 'normal', 'lembur', 'un', 'ul', 'tot'].forEach(k => { cell(k).innerHTML = txt; }); $('[data-w]', tr).textContent = ''; };
    tr.querySelectorAll('input[type=time]').forEach(i => i.classList.remove('bad'));
    if (!r || !r.hadir) return clear('<span class="dim">–</span>');
    const c = harianDay_(r, w, cfg);
    if (c.err) { bad = true; tr.querySelectorAll('input[type=time]').forEach(i => i.classList.add('bad')); clear(''); $('[data-w]', tr).textContent = c.err; return; }
    h++; jl += c.lembur; N += c.upah_normal; L += c.upah_lembur; T += c.total;
    cell('jam').textContent = fmt(c.jam); cell('normal').textContent = fmt(c.normal); cell('lembur').textContent = fmt(c.lembur);
    cell('un').textContent = num(c.upah_normal); cell('ul').textContent = num(c.upah_lembur); cell('tot').innerHTML = '<b>' + num(c.total) + '</b>';
    const kw = c.kurang && !c.manual; if (kw) warn++;
    $('[data-w]', tr).innerHTML = kw ? `<span style="color:var(--warn)">⚠ ${fmt(c.jam)} jam &lt; ${num_(cfg.jam)} jam, dihitung 1 hari</span>` : '';
  });
  if ($('#abN')) { $('#abN').textContent = num(N); $('#abL').textContent = num(L); $('#abT').textContent = num(T); }
  if ($('#hSave')) $('#hSave').disabled = bad;
  $('#abCards').innerHTML = `<div class="card"><div class="k">Hadir</div><div class="v">${h}</div></div>
    <div class="card"><div class="k">Total jam lembur</div><div class="v">${fmt(jl)}</div></div>
    <div class="card"><div class="k">Kurang dari ${num_(cfg.jam)} jam (dibayar penuh)</div><div class="v" style="color:${warn ? 'var(--warn)' : 'inherit'}">${warn}</div></div>
    <div class="card"><div class="k">Total upah hari ini</div><div class="v" style="color:var(--pri)">${rp(T)}</div></div>`;
}
function absChanged(el) {
  const tr = el.closest('tr[data-ab]'), id = tr.dataset.ab, dr = absDraftOf(S.hDate), cfg = S.data.config;
  const r = dr[id] = dr[id] || { hadir: false, jam_masuk: '', jam_pulang: '', hari_mode: 'auto', hari_manual: 1 };
  const k = el.dataset.af;
  if (k === 'hadir') {
    r.hadir = el.checked;
    if (r.hadir && !r.jam_masuk) { r.jam_masuk = cfg.jam_masuk_std; r.jam_pulang = cfg.jam_pulang_std; }
    $('[data-af="jam_masuk"]', tr).value = r.jam_masuk; $('[data-af="jam_pulang"]', tr).value = r.jam_pulang;
    ['jam_masuk', 'jam_pulang', 'hari_mode'].forEach(f => { $(`[data-af="${f}"]`, tr).disabled = !r.hadir; });
    $('[data-af="hari_manual"]', tr).disabled = !r.hadir || r.hari_mode !== 'manual';
  } else if (k === 'hari_mode') { r.hari_mode = el.value; $('[data-af="hari_manual"]', tr).disabled = el.value !== 'manual'; }
  else if (k === 'hari_manual') r.hari_manual = el.value === '' ? 0 : Number(el.value);
  else r[k] = el.value;
  updAbsen();
}
async function saveAbsen() {
  const dr = absDraftOf(S.hDate);
  const rows = [...document.querySelectorAll('tr[data-ab]')].map(tr => {
    const id = tr.dataset.ab, r = dr[id];
    return r && r.hadir ? { worker_id: id, hadir: true, jam_masuk: r.jam_masuk, jam_pulang: r.jam_pulang, hari_mode: r.hari_mode, hari_manual: r.hari_manual } : { worker_id: id, hadir: false };
  });
  try {
    const out = await api('saveAbsen', { tanggal: S.hDate, rows });
    S.hData = out.data; delete S.absDraft[S.hDate];
    toast('Absensi ' + dShort(S.hDate) + ' tersimpan', 'ok'); route(true);
  } catch (e) { showErr(e); }
}

/* ---------- REKAP & KLAIM ---------- */
async function vHarian() {
  if (needStart('Rekap & klaim harian')) return;
  const cfg = S.data.config, qs = S.role === 'qs';
  const finals = (S.data.harianPeriods || []).filter(p => p.status === 'Final').map(p => num_(p.no_ke)).sort((a, b) => a - b);
  const cur = harianNo_(todayStr(), cfg) || 1;
  const nos = qs ? Array.from({ length: Math.max(cur, finals.length ? finals[finals.length - 1] : 1) }, (_, i) => i + 1) : finals;
  if (!nos.length) return V(`${head('Rekap & klaim harian', '')}<div class="empty">Belum ada periode harian yang Final.</div>`);
  const no = nos.includes(S.hNo) ? S.hNo : (qs ? cur : finals[finals.length - 1]); S.hNo = no;
  const H = await loadHarian(no), R = H.rekap, fin = H.periode.status === 'Final';
  const lastFinal = finals.length ? finals[finals.length - 1] : null;
  const sel = S.hPrev && (S.hPrev === '_rekap' || R.pekerja.some(p => p.worker_id === S.hPrev)) ? S.hPrev : (R.pekerja[0] ? R.pekerja[0].worker_id : '_rekap');
  S.hPrev = sel;
  V(`${head(`Rekap &amp; klaim harian · Periode #${no} ${hPill(H.periode.status)}`, esc(dRange(H.periode.tgl_mulai, H.periode.tgl_akhir)),
    `<div class="seg">${nos.slice(-8).map(n => `<button class="${n === no ? 'on' : ''}" data-act="hno" data-v="${n}">#${n}${finals.includes(n) ? ' 🔒' : ''}</button>`).join('')}</div>
     ${qs && !fin ? `<button class="btn" data-act="hfin" ${R.errors.length || !R.pekerja.length ? 'disabled' : ''}>🔒 Finalkan klaim</button>` : ''}
     ${qs && fin && lastFinal === no ? '<button class="btn sec" data-act="hunlock">Buka kunci</button>' : ''}
     ${R.pekerja.length ? '<button class="btn sec" data-act="hprint" data-v="all">⬇ PDF semua (per pekerja + rekap)</button>' : ''}`)}
  <div class="cards" style="margin-bottom:14px">
    <div class="card"><div class="k">Pekerja diklaim</div><div class="v">${R.pekerja.length}</div></div>
    <div class="card"><div class="k">Total hari kerja</div><div class="v">${fmt(R.total.hari)}</div></div>
    <div class="card"><div class="k">Total jam lembur</div><div class="v">${fmt(R.total.jam_lembur)}</div></div>
    <div class="card"><div class="k">Total klaim periode</div><div class="v" style="color:var(--pri)">${rp(R.total.total)}</div>${fin ? '<div class="mut">rate &amp; aturan dikunci saat final</div>' : ''}</div>
  </div>
  ${R.errors.length ? `<div class="lock" style="background:#fde2de;color:var(--bad)"><b>Harus diperbaiki sebelum final:</b><br>${R.errors.map(esc).join('<br>')}</div>` : ''}
  ${R.warnings.length ? `<div class="lock draft"><b>Perlu dicek (${R.warnings.length}):</b><br>${R.warnings.slice(0, 12).map(esc).join('<br>')}${R.warnings.length > 12 ? '<br>…' : ''}</div>` : ''}
  ${R.pekerja.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>Pekerja</th><th>Jabatan</th><th class="r">Hadir</th><th class="r">Total hari</th><th class="r">Jam normal</th><th class="r">Jam lembur</th><th class="r">Rate harian</th><th class="r">Lembur/jam</th><th class="r">Upah normal</th><th class="r">Upah lembur</th><th class="r">Total hari + lembur</th><th></th></tr></thead><tbody>
  ${R.pekerja.map(p => `<tr class="row-click" data-act="hprev" data-v="${esc(p.worker_id)}" ${p.worker_id === sel ? 'style="background:var(--soft)"' : ''}><td><b>${esc(p.nama)}</b><span class="mut">${esc(p.worker_id)}</span></td><td>${esc(p.jabatan)}</td><td class="r">${p.hadir}</td><td class="r">${fmt(p.hari)}</td><td class="r">${fmt(p.jam_normal)}</td><td class="r">${fmt(p.jam_lembur)}</td><td class="r">${num(p.rate_harian)}</td><td class="r">${num(p.rate_lembur)}</td><td class="r">${num(p.upah_normal)}</td><td class="r">${num(p.upah_lembur)}</td><td class="r"><b>${num(p.total)}</b></td><td class="dim">Lihat ›</td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="3" class="r">TOTAL</td><td class="r">${fmt(R.total.hari)}</td><td></td><td class="r">${fmt(R.total.jam_lembur)}</td><td></td><td></td><td class="r">${num(R.total.upah_normal)}</td><td class="r">${num(R.total.upah_lembur)}</td><td class="r">${num(R.total.total)}</td><td></td></tr></tfoot></table></div>
  <div class="page-h" style="margin-top:20px"><div><h1 style="font-size:16px">Pratinjau PDF (A4 potret)</h1></div>
    <div class="toolbar"><select id="hSel" style="width:auto">${R.pekerja.map(p => `<option value="${esc(p.worker_id)}" ${p.worker_id === sel ? 'selected' : ''}>${esc(p.nama)}</option>`).join('')}<option value="_rekap" ${sel === '_rekap' ? 'selected' : ''}>Halaman rekap</option></select>
    <button class="btn" data-act="hprint" data-v="one">⬇ PDF halaman ini</button></div></div>
  <div class="hpaper">${sel === '_rekap' ? hRekapPage(H) : hWorkerPage(H, R.pekerja.find(p => p.worker_id === sel))}</div>`
    : `<div class="empty">Belum ada absensi di periode ini.${qs ? '<br><button class="btn" data-nav="absen">Ke Absensi harian</button>' : ''}</div>`}`);
}
function hSign(H, last) {
  return `<div class="hsign">${H.sign.map(s => `<div>${esc(s[0])}<b>${esc(s[1])}</b></div>`).join('')}<div>${esc(last[0])}<b>${esc(last[1])}</b></div></div>`;
}
function hWorkerPage(H, p) {
  if (!p) return '';
  const byDate = {}; p.days.forEach(d => { byDate[d.tanggal] = d; });
  const days = Array.from({ length: 14 }, (_, i) => addDays_(H.periode.tgl_mulai, i));
  const J = num_(S.data.config.jam) || 8;
  return `<h2>KLAIM UPAH PEKERJA HARIAN</h2><div class="sub">${esc(H.header.project)} · ${esc(H.header.owner)}</div>
  <table class="info"><tr><td>Nama pekerja</td><td>: <b>${esc(p.nama)}</b> (${esc(p.worker_id)})</td></tr><tr><td>Jabatan</td><td>: ${esc(p.jabatan)}</td></tr>
    <tr><td>Periode klaim</td><td>: #${H.periode.no_ke} · ${esc(dRange(H.periode.tgl_mulai, H.periode.tgl_akhir))}${H.periode.status === 'Final' ? '' : ' (DRAFT)'}</td></tr>
    <tr><td>Rate harian</td><td>: ${rp(p.rate_harian)} · lembur ${rp(p.rate_lembur)}/jam</td></tr></table>
  <table class="tb"><thead><tr><th>Tanggal</th><th>Jam masuk</th><th>Jam pulang</th><th>Jam normal</th><th>Jam lembur</th><th>Hari</th><th>Rate per hari</th><th>Total per hari</th><th>Total lembur</th><th>Total hari + lembur</th></tr></thead><tbody>
  ${days.map(dt => { const d = byDate[dt]; return d && !d.err
    ? `<tr><td>${esc(dShort(dt))}</td><td class="c">${esc(d.jam_masuk)}</td><td class="c">${esc(d.jam_pulang)}</td><td class="r">${fmt(d.normal)}</td><td class="r">${fmt(d.lembur)}</td><td class="r">${fmt(d.hari)}${d.kurang && !d.manual ? '*' : ''}</td><td class="r">${num(d.rate)}</td><td class="r">${num(d.upah_normal)}</td><td class="r">${num(d.upah_lembur)}</td><td class="r">${num(d.total)}</td></tr>`
    : `<tr class="off"><td>${esc(dShort(dt))}</td><td class="c">–</td><td class="c">–</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`; }).join('')}
  </tbody><tfoot><tr><td colspan="3" class="r">TOTAL</td><td class="r">${fmt(p.jam_normal)}</td><td class="r">${fmt(p.jam_lembur)}</td><td class="r">${fmt(p.hari)}</td><td></td><td class="r">${num(p.upah_normal)}</td><td class="r">${num(p.upah_lembur)}</td><td class="r">${num(p.total)}</td></tr></tfoot></table>
  ${p.days.some(d => d.kurang && !d.manual) ? `<div class="fn">* kerja kurang dari ${J} jam, dibayar 1 hari penuh.</div>` : ''}
  ${hSign(H, ['Pekerja', p.nama])}`;
}
function hRekapPage(H) {
  const R = H.rekap;
  return `<h2>REKAP KLAIM UPAH PEKERJA HARIAN</h2><div class="sub">${esc(H.header.project)} · Periode #${H.periode.no_ke} · ${esc(dRange(H.periode.tgl_mulai, H.periode.tgl_akhir))}${H.periode.status === 'Final' ? '' : ' (DRAFT)'}</div>
  <table class="tb"><thead><tr><th>No</th><th>Nama pekerja</th><th>Jabatan</th><th>Total hari</th><th>Jam lembur</th><th>Rate harian</th><th>Lembur/jam</th><th>Total upah</th><th>Total lembur</th><th>Total hari + lembur</th></tr></thead><tbody>
  ${R.pekerja.map((p, i) => `<tr><td class="c">${i + 1}</td><td>${esc(p.nama)}</td><td>${esc(p.jabatan)}</td><td class="r">${fmt(p.hari)}</td><td class="r">${fmt(p.jam_lembur)}</td><td class="r">${num(p.rate_harian)}</td><td class="r">${num(p.rate_lembur)}</td><td class="r">${num(p.upah_normal)}</td><td class="r">${num(p.upah_lembur)}</td><td class="r">${num(p.total)}</td></tr>`).join('')}
  </tbody><tfoot><tr><td colspan="3" class="r">TOTAL</td><td class="r">${fmt(R.total.hari)}</td><td class="r">${fmt(R.total.jam_lembur)}</td><td></td><td></td><td class="r">${num(R.total.upah_normal)}</td><td class="r">${num(R.total.upah_lembur)}</td><td class="r">${num(R.total.total)}</td></tr></tfoot></table>
  ${hSign(H, ['Mandor', ''])}`;
}
function printHarian(mode) {
  const H = S.hData; if (!H) return;
  const pages = mode === 'all' ? H.rekap.pekerja.map(p => hWorkerPage(H, p)).concat([hRekapPage(H)])
    : [S.hPrev === '_rekap' ? hRekapPage(H) : hWorkerPage(H, H.rekap.pekerja.find(p => p.worker_id === S.hPrev))];
  const st = document.createElement('style'); st.id = 'hPrintStyle';
  st.textContent = '@page{size:A4 portrait;margin:10mm}';
  document.head.appendChild(st);
  const old = document.title;
  document.title = `Klaim harian periode ${H.periode.no_ke}`;
  $('#printRoot').innerHTML = pages.map(p => `<div class="hpaper hpage">${p}</div>`).join('');
  window.print();
  setTimeout(() => { st.remove(); document.title = old; }, 500);
}
