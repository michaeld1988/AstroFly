# 🌌 AstroFlug – 3D-Kamerafahrt durch Astrofotos

Erzeugt aus einem **Starless-Bild** und einer **Sternmaske** (z. B. aus StarNet++,
StarXTerminator oder PixInsight) eine animierte 3D-Kamerafahrt, bei der der
Zuschauer scheinbar durchs Weltall auf den Nebel bzw. die Galaxie zufliegt.

Die App läuft komplett lokal im Browser – **keine Installation nötig**,
die Bilder verlassen deinen Rechner nicht.

## Start

`index.html` im Browser öffnen (Chrome oder Edge empfohlen – dort funktioniert
auch der MP4-Export; Firefox exportiert WebM).

## Bedienung

1. **Bilder laden** – Starless-Bild und Sternmaske als TIFF, PNG oder JPG
   auswählen oder per Drag & Drop ablegen (auch 16-Bit-TIFF wird unterstützt).
2. **Tiefenkarte** – wird automatisch aus der Helligkeit des Starless-Bildes
   berechnet: helle Nebelbereiche liegen „näher“ an der Kamera.
   Mit *Glättung* wird die Karte weicher, *Tiefe umkehren* dreht die Wirkung um.
3. **Kamera & Animation**
   | Regler | Wirkung |
   |---|---|
   | Zoom | Start-Ausschnitt (Anfangsvergrößerung) |
   | Geschwindigkeit | Wie schnell die Kamera in das Bild hineinfliegt |
   | Beschleunigen & Abbremsen | Sanftes Anfahren und Abbremsen der Kamera (Ease-in/out) |
   | 3D-Effekt | Stärke der Parallaxe (Tiefenwirkung) |
   | Räumlichkeit | Tiefenumfang: wie stark sich nahe und ferne Bereiche in der Fluggeschwindigkeit unterscheiden |
   | Rotation | Kameradrehung während des Fluges (°/s) |
   | Ausschnitt drehen | Statische Drehung des Bildausschnitts (0–360°) |
   | Kippen horizontal/vertikal | Neigt die Kamera – nahe Bereiche verschieben sich gegenüber fernen (Kipp-Parallaxe) |
   | Schwenk-Animation | Animiertes Kippen: langsame, elliptische Kamerabewegung (Stärke + Tempo) |
   | Dauer | Länge des Videos (5–60 s) |
   | Loop-Modus | Kamera fliegt hin und wieder zurück – nahtlos wiederholbar, ideal für Social Media |

   **Zoomziel:** Einfach in die Vorschau **klicken** – die Kamera fliegt im
   Laufe des Clips sanft auf diesen Punkt zu. Doppelklick setzt das Ziel
   zurück auf die Bildmitte.
4. **Sterne**
   | Regler | Wirkung |
   |---|---|
   | Ebenen-Streuung | Wie stark die Sterne zufällig auf verschiedene Tiefen-Ebenen verteilt werden |
   | Abstand zum Nebel | Grundtiefe der Sterne relativ zum Starless-Bild (fern ↔ nah) |
   | Funkeln | Stärke des Sternen-Funkelns |
   | Größe / Helligkeit / Sättigung | Aussehen der Sterne anpassen (20–300 % / 0–300 % / 0–200 %) |
   | 🎲 Ebenen neu mischen | Würfelt eine neue Zufallsverteilung der Stern-Ebenen |
5. **Effekte & Look**
   **Presets:** Kino, Deep Space, Traumglühen, Monochrom, Hyperraum und
   Neutral – setzen alle Look-Regler auf einen abgestimmten cineastischen
   Stil; jeder Regler bleibt danach individuell veränderbar.
   | Regler | Wirkung |
   |---|---|
   | Bloom | Leuchtender Glow um helle Sterne und Nebelkerne |
   | Bewegungsunschärfe | Radiale/tangentiale Unschärfe entlang der Flugbewegung |
   | Warp | Sterne rasen beschleunigt an der Kamera vorbei, mit Farbsäumen und Streifen – Hyperraum-Feeling |
   | Vignette | Filmische Randabdunklung |
   | Belichtung | Heller/dunkler (±2 Blendenstufen) |
   | Kontrast | Globaler Kontrast |
   | Sättigung | Farbintensität des Gesamtbilds |
   | Klarheit | Lokaler Kontrast (negativ = weicher Orton-Glow) |
   | Schärfe | Feine Detailschärfung |
6. **Format** – 1:1, 16:9, 21:9, 4:3 oder 9:16 (Hochformat, z. B. für Reels).
7. **Export** – Auflösung wählen und **„Video exportieren“** klicken.
   Das Video wird in Echtzeit gerendert und danach automatisch als Datei
   gespeichert (MP4 in Chrome/Edge, sonst WebM).

## Wie der 3D-Effekt entsteht

- Aus dem Starless-Bild wird eine **Tiefenkarte** (geglättete, kontrast-
  gestreckte Luminanz) erzeugt. Beim Hineinzoomen skalieren „nahe“ Bereiche
  überproportional (`zoom^f(tiefe)`), was die Parallaxe des Nebels erzeugt.
- Aus der Sternmaske werden die **einzelnen Sterne erkannt** (Blob-Detektion)
  und als leuchtende Partikel mit jeweils eigener, zufälliger Tiefe gerendert.
  Dadurch ziehen die Sterne beim Flug in unterschiedlichem Tempo am Betrachter
  vorbei – wie bei einem echten Flug durchs Sternenfeld, inkl. dezentem Funkeln.
- Die Effekte laufen als **Post-Processing-Kette** auf der GPU: Die Szene wird
  in einen Framebuffer gerendert, Bloom entsteht per Bright-Pass + Gauß-Blur in
  Viertelauflösung, Bewegungsunschärfe durch Mehrfach-Sampling entlang des
  per-Pixel-Bewegungsvektors (Zoom radial, Rotation tangential, Kamerafahrt).

## Technik

- Reines HTML/CSS/JavaScript, WebGL2-Rendering, keine Build-Tools.
- TIFF-Dekodierung über [UTIF.js](https://github.com/photopea/UTIF.js)
  (`vendor/UTIF.js`, inkl. `pako` für Deflate-komprimierte TIFFs).
- Video-Export über die MediaRecorder-API (`canvas.captureStream`).
