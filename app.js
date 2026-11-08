'use strict';
/* Obname SPK — aplikasi web layar lebar (bukan PWA). Semua data & aturan berasal dari server (Apps Script);
   rumus memakai logic.js (salinan backend/Logic.gs) agar angka di layar sama dengan yang dihitung server.
   Tampilan ada di views.js, impor PDF di import-pdf.js. */

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
  pid: null, pdfPid: null, manPid: null, manOT: false, drafts: {}, offline: false, busy: 0
};
// versi API backend minimum yang dibutuhkan aplikasi ini (lihat API_VERSION di backend/Code.gs)
const NEED_API = '1.1.0';
const verLt = (a, b) => { const x = String(a || '0').split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== y[i]) return (x[i] || 0) < y[i]; } return false; };
const backendOld = () => S.data && verLt(S.data.version, NEED_API);
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
  paintShell();
  route();
}
function paintShell() {
  document.body.classList.toggle('viewer', S.role !== 'qs');
  $('#roleTag').textContent = S.role === 'qs' ? '👤 QS · admin' : '👁 Viewer · hanya melihat';
  $('#hTitle').textContent = S.data.config.project || 'Obname SPK';
  document.title = (S.data.config.project || 'Obname SPK') + ' · Obname SPK';
  fillSpkSelect();
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
  S.code = ''; S.data = null; S.drafts = {}; S.pid = null; S.pdfPid = null; S.manPid = null;
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
  try { await refresh(); S.hData = null; if (render) { paintShell(); route(true); } }
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

/* ---------- draft & antrean saat koneksi putus ---------- */
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
    if (e.code === 'NETWORK') { queuePending(p.id, rows); toast('Koneksi putus: perubahan disimpan di perangkat dan akan disinkronkan', 'ok'); return false; }
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
  if (done) { toast('Perubahan tersinkron', 'ok'); await reload(); }
  banner();
}
function banner() {
  const n = pendingCount(), off = S.offline || !navigator.onLine, el = $('#banner');
  const parts = [];
  if (off) parts.push('Tidak ada koneksi' + (S.cachedAt ? ' — menampilkan data per ' + new Date(S.cachedAt).toLocaleString('id-ID') : ''));
  if (n) parts.push(`${n} perubahan belum tersinkron <button class="btn sm" data-act="sync">Sinkronkan</button>`);
  if (backendOld()) parts.push(`<b>Backend di Google Apps Script masih versi lama (${esc(S.data.version || '1.0.0')}, butuh ${NEED_API}).</b> Fitur baru (mis. pekerja harian) belum bisa dipakai. ${S.role === 'qs' ? 'Salin ulang semua file <code>.gs</code> dari folder backend, jalankan <code>setup</code>, lalu Deploy → Kelola deployment → edit → Versi baru.' : 'Minta QS memperbarui backend.'}`);
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
function dialog(title, body, buttons, wide) {
  const d = $('#dlg');
  d.className = wide ? 'wide' : '';
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
const NAV = [['#', 'Obname SPK'], ['dash', '🏠', 'Beranda'], ['per', '🗓', 'Periode'], ['input', '✍️', 'Input forecast & aktual', true], ['man', '👷', 'Forecast manpower'], ['spk', '📋', 'Master SPK'], ['pdf', '📄', 'PDF pengajuan'],
  ['#', 'Pekerja harian'], ['pek', '👥', 'Daftar pekerja'], ['absen', '🕘', 'Absensi harian', true], ['harian', '💰', 'Rekap & klaim']];
const VIEWS = { dash: vDash, per: vPer, input: vInput, final: vFinal, man: vMan, spk: vSpk, pdf: vPdf, set: vSet, pek: vPek, absen: vAbsen, harian: vHarian };
function go(v) { if (location.hash === '#' + v) route(); else location.hash = '#' + v; }
function route(keepScroll) {
  if (!S.data) return;
  let v = (location.hash || '#dash').slice(1);
  if (!VIEWS[v]) v = 'dash';
  if (S.role !== 'qs' && ['input', 'final', 'set', 'absen'].includes(v)) v = 'dash';
  S.view = v;
  const hl = v === 'final' ? 'input' : v;
  $('#nav').innerHTML = NAV.filter(n => !n[3] || S.role === 'qs')
    .map(n => n[0] === '#' ? `<div class="grp">${n[1]}</div>` : `<button data-nav="${n[0]}" class="${hl === n[0] ? 'on' : ''}"><i>${n[1]}</i>${n[2]}</button>`).join('');
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
  V(`<div class="empty"><h2 style="margin-bottom:6px">Belum ada SPK</h2>${S.role === 'qs' ? 'Impor dari PDF SPK atau buat manual.<br><button class="btn" data-act="pdfimp">📄 Impor SPK dari PDF</button><button class="btn sec" data-nav="set">Buat manual di Pengaturan</button>' : 'Minta QS membuat data SPK.'}</div>`);
  return null;
}

/* ---------- aksi (delegasi klik) ---------- */
const ACT = {
  sync: () => flushPending(),
  pickp: ds => { S.pid = ds.id; route(); },
  async save() { const p = S.inp.p; if (await saveDraft(p)) { toast('Tersimpan', 'ok'); route(true); } },
  inp: ds => { S.pid = ds.id; go('input'); },
  async fin(ds) { S.pid = ds.id; if (S.view === 'input') { const p = S.inp.p; if (!(await saveDraft(p))) return; } go('final'); },
  async trk(ds) { const p = S.inp && S.inp.p && S.inp.p.id === ds.id ? S.inp.p : null; if (p && !(await saveDraft(p))) return; try { await api('startTracking', { periode_id: ds.id }); toast('Periode mulai Tracking', 'ok'); await reload(); } catch (e) { showErr(e); } },
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
  pdfimp: () => $('#pdfIn').click(),
  async savecfg() {
    // kirim hanya yang berubah, supaya satu isian tidak menggagalkan yang lain
    const values = {}, cfg = S.data.config;
    document.querySelectorAll('[data-cfg]').forEach(el => { if (String(el.value) !== String(cfg[el.dataset.cfg] == null ? '' : cfg[el.dataset.cfg])) values[el.dataset.cfg] = el.value; });
    if (values.hse_sheet_id !== undefined) values.hse_sheet_id = sheetIdOf_(values.hse_sheet_id); // alamat lengkap -> ID
    if (!Object.keys(values).length) return toast('Tidak ada perubahan', 'ok');
    try { await api('saveConfig', { values }); toast('Pengaturan tersimpan', 'ok'); await reload(); }
    catch (e) { if (/Pengaturan tidak dikenal/.test(e.message)) e.message += ' — backend masih versi lama; perbarui file .gs lalu buat versi deployment baru'; showErr(e); }
  },
  async addm() { const n = await askText('Tambah mandor', 'Nama mandor'); if (!n) return; try { await api('saveMandor', { nama: n }); await reload(); } catch (e) { showErr(e); } },
  async renm(ds) { const m = S.data.mandor.find(x => x.id === ds.id); const n = await askText('Ubah nama mandor', 'Nama baru (sekarang: ' + m.nama + ')'); if (!n) return; try { await api('saveMandor', { id: ds.id, nama: n }); await reload(); } catch (e) { showErr(e); } },
  async delm(ds) { if (!(await confirmBox('Hapus mandor?', 'Tidak bisa dihapus jika masih dipakai SPK.', 'Hapus'))) return; try { await api('deleteMandor', { id: ds.id }); await reload(); } catch (e) { showErr(e); } },
  addspk: () => spkDialog(null),
  edspk: ds => spkDialog(S.data.spk.find(x => x.id === ds.id)),
  async chgurl() { const u = await askText('Alamat server', 'URL Web App (…/exec)'); if (!u) return; if (!/^https?:\/\//.test(u)) return toast('URL harus diawali https://', 'bad'); S.url = u; store.set('obname.url', u); await reload(); },
  async log() {
    try {
      const r = await api('getLog', { limit: 40 });
      dialog('Log aktivitas', r.data.map(x => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--line)"><b>${esc(x.aksi)}</b> <span class="mut">${esc(x.waktu)}</span><div class="mut" style="word-break:break-all">${esc(x.detail)}</div></div>`).join('') || '<div class="mut">Kosong</div>', [{ label: 'Tutup' }], true);
    } catch (e) { showErr(e); }
  },
  logout: () => logout(),
  /* pekerja harian */
  async synchse() {
    try { const r = await api('syncHse'); toast(`Sinkron HSE: ${r.data.total} pekerja (${r.data.baru} baru, ${r.data.diperbarui} diperbarui, ${r.data.hilang} hilang)`, 'ok'); await reload(); }
    catch (e) { showErr(e); }
  },
  pekf: ds => { S.pekF = ds.v; route(true); },
  hday: ds => { const n = addDays_(S.hDate, +ds.v); if (n < S.data.config.start) return; S.hDate = n; route(true); },
  hauto: () => {
    const dr = absDraftOf(S.hDate), cfg = S.data.config; let k = 0;
    (S.data.pekerja || []).filter(p => !harianEligible_(p).length).forEach(p => {
      const r = dr[p.id]; if (r && r.hadir) return;
      dr[p.id] = { hadir: true, jam_masuk: cfg.jam_masuk_std, jam_pulang: cfg.jam_pulang_std, hari_mode: 'auto', hari_manual: 1 }; k++;
    });
    toast(k ? `${k} pekerja diisi ${cfg.jam_masuk_std}–${cfg.jam_pulang_std} (belum disimpan)` : 'Semua pekerja sudah terisi', 'ok'); route(true);
  },
  hsave: () => saveAbsen(),
  hno: ds => { S.hNo = +ds.v; route(); },
  hprev: ds => { S.hPrev = ds.v; route(true); },
  hprint: ds => printHarian(ds.v),
  hfin() {
    const H = S.hData;
    dialog(`Finalkan klaim harian periode #${H.periode.no_ke}?`, `<p>Total ${rp(H.rekap.total.total)} untuk ${H.rekap.pekerja.length} pekerja. Setelah final, absensi periode ini terkunci dan rate saat ini dibekukan untuk klaim.</p>
      ${H.rekap.warnings.length ? `<div class="lock draft">${H.rekap.warnings.length} catatan (mis. kurang dari jam normal dibayar penuh). Pastikan sudah dicek.</div>` : ''}
      <label class="chk"><input type="checkbox" id="hAck"> Absensi sudah dicocokkan dengan data lapangan</label>`, [
      { label: 'Batal' },
      { label: 'Finalkan', cls: '', run: async d => { if (!$('#hAck', d).checked) throw new Error('Centang konfirmasi dulu'); const r = await api('finalizeHarian', { no_ke: H.periode.no_ke, ack: true }); toast('Klaim harian difinalkan 🔒', 'ok'); await refresh(); S.hData = r.data; route(true); } }]);
  },
  async hunlock() { const why = await askText('Buka kunci klaim harian', 'Alasan (wajib, tercatat di log)'); if (!why) return; try { await api('unlockHarian', { no_ke: S.hNo, reason: why }); toast('Kunci dibuka', 'ok'); await reload(); } catch (e) { showErr(e); } }
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
      dr[id][t.dataset.key] = t.value === '' ? 0 : Math.max(0, parseFloat(t.value) || 0);
      updInput();
    } else if (t.matches('[data-mk]')) setMap(t.dataset.mk, { koef: Math.min(60, Math.max(0, parseFloat(t.value) || 0)) });
    else if (t.matches('#ack')) $('#btnFin').disabled = !t.checked || S.finBlock;
    else if (t.matches('[data-pf]')) pekChanged(t.closest('tr'));
    else if (t.matches('[data-af]') && t.type !== 'checkbox' && t.tagName !== 'SELECT') absChanged(t);
    else if (t.matches('#pekQ')) { S.pekQ = t.value; vPek(); const q = $('#pekQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  });
  document.addEventListener('change', e => {
    if (e.target.matches('[data-mref]')) setMap(e.target.dataset.mref, { ref: e.target.value });
    else if (e.target.matches('#pdfIn')) handlePdf(e.target.files[0]);
    else if (e.target.matches('[data-af]') && (e.target.type === 'checkbox' || e.target.tagName === 'SELECT')) absChanged(e.target);
    else if (e.target.matches('#hDateIn')) { if (e.target.value && e.target.value >= S.data.config.start) { S.hDate = e.target.value; route(true); } }
    else if (e.target.matches('#hSel')) { S.hPrev = e.target.value; route(true); }
  });
  // Enter = turun ke baris berikutnya pada kolom yang sama (isian cepat)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches || !e.target.matches('input[data-item]')) return;
    e.preventDefault();
    const col = [...document.querySelectorAll(`input[data-key="${e.target.dataset.key}"]:not(:disabled)`)];
    const nx = col[col.indexOf(e.target) + 1]; if (nx) { nx.focus(); nx.select(); }
  });
  $('#spkSel').onchange = e => { S.spkId = e.target.value; store.set('obname.spk', S.spkId); S.pid = null; S.pdfPid = null; S.manPid = null; route(); };
  $('#btnSet').onclick = () => go('set');
  $('#btnOut').onclick = () => logout();
  $('#loginBtn').onclick = doLogin;
  $('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#urlToggle').onclick = () => { $('#urlBox').dataset.open = '1'; $('#urlBox').hidden = false; $('#urlIn').focus(); };
  window.addEventListener('hashchange', () => route());
  window.addEventListener('resize', () => { if (S.view === 'pdf') fitPaper(); });
  window.addEventListener('online', async () => { S.offline = false; banner(); await flushPending(); if (S.data && !pendingCount()) reload(); });
  window.addEventListener('offline', banner);
}

/* ---------- start ---------- */
(function init() {
  wire();
  S.url = store.get('obname.url') || (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '';
  S.drafts = {};
  // versi lama aplikasi terpasang sebagai PWA: lepas service worker & cache lamanya agar tidak menyajikan tampilan lama
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  if (window.caches) caches.keys().then(ks => ks.forEach(k => { if (/^obname-/.test(k)) caches.delete(k); })).catch(() => {});
  const saved = store.get('obname.code') || store.get('obname.code', true);
  if (saved && S.url) { S.code = saved; S.role = store.get('obname.role') || 'view'; startSession(); }
  else showLogin();
})();
