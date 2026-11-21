# AstroFly Beta (Staging)

Testumgebung für neue Features vor dem Live-Gang:
https://michaeld1988.github.io/AstroFly/beta/

Dieser Ordner enthält den jeweils aktuellen Teststand und kann jederzeit
von der Live-Version abweichen. Die offizielle App liegt eine Ebene höher:
https://michaeld1988.github.io/AstroFly/

## Stand b1 (21.11.2026): Alpha a14 uebernommen

Die Beta entspricht jetzt dem Stand der Alpha. Uebernommen mit
`python3 tools/alpha-to-beta.py <marke>`; das Skript kopiert `alpha/` und
stellt die kanal-eigenen Stellen um (Name, Abzeichen, Service Worker,
Manifest). `app.js`, `objectinfo.js` und `style.css` sind danach
byteidentisch mit der Alpha.

Neu gegenueber dem bisherigen Beta-Stand:
- Wolken-Objekte (Tiefen-Engine v3): der Nebel wird in Wolken mit eigener
  Tiefe zerlegt, Dunkelwolken schweben vor dem Leuchten. Deutlich mehr
  Parallaxe ohne Verzerrung und ohne Doppelbilder. Dazu die Flug-Presets
  "Raum-Orbit" und "Tiefenflug".
- Look -> Bearbeiten: Regler gruppiert wie in Lightroom (Licht, Farbe,
  Effekte, Details, Optik). Neu darin: Temperatur, Toenung, Schwaerzen
  anheben, Split-Tone, Tiefendunst, Halation, anamorphe Flares,
  Kinobalken, Nebel-Stroemung, Roetung hinter Staub, Sternlicht auf dem
  Nebel. Look-Preset "Film (35 mm)".
- Kamera: Traegheit im Flugplan, Beschleunigungen "cine" und "settle",
  Schnitte im Flugplan, Presets Dreiakter, Contact, Gravity, Tree of Life.
- Titelkarte am Videoanfang (passt sich dem Format an).
- Ein-Bild-Workflow: fertiges Bild laden, die App trennt die Sterne selbst.
- Export: Bildrate waehlbar (24, 25, 30, 60), Stereo-Export
  (Side-by-Side, Anaglyph), eigene Farbwandlung (BT.709, begrenzter
  Bereich), damit die Datei aussieht wie die Vorschau.
- Als App installierbar (PWA), laeuft nach dem ersten Laden offline.
- Diagnosebericht im Export-Bereich.
