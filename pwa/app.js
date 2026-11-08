'use strict';
/* Obname SPK — PWA. Semua data & aturan berasal dari server (Apps Script); rumus memakai logic.js
   (salinan backend/Logic.gs) agar angka di layar sama dengan yang dihitung server. */

/* ---------- util ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (+n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const rp = n => 'Rp ' + Math.round(+n || 0).toLocaleString('id-ID');
const num = n => Math.round(+n || 0).toLocaleString('id-ID');
const store = {
  get(k, session) { try { return (session ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } },
  set(k, v, session) { try { (session ? sessionStorage : localStorage).setItem(k, v); } catch (e) { /* penyimpanan diblokir */ } },
  del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { /* abaikan */ } }
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function dRange(a, b) {
  if (!a || !b) return '-';
  const s = new Date(a + 'T00:00:00Z'), e = new Date(b + 'T00:00:00Z');
  const sm = MONTHS[s.getUTCMonth()], em = MONTHS[e.getUTCMonth()], ey = e.getUTCFullYear();
  return s.getUTCMonth() === e.getUTCMonth() ? `${s.getUTCDate()}–${e.getUTCDate()} ${em} ${ey}` : `${s.getUTCDate()} ${sm}–${e.getUTCDate()} ${em} ${ey}`;
}
const pRange = p => dRange(p.tgl_mulai, p.tgl_akhir);
const pillOf = st => st === 'Final' ? '<span class="pill p-ok">Final 🔒</span>' : st === 'Tracking' ? '<span class="pill p-tr">Tracking</span>' : '<span class="pill p-fc">Forecast</span>';

/* ---------- state ---------- */
const S = {
  url: '', code: '', role: 'view', data: null, spkId: null, view: 'dash',
  pid: null, pdfPid: null, mode: 'aktual', manOT: false, drafts: {}, offline: false, busy: 0, installEvt: null
};
const mkErr = (code, message, details) => Object.assign(new Error(message), { code, details });

/* ---------- API ---------- */
function busy(d) { S.busy += d; $('#spinner') && $('#spinner').remove(); if (S.busy > 0) { const s = document.createElement('div'); s.id = 'spinner'; s.className = 'spin'; document.body.appendChild(s); } }
async function api(action, payload = {}) {
  if (!S.url) throw mkErr('NO_URL', 'Alamat server belum diisi');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
  busy(1);
  try {
    let res;
    try {
      res = await fetch(S.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ code: S.code, action, payload }), signal: ctl.signal });
    } catch (e) { throw mkErr('NETWORK', 'Tidak bisa terhubung ke server'); }
    let out;
    try { out = await res.json(); } catch (e) { throw mkErr('BAD_RESPONSE', 'Jawaban server tidak valid (cek alamat server dan deploy Web App)'); }
    if (!out.ok) throw mkErr(out.error.code, out.error.message, out.error.details);
    return out;
  } finally { clearTimeout(t); busy(-1); }
}

/* ---------- login / sesi ---------- */
function showLogin(msg) {
  $('#app').hidden = true; $('#login').hidden = false;
  $('#loginErr').textContent = msg || '';
  $('#urlBox').hidden = !!S.url && !$('#urlBox').dataset.open;
  $('#urlIn').value = S.url;
  setTimeout(() => $('#codeIn').focus(), 50);
}
function showApp() {
  $('#login').hidden = true; $('#app').hidden = false;
  document.body.classList.toggle('viewer', S.role !== 'qs');
  $('#roleTag').textContent = S.role === 'qs' ? '👤 QS' : '👁 Viewer';
  $('#hTitle').textContent = S.data.config.project || 'Obname SPK';
  document.title = (S.data.config.project || 'Obname SPK');
  fillSpkSelect();
  route();
}
async function doLogin() {
  const code = $('#codeIn').value.trim(), url = ($('#urlIn').value || S.url).trim();
  if (!/^https?:\/\//.test(url)) return void ($('#loginErr').textContent = 'Isi alamat server (diawali https://)');
  if (!code) return void ($('#loginErr').textContent = 'Isi kode akses');
  S.url = url; S.code = code; $('#loginErr').textContent = '';
  $('#loginBtn').disabled = true;
  try {
    await api('login');
    store.set('obname.url', url);
    if ($('#remember').checked) store.set('obname.code', code); else store.set('obname.code', code, true);
    $('#codeIn').value = '';
    await startSession();
  } catch (e) { S.code = ''; showLogin(e.message); }
  finally { $('#loginBtn').disabled = false; }
}
async function startSession() {
  try { await refresh(); showApp(); }
  catch (e) {
    const cached = store.get('obname.cache');
    if (e.code === 'NETWORK' && cached) { applyCache(JSON.parse(cached)); S.offline = true; showApp(); }
    else if (e.code === 'BAD_CODE' || e.code === 'LOCKED') { logout(); showLogin(e.message); }
    else { showLogin(e.message); }
  }
}
function applyCache(c) { S.data = c.data; S.role = c.role; S.cachedAt = c.at; pickSpk(); }
function logout() {
  ['obname.code', 'obname.cache', 'obname.role'].forEach(store.del);
  S.code = ''; S.data = null; S.drafts = {}; S.pid = null; S.pdfPid = null;
  showLogin();
}
function pickSpk() {
  const spks = S.data.spk;
  const saved = store.get('obname.spk');
  if (!spks.some(s => s.id === S.spkId)) S.spkId = (spks.find(s => s.id === saved) || spks[0] || {}).id || null;
}
async function refresh() {
  const out = await api('bootstrap');
  S.data = out.data; S.role = out.role; S.offline = false;
  store.set('obname.role', S.role);
  store.set('obname.cache', JSON.stringify({ data: S.data, role: S.role, at: Date.now() }));
  pickSpk();
}
async function reload(render = true) {
  try { await refresh(); if (render) { document.body.classList.toggle('viewer', S.role !== 'qs'); $('#hTitle').textContent = S.data.config.project; fillSpkSelect(); route(true); } }
  catch (e) { showErr(e); }
}

/* ---------- turunan data ---------- */
function ctx() {
  const d = S.data, cfg = d.config;
  const spk = d.spk.find(s => s.id === S.spkId) || null;
  const mandor = spk ? (d.mandor.find(m => m.id === spk.mandor_id) || { nama: '' }) : null;
  const items = d.items.filter(i => i.spk_id === S.spkId).sort((a, b) => a.no - b.no);
  const periods = d.periods.filter(p => p.spk_id === S.spkId).sort((a, b) => a.no_ke - b.no_ke);
  return { d, cfg, spk, mandor, items, periods };
}
const rep = p => buildReport_(p, S.data.items, S.data.periodItems, S.data.periods, S.data.config);
const activePeriod = c => c.periods.find(p => p.status === 'Tracking') || c.periods.find(p => p.status !== 'Final') || c.periods[c.periods.length - 1] || null;
const lastOf = (c, st) => [...c.periods].reverse().find(p => p.status === st);

/* ---------- draft & antrean offline ---------- */
const pendingGet = () => { try { return JSON.parse(store.get('obname.pending') || '{}'); } catch (e) { return {}; } };
const pendingSet = o => store.set('obname.pending', JSON.stringify(o));
const pendingCount = () => Object.values(pendingGet()).reduce((a, m) => a + Object.keys(m).length, 0);
function draftOf(pid) {
  if (!S.drafts[pid]) S.drafts[pid] = JSON.parse(JSON.stringify(pendingGet()[pid] || {}));
  return S.drafts[pid];
}
function dirtyRows(p) {
  const dr = draftOf(p.id), r = rep(p), rows = [];
  r.rows.forEach(row => {
    const d = dr[row.item_id]; if (!d) return;
    const out = {};
    ['vol_forecast', 'vol_aktual'].forEach(k => { if (d[k] !== undefined && Math.abs(d[k] - row[k]) > 1e-9) out[k] = d[k]; });
    if (Object.keys(out).length) rows.push(Object.assign({ item_id: row.item_id }, out));
  });
  return rows;
}
function queuePending(pid, rows) {
  const p = pendingGet(); p[pid] = p[pid] || {};
  rows.forEach(r => { p[pid][r.item_id] = Object.assign(p[pid][r.item_id] || {}, r); delete p[pid][r.item_id].item_id; });
  pendingSet(p); banner();
}
async function saveDraft(p) {
  const rows = dirtyRows(p);
  if (!rows.length) return true;
  try {
    await api('savePeriodItems', { periode_id: p.id, rows });
    delete S.drafts[p.id];
    const pend = pendingGet(); delete pend[p.id]; pendingSet(pend);
    await refresh();
    return true;
  } catch (e) {
    if (e.code === 'NETWORK') { queuePending(p.id, rows); toast('Offline: perubahan disimpan di perangkat dan akan disinkronkan', 'ok'); return false; }
    showErr(e); return false;
  }
}
async function flushPending() {
  if (S.role !== 'qs') return;
  const pend = pendingGet(); let done = 0;
  for (const pid of Object.keys(pend)) {
    const rows = Object.keys(pend[pid]).map(id => Object.assign({ item_id: id }, pend[pid][id]));
    try { await api('savePeriodItems', { periode_id: pid, rows }); delete pend[pid]; delete S.drafts[pid]; done++; }
    catch (e) {
      if (e.code === 'NETWORK') break;
      showErr(e); if (['NOT_FOUND', 'BAD_STATE', 'VALIDATION'].includes(e.code)) { delete pend[pid]; delete S.drafts[pid]; }
    }
  }
  pendingSet(pend);
  if (done) { toast('Perubahan offline tersinkron', 'ok'); await reload(); }
  banner();
}
function banner() {
  const n = pendingCount(), off = S.offline || !navigator.onLine, el = $('#banner');
  const parts = [];
  if (off) parts.push('Mode offline' + (S.cachedAt ? ' — data per ' + new Date(S.cachedAt).toLocaleString('id-ID') : ''));
  if (n) parts.push(`${n} perubahan belum tersinkron <button class="btn sm" data-act="sync">Sinkronkan</button>`);
  el.innerHTML = parts.join(' · ');
}

/* ---------- toast & dialog ---------- */
let toastT;
function toast(msg, type, details) {
  const t = $('#toast');
  t.className = type || ''; t.style.display = 'block';
  t.innerHTML = esc(msg) + (details && details.length ? '<ul>' + details.slice(0, 6).map(x => `<li>${esc(x)}</li>`).join('') + (details.length > 6 ? '<li>…</li>' : '') + '</ul>' : '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.style.display = 'none'; }, details && details.length ? 7000 : 3500);
}
const showErr = e => toast(e.message || 'Terjadi kesalahan', 'bad', e.details);
function dialog(title, body, buttons) {
  const d = $('#dlg');
  d.innerHTML = `<h2>${esc(title)}</h2><div id="dbody">${body}</div><div class="err" id="derr"></div><div class="actions" id="dbtn"></div>`;
  buttons.forEach(b => {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.cls || 'sec'); el.textContent = b.label; el.type = 'button';
    el.onclick = async () => {
      if (!b.run) return d.close();
      el.disabled = true;
      try { if (await b.run(d) !== false) d.close(); } catch (e) { $('#derr').textContent = e.message + (e.details ? ' — ' + e.details.join('; ') : ''); }
      finally { el.disabled = false; }
    };
    $('#dbtn').appendChild(el);
  });
  d.showModal();
}
const askText = (title, label) => new Promise(res => {
  dialog(title, `<label>${esc(label)}</label><input id="qIn" autocomplete="off">`, [
    { label: 'Batal', run: () => { res(null); } },
    { label: 'OK', cls: '', run: d => { const v = $('#qIn', d).value.trim(); if (!v) throw new Error('Wajib diisi'); res(v); } }
  ]);
  $('#dlg').addEventListener('close', () => res(null), { once: true });
});
const confirmBox = (title, msg, okLabel) => new Promise(res => {
  dialog(title, `<p>${esc(msg)}</p>`, [{ label: 'Batal', run: () => { res(false); } }, { label: okLabel || 'Lanjut', cls: 'bad', run: () => { res(true); } }]);
  $('#dlg').addEventListener('close', () => res(false), { once: true });
});

/* ---------- navigasi ---------- */
const NAV = [['dash', '🏠', 'Beranda'], ['per', '🗓', 'Periode'], ['input', '✍️', 'Input', true], ['man', '👷', 'Manpower'], ['spk', '📋', 'Master'], ['pdf', '📄', 'PDF']];
const VIEWS = { dash: vDash, per: vPer, input: vInput, final: vFinal, man: vMan, spk: vSpk, pdf: vPdf, set: vSet };
function go(v) { if (location.hash === '#' + v) route(); else location.hash = '#' + v; }
function route(keepScroll) {
  if (!S.data) return;
  let v = (location.hash || '#dash').slice(1);
  if (!VIEWS[v]) v = 'dash';
  if (S.role !== 'qs' && ['input', 'final', 'set'].includes(v)) v = 'dash';
  S.view = v;
  $('#nav').innerHTML = NAV.filter(n => !n[3] || S.role === 'qs')
    .map(n => `<button data-nav="${n[0]}" class="${S.view === n[0] ? 'on' : ''}"><i>${n[1]}</i>${n[2]}</button>`).join('');
  banner();
  const y = window.scrollY;
  Promise.resolve(VIEWS[v]()).catch(showErr).then(() => { window.scrollTo(0, keepScroll ? y : 0); });
}
function fillSpkSelect() {
  const sel = $('#spkSel'), d = S.data;
  if (!d.spk.length) { sel.innerHTML = '<option>Belum ada SPK</option>'; sel.disabled = true; return; }
  sel.disabled = false;
  sel.innerHTML = d.spk.map(s => `<option value="${esc(s.id)}" ${s.id === S.spkId ? 'selected' : ''}>SPK ${esc(s.no_spk)} · ${esc((d.mandor.find(m => m.id === s.mandor_id) || {}).nama || '?')}</option>`).join('');
}
const V = html => { $('#view').innerHTML = html; };
function needSpk() {
  const c = ctx();
  if (c.spk) return c;
  V(`<div class="empty">Belum ada SPK.<br>${S.role === 'qs' ? '<button class="btn" data-nav="set" style="max-width:260px;margin:14px auto 0">Buat mandor &amp; SPK di Pengaturan</button>' : 'Minta QS membuat data SPK.'}</div>`);
  return null;
}

/* ---------- BERANDA ---------- */
function vDash() {
  const c = needSpk(); if (!c) return;
  const { cfg, items, periods } = c;
  const spkVal = items.reduce((a, i) => a + volSpk_(i, cfg) * num_(i.harga), 0);
  const finals = periods.filter(p => p.status === 'Final');
  const done = finals.reduce((a, p) => a + num_(p.total), 0), ret = finals.reduce((a, p) => a + num_(p.retensi), 0);
  const act = activePeriod(c), r = act ? rep(act) : null;
  const fcAll = periods.filter(p => p.status !== 'Final').reduce((a, p) => a + rep(p).total_forecast, 0);
  const bars = periods.slice(-7).map(p => {
    const x = rep(p);
    return { l: '#' + p.no_ke, v: p.status === 'Final' ? num_(p.total) : x.total_forecast, t: p.status === 'Final' ? 'a' : p.status === 'Tracking' ? 'f' : 'd' };
  });
  const mx = Math.max(1, ...bars.map(b => b.v));
  const pct = x => spkVal ? Math.min(100, x / spkVal * 100) : 0;
  V(`
  ${act ? `<div class="card"><div class="row"><b>Periode #${act.no_ke}</b>${pillOf(act.status)}</div>
    <div class="mut">${esc(pRange(act))}</div>
    <div class="row" style="margin-top:8px"><div><div class="mut">Forecast</div><b>${rp(r.total_forecast)}</b></div><div style="text-align:right"><div class="mut">Aktual</div><b>${rp(r.total)}</b></div></div>
    <div class="bar2"><div style="width:${r.total_forecast ? Math.min(100, r.total / r.total_forecast * 100) : 0}%"></div></div>
    <div class="mut" style="margin-top:4px">Realisasi ${r.total_forecast ? Math.round(r.total / r.total_forecast * 100) : 0}% dari forecast</div></div>`
      : '<div class="card"><div class="mut">Belum ada periode. ' + (S.role === 'qs' ? 'Buka di menu Periode.' : '') + '</div></div>'}
  <div class="grid2">
    <div class="card"><div class="mut">Nilai SPK</div><b style="font-size:16px">${rp(spkVal)}</b></div>
    <div class="card"><div class="mut">Terobname (final)</div><b style="font-size:16px">${rp(done)}</b><div class="mut">${Math.round(pct(done))}% dari SPK</div></div>
    <div class="card"><div class="mut">Sisa nilai SPK</div><b style="font-size:16px">${rp(spkVal - done)}</b></div>
    <div class="card"><div class="mut">Retensi tertahan</div><b style="font-size:16px">${rp(ret)}</b><div class="mut">${num_(cfg.ret)}% per periode</div></div>
  </div>
  <h3>Per 2 minggu</h3>
  <div class="card">${bars.length ? `<div class="chart">${bars.map(b => `<div class="c"><div class="b ${b.t}" style="height:${b.v / mx * 88}%"></div>${b.l}</div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--pri2)"></i>Final</span><span><i style="background:var(--fc)"></i>Berjalan (forecast)</span><span><i style="border:1px dashed var(--fc)"></i>Forecast</span></div>
    <div class="mut" style="margin-top:6px">Jika semua forecast tercapai, kumulatif ≈ ${Math.round(pct(done + fcAll))}% nilai SPK.</div>` : '<div class="mut">Belum ada data periode.</div>'}</div>
  ${S.role === 'qs' && act && act.status !== 'Final' ? '<button class="btn" data-nav="input">✍️ Update progres periode ini</button>' : ''}`);
}

/* ---------- PERIODE ---------- */
function vPer() {
  const c = needSpk(); if (!c) return;
  const qs = S.role === 'qs', last = c.periods[c.periods.length - 1];
  const finalLast = lastOf(c, 'Final');
  V(`<h3 style="margin-top:0">Periode 2 mingguan · SPK ${esc(c.spk.no_spk)}</h3>
  ${c.periods.length ? [...c.periods].reverse().map(p => {
    const r = rep(p), val = p.status === 'Final' ? num_(p.grand_total) : p.status === 'Tracking' ? r.grand_total : r.total_forecast;
    const sub = p.status === 'Final' ? 'Grand total ' + rp(val) : p.status === 'Tracking' ? 'Aktual berjalan ' + rp(r.total) : 'Forecast ' + rp(val);
    const acts = [];
    if (p.status === 'Final') {
      acts.push(`<button class="btn sm sec" data-act="pdf" data-id="${p.id}">PDF</button>`);
      if (qs && finalLast && finalLast.id === p.id) acts.push(`<button class="btn sm sec" data-act="unlock" data-id="${p.id}">Buka kunci</button>`);
    } else if (qs) {
      if (p.status === 'Tracking') acts.push(`<button class="btn sm" data-act="inp" data-id="${p.id}">Input</button><button class="btn sm sec" data-act="fin" data-id="${p.id}">Final Check</button>`);
      else {
        acts.push(`<button class="btn sm sec" data-act="inp" data-id="${p.id}">Forecast</button>`);
        const prevOk = !c.periods.some(x => x.no_ke < p.no_ke && x.status !== 'Final') && !c.periods.some(x => x.status === 'Tracking');
        if (prevOk) acts.push(`<button class="btn sm" data-act="trk" data-id="${p.id}">Mulai Tracking</button>`);
      }
      if (last && last.id === p.id) acts.push(`<button class="btn sm sec" data-act="delp" data-id="${p.id}">Hapus</button>`);
    }
    return `<div class="card"><div class="row top"><div><b>#${p.no_ke}</b> · ${esc(pRange(p))}<div class="mut">${sub}</div></div>${pillOf(p.status)}</div>${acts.length ? `<div class="actions">${acts.join('')}</div>` : ''}</div>`;
  }).join('') : '<div class="empty">Belum ada periode.</div>'}
  ${qs ? '<button class="btn sec" data-act="newp">＋ Buka periode berikutnya</button>' : ''}`);
}

/* ---------- INPUT ---------- */
function vInput() {
  const c = needSpk(); if (!c) return;
  const open = c.periods.filter(p => p.status !== 'Final');
  if (!open.length) return V('<div class="empty">Tidak ada periode aktif.<br>Buka periode berikutnya di menu Periode.</div>');
  const p = open.find(x => x.id === S.pid) || open.find(x => x.status === 'Tracking') || open[0];
  S.pid = p.id;
  if (p.status !== 'Tracking') S.mode = 'forecast';
  const r = rep(p), key = S.mode === 'aktual' ? 'vol_aktual' : 'vol_forecast', dr = draftOf(p.id);
  S.inp = { p, r, key };
  V(`
  ${open.length > 1 ? `<div class="seg">${open.map(x => `<button class="${x.id === p.id ? 'on' : ''}" data-act="pickp" data-id="${x.id}">#${x.no_ke}</button>`).join('')}</div>` : ''}
  <div class="row" style="margin-bottom:8px"><div><b>Periode #${p.no_ke}</b><div class="mut">${esc(pRange(p))}</div></div>${pillOf(p.status)}</div>
  <div class="seg"><button class="${S.mode === 'aktual' ? 'on' : ''}" data-act="mode" data-m="aktual" ${p.status !== 'Tracking' ? 'disabled style="opacity:.4"' : ''}>Aktual (tracking)</button><button class="${S.mode === 'forecast' ? 'on' : ''}" data-act="mode" data-m="forecast">Forecast</button></div>
  ${r.rows.map(row => {
    const val = dr[row.item_id] && dr[row.item_id][key] !== undefined ? dr[row.item_id][key] : row[key];
    const other = S.mode === 'aktual' ? ['Forecast', row.vol_forecast] : ['Aktual', row.vol_aktual];
    return `<div class="item" data-row="${esc(row.item_id)}"><div class="row"><span class="no">${esc(row.no)}</span><b style="flex:1;margin-left:8px">${esc(row.deskripsi)}</b></div>
    <div class="kv"><div><span class="mut">Sebelumnya</span><b>${fmt(row.vol_sebelumnya)}</b></div><div><span class="mut">Sisa</span><b>${fmt(row.sisa)}</b></div><div><span class="mut">${other[0]}</span><b>${fmt(other[1])} ${esc(row.sat)}</b></div></div>
    <label>Vol ${S.mode === 'aktual' ? 'aktual' : 'forecast'} (${esc(row.sat)}) · @ ${rp(row.harga)}</label>
    <input type="number" inputmode="decimal" min="0" step="0.01" data-item="${esc(row.item_id)}" value="${val ? val : ''}">
    <div class="row" style="margin-top:4px"><span class="err" data-e style="min-height:0"></span><b data-j></b></div></div>`;
  }).join('')}
  <div class="sum">
    <div class="row"><span>Total ${S.mode === 'aktual' ? 'aktual' : 'forecast'}</span><b id="sTot"></b></div>
    ${S.mode === 'aktual' ? `<div class="row"><span>Retensi ${num_(r.retensi_pct)}%</span><b id="sRet"></b></div><div class="row"><span>Grand total</span><span class="tot" id="sGr"></span></div>` : ''}
    <div class="grid2" style="margin-top:8px"><button class="btn sec" id="btnSave" data-act="save">Simpan</button>${p.status === 'Tracking' ? '<button class="btn" data-act="fin" data-id="' + p.id + '">Final Check →</button>' : '<button class="btn" data-act="trk" data-id="' + p.id + '">Mulai Tracking</button>'}</div>
  </div>`);
  updInput();
}
function updInput() {
  const { p, r, key } = S.inp, dr = draftOf(p.id);
  let tot = 0, bad = false;
  r.rows.forEach(row => {
    const v = dr[row.item_id] && dr[row.item_id][key] !== undefined ? dr[row.item_id][key] : row[key];
    const el = $(`[data-row="${CSS.escape(row.item_id)}"]`); if (!el) return;
    const over = v > row.sisa + 1e-9;
    $('[data-e]', el).textContent = over ? `Melebihi sisa (${fmt(row.sisa)})` : '';
    $('[data-j]', el).textContent = rp(over ? 0 : v * row.harga);
    if (over) bad = true; else tot += v * row.harga;
  });
  $('#sTot').textContent = rp(tot);
  if ($('#sRet')) { const ret = Math.round(tot * num_(r.retensi_pct) / 100); $('#sRet').textContent = '− ' + rp(ret); $('#sGr').textContent = rp(tot - ret); }
  $('#btnSave').disabled = bad;
}

/* ---------- FINAL CHECK ---------- */
async function vFinal() {
  const c = needSpk(); if (!c) return;
  const p = c.periods.find(x => x.id === S.pid && x.status === 'Tracking') || lastOf(c, 'Tracking');
  if (!p) return V('<div class="empty">Tidak ada periode berstatus Tracking untuk difinalkan.</div>');
  S.pid = p.id;
  V('<div class="empty">Memeriksa…</div>');
  if (!(await saveDraft(p))) { if (pendingCount()) return V('<div class="empty">Tidak ada koneksi.<br>Perubahan tersimpan di perangkat. Sambungkan internet lalu ulangi Final Check.</div>'); return go('input'); }
  const out = await api('checkPeriod', { periode_id: p.id });
  const { report, checks } = out.data, blk = checks.blockers.length;
  V(`
  <div class="row" style="margin-bottom:8px"><b>Final Check · Periode #${p.no_ke}</b>${pillOf(p.status)}</div>
  <div class="mut" style="margin-bottom:8px">${esc(pRange(p))}</div>
  <div class="card">
    <div class="chk2"><span>${blk ? '❌' : '✅'}</span><div><b>Volume aktual ≤ sisa volume</b>${checks.blockers.map(x => `<div class="mut" style="color:var(--bad)">${esc(x)}</div>`).join('')}</div></div>
    <div class="chk2"><span>${checks.warnings.length ? '⚠️' : '✅'}</span><div><b>Kelengkapan &amp; selisih forecast (±20%)</b>${checks.warnings.map(x => `<div class="mut">${esc(x)}</div>`).join('') || '<div class="mut">Tidak ada catatan</div>'}</div></div>
    <div class="chk2"><span>✅</span><div><b>Retensi ${report.retensi_pct}% terhitung</b><div class="mut">Total ${rp(report.total)} · Retensi ${rp(report.retensi)} · Grand total ${rp(report.grand_total)}</div></div></div>
  </div>
  <div class="card">${report.rows.map(r => `<div class="row" style="padding:4px 0;font-size:13px"><span>${esc(r.no)}. ${esc(r.deskripsi)}</span><span>${fmt(r.vol_aktual)} ${esc(r.sat)} · ${rp(r.jumlah)}</span></div>`).join('')}</div>
  <div class="card"><label class="chk" style="margin:0"><input type="checkbox" id="ack"> Saya sudah cek semua volume di lapangan</label></div>
  <button class="btn" id="btnFin" data-act="finalize" data-id="${p.id}" disabled>🔒 Finalkan &amp; Kunci Periode</button>
  <button class="btn sec" data-nav="input">Kembali ke Input</button>
  <p class="mut">Setelah final, periode terkunci dan menjadi "Vol sebelumnya" periode berikutnya.</p>`);
  S.finBlock = blk > 0;
}

/* ---------- MASTER ---------- */
function vSpk() {
  const c = needSpk(); if (!c) return;
  const { cfg, items } = c, qs = S.role === 'qs';
  const total = items.reduce((a, i) => a + volSpk_(i, cfg) * num_(i.harga), 0);
  V(`<div class="card"><div class="mut">SPK ${esc(c.spk.no_spk)} · ${esc(c.spk.pekerjaan)} · ${esc(c.mandor.nama)}</div><div class="row"><b>Total nilai SPK</b><b>${rp(total)}</b></div></div>
  ${items.map(i => {
    const vs = volSpk_(i, cfg), ov = i.vol_spk_override !== '' && i.vol_spk_override != null;
    return `<div class="item ${qs ? 'click' : ''}" ${qs ? `data-act="edititem" data-id="${esc(i.id)}"` : ''}><div class="row"><span class="no">${esc(i.no)}</span><b style="flex:1;margin-left:8px">${esc(i.deskripsi)}</b></div>
    <div class="mut">${esc(i.spesifikasi)}</div>
    <div class="kv"><div><span class="mut">Vol RAB</span><b>${fmt(i.vol_rab)} ${esc(i.sat)}</b></div><div><span class="mut">Vol SPK ${ov ? '(manual)' : num_(cfg.pctSpk) + '%'}</span><b>${fmt(vs)} ${esc(i.sat)}</b></div><div><span class="mut">Harga sat.</span><b>${num(i.harga)}</b></div></div>
    <div class="row"><span class="mut">Jumlah SPK</span><b>${rp(vs * num_(i.harga))}</b></div></div>`;
  }).join('') || '<div class="empty">Belum ada item pekerjaan.</div>'}
  ${qs ? '<button class="btn sec" data-act="additem">＋ Tambah item pekerjaan</button><button class="btn sec" data-act="import">⇪ Impor dari Excel (tempel)</button>' : ''}`);
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
  if (!c.periods.length) return V('<div class="empty">Belum ada periode. Forecast manpower dihitung dari volume forecast per periode.</div>');
  const p = c.periods.find(x => x.id === S.manPid) || activePeriod(c); S.manPid = p.id;
  const dis = S.role !== 'qs' ? 'disabled' : '';
  const cats = [...new Set(S.data.produktivitas.map(x => x.kategori))];
  const mapOf = id => S.data.map.find(m => m.item_id === id) || { ref: '', koef: 0 };
  const r = rep(p);
  V(`<div class="row" style="margin-bottom:8px"><b>👷 Forecast Manpower</b><span class="mut">Acuan: Standar Produktivitas CSA &amp; MEP</span></div>
  <div class="seg">${c.periods.filter(x => x.status !== 'Final' || x.id === p.id).slice(-6).map(x => `<button class="${x.id === p.id ? 'on' : ''}" data-act="manp" data-id="${x.id}">#${x.no_ke}</button>`).join('')}</div>
  <div class="seg"><button class="${!S.manOT ? 'on' : ''}" data-act="ot" data-v="0">Jam normal</button><button class="${S.manOT ? 'on' : ''}" data-act="ot" data-v="1">Dengan lembur</button></div>
  <div class="card" id="manSum"></div>
  ${r.rows.map(row => {
    const m = mapOf(row.item_id);
    return `<div class="item" data-mi="${esc(row.item_id)}"><div class="row"><span class="no">${esc(row.no)}</span><b style="flex:1;margin-left:8px">${esc(row.deskripsi)}</b></div>
    <label>Acuan produktivitas</label>
    <select data-mref="${esc(row.item_id)}" ${dis}><option value="">— pilih acuan —</option>${cats.map(k => `<optgroup label="${esc(k)}">${S.data.produktivitas.filter(x => x.kategori === k).map(x => `<option ${x.pekerjaan === m.ref ? 'selected' : ''}>${esc(x.pekerjaan)}</option>`).join('')}</optgroup>`).join('')}</select>
    <div class="mut" data-ms style="margin-top:4px"></div>
    <label>Koefisien kesulitan (% penurunan kapasitas)</label>
    <input type="number" min="0" max="60" step="1" inputmode="numeric" data-mk="${esc(row.item_id)}" value="${num_(m.koef)}" ${dis}>
    <div class="chips">${[0, 10, 20, 30].map(v => `<button data-act="koef" data-id="${esc(row.item_id)}" data-v="${v}" ${dis}>${v}%</button>`).join('')}</div>
    <div data-mo></div></div>`;
  }).join('')}
  <div class="card"><div class="mut"><b>Cara hitung</b><br>Kapasitas efektif = kapasitas standar × (1 − koefisien%) × (jam kerja ÷ 8). Lembur menambah jam per hari. Regu = Vol forecast ÷ kapasitas efektif ÷ hari kerja periode. Orang = regu × komposisi (dibulatkan ke atas per item).</div>
  <div class="mut" style="margin-top:6px"><b>Panduan standar:</b> area tinggi (plafon tinggi, eksterior gedung bertingkat) menurunkan kapasitas 20–30%. Bila material sulit/jauh, ubah rasio menjadi 1 Tukang : 2 Kenek.</div></div>`);
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
    if (it.error) { $('[data-ms]', el).innerHTML = '<span class="warnx">Pilih acuan produktivitas</span>'; $('[data-mo]', el).innerHTML = ''; return; }
    const p = prod[it.acuan], warn = [];
    if (!it.satuan_cocok) warn.push(`⚠ satuan SPK (${esc(it.sat)}) ≠ satuan standar (${esc(it.satuan_acuan)}), cek acuan`);
    if (it.koefisien > 30) warn.push('⚠ di atas rentang 20–30% pada standar');
    $('[data-ms]', el).innerHTML = `Standar: ${fmt(p.kap_min)}–${fmt(p.kap_max)} ${esc(p.satuan)}/hari/regu · ${esc(p.komposisi)}` + (warn.length ? `<br><span class="warnx">${warn.join('<br>')}</span>` : '');
    $('[data-mo]', el).innerHTML = `<div class="kv"><div><span class="mut">Vol forecast</span><b>${fmt(it.vol)} ${esc(it.sat)}</b></div><div><span class="mut">Kapasitas efektif</span><b>${fmt(it.kapasitas_efektif)}/hari</b></div><div><span class="mut">Regu</span><b>${fmt(it.regu)}</b></div></div>
      <div>${it.tenaga.map(h => `<span class="chip"><b>${h.orang}</b> ${esc(h.jabatan)}</span>`).join('')}<span class="mut" style="margin-left:4px">${fmt(it.hari_orang)} hari-orang</span></div>`;
  });
  const p = c.periods.find(x => x.id === S.manPid);
  $('#manSum').innerHTML = `<div class="row"><div><div class="mut">Kebutuhan puncak (Periode #${p.no_ke})</div><div class="big">${res.puncak} orang</div></div><div style="text-align:right"><div class="mut">Rata-rata teoritis</div><b>${fmt(res.rata_rata_per_hari)} orang/hari</b></div></div>
    <div style="margin-top:6px">${Object.keys(res.per_jabatan).map(k => `<span class="chip"><b>${res.per_jabatan[k]}</b> ${esc(k)}</span>`).join('') || '<span class="mut">Belum ada item dengan acuan</span>'}</div>
    <div class="mut" style="margin-top:6px"><b>Jam normal ${peakN} orang · Dengan lembur ${peakO} orang</b></div>
    <div class="mut" style="margin-top:2px">${esc(pRange(p))} · ${res.hari_kerja} hari kerja (${num_(cfg.hariMg)} hr/mgg) · ${fmt(res.jam_per_hari)} jam/hari${S.manOT ? ` (lembur +${num_(cfg.lembur)}%)` : ''} · basis kapasitas: ${({ min: 'minimum', avg: 'rata-rata', max: 'maksimum' })[cfg.basis] || cfg.basis} · total ${fmt(res.hari_orang)} hari-orang</div>`;
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
  if (!list.length) return V(`<div class="empty">${S.role === 'qs' ? 'Belum ada periode.' : 'Belum ada periode Final untuk dilihat.'}</div>`);
  const p = list.find(x => x.id === S.pdfPid) || lastOf({ periods: list }, 'Final') || list[list.length - 1];
  S.pdfPid = p.id;
  V('<div class="empty">Memuat…</div>');
  const out = await api('getReport', { periode_id: p.id });
  S.pdf = out.data;
  const fin = out.data.header.status === 'Final';
  V(`<div class="seg">${list.slice(-8).map(x => `<button class="${x.id === p.id ? 'on' : ''}" data-act="pdfp" data-id="${x.id}">#${x.no_ke}${x.status === 'Final' ? ' 🔒' : ''}</button>`).join('')}</div>
  <div class="lock ${fin ? '' : 'draft'}">${fin ? '🔒 Periode final — siap diajukan.' : 'Draft — belum final. PDF diberi watermark "DRAFT".'}</div>
  <div class="mut" style="margin-bottom:4px">Pratinjau kertas A4 <b>landscape</b> (diperkecil):</div>
  <div id="paperBox"><div class="paper" id="paper">${paperHTML(out.data)}</div></div>
  <div class="grid2" style="margin-top:10px"><button class="btn" data-act="print">⬇ Simpan PDF</button><button class="btn sec" data-act="print">🖨 Cetak</button></div>
  <p class="mut">Di dialog cetak pilih tujuan "Simpan sebagai PDF", kertas A4, orientasi landscape (sudah diatur otomatis). Susunan kolom sama dengan sheet OBNAME di Excel.</p>`);
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
  const sc = box.clientWidth / 1060; p.style.transform = `scale(${sc})`; box.style.height = (p.offsetHeight * sc) + 'px';
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
  V(`<h2 style="margin-bottom:8px">⚙ Pengaturan</h2>
  <div class="card"><div class="mut" style="margin-bottom:4px">Proyek (dipakai di layar dan PDF)</div>
    ${f('project', 'Nama proyek')}${f('owner', 'Owner / pemberi kerja')}</div>
  <div class="card"><div class="mut" style="margin-bottom:4px">Hitungan</div>
    <div class="grid2"><div>${f('pctSpk', 'Volume SPK (% dari RAB)', 'number', 'min="1" max="100"')}</div><div>${f('ret', 'Retensi (%)', 'number', 'min="0" max="100" step="0.5"')}</div></div>
    <div class="grid2"><div>${f('jam', 'Jam normal per hari', 'number', 'min="1" max="24" step="0.5"')}</div><div>${f('hariMg', 'Hari kerja per minggu', 'number', 'min="1" max="7"')}</div></div>
    <div class="grid2"><div>${f('lembur', 'Lembur (% tambahan jam normal)', 'number', 'min="0" max="100"')}</div><div><label>Basis kapasitas manpower</label><select data-cfg="basis">${[['min', 'Minimum (konservatif)'], ['avg', 'Rata-rata'], ['max', 'Maksimum']].map(o => `<option value="${o[0]}" ${cfg.basis === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div></div>
    ${f('start', 'Mulai periode #1', 'date')}
    <div class="mut" style="margin-top:6px">Persen SPK dan tanggal mulai terkunci setelah ada periode Final / periode dibuat.</div></div>
  <div class="card"><div class="mut" style="margin-bottom:4px">Penandatangan di PDF</div>
    ${[1, 2, 3].map(n => `<div class="grid2"><div>${f('sign' + n + '_label', 'Jabatan')}</div><div>${f('sign' + n + '_name', 'Nama')}</div></div>`).join('')}
    <div class="mut" style="margin-top:6px">Penandatangan ke-4 (Mandor) otomatis mengikuti mandor SPK.</div></div>
  <button class="btn" data-act="savecfg">Simpan pengaturan</button>
  <h3>Mandor</h3>
  ${d.mandor.map(m => `<div class="card row"><span>${esc(m.nama)}</span><span><button class="btn sm sec" data-act="renm" data-id="${esc(m.id)}">Ubah</button> <button class="btn sm sec" data-act="delm" data-id="${esc(m.id)}">Hapus</button></span></div>`).join('') || '<div class="mut">Belum ada mandor.</div>'}
  <button class="btn sec" data-act="addm">＋ Tambah mandor</button>
  <h3>SPK</h3>
  ${d.spk.map(s => `<div class="card row"><span><b>SPK ${esc(s.no_spk)}</b><div class="mut">${esc((d.mandor.find(m => m.id === s.mandor_id) || {}).nama || '?')} · ${esc(s.pekerjaan)}</div></span><button class="btn sm sec" data-act="edspk" data-id="${esc(s.id)}">Ubah</button></div>`).join('') || '<div class="mut">Belum ada SPK.</div>'}
  <button class="btn sec" data-act="addspk">＋ Tambah SPK</button>
  <h3>Aplikasi</h3>
  <div class="card"><div class="mut">Server</div><div style="word-break:break-all;font-size:13px">${esc(S.url)}</div>
    <div class="actions"><button class="btn sm sec" data-act="chgurl">Ubah alamat server</button>${S.installEvt ? '<button class="btn sm" data-act="install">Pasang aplikasi</button>' : ''}<button class="btn sm sec" data-act="log">Lihat log</button></div></div>
  <button class="btn sec" data-act="logout">Keluar</button>`);
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

/* ---------- aksi (delegasi klik) ---------- */
const ACT = {
  sync: () => flushPending(),
  pickp: ds => { S.pid = ds.id; route(); },
  mode: ds => { S.mode = ds.m; route(); },
  async save() { const p = S.inp.p; if (await saveDraft(p)) { toast('Tersimpan', 'ok'); route(true); } },
  inp: ds => { S.pid = ds.id; const p = ctx().periods.find(x => x.id === ds.id); S.mode = p && p.status === 'Tracking' ? 'aktual' : 'forecast'; go('input'); },
  async fin(ds) { S.pid = ds.id; if (S.view === 'input') { const p = S.inp.p; if (!(await saveDraft(p))) return; } go('final'); },
  async trk(ds) { const p = S.inp && S.inp.p && S.inp.p.id === ds.id ? S.inp.p : null; if (p && !(await saveDraft(p))) return; try { await api('startTracking', { periode_id: ds.id }); toast('Periode mulai Tracking', 'ok'); S.mode = 'aktual'; await reload(); } catch (e) { showErr(e); } },
  async newp() { try { const r = await api('createPeriod', { spk_id: S.spkId }); toast(`Periode #${r.data.no_ke} dibuka (${r.data.status})`, 'ok'); await reload(); } catch (e) { showErr(e); } },
  async delp(ds) { if (!(await confirmBox('Hapus periode?', 'Data forecast/aktual periode ini ikut terhapus.', 'Hapus'))) return; try { await api('deletePeriod', { periode_id: ds.id }); toast('Periode dihapus', 'ok'); await reload(); } catch (e) { showErr(e); } },
  async unlock(ds) { const why = await askText('Buka kunci periode', 'Alasan (wajib, tercatat di log)'); if (!why) return; try { await api('unlockPeriod', { periode_id: ds.id, reason: why }); toast('Kunci dibuka — status Tracking', 'ok'); await reload(); } catch (e) { showErr(e); } },
  async finalize(ds) {
    try { const r = await api('finalizePeriod', { periode_id: ds.id, ack: true }); toast('Periode difinalkan 🔒', 'ok', r.data.warnings.slice(0, 3)); S.pdfPid = ds.id; await refresh(); go('pdf'); }
    catch (e) { showErr(e); }
  },
  pdf: ds => { S.pdfPid = ds.id; go('pdf'); },
  pdfp: ds => { S.pdfPid = ds.id; route(); },
  print: () => doPrint(),
  manp: ds => { S.manPid = ds.id; route(true); },
  ot: ds => { S.manOT = ds.v === '1'; route(true); },
  koef: ds => { const el = $(`[data-mk="${CSS.escape(ds.id)}"]`); el.value = ds.v; setMap(ds.id, { koef: +ds.v }); },
  edititem: ds => itemDialog(S.data.items.find(i => i.id === ds.id)),
  additem: () => itemDialog(null),
  import: () => importDialog(),
  async savecfg() {
    const values = {};
    document.querySelectorAll('[data-cfg]').forEach(el => { values[el.dataset.cfg] = el.value; });
    try { await api('saveConfig', { values }); toast('Pengaturan tersimpan', 'ok'); await reload(); } catch (e) { showErr(e); }
  },
  async addm() { const n = await askText('Tambah mandor', 'Nama mandor'); if (!n) return; try { await api('saveMandor', { nama: n }); await reload(); } catch (e) { showErr(e); } },
  async renm(ds) { const m = S.data.mandor.find(x => x.id === ds.id); const n = await askText('Ubah nama mandor', 'Nama baru (sekarang: ' + m.nama + ')'); if (!n) return; try { await api('saveMandor', { id: ds.id, nama: n }); await reload(); } catch (e) { showErr(e); } },
  async delm(ds) { if (!(await confirmBox('Hapus mandor?', 'Tidak bisa dihapus jika masih dipakai SPK.', 'Hapus'))) return; try { await api('deleteMandor', { id: ds.id }); await reload(); } catch (e) { showErr(e); } },
  addspk: () => spkDialog(null),
  edspk: ds => spkDialog(S.data.spk.find(x => x.id === ds.id)),
  async chgurl() { const u = await askText('Alamat server', 'URL Web App (…/exec)'); if (!u) return; if (!/^https?:\/\//.test(u)) return toast('URL harus diawali https://', 'bad'); S.url = u; store.set('obname.url', u); await reload(); },
  async install() { S.installEvt.prompt(); await S.installEvt.userChoice; S.installEvt = null; route(true); },
  async log() {
    try {
      const r = await api('getLog', { limit: 40 });
      dialog('Log aktivitas', r.data.map(x => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--line)"><b>${esc(x.aksi)}</b> <span class="mut">${esc(x.waktu)}</span><div class="mut" style="word-break:break-all">${esc(x.detail)}</div></div>`).join('') || '<div class="mut">Kosong</div>', [{ label: 'Tutup' }]);
    } catch (e) { showErr(e); }
  },
  logout: () => logout()
};

function wire() {
  document.addEventListener('click', e => {
    const n = e.target.closest('[data-nav]'); if (n) return go(n.dataset.nav);
    const a = e.target.closest('[data-act]'); if (a && ACT[a.dataset.act] && !a.disabled) ACT[a.dataset.act](a.dataset, a);
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('[data-item]') && S.inp) {
      const dr = draftOf(S.inp.p.id), id = t.dataset.item;
      dr[id] = dr[id] || {};
      dr[id][S.inp.key] = t.value === '' ? 0 : Math.max(0, parseFloat(t.value) || 0);
      updInput();
    } else if (t.matches('[data-mk]')) setMap(t.dataset.mk, { koef: Math.min(60, Math.max(0, parseFloat(t.value) || 0)) });
    else if (t.matches('#ack')) $('#btnFin').disabled = !t.checked || S.finBlock;
  });
  document.addEventListener('change', e => { if (e.target.matches('[data-mref]')) setMap(e.target.dataset.mref, { ref: e.target.value }); });
  $('#spkSel').onchange = e => { S.spkId = e.target.value; store.set('obname.spk', S.spkId); S.pid = null; S.pdfPid = null; S.manPid = null; route(); };
  $('#btnSet').onclick = () => go('set');
  $('#loginBtn').onclick = doLogin;
  $('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#urlToggle').onclick = () => { $('#urlBox').dataset.open = '1'; $('#urlBox').hidden = false; $('#urlIn').focus(); };
  window.addEventListener('hashchange', () => route());
  window.addEventListener('resize', () => { if (S.view === 'pdf') fitPaper(); });
  window.addEventListener('online', async () => { S.offline = false; banner(); await flushPending(); if (S.data && !pendingCount()) reload(); });
  window.addEventListener('offline', banner);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; if (S.view === 'set') route(true); });
}

/* ---------- start ---------- */
(function init() {
  wire();
  S.url = store.get('obname.url') || (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
  S.drafts = {};
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell tidak aktif */ });
  const saved = store.get('obname.code') || store.get('obname.code', true);
  if (saved && S.url) { S.code = saved; S.role = store.get('obname.role') || 'view'; startSession(); }
  else showLogin();
})();
