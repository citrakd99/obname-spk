# Obname SPK — aplikasi web (layar lebar)

Aplikasi web statis (HTML/CSS/JS tanpa build, bukan PWA) untuk dipakai di laptop/monitor: menu di sidebar kiri, isi
memakai lebar layar penuh, data berupa tabel lebar. Datanya dari backend Apps Script (`../backend`). Di layar sempit
(<980 px) sidebar otomatis menjadi bilah atas, tetapi tampilan utamanya memang untuk layar lebar.

## Pakai lokal (demo, tanpa Google)

```bash
node backend/test/dev-server.js
```
Buka http://localhost:8787, isi alamat server `http://localhost:8787/exec`, kode `QS-DEMO` (QS) atau `VIEW-DEMO` (Viewer).
Data demo tersimpan di memori dan hilang saat server dimatikan. Kode demo hanya untuk lokal.
(`--empty` memulai tanpa data; `/test-fixtures/spk-contoh.pdf` adalah PDF SPK contoh untuk mencoba impor.)

## Pasang untuk dipakai sungguhan

1. Pasang backend (lihat `backend/README.md`), salin URL Web App `.../exec`.
2. Isi `API_URL` di `web/config.js` (atau biarkan kosong: aplikasi menanyakan saat login pertama).
3. Unggah isi folder `web/` ke hosting statis (GitHub Pages, Netlify, Cloudflare Pages, dsb) — atau jalankan `sh deploy.sh`
   dari akar repo untuk GitHub Pages.

Kode akses tidak pernah ada di file aplikasi. Pengguna mengetiknya saat masuk; centang "Ingat di perangkat ini"
untuk menyimpannya di perangkat tersebut (kalau tidak, hanya berlaku selama tab terbuka).

## Menu

| Menu | QS | Viewer |
|---|---|---|
| Beranda (nilai SPK, progres, grafik forecast per 2 minggu, tabel semua periode) | ✔ | ✔ |
| Periode (buka, mulai Tracking, buka kunci, hapus) | ✔ | lihat |
| Input forecast **dan** aktual dalam satu tabel → Final Check → Finalkan | ✔ | – |
| Forecast manpower (acuan produktivitas + koefisien, jam normal/lembur) | ubah | lihat |
| Master SPK (item, impor dari PDF SPK atau tempel dari Excel) | ubah | lihat |
| PDF pengajuan A4 landscape (format sheet OBNAME) | draft & final | final saja |
| ⚙ Pengaturan (proyek, retensi, jam kerja, penandatangan, mandor, SPK, pekerja harian, log) | ✔ | – |
| Pekerja harian · Daftar pekerja (sinkron dari HSE, tandai harian, rate, lembur auto/manual) | ✔ | lihat |
| Pekerja harian · Absensi harian (jam masuk/pulang, isi otomatis jam standar, hari auto/manual) | ✔ | – |
| Pekerja harian · Rekap & klaim, Final, PDF A4 potret (per pekerja + rekap) | ✔ | final saja |

Isian cepat: di tabel Input, tekan Enter untuk turun ke baris berikutnya pada kolom yang sama.

## Koneksi putus

Data terakhir tetap ditampilkan dari cache perangkat (dihapus saat Keluar). Input volume yang disimpan saat koneksi putus
diantre di perangkat dan disinkronkan lewat tombol "Sinkronkan" di banner atau otomatis saat koneksi kembali. Aksi lain
(finalisasi, pengaturan, dsb.) butuh koneksi. Aplikasi tidak lagi memakai service worker; versi lama yang pernah terpasang
sebagai PWA akan melepas service worker dan cache lamanya sendiri saat dibuka.

## Impor SPK dari PDF

Menu **Master SPK → Impor dari PDF SPK** (atau di layar kosong saat belum ada SPK). Mendukung template
"SURAT PERINTAH KERJA (SPK)" FM/05-03. PDF dibaca di browser (pdf.js, tersimpan di `vendor/pdfjs/`); isinya tidak dikirim
ke pihak ketiga, hanya item hasil impor yang dikirim ke server Anda.

- Baris tabel dikenali dari garis border PDF, jadi sel deskripsi/spesifikasi 2–4 baris tetap benar. Baris judul
  (bagian, sub-bagian, kelompok) tidak diimpor sebagai item; namanya dipakai sebagai konteks deskripsi
  (pilihan: ringkas / lengkap / nama saja, dan bisa diedit per baris).
- Pratinjau menampilkan kop (proyek, owner, SPK, mandor), cek **total terhadap baris TOTAL di PDF** (selisih pembulatan
  wajar), catatan per baris (harga kosong, jumlah tidak cocok), dan pilihan baris yang diimpor.
- Volume di PDF dianggap **Volume SPK** (disimpan sebagai volume SPK manual; RAB dihitung ÷ persen SPK). Bisa diubah
  menjadi Volume RAB.
- Tujuan: SPK baru (mandor dibuat otomatis bila belum ada), memperbarui SPK yang nomor+mandornya sama, atau menambah ke
  SPK terpilih. Opsional mengisi nama proyek/owner, retensi, dan penandatangan dari PDF.
- Ditolak jika SPK tujuan sudah punya periode Final. Template yang berbeda (kolom bergeser / bukan SPK) ditolak dengan
  pesan, bukan dibaca asal-asalan.
- Uji: `node backend/test/spkpdf.test.js` (fixture netral `backend/test/fixtures/spk-contoh.pdf`).

## Berkas

`index.html` kerangka · `style.css` · `app.js` inti (sesi, API, navigasi, aksi) · `views.js` semua layar ·
`views-harian.js` modul pekerja harian · `import-pdf.js` impor PDF · `spkpdf.js` pembaca PDF SPK · `logic.js` rumus (salinan `backend/Logic.gs`) · `config.js`.
Jika `backend/Logic.gs` berubah: `node web/sync-logic.js` (uji backend gagal bila `logic.js` tertinggal).
