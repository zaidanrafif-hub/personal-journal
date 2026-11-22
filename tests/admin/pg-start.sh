#!/bin/sh
# Menyalakan Postgres uji (klaster terpisah, port 54329). Dipakai hanya untuk pengujian lokal.
PGB=/usr/lib/postgresql/16/bin; D=/var/lib/postgresql/pjtest
[ -d "$D/data" ] || { runuser -u postgres -- mkdir -p $D && runuser -u postgres -- $PGB/initdb -D $D/data -A trust >/dev/null; }
if ! runuser -u postgres -- $PGB/pg_ctl -D $D/data status >/dev/null 2>&1; then
  rm -f $D/data/postmaster.pid
  runuser -u postgres -- $PGB/pg_ctl -D $D/data -l $D/pg.log -o "-p 54329 -k $D" -w start >/dev/null 2>&1
fi
psql -h $D -p 54329 -U postgres -d postgres -Atc "select 'postgres uji siap'"
