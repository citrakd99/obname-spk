// Menyalin backend/Logic.gs -> pwa/logic.js agar rumus di server dan di aplikasi sama persis.
// Jalankan setiap kali Logic.gs berubah:  node pwa/sync-logic.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'backend', 'Logic.gs'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'logic.js'), '// SALINAN OTOMATIS dari backend/Logic.gs. Jangan diedit; jalankan node pwa/sync-logic.js\n' + src);
console.log('logic.js diperbarui');
