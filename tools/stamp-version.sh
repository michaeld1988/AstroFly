#!/usr/bin/env bash
# Cache-Busting automatisch beim Deploy: jede index.html bekommt ?v=<datum>-<sha>
# des letzten Commits, der ihren Kanal beruehrt hat (live = Root-Dateien,
# beta/ und alpha/ je fuer sich). Der Service Worker eines Kanals bekommt
# dieselbe Marke als VERSION. Laeuft nur auf der Deploy-Kopie, das Repo
# bleibt unveraendert. Manuelles Hochzaehlen im Repo bleibt moeglich und
# schadet nicht.
set -euo pipefail
cd "$(dirname "$0")/.."

stamp_for() {
  # $@ = Pfade, deren juengster Commit die Marke bestimmt
  local sha date
  sha="$(git log -1 --format=%h -- "$@" 2>/dev/null || true)"
  date="$(git log -1 --format=%cs -- "$@" 2>/dev/null || true)"
  if [ -z "$sha" ]; then echo "$(date -u +%Y-%m-%d)-local"; else echo "${date}-${sha}"; fi
}

stamp_channel() {
  local dir="$1"; shift
  local mark; mark="$(stamp_for "$@")"
  local idx="${dir}index.html" sw="${dir}sw.js"
  [ -f "$idx" ] && sed -i -E "s/\?v=[0-9A-Za-z.-]+/?v=${mark}/g" "$idx"
  [ -f "$sw" ] && sed -i -E "s/const VERSION = \"[0-9A-Za-z.-]+\";/const VERSION = \"${mark}\";/" "$sw"
  echo "${dir:-root/}: ${mark}"
}

stamp_channel ""       index.html app.js i18n.js objectinfo.js style.css vendor demo
stamp_channel "beta/"  beta
stamp_channel "alpha/" alpha
