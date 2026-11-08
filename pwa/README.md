# PWA Obname SPK

Aplikasi web statis (HTML/CSS/JS tanpa build) yang bisa dipasang di HP. Datanya dari backend Apps Script (`../backend`).

## Pakai lokal (demo, tanpa Google)

```bash
node backend/test/dev-server.js
```
Buka http://localhost:8787, isi alamat server `http://localhost:8787/exec`, kode `QS-DEMO` (QS) atau `VIEW-DEMO` (Viewer).
Data demo tersimpan di memori dan hilang saat server dimatikan. Kode demo hanya untuk lokal.

## Pasang untuk dipakai sungguhan

1. Pasang backend (lihat `backend/README.md`), salin URL Web App `.../exec`.
2. Isi `API_URL` di `pwa/config.js` (atau biarkan kosong: aplikasi akan menanyakan saat login pertama).
3. Unggah isi folder `pwa/` ke hosting statis HTTPS (GitHub Pages, Netlify, Cloudflare Pages, dsb).
   HTTPS wajib agar service worker dan "Pasang aplikasi" aktif.
4. Buka di HP → menu browser → *Tambahkan ke layar utama* / *Pasang aplikasi*.

Kode akses tidak pernah ada di file aplikasi. Pengguna mengetiknya saat masuk; centang "Ingat di perangkat ini"
untuk menyimpannya di perangkat tersebut (kalau tidak dicentang, hanya berlaku selama tab terbuka).

## Menu

| Menu | QS | Viewer |
|---|---|---|
| Beranda (progres, forecast 2 mingguan) | ✔ | ✔ |
| Periode (buka, mulai Tracking, buka kunci, hapus) | ✔ | lihat |
| Input forecast / aktual → Final Check → Finalkan | ✔ | – |
| Manpower (acuan produktivitas + koefisien, jam normal/lembur) | ubah | lihat |
| Master (item SPK, impor dari Excel) | ubah | lihat |
| PDF A4 landscape (format sheet OBNAME) | draft & final | final saja |
| ⚙ Pengaturan (proyek, retensi, jam kerja, penandatangan, mandor, SPK) | ✔ | – |

## Offline

- Aplikasi (shell) tetap terbuka tanpa internet; data terakhir ditampilkan dari cache perangkat (dihapus saat Keluar).
- Input volume yang disimpan saat offline diantre di perangkat dan disinkronkan lewat tombol "Sinkronkan" di banner
  atau otomatis saat koneksi kembali. Aksi lain (finalisasi, pengaturan, dsb.) butuh koneksi.

## Memperbarui

- Jika `backend/Logic.gs` berubah: `node pwa/sync-logic.js` (uji backend akan gagal jika `logic.js` tertinggal).
- Naikkan `VERSION` di `sw.js` setiap kali file aplikasi berubah agar perangkat mengambil versi baru.
