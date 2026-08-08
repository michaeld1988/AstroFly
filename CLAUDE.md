# AstroFly – Projektwissen für Claude

## Was ist AstroFly?

AstroFly ist eine kostenlose Browser-App von Michael Döhler (GitHub:
michaeld1988, Instagram: @astrofly_app), die aus einem **Starless-Bild** und
einer **Sternmaske** (z. B. aus StarNet++/StarXTerminator) einen animierten
**3D-Kameraflug** durch Astrofotos erzeugt. Reines HTML/CSS/JS + WebGL2,
kein Build-Schritt, alles läuft lokal im Browser.

- **Live:** https://michaeld1988.github.io/AstroFly/
- **Beta:** https://michaeld1988.github.io/AstroFly/beta/ (Ordner `beta/` im Repo)
- Claude ist der alleinige Entwickler; Michael testet, gibt Feedback und
  entscheidet über Releases.

## Kern-Features (Stand: August 2026)

- 3D-Parallaxe aus automatischer Tiefenkarte; Zoom- und Lateral-Flugmodus,
  Loop-Modus, Zoomziel per Klick (tiefenbewusst)
- Sterne als GPU-Partikel mit eigener Tiefe, Funkeln, Sterngenerator,
  Geschwindigkeits-Streifen bei Bewegungsunschärfe
- Easy-Modus (8 Presets + Effektstärkeregler) / Pro-Modus (6 Tabs:
  Bilder · Kamera · Sterne · Look · Wissenschaft · Export)
- **Wissenschaft:** Plate-Solve (FITS/WCS, Auto-Übernahme aus FITS-Headern),
  Gaia-DR3-Abgleich (echte Sternentfernungen/-farben, Eigenbewegungs-
  Zeitraffer, wissenschaftlicher Modus), SIMBAD-Objekterkennung mit
  Infokarte + Feld-Beschriftungen (6 wählbare Stile), kuratierte Regionen
  (z. B. Cygnusbogen), Galaxienrotation, Nebel-Okklusion
- Export: MP4 (WebCodecs) bis 4K, alle gängigen Seitenverhältnisse,
  9:16 mit Social-Media-Schutzzone für Overlays

## Arbeitsweise mit Michael (wichtig!)

1. **Sprache:** Mit Michael immer Deutsch; Instagram-Captions auf Englisch
   mit **maximal 5 Hashtags**.
2. **Todo-Regel:** Schreibt Michael Todos, nur sammeln/bestätigen – erst
   umsetzen, wenn er das Startsignal gibt („Leg los" o. ä.).
3. **Beta-first:** Features zuerst in `beta/` deployen (Beta-Deploy-PRs
   werden sofort gemerged), live erst nach Michaels Freigabe. Kleine,
   eindeutige **Bugfixes dürfen direkt live** (Michaels Ansage).
4. **Deploys:** GitHub Pages serviert `main` (Root = live, `beta/` = Beta).
   Nach jedem Merge auf main das Deployment per curl verifizieren.
   `index.html` referenziert JS/CSS mit `?v=<Datum>` – bei jedem Release
   die Version hochzählen (Cache-Busting).
5. **Tests:** Playwright-Headless-Tests (Chromium mit SwiftShader) gegen
   einen lokalen `python3 -m http.server`. Achtung: Der Server serviert die
   Arbeitskopie – vor Testläufen Branch prüfen. Für SIMBAD-Änderungen
   zusätzlich live gegen den echten TAP-Server testen (Mocks reichen nicht).

## Code-Landkarte

- `app.js` – Rendering (WebGL2-Shader), Kamera (`camAt`), Overlay
  (`drawOverlayTo`: Infokarte + Labels), FITS/WCS-Parser, UI-Verdrahtung
- `objectinfo.js` – SIMBAD-Abfrage, kuratierte Fakten (`OBJECT_FACTS`),
  Regionen (`OBJECT_REGIONS`), Größen-Fallbacks (`OBJ_ARCMIN`)
- `i18n.js` – alle UI-Texte EN/DE (`data-i18n`-Attribute)
- `index.html` / `style.css` – flache Tab-Sektionen, Instrumenten-Look
  (monochrom, Akzent #8fb0ff)
- `beta/` – vollständige Kopie der App für den Beta-Kanal
- `demo/` – Orion-Demobilder; `vendor/` – UTIF, mp4-muxer u. a.
- `tools/instagram-mcp/` – optionaler MCP-Server (Cloudflare Worker) für
  Instagram-Posts/Kommentare/Insights (geparkt, PR #52)

## Konventionen

- Kommentare im Code auf Deutsch, knapp, nur wo nötig
- Keine Emojis in Panel-Labels (Tofu-Boxen auf manchen Systemen)
- SIMBAD-TAP-Eigenheiten: `ORDER BY` ohne Tabellenpräfix (Spalten-Alias
  nutzen), `galdim_majaxis` darf NULL sein, Idents haben doppelte
  Leerzeichen („NGC  6960")
- Commits enden mit Co-Authored-By-Zeile von Claude
