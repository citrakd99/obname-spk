# Backend Obname SPK (Google Sheets + Apps Script)

Backend berupa Web App Apps Script yang terikat ke satu Google Sheet. Peran ditentukan **kode akses** (tanpa email):
`CODE_QS` untuk QS (admin) dan `CODE_VIEW` untuk Viewer (SM/PM). Kode hanya ada di Script Properties.

## Pasang (sekali, ±10 menit)

1. Buat Google Sheet kosong (mis. "Obname SPK Data").
2. Menu **Ekstensi → Apps Script**. Salin isi file di folder ini ke proyek script:
   `Logic.gs`, `Db.gs`, `Code.gs`, `Seed.gs`, `Setup.gs`. Untuk `appsscript.json`: Project Settings → centang
   *Show "appsscript.json" manifest file*, lalu timpa isinya. (Tidak perlu menyalin folder `test`.)
3. Pilih fungsi **`setup`** → **Run** → beri izin. Ini membuat 9 tab, mengisi Config default dan 62 baris
   tabel Produktivitas dari PDF standar.
4. **Project Settings → Script Properties → Add**: `CODE_QS` = kode QS, `CODE_VIEW` = kode Viewer
   (pakai kode panjang dan acak, minimal 12 karakter).
5. **Deploy → New deployment → Web app**. *Execute as*: Me. *Who has access*: Anyone.
   Salin URL `/exec` (ini yang dipasang di webapp).
6. Cek di browser: membuka URL `/exec` harus menampilkan `{"ok":true,"service":"obname-spk",...}`.

Setiap kali kode `.gs` diubah, buat **New version** di Manage deployments agar URL yang sama memakai kode baru.
Mengganti kode akses cukup mengubah Script Properties (tidak perlu deploy ulang).

## Cara memanggil dari webapp

```js
async function api(code, action, payload = {}) {
  const res = await fetch(URL_EXEC, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },   // jangan application/json (memicu preflight CORS)
    body: JSON.stringify({ code, action, payload })
  });
  const out = await res.json();
  if (!out.ok) throw Object.assign(new Error(out.error.message), out.error);
  return out; // { ok, role, data }
}
```

## Aksi

| Aksi | Peran | Payload | Fungsi |
|---|---|---|---|
| `login` | QS, Viewer | – | Cek kode, mengembalikan `role` |
| `bootstrap` | QS, Viewer | – | Semua data (config, mandor, spk, items+`vol_spk`, periods, periodItems, produktivitas, map) |
| `saveConfig` | QS | `values:{project,owner,pctSpk,ret,jam,hariMg,lembur,basis,start,sign1_label,sign1_name,...}` | Pengaturan |
| `saveMandor` / `deleteMandor` | QS | `{id?,nama}` / `{id}` | |
| `saveSpk` | QS | `{id?,no_spk,mandor_id,pekerjaan}` | |
| `saveItem` / `deleteItem` | QS | `{id?,spk_id,no,deskripsi,spesifikasi,vol_rab,vol_spk_override?,sat,harga}` / `{id}` | |
| `importItems` | QS | `{spk_id,rows:[...],replace?}` | Impor massal dari Excel |
| `createPeriod` | QS | `{spk_id}` | Periode berikutnya (14 hari). Pertama = Tracking, berikutnya = Forecast |
| `startTracking` | QS | `{periode_id}` | Forecast → Tracking |
| `savePeriodItems` | QS | `{periode_id,rows:[{item_id,vol_forecast?,vol_aktual?,catatan?}]}` | Simpan; menolak > sisa volume |
| `checkPeriod` | QS | `{periode_id}` | Final Check: `blockers` dan `warnings` |
| `finalizePeriod` | QS | `{periode_id,ack:true}` | Kunci periode + snapshot total/retensi |
| `unlockPeriod` | QS | `{periode_id,reason}` | Buka kunci (hanya Final terakhir), dicatat di Log |
| `deletePeriod` | QS | `{periode_id}` | Hanya periode terakhir yang belum Final |
| `getReport` | QS, Viewer | `{periode_id}` | Data PDF (header, penandatangan, baris, total). Viewer hanya periode Final |
| `saveMap` | QS | `{item_id,ref,koef}` | Acuan produktivitas + koefisien kesulitan (0–60%) |
| `manpower` | QS, Viewer | `{periode_id,ot?}` | Forecast manpower dari `vol_forecast` periode itu |
| `getLog` | QS | `{limit?}` | Jejak audit |

Gagal: `{"ok":false,"error":{"code","message","details"}}`. Kode: `BAD_CODE`, `LOCKED`, `FORBIDDEN`, `VALIDATION`,
`NOT_FOUND`, `CONFIG_MISSING`, `BAD_STATE`, `ITEM_LOCKED`, `CONFIG_LOCKED`, `CHECK_FAILED`, `ACK_REQUIRED`, `BUSY`, `SERVER_ERROR`.

## Aturan yang dijaga server

- Vol sebelumnya = jumlah aktual periode **Final** (no lebih kecil); sisa = Vol SPK − Vol sebelumnya. Dihitung ulang di server.
- Aktual/forecast > sisa ditolak; aktual hanya bisa diisi saat status Tracking.
- Satu periode Tracking per SPK; periode harus Final berurutan.
- Periode Final terkunci. Setelah ada Final: harga/volume/satuan item, persen SPK dan tanggal mulai tidak bisa diubah;
  persen retensi disimpan per periode saat final, sehingga mengubah retensi tidak menggeser periode lama.
- 10 kode salah berturut-turut mengunci login 10 menit. Semua tulis memakai `LockService`. Semua perubahan penting masuk tab `Log`.
- Koefisien kesulitan = % penurunan kapasitas; jam kerja = jam normal × (1 + lembur%), dibanding standar 8 jam.

## Uji lokal (tanpa Google)

```bash
node backend/test/run.js
```
Menjalankan 24 skenario terhadap tiruan layanan Google (alur penuh forecast → tracking → final → unlock, hak akses,
validasi, kunci data, manpower).

## Batasan

- Kode bersama adalah pengamanan sederhana: siapa pun yang tahu kode punya peran itu. Ganti kode di Script Properties bila bocor.
- Tidak ada pembatasan per mandor; Viewer melihat semua data.
- Uji di atas memakai tiruan; langkah deploy ke akun Google Anda belum pernah dijalankan.
