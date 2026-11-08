/**
 * Jalankan SEKALI dari editor Apps Script: pilih fungsi `setup` lalu Run.
 * Membuat semua tab + header, mengisi Config default dan tabel Produktivitas (dari Seed.gs).
 * Aman dijalankan ulang: tab/baris yang sudah ada tidak ditimpa.
 */
function setup() {
  const ss = ss_();
  Object.keys(TABLES).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const head = TABLES[name];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
  // kolom yang harus tetap teks (mis. No. SPK "001" jangan jadi 1)
  ss.getSheetByName('SPK').getRange('B2:B').setNumberFormat('@');
  ss.getSheetByName('Periode').getRange('D2:E').setNumberFormat('@');
  // tanggal & jam harian disimpan sebagai teks agar tidak diubah Sheets menjadi tanggal/jam
  ss.getSheetByName('Harian_Absen').getRange('A2:A').setNumberFormat('@');
  ss.getSheetByName('Harian_Absen').getRange('E2:F').setNumberFormat('@');
  ss.getSheetByName('Harian_Periode').getRange('B2:C').setNumberFormat('@');
  ss.getSheetByName('Pekerja').getRange('A2:A').setNumberFormat('@');

  const cfgSheet = ss.getSheetByName('Config');
  cfgSheet.getRange('B2:B').setNumberFormat('@');
  if (cfgSheet.getLastRow() <= 1) {
    const rows = Object.keys(CONFIG_DEFAULTS).map(function (k) { return [k, CONFIG_DEFAULTS[k]]; });
    cfgSheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }
  const pSheet = ss.getSheetByName('Produktivitas');
  if (pSheet.getLastRow() <= 1) {
    pSheet.getRange(2, 1, PRODUKTIVITAS_SEED.length, 6).setValues(PRODUKTIVITAS_SEED);
  }
  const removeDefault = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1') || ss.getSheetByName('Lembar1');
  if (removeDefault && ss.getSheets().length > 1 && removeDefault.getLastRow() === 0) ss.deleteSheet(removeDefault);
  return 'Setup selesai. Langkah berikut: isi Script Properties CODE_QS dan CODE_VIEW, lalu Deploy sebagai Web App.';
}
