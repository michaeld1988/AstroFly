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

## Kern-Features (Stand: 22. August 2026, live v2026-08-22-1)

- 3D-Parallaxe aus automatischer Tiefenkarte; Zoom- und Lateral-Flugmodus,
  Loop-Modus, Zoomziel per Klick (tiefenbewusst)
- Sterne als GPU-Partikel mit eigener Tiefe (bis 25 000 Gaia-Matches),
  Funkeln, Sterngenerator, Geschwindigkeits-Streifen bei Bewegungsunschärfe;
  Sterne werden auf separater Ebene gerendert – Clarity/Structure/Sharpen
  wirken nur auf den Nebel; Sternfarb-Boost bis 300 %; „Sterne verankern"-
  Regler (Sci-Tab) fixiert Gaia-Sterne im Nebel
- **Nebelfarben (Look-Tab):** Hα/OIII/SII getrennt bearbeiten – je Band
  Erkennungs-Farbton, Erkennungs-Bereich (°), Sättigung, Farbton-Shift,
  dazu globaler Feather und eine einblendbare Erkennungsmaske; Shader mit
  flachem Kern + Kosinus-Auslauf und Monotonie-Clamp (artefaktfrei)
- Easy-Modus (8 Presets + eigene Preset-Karten + Effektstärkeregler) /
  Pro-Modus mit **sechs Gruppen in einer senkrechten Leiste** (`#proRail`:
  Projekte · Bild · Kamera · Look · Daten · Export) und Untergruppen
  (`#subTabs`), z. B. Kamera → Flug/Flugplan/Galaxie. Steuerung über
  `TAB_GROUPS`, `gotoTab(tab)`, `state.activeGroup`/`state.activeTab`
- **Projekte** (eigene Gruppe): Komplett-Speicherung in IndexedDB inklusive
  Bildern, WCS, Gaia-Daten und Flugplan – im Gegensatz zu eigenen Presets,
  die davon nichts speichern
- **Flugplan** mit Zeitachse unter der Vorschau (`#timeline`, Wegpunkte als
  Rauten, Etappendauer per Ziehen), Miniaturbild je Wegpunkt,
  Wegpunkt-Bearbeitung direkt im Bild mit Übernehmen-Knopf (`#wpApply`),
  zoom-kompensierte Wegführung (Schwenk mit gleichzeitigem Zoom läuft auf
  dem Schirm gleichmäßig)
- **Bedienkomfort:** Undo/Redo für alle Einstellungen (Strg+Z / Strg+Umschalt+Z,
  Verlauf mit 60 Schritten), Shift hält beim Ziehen jeden Regler auf ein
  Zehntel der Schrittweite, Reglerwerte antippen und eintippen,
  Abweichungspunkte plus Gruppen-Reset, Statusband über der Vorschau
  (`STATUS_CHIPS`) mit Sprung zur zuständigen Einstellung, feste
  Render-Fußleiste im Panel, mobil als hochziehbares Bedienblatt,
  geführter Einstieg beim ersten Start (`TOUR_STEPS`, 5 Schritte)
- **Stil-Code:** Einstellungen als kurzer Textblock kopieren und einfügen
  (`buildStyleCode`/`parseStyleCode`/`applyStyleCode`) – so tauscht Michael
  fertige Looks aus, ohne Screenshots zu vergleichen
- **Eigene Presets:** benennbar, Gruppen wählbar (Kamera/Sterne/Look/Format),
  localStorage `astrofly-user-presets`; speichert NIE Gaia-Daten, FITS-Header
  oder Bilddaten (explizite Vorgabe von Michael)
- **Wissenschaft:** Plate-Solve (FITS/WCS, Auto-Übernahme aus FITS-Headern),
  Gaia-DR3-Abgleich (echte Sternentfernungen/-farben, Eigenbewegungs-
  Zeitraffer, wissenschaftlicher Modus; Katalog-Cache übersteht Masken-
  Neuaufbau, inaktive Regler ausgegraut), SIMBAD-Objekterkennung mit
  Infokarte + Feld-Beschriftungen (6 wählbare Stile) inkl. Sharpless und
  markanter Einzelsterne (WR-Sterne u. a.) mit Gaia-Astrophysik (Teff,
  Entfernung, Radius/Masse relativ zur Sonne, Alter), Labels folgen dem
  jeweiligen Layer (Nebel-Labels dem Starless-Bild, Stern-Labels den
  Stern-Partikeln), Spiegeln H/V (wahlweise nur Starless), kuratierte
  Regionen (z. B. Cygnusbogen), Galaxienrotation (±10°/s in 0,1°-Schritten),
  Nebel-Okklusion
- **QoL:** Doppelklick setzt jeden Slider auf Standard zurück (wie
  Lightroom), Zoom ohne seitlichen Drift bei verschobenem Ausschnitt,
  JPEG-Warnhinweis bei der Bildauswahl; Klick in die Vorschau setzt den
  Fokuspunkt bzw. das Galaxie-Zentrum und zeigt dort einen Linien-Marker
  (`#i-mtarget` blau, `#i-mspin` violett), Doppelklick setzt das Ziel
  zurück in die Bildmitte
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
   Arbeitskopie – vor Testläufen Branch prüfen. Jeder Test muss vorab
   `localStorage.setItem("astrofly-tour-seen", "1")` setzen, sonst legt sich
   der geführte Einstieg über die Bedienelemente. Für SIMBAD-Änderungen
   zusätzlich live gegen den echten TAP-Server testen (Mocks reichen nicht).
6. **Monitoring:** ein täglicher Check-in um 07:00 UTC berichtet neue Issues
   und offene PRs. An Issues nichts fixen oder kommentieren, nur berichten –
   außer Michael bittet darum.

## Code-Landkarte

- `app.js` – Rendering (WebGL2-Shader), Kamera (`camAt`), Overlay
  (`drawOverlayTo`: Infokarte + Labels), FITS/WCS-Parser, UI-Verdrahtung
- `objectinfo.js` – SIMBAD-Abfrage, kuratierte Fakten (`OBJECT_FACTS`),
  Regionen (`OBJECT_REGIONS`), Größen-Fallbacks (`OBJ_ARCMIN`)
- `i18n.js` – alle UI-Texte EN/DE (`data-i18n`-Attribute)
- `index.html` / `style.css` – Gruppenleiste `#proRail` + Untergruppen
  `#subTabs`, Bühne mit `#stageInner` (Vorschau, Transport, Steuerkreuz),
  Statusband `#stageChips`, Zeitachse `#timeline`, Fußleiste `#panelFoot`,
  Symbolsammlung als SVG-Sprite (`#i-*`), Instrumenten-Look (monochrom,
  Akzent #8fb0ff, zweiter Akzent #b07aff)
- `beta/` – vollständige Kopie der App für den Beta-Kanal
- `demo/` – Orion-Demobilder + `orion.wcs` (Plate-Solve-Lösung, wird vom
  Demo-Button automatisch mitgeladen); `vendor/` – UTIF, mp4-muxer u. a.
- `tools/instagram-mcp/` – optionaler MCP-Server (Cloudflare Worker) für
  Instagram-Posts/Kommentare/Insights (geparkt, PR #52)

## Konventionen

- Kommentare im Code auf Deutsch, knapp, nur wo nötig
- Keine Emojis in Panel-Labels (Tofu-Boxen auf manchen Systemen)
- SIMBAD-TAP-Eigenheiten: `ORDER BY` ohne Tabellenpräfix (Spalten-Alias
  nutzen), `galdim_majaxis` darf NULL sein, Idents haben doppelte
  Leerzeichen („NGC  6960")
- Commits enden mit Co-Authored-By-Zeile von Claude
