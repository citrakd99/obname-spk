#!/bin/sh
# Terbitkan isi pwa/ ke GitHub Pages (cabang gh-pages). Jalankan dari akar repo setelah commit & push main.
set -e
git push origin main
git subtree split --prefix pwa -b gh-pages-tmp >/dev/null
git push -f origin gh-pages-tmp:gh-pages
git branch -D gh-pages-tmp >/dev/null
echo "Terbit. Pages memperbarui dalam ±1 menit."
