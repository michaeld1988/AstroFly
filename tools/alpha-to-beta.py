#!/usr/bin/env python3
"""Stand der Alpha in die Beta uebernehmen.

Aufruf:  python3 tools/alpha-to-beta.py [marke]     (marke z. B. 2026-11-21-b1)

Kopiert alpha/ nach beta/ und stellt die wenigen kanal-eigenen Stellen um:
Name und Titel, das Alpha-Abzeichen, das Suchmaschinen-Verbot (nur Alpha),
Cache-Namen des Service Workers, Manifest. Jede Ersetzung wird gezaehlt -
passt eine nicht mehr, bricht das Skript ab, statt still etwas auszulassen.
beta/BETA.md bleibt, alpha/ALPHA.md wird nicht kopiert.
"""
import datetime
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
A, B = ROOT / "alpha", ROOT / "beta"
MARK = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().isoformat() + "-b1"
KEEP_IN_BETA = {"BETA.md"}
SKIP_FROM_ALPHA = {"ALPHA.md"}

# 1. Dateien uebernehmen (auch Entfallenes entfernen)
for item in B.iterdir():
    if item.name in KEEP_IN_BETA:
        continue
    shutil.rmtree(item) if item.is_dir() else item.unlink()
for item in A.iterdir():
    if item.name in SKIP_FROM_ALPHA:
        continue
    if item.is_dir():
        shutil.copytree(item, B / item.name)
    else:
        shutil.copy2(item, B / item.name)


def edit(name, steps):
    p = B / name
    s = p.read_text(encoding="utf-8")
    for old, new, count in steps:
        n = s.count(old)
        if n != count:
            sys.exit(f"{name}: erwartet {count}x, gefunden {n}x: {old[:70]!r}")
        s = s.replace(old, new)
    p.write_text(s, encoding="utf-8")
    return s


# 2. Kanal-eigene Stellen
html = edit("index.html", [
    ('<meta name="robots" content="noindex, nofollow">\n', "", 1),
    ("<title>AstroFly Alpha – ", "<title>AstroFly – ", 1),
    ('          <span class="chbadge" title="" data-i18n-title="alphaBadge">Alpha</span>\n', "", 1),
    ('data-i18n="sepTip">Alpha: no starless/star-mask pair at hand?', 'data-i18n="sepTip">No starless/star-mask pair at hand?', 1),
])
(B / "index.html").write_text(re.sub(r"\?v=[0-9A-Za-z.-]+", "?v=" + MARK, html), encoding="utf-8")

i18n = edit("i18n.js", [
    ('docTitle: "AstroFly Alpha – ', 'docTitle: "AstroFly – ', 2),
    ('swUpdated: "A new alpha version is ready', 'swUpdated: "A new version is ready', 1),
    ('swUpdated: "Eine neue Alpha-Version ist bereit', 'swUpdated: "Eine neue Version ist bereit', 1),
    ('sepTip: "Alpha: no starless', 'sepTip: "No starless', 1),
    ('sepTip: "Alpha: kein Starless', 'sepTip: "Kein Starless', 1),
])
i18n, n = re.subn(r'^      alphaBadge: ".*",\n', "", i18n, flags=re.M)
if n != 2:
    sys.exit(f"i18n.js: alphaBadge {n}x statt 2x")
(B / "i18n.js").write_text(i18n, encoding="utf-8")

sw = edit("sw.js", [
    ("// AstroFly Alpha - Service Worker", "// AstroFly Beta - Service Worker", 1),
    ("astrofly-alpha-", "astrofly-beta-", 3),
    ('url.pathname.includes("/alpha/")', 'url.pathname.includes("/beta/")', 1),
])
sw, n = re.subn(r'const VERSION = "[0-9A-Za-z.-]+";', f'const VERSION = "{MARK}";', sw)
if n != 1:
    sys.exit("sw.js: VERSION nicht gefunden")
(B / "sw.js").write_text(sw, encoding="utf-8")

edit("manifest.webmanifest", [
    ('"name": "AstroFly Alpha"', '"name": "AstroFly Beta"', 1),
    ('"short_name": "AstroFly α"', '"short_name": "AstroFly β"', 1),
    ("– alpha channel", "– beta channel", 1),
])

# 3. Gegenprobe: in den umgestellten Dateien darf der Kanalname nicht mehr vorkommen
left = []
for name in ["index.html", "i18n.js", "sw.js", "manifest.webmanifest"]:
    for i, line in enumerate((B / name).read_text(encoding="utf-8").split("\n"), 1):
        if re.search(r"alpha", line, re.I) and not re.search(r"H-alpha|Hα|alphabet", line, re.I):
            left.append(f"{name}:{i}: {line.strip()[:100]}")
if left:
    sys.exit("Noch Alpha-Bezuege in der Beta:\n" + "\n".join(left))
print(f"Beta = Alpha, Marke {MARK}")
