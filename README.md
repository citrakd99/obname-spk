# Obname SPK

Tracking, forecast 2 mingguan, dan pengajuan obname mandor (aplikasi web layar lebar + Google Sheets/Apps Script).

- `web/` — aplikasi web (dipublikasikan lewat GitHub Pages). Lihat `web/README.md`.
- `backend/` — kode Google Apps Script + uji (`node backend/test/run.js`). Lihat `backend/README.md`.

Repo ini tidak berisi data proyek maupun kode akses. Alamat server (Web App Apps Script) diisi di `web/config.js`
atau saat login pertama di aplikasi.

## Menerbitkan
Aplikasi tayang di GitHub Pages dari cabang `gh-pages` (isi folder `web/`). Setelah mengubah `web/`:

```bash
git add -A && git commit -m "pesan"
sh deploy.sh
```
