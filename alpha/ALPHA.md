# AstroFly Alpha (privater Teststand)

Privater Teststand des Entwicklers, vor der Beta:
https://michaeld1988.github.io/AstroFly/alpha/

Nirgends verlinkt und fuer Suchmaschinen gesperrt (noindex). Hier landen
neue Funktionen zuerst; was sich bewaehrt, wandert in die Beta
(`beta/`) und nach Freigabe in die Live-Version (Root).

Die App ist hier als PWA installierbar (Manifest + Service Worker) und
laeuft nach dem ersten Laden auch offline; nur Katalogabfragen (Gaia,
SIMBAD) brauchen das Netz.

## Stand a8: Wolken-Objekte (Tiefen-Engine v3)

Ersetzt die Schichten-Tiefe (Multiplane), die den Nebel in Ringe zerschnitt.
Schalter und Regler: Bild -> Tiefenkarte -> Wolken-Objekte.

- Der Nebel wird an seinen dunklen Senken in Wolken zerlegt. Jede Wolke hat
  eine eigene Tiefe und bleibt fast starr; gedehnt wird nur der dunkle Raum
  dazwischen (inhaltsabhaengige Dehnungsgrenze). Gegen den leeren Himmel
  darf sich der Nebel loesen.
- Dunkelwolken, die von hellem Nebel eingefasst sind, werden automatisch
  erkannt und schweben als eigene Schicht vor dem Leuchten (Regler
  "Dunkelwolken im Vordergrund"). Ihr heller Saum und Sterne davor wandern
  mit; wo sie in dunkle Umgebung uebergehen, bleiben sie verbunden.
- Im Ruhebild exakt das Foto. Nicht aktiv bei drehenden Galaxien, im
  Mond-Modus und bei "Objekt in echte Tiefe".

Zum Testen: Parallaxe und Raeumlichkeit duerfen deutlich hoeher als bisher
(auch 100/100), vor allem mit Orbit- und Seitflug. Vergleich: Haken
"Wolken-Objekte" aus = bisherige Engine.

Stand a9: zwei Flug-Presets, die die Engine mit einem Klick zeigen:
"Raum-Orbit" (um den Nebel kreisen) und "Tiefenflug" (kraeftiger Anflug),
beide mit voller Parallaxe und Raeumlichkeit.
