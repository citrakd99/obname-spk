# Obname SPK

Tracking, forecast 2 mingguan, dan pengajuan obname mandor (PWA + Google Sheets/Apps Script).

- `pwa/` — aplikasi web (dipublikasikan lewat GitHub Pages). Lihat `pwa/README.md`.
- `backend/` — kode Google Apps Script + uji (`node backend/test/run.js`). Lihat `backend/README.md`.

Repo ini tidak berisi data proyek maupun kode akses. Alamat server (Web App Apps Script) diisi di `pwa/config.js`
atau saat login pertama di aplikasi.

## Menerbitkan
Aplikasi tayang di GitHub Pages dari cabang `gh-pages` (isi folder `pwa/`). Setelah mengubah `pwa/`:

```bash
git add -A && git commit -m "pesan"
sh deploy.sh
```
Naikkan `VERSION` di `pwa/sw.js` setiap kali file aplikasi berubah.
