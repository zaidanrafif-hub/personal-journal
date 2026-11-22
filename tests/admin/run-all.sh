#!/bin/sh
# Menjalankan semua tahap uji berurutan. Butuh: Postgres uji (./pg-start.sh), Node, Playwright + Chromium.
# Hasil JSON ada di tests/results/. Jalankan dari folder tests/admin.
set -e
cd "$(dirname "$0")"
./pg-start.sh
node db.test.js | tail -3
for f in t3-auth t4-modules t5-system t6-platform t7-integration; do node $f.test.js; done
