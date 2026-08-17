/* AstroFly – 3D camera flight through astrophotos
 *
 * Pipeline:
 *   starless image -> color texture + depth map (smoothed luminance)
 *   star mask      -> star particles (blob detection) with individual 3D depth
 *   WebGL2 pass 1  -> scene (parallax nebula + stars) into framebuffer
 *   WebGL2 pass 2  -> bloom (bright pass + Gaussian blur at quarter resolution)
 *   WebGL2 pass 3  -> composite: motion blur, warp fringing,
 *                     vignette, fade in/out
 *   WebCodecs / MediaRecorder -> export as MP4/WebM
 */

"use strict";

// ---------------------------------------------------------------- Zustand

const state = {
  starless: null,        // { canvas, width, height, name }
  stars: null,
  starsOriginal: null,   // unbearbeitete Sternmaske (für Streckung an/aus)
  depthCanvas: null,
  starCount: 0,

  aspect: 16 / 9,
  aspectName: "16:9",
  strictEdges: true,     // Ausschnitt nie über die echte Bildfläche (sonst Spiegelränder)

  flightMode: "zoom",    // "zoom" = auf den Nebel zu, "lateral" = seitlicher Flug
  driftDir: 90,          // Flugrichtung beim seitlichen Flug in Grad
  zoomBase: 1,
  speed: 40,             // 0..100 (beim seitlichen Flug: Fahrstrecke)
  ease: 60,              // Beschleunigen/Abbremsen 0..100
  easeMode: "linear",    // inout | in | out | linear
  parallax: 60,          // 0..100
  depthBoost: 33,        // Räumlichkeit/Tiefenumfang 0..100
  rotationSpeed: 0,      // °/s
  orientation: 0,        // °
  frameX: 0,             // Ausschnitt-Verschiebung -100..100 (an Bildkante geklemmt)
  frameY: 0,
  spinSpeed: 0,          // Galaxien-Rotation im Kern in °/s (0 = aus)
  spinRadius: 40,        // Wirkradius in % 
  spinDiff: 40,          // 0 = starr, 100 = innen deutlich schneller
  spinFlat: 0,           // Ellipsen-Stauchung für geneigte Galaxien 0..100
  spinTilt: 0,           // Ellipsen-Winkel in Grad
  spinCenter: { x: 0, y: 0 }, // Rotationszentrum in Ebenen-Einheiten
  spinPick: false,       // nächster Klick setzt das Rotationszentrum
  spinShow: false,       // Rotationsbereich als rote Maske einblenden
  spinMaskAmt: 0,        // Helligkeitsmaske einbeziehen 0..100 (0 = nur Kreis/Ellipse)
  spinMaskSmooth: 6,     // eigene Glättung der Spin-Helligkeitsmaske
  spinStars: false,      // Sterne im Rotationsbereich mitdrehen
  tiltX: 0,              // -100..100
  tiltY: 0,
  swayAmp: 0,            // Schwenk-Animation Stärke 0..100
  swayTempo: 40,         // Schwenk-Tempo 0..100
  swayDir: 0,            // Schwenk-Richtung in Grad
  swayRandom: 0,         // 0 = gerichtet, 100 = zufälliges Wackeln
  tiltRampAmp: 0,        // gerichteter Kipp-Schwenk: Stärke 0..100
  tiltRampDir: 0,        // Kipp-Richtung in Grad
  fade: 0,               // Ein-/Ausblenden in Zehntelsekunden (0 = aus)
  duration: 20,          // s
  loopMode: false,       // hin & zurück, nahtlos
  smooth: 18,
  depthRes: 768,        // Kantenlaenge der Tiefenkarte (768/1536/2048)
  customDepth: null,     // eigene, importierte Tiefenkarte { canvas, width, height }
  invertDepth: false,
  target: { x: 0, y: 0 }, // Zoomziel in Bildebenen-Einheiten (0,0 = Mitte)

  spread: 70,            // Stern-Ebenen-Streuung 0..100
  starDist: 55,          // Stern-Grundtiefe (Abstand zum Nebel) 0..100
  starLayers: 0,         // Anzahl diskreter Tiefen-Ebenen (0 = kontinuierlich)
  genStars: 0,           // Anzahl zusätzlich generierter (synthetischer) Sterne
  starPar: 100,          // Stern-Parallaxe in % (Bewegung relativ zum Nebel)
  maskStretched: false,  // Sternmaske ist bereits gestreckt -> keine Auto-Streckung
  stretchAmount: 50,     // Intensität der Auto-Streckung 0..100
  twinkle: 25,           // 0..100
  wcs: null,             // Plate-Solve-Lösung (aus FITS/WCS-Header)
  gaiaDepth: null,       // echte Tiefe je Masken-Stern (Float32Array, -1 = keine)
  gaiaAmt: 100,          // Einfluss der echten Tiefen 0..100
  gaiaInfo: null,        // { matched, total, dMin, dMax } für die Statuszeile
  gaiaOnly: false,       // Wissenschafts-Modus: nur Sterne mit echter Tiefe
  gaiaColorRGB: null,    // echte Katalogfarben je Masken-Stern (RGB, -1 = keine)
  gaiaColors: false,     // Katalogfarben statt Fotofarben verwenden
  gaiaPM: null,          // Eigenbewegung je Masken-Stern (Ebene/Jahr)
  gaiaPmYears: 0,        // Zeitraffer-Spanne in Jahren (0 = aus)
  objFar: false,         // Objekt einheitlich in die Ferne (hinter alle Sterne)
  occlude: 0,
  scenarioOn: false,     // Szenario-Flug: Kamera fliegt die Wegpunkte ab
  scenEdit: false,       // Flugplan-Einrichtung: Kamera folgt dem Steuerkreuz
  scenView: { x: 0, y: 0, zoom: 1, angle: 0 }, // aktuell eingerichteter Blick
  waypoints: [],         // [{ x, y, zoom, dur, hold, ease }] in Ebenen-Einheiten
  moonMode: false,       // Mond-Modus: Kugel-Tiefe statt Luminanz-Tiefe
  moonDisk: null,        // erkannte Mondscheibe { cx, cy, r } (normiert auf Bildbreite)
  moonObj: "moon",       // Auswahl im Bilder-Tab: moon | planet (gleiche Kugel-Logik)
  starDetails: true,     // Sternphysik (Größe/Alter) in Labels anzeigen
  realStars: true,       // hellste Sterne mit ihrem echten Pixel-Abbild rendern
  flipH: false,          // Bild horizontal gespiegelt (Starless + Maske)
  flipV: false,          // Bild vertikal gespiegelt
  flipOnlyStarless: false, // Spiegeln wirkt nur aufs Starless (Maske/Koordinaten bleiben)
  anchorStars: 0,       // % Sterne im Nebel verankern (Tiefe/Bewegung des Nebels)            // Nebel verdeckt dahinterliegende Sterne (0 = aus)
  objInfo: null,         // erkanntes Hauptobjekt { id, facts, otype }
  labels: null,          // Feld-Beschriftungen [{ id, x, y, sizePlane, otype, on }]
  showInfo: true,        // Infokarte ins Video einblenden
  showLabels: true,      // Feld-Beschriftungen ins Video einblenden
  labelStyle: "editorial", // Stil der Beschriftungen (editorial/glass/hud/micro/focus/classic)
  twinkleSpeed: 100,     // Funkel-Tempo in %
  starSize: 100,         // % Sterngröße
  starBright: 100,       // % Sternhelligkeit
  starSat: 100,          // % Sternsättigung
  seed: 1,               // Zufalls-Seed für Stern-Ebenen

  bloom: 0,              // 0..100
  mblur: 0,              // 0..100
  mblurStars: false,     // Bewegungsunschärfe nur auf die Sterne
  warp: 0,               // 0..100
  vignette: 0,           // 0..100
  exposure: 0,           // -100..100 (Blendenstufen ±2)
  contrast: 0,           // -100..100
  saturation: 0,         // -100..100
  clarity: 0,            // -100..100 (negativ = weich/Orton)
  structure: 0,          // -100..100 (feine Details, Multi-Scale-Lokalkontrast)
  h2Sat: 100,            // Nebelfarben: Sättigung Rot/H-alpha in %
  o3Sat: 100,            //   Türkis/OIII
  s2Sat: 100,            //   Gold/SII
  h2Hue: 0,              // Nebelfarben: Farbton-Shift in Grad (-45..45)
  o3Hue: 0,
  s2Hue: 0,
  h2Det: 0,              // Erkennungs-Farbton je Band in Grad (0..360)
  o3Det: 184,
  s2Det: 34,
  h2Width: 35,           // Erkennungs-Bereich je Band in ±Grad
  o3Width: 45,
  s2Width: 25,
  bandShow: "off",       // Erkennungsmaske in der Vorschau: off/h2/o3/s2
  bandFeather: 50,       // weiche Kante der Banderkennung in % (50 = neutral)
  sharpen: 0,            // 0..100

  viewScale: 70,         // Vorschaugröße in % der verfügbaren Fläche

  playing: true,
  t0: performance.now(),
  pausedAt: 0,

  exporting: false,
  offlineExport: false,
};

const $ = (id) => document.getElementById(id);
const canvas = $("glcanvas");

// ---------------------------------------------------------------- WebGL

const gl = canvas.getContext("webgl2", {
  antialias: false, // Szene wird in FBO gerendert, MSAA griffe hier nicht
  preserveDrawingBuffer: true, // nötig für captureStream in manchen Browsern
});
if (!gl) {
  alert(t("webgl2"));
  throw new Error("no webgl2");
}

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error("Shader: " + gl.getShaderInfoLog(s));
  }
  return s;
}

function program(vsSrc, fsSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("Link: " + gl.getProgramInfoLog(p));
  }
  return p;
}

const locCache = new Map();
function loc(prog, name) {
  let m = locCache.get(prog);
  if (!m) { m = new Map(); locCache.set(prog, m); }
  let l = m.get(name);
  if (l === undefined) { l = gl.getUniformLocation(prog, name); m.set(name, l); }
  return l;
}
const u1f = (p, n, v) => gl.uniform1f(loc(p, n), v);
const u1i = (p, n, v) => gl.uniform1i(loc(p, n), v);
const u2f = (p, n, x, y) => gl.uniform2f(loc(p, n), x, y);
const u3f = (p, n, x, y, z) => gl.uniform3f(loc(p, n), x, y, z);

// Maximale Texturkante: hochskalierte Bilder dürfen bis 8192 px nutzen
const MAX_TEX = Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE));

// --- Vollbild-Vertexshader (für alle Bildschirm-Pässe) ---

const quadVS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// --- Pass 1a: Hintergrund (Starless + Tiefenkarte, Parallax-Zoom) ---

const bgFS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uColorTexel;   // 1 Texel der Farbtextur in UV
uniform float uBicubic;     // 1 = bikubisch abtasten (beim Hineinzoomen)
uniform float uObjFar;      // 1 = Objekt einheitlich in die Ferne legen
uniform float uViewAspect;  // Breite/Höhe des Ausgabeformats
uniform float uImgAspect;   // Breite/Höhe des Bildes
uniform float uMoonMode;    // Mond-Modus: Himmel ausserhalb der Scheibe schwarz
uniform vec2 uMoonC;        // Scheibenzentrum in Textur-UV
uniform float uMoonR;       // Scheibenradius als Anteil der Bildbreite
uniform float uZoom;        // aktueller Gesamtzoom
uniform float uParallax;    // 0..1
uniform float uAngle;       // rad
uniform float uCover;       // Grundskalierung, damit Bild das Format füllt
uniform vec2 uCenter;       // Kameraziel in Bildebenen-Einheiten
uniform vec2 uTilt;         // Kipp-Parallaxe in Bildebenen-Einheiten
uniform float uDepthRange;  // Räumlichkeit: Spreizung der Tiefen-Zoomraten
uniform vec2 uSpinCenter;   // Galaxien-Rotation: Zentrum (Ebenen-Einheiten)
uniform float uSpinAngle;   // aktueller Drehwinkel im Kern (rad)
uniform float uSpinRadius;  // Wirkradius in Ebenen-Einheiten
uniform float uSpinDiff;    // 0 = starre Rotation, 1 = innen deutlich schneller
uniform vec3 uSpinEll;      // Ellipse: (cos Neigung, sin Neigung, Stauchung)
uniform float uSpinShow;    // 1 = Rotationsbereich als rote Maske einblenden
uniform sampler2D uSpinMask; // Helligkeitsmaske (eigene Glättung)
uniform float uSpinMaskAmt;  // 0 = ignorieren, 1 = voll gewichten
uniform vec3 uBandSat;      // Nebelfarben: Sättigung je Band (HII, OIII, SII)
uniform vec3 uBandHue;      // Nebelfarben: Farbton-Shift je Band (Kreisanteil)
uniform vec3 uBandCen;      // Erkennungs-Farbton je Band (Kreisanteil, einstellbar)
uniform vec3 uBandWidth;    // Erkennungs-Bereich je Band (Kreisanteil, einstellbar)
uniform float uBandShow;    // Erkennungsmaske: 0 = aus, 1 = HII, 2 = OIII, 3 = SII
uniform float uBandFeather; // weiche Kante der Banderkennung (0 = hart, 1 = sehr weich)
uniform float uBandOn;      // 1 = mindestens ein Band-Regler aktiv

vec2 imgUv(vec2 q) {
  return vec2(q.x / uImgAspect, q.y) + 0.5;
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
// C1-stetiges Farbton-Fenster: flacher Kern (voller Griff) mit Kosinus-
// Auslauf, Ableitung an beiden Enden 0 - keine sichtbaren Kanten in
// Verläufen. Der Feather verschiebt das Verhältnis Kern/Auslauf
float bandW(float h, float center, float width) {
  float d = abs(fract(h - center + 0.5) - 0.5);
  if (d >= width) return 0.0;
  float core = width * mix(0.55, 0.1, uBandFeather);
  if (d <= core) return 1.0;
  float t = (d - core) / (width - core);
  return 0.5 + 0.5 * cos(3.14159265 * t);
}

// Gewicht der Helligkeitsmaske an einem Ebenen-Punkt (1 = volle Drehung)
float spinMaskW(vec2 q) {
  if (uSpinMaskAmt == 0.0) return 1.0;
  float m = texture(uSpinMask, vec2(q.x / uImgAspect, q.y) + 0.5).r;
  return mix(1.0, m, uSpinMaskAmt);
}

// Radius eines Ebenen-Punkts im (elliptischen) Spin-Raum, 1 = Maskenrand
float spinR(vec2 q) {
  vec2 d = q - uSpinCenter;
  float c = uSpinEll.x, s = uSpinEll.y;
  vec2 e = mat2(c, -s, s, c) * d;
  e.y /= uSpinEll.z;
  return length(e) / uSpinRadius;
}

// Galaxien-Rotation: dreht die Bildabtastung nur innerhalb des Wirkradius um
// das gesetzte Zentrum. Zum Rand hin läuft die Drehung weich auf null aus
// (keine sichtbare Kante); der Differenzial-Anteil lässt den Kern schneller
// rotieren als die Außenbereiche – wie bei einer echten Galaxie.
vec2 spinWarp(vec2 q) {
  if (uSpinAngle == 0.0) return q;
  vec2 d = q - uSpinCenter;
  float c = uSpinEll.x, s = uSpinEll.y;
  vec2 e = mat2(c, -s, s, c) * d;   // in die Achsenlage der Ellipse drehen
  e.y /= uSpinEll.z;                // Stauchung aufheben -> Kreisraum
  float r = length(e) / uSpinRadius;
  if (r >= 1.0) return q;
  float fall = smoothstep(1.0, 0.55, r);
  float diffW = mix(1.0, 0.25 / (0.25 + 0.75 * r), uSpinDiff);
  float a = uSpinAngle * fall * diffW * spinMaskW(q);
  float ca = cos(a), sa = sin(a);
  e = mat2(ca, -sa, sa, ca) * e;
  e.y *= uSpinEll.z;                // zurück in die Bildlage
  return uSpinCenter + mat2(c, s, -s, c) * e;
}

void main() {
  // Canvas-Punkt in Ebenen-Einheiten (Höhe = 1)
  vec2 p = vec2((vUv.x - 0.5) * uViewAspect, vUv.y - 0.5);
  float c = cos(uAngle), s = sin(uAngle);
  vec2 pr = mat2(c, -s, s, c) * p;

  // Parallax: nahe Bereiche (hohe Tiefe) zoomen überproportional;
  // Kippen verschiebt sie zusätzlich seitlich. Tiefe ist erst nach dem
  // Sampeln bekannt -> Fixpunkt-Iteration.
  vec2 q = uCenter + pr / (uCover * uZoom);
  vec2 uv = imgUv(spinWarp(q));
  for (int i = 0; i < 3; i++) {
    float d = texture(uDepth, uv).r;
    // "Objekt in echte Tiefe": das Bild verhält sich wie ein fernes, starres
    // Objekt (einheitlich weit hinten) - alle Sterne ziehen davor vorbei
    d = mix(d, 0.02, uObjFar);
    float ex = 1.0 + uParallax * (d - 0.45) * uDepthRange;
    float scale = uCover * pow(uZoom, ex);
    q = uCenter + pr / scale + uTilt * (d - 0.45);
    uv = imgUv(spinWarp(q));
  }

  // Beim Hineinzoomen bikubisch (Catmull-Rom, 9 bilineare Taps) statt nur
  // bilinear abtasten: deutlich weniger Verpixelung/Matschigkeit bei Zoom > 1
  vec3 col;
  if (uBicubic > 0.5) {
    vec2 pos = uv / uColorTexel - 0.5;
    vec2 f = fract(pos);
    vec2 base = (pos - f + 0.5) * uColorTexel;
    vec2 f2 = f * f, f3 = f2 * f;
    vec2 w0 = -0.5 * f3 + f2 - 0.5 * f;
    vec2 w1 =  1.5 * f3 - 2.5 * f2 + 1.0;
    vec2 w2 = -1.5 * f3 + 2.0 * f2 + 0.5 * f;
    vec2 w3 =  0.5 * f3 - 0.5 * f2;
    vec2 w12 = w1 + w2;
    vec2 uv12 = base + (w2 / w12) * uColorTexel;
    vec2 uv0 = base - uColorTexel;
    vec2 uv3 = base + 2.0 * uColorTexel;
    col =
      texture(uColor, vec2(uv0.x,  uv0.y)).rgb  * (w0.x  * w0.y) +
      texture(uColor, vec2(uv12.x, uv0.y)).rgb  * (w12.x * w0.y) +
      texture(uColor, vec2(uv3.x,  uv0.y)).rgb  * (w3.x  * w0.y) +
      texture(uColor, vec2(uv0.x,  uv12.y)).rgb * (w0.x  * w12.y) +
      texture(uColor, vec2(uv12.x, uv12.y)).rgb * (w12.x * w12.y) +
      texture(uColor, vec2(uv3.x,  uv12.y)).rgb * (w3.x  * w12.y) +
      texture(uColor, vec2(uv0.x,  uv3.y)).rgb  * (w0.x  * w3.y) +
      texture(uColor, vec2(uv12.x, uv3.y)).rgb  * (w12.x * w3.y) +
      texture(uColor, vec2(uv3.x,  uv3.y)).rgb  * (w3.x  * w3.y);
    col = max(col, 0.0);
  } else {
    col = texture(uColor, uv).rgb;
  }
  // Nebelfarben: HII-/OIII-/SII-artige Farbbereiche gezielt anpassen.
  // Arbeitet auf dem Farbton (Rot, Türkis, Gold) - wirkt damit auf RGB-
  // wie auf Schmalband-Paletten; Graues bleibt unangetastet
  if (uBandOn > 0.5) {
    vec3 hsv = rgb2hsv(col);
    // Fenster-Gewichte je Band: reine Funktion des FARBTONS. Der Shift wird
    // bewusst NICHT mit Saettigung/Helligkeit gegated - die Wirkung skaliert
    // ohnehin mit der Farbigkeit des Pixels, Grau bleibt von selbst stehen.
    // (Das alte Gate verschob Nachbarpixel gleicher Farbe unterschiedlich
    // stark, sobald ihre Saettigung differierte - das riss Verlaeufe auf.)
    vec3 wh = vec3(
      bandW(hsv.x, uBandCen.x, uBandWidth.x),
      bandW(hsv.x, uBandCen.y, uBandWidth.y),
      bandW(hsv.x, uBandCen.z, uBandWidth.z));
    // Verschiebung so begrenzen, dass die Farbton-Abbildung monoton bleibt
    // (Steilheit des Auslaufs) - sonst "faltet" sie sich und es entstehen
    // harte Banding-Kanten. Fuer grosse Shifts den Bereich weiter stellen.
    vec3 lim = (uBandWidth * (1.0 - mix(0.55, 0.1, uBandFeather))) * 0.6;
    vec3 sh = clamp(uBandHue, -lim, lim);
    hsv.x = fract(hsv.x + dot(sh, wh) + 1.0);
    // Saettigungs-Regler zusaetzlich mit Saettigungs-/Helligkeits-Gate:
    // dunkles Farbrauschen (JPEG-Chroma) wird nicht aufgesaettigt
    float gate = smoothstep(0.03, 0.16, hsv.y) * smoothstep(0.02, 0.12, hsv.z);
    vec3 ws = wh * gate;
    hsv.y = clamp(hsv.y * mix(1.0, uBandSat.x, ws.x) * mix(1.0, uBandSat.y, ws.y) * mix(1.0, uBandSat.z, ws.z), 0.0, 1.0);
    col = hsv2rgb(hsv);
    // Erkennungsmaske: hebt die Pixel hervor, die das gewaehlte Band packt
    if (uBandShow > 0.5) {
      float wSel = uBandShow < 1.5 ? ws.x : (uBandShow < 2.5 ? ws.y : ws.z);
      col = col * 0.15 + wSel * (col + vec3(0.10, 0.32, 0.12));
    }
  }
  // Masken-Vorschau: rote Einfärbung entspricht exakt der Drehstärke
  // (gleiche Falloff-Kurve), plus dünner Ring am Maskenrand
  if (uSpinShow > 0.5) {
    float r = spinR(q);
    float w = smoothstep(1.0, 0.55, r) * spinMaskW(q);
    col = mix(col, vec3(1.0, 0.15, 0.1), w * 0.4);
    float ring = smoothstep(0.05, 0.0, abs(r - 1.0));
    col = mix(col, vec3(1.0, 0.35, 0.25), ring * 0.85);
  }
  // Mond-Modus: alles ausserhalb der erkannten Scheibe ist Himmel - schwarz.
  // Ohne diese Maske sampeln Hintergrund-Pixel (ferne Tiefe) mit anderem
  // Zoom-Exponenten in die helle Scheibe hinein -> Echo-Ring um den Mond;
  // beim Rauszoomen erschienen zudem gespiegelte Kopien (Textur-Wrap)
  if (uMoonMode > 0.5) {
    vec2 ddM = vec2(uv.x - uMoonC.x, (uv.y - uMoonC.y) / uImgAspect);
    col *= 1.0 - smoothstep(uMoonR * 1.005, uMoonR * 1.04, length(ddM));
  }
  outColor = vec4(col, 1.0);
}`;

// --- Pass 1b: Sterne (Punkt-Sprites mit individueller Tiefe) ---

const starVS = `#version 300 es
layout(location=0) in vec2 aPos;    // Ebenen-Einheiten: x in ±imgAspect/2, y in ±0.5
layout(location=1) in float aBright;// 0..1 (Helligkeit/Fluss)
layout(location=2) in float aSize;  // Radius in Ebenen-Einheiten
layout(location=3) in vec3 aColor;
layout(location=4) in float aGaia;  // echte Tiefe 0..1 aus Gaia (-1 = keine)
layout(location=5) in vec2 aPm;     // Eigenbewegung in Ebenen-Einheiten/Jahr
layout(location=6) in vec4 aAtlas;  // echtes Sternabbild: Zentrum-UV, halbe Groesse (UV / Ebene); x<0 = keins
uniform float uViewAspect;
uniform float uZoom;
uniform float uParallax;
uniform float uAngle;
uniform float uCover;
uniform float uPixelsY;   // Canvas-Höhe in px
uniform float uTime;
uniform float uSeed;      // Zufalls-Seed für die Ebenen-Verteilung
uniform float uStarBase;  // Grundtiefe (Abstand zum Nebel), 0 fern .. 1 nah
uniform float uSpread;    // Streuung der Ebenen 0..1
uniform float uLayers;    // Anzahl diskreter Ebenen (0 = kontinuierlich)
uniform float uStarPar;   // Parallax-Multiplikator für Sterne
uniform float uTwinkle;   // Funkel-Stärke 0..1
uniform float uTwSpeed;   // Funkel-Tempo (1 = normal)
uniform float uWarp;      // 0..1: Sterne rasen zusätzlich an der Kamera vorbei
uniform float uDepthRange;
uniform float uStarSize;   // Größen-Multiplikator
uniform float uStarBright; // Helligkeits-Multiplikator
uniform float uStarSat;    // Sättigung (0 = weiß, 1 = original, 2 = kräftig)
uniform vec2 uCenter;
uniform vec2 uTilt;
// Zweiter Kamerazustand (kurz danach) für die Geschwindigkeits-Streifen:
// jeder Stern kennt damit seine echte Bildschirmgeschwindigkeit
uniform float uZoom2;
uniform float uAngle2;
uniform vec2 uCenter2;
uniform vec2 uTilt2;
uniform float uStreak;    // Belichtungszeit / dt (0 = keine Streifen)
uniform float uMaxPoint;  // größte Punktgröße der GPU (Intel meldet z. B. nur 255)
uniform float uGaiaAmt;   // Mischung Zufallstiefe -> echte Gaia-Tiefe (0..1)
uniform float uGaiaOnly;  // 1 = Wissenschafts-Modus: nur Sterne mit Gaia-Tiefe
// Sterne rotieren mit der Galaxie (gleiche Formeln wie spinWarp im Hintergrund;
// Vorzeichen invertiert, weil dort die Abtastung statt des Inhalts gedreht wird)
uniform float uSpinStars;   // 1 = Sterne im Rotationsbereich mitdrehen
uniform float uSpinAngleS;  // akkumulierter Winkel zum Zeitpunkt t
uniform float uSpinAngleS2; // Winkel kurz danach (für die Streifen)
uniform vec2 uSpinCenterS;
uniform float uSpinRadiusS;
uniform float uSpinDiffS;
uniform vec3 uSpinEllS;
uniform sampler2D uSpinMaskS;
uniform float uSpinMaskAmtS;
uniform float uImgAspectS;
uniform float uPmYears;   // Zeitraffer: verstrichene Jahre zum Zeitpunkt t
uniform float uPmYears2;  // ... und kurz danach (für die Streifen)
// Nebel-Okklusion: Nebelschwaden, die VOR einem Stern liegen, verdecken ihn
uniform float uOcclude;    // Stärke 0..1 (0 = aus)
uniform float uMoonMode;   // Mond-Modus: Sterne hinter die Mondscheibe zwingen
uniform float uRealStars;  // 1 = hellste Sterne mit echtem Pixel-Abbild rendern
uniform vec2 uMoonCS;      // Scheibenzentrum in Textur-UV
uniform float uMoonRS;     // Scheibenradius als Anteil der Bildbreite
uniform float uAnchor;     // Sterne im Nebel verankern: Stärke 0..1
uniform vec2 uTiltB2;      // Nebel-Kippwert der zweiten Kamera (für Anker-Streifen)
uniform float uObjFarS;    // 1 = Objekt liegt einheitlich weit hinten
uniform vec2 uTiltB;       // Kipp-Parallaxe des Hintergrunds (nicht der Sterne)
uniform sampler2D uDepthS; // Tiefenkarte des Nebels
uniform sampler2D uColorS; // Starless-Bild (Dichte der Nebelschwaden)
out vec3 vColor;
out float vAlpha;
out vec2 vDir;    // Streifen-Richtung in Pixeln (normiert)
out float vLen;   // Streifen-Länge in px
out float vBase;  // Stern-Durchmesser in px
out float vSize;  // gl_PointSize (für gl_PointCoord -> px)
out vec3 vAtlasUv;   // Atlas: Zentrum-UV + halbe Groesse in UV (x<0 = prozedural)
out float vPatchHalf; // halbe Patch-Groesse auf dem Bildschirm in px

// Sternposition mit der Galaxien-Rotation mitdrehen (identische Falloff-,
// Differenzial- und Masken-Logik wie im Hintergrund-Shader)
vec2 spinStar(vec2 p, float angle) {
  if (uSpinStars < 0.5 || angle == 0.0) return p;
  vec2 d = p - uSpinCenterS;
  float c = uSpinEllS.x, s = uSpinEllS.y;
  vec2 e = mat2(c, -s, s, c) * d;
  e.y /= uSpinEllS.z;
  float r = length(e) / uSpinRadiusS;
  if (r >= 1.0) return p;
  float fall = smoothstep(1.0, 0.55, r);
  float diffW = mix(1.0, 0.25 / (0.25 + 0.75 * r), uSpinDiffS);
  float mw = 1.0;
  if (uSpinMaskAmtS > 0.0) {
    float m = textureLod(uSpinMaskS, vec2(p.x / uImgAspectS, p.y) + 0.5, 0.0).r;
    mw = mix(1.0, m, uSpinMaskAmtS);
  }
  float a = -angle * fall * diffW * mw; // Inhalt dreht entgegen der Abtastung
  float ca = cos(a), sa = sin(a);
  e = mat2(ca, -sa, sa, ca) * e;
  e.y *= uSpinEllS.z;
  return uSpinCenterS + mat2(c, s, -s, c) * e;
}

void main() {
  // Reproduzierbare Zufalls-Tiefe pro Stern; "Neu mischen" ändert den Seed
  float h = fract(sin(aPos.x * 127.1 + aPos.y * 311.7 + uSeed * 17.0) * 43758.5453);
  // Optional in diskrete Ebenen einrasten (gleichmäßig verteilt)
  float brightShift = aBright * 0.12;
  if (uLayers > 0.5) {
    h = (floor(h * uLayers) + 0.5) / uLayers;
    brightShift = 0.0;
  }
  float depth = clamp(uStarBase + (h - 0.5) * uSpread + brightShift, 0.02, 1.0);
  // Echte Entfernung aus dem Gaia-Katalog (falls zugeordnet): ersetzt die
  // Zufallstiefe je nach eingestellter Stärke. Im Wissenschafts-Modus zählen
  // ausschließlich echte Tiefen; Sterne ohne Gaia-Messung werden ausgeblendet
  if (aGaia >= 0.0) {
    depth = mix(depth, clamp(aGaia, 0.02, 1.0), max(uGaiaAmt, uGaiaOnly));
  } else if (uGaiaOnly > 0.5) {
    gl_Position = vec4(4.0, 4.0, 2.0, 1.0); // außerhalb des Clip-Volumens
    gl_PointSize = 1.0;
    vColor = vec3(0.0); vAlpha = 0.0;
    vDir = vec2(1.0, 0.0); vLen = 0.0; vBase = 1.0; vSize = 1.0;
    vAtlasUv = vec3(-1.0); vPatchHalf = 0.0;
    return;
  }

  // Mond-Modus: Sterne stehen quasi im Unendlichen - weit hinter dem Mond
  // und nahezu unbewegt (der Mond ist das einzig nahe Objekt im Bild)
  if (uMoonMode > 0.5) depth = min(depth, 0.03);

  // Sterne im Nebel verankern: Sterne auf dichten Nebelregionen übernehmen
  // Tiefe und Bewegung des Nebels an ihrer Bildposition - sie bleiben beim
  // 3D-Flug IM Nebel (z. B. die Wolf-Rayet-Sterne im Löwennebel), statt
  // davor herzufliegen. Sterne, deren Gaia-Tiefe klar vor oder hinter dem
  // Nebel liegt, bleiben frei.
  float anchorW = 0.0;
  float dNA = 0.45;
  if (uAnchor > 0.0) {
    vec2 uvA = vec2(aPos.x / uImgAspectS, aPos.y) + 0.5;
    if (uvA.x > 0.001 && uvA.x < 0.999 && uvA.y > 0.001 && uvA.y < 0.999) {
      dNA = textureLod(uDepthS, uvA, 0.0).r;
      dNA = mix(dNA, 0.02, uObjFarS);
      vec3 cNA = textureLod(uColorS, uvA, 0.0).rgb;
      float dens = smoothstep(0.05, 0.30, dot(cNA, vec3(0.299, 0.587, 0.114)));
      float agree = aGaia >= 0.0
        ? 1.0 - smoothstep(0.10, 0.28, abs(clamp(aGaia, 0.02, 1.0) - dNA))
        : 1.0;
      anchorW = uAnchor * dens * agree;
    }
  }

  // Sterne parallaxieren deutlich stärker als der Nebel (Faktor ~2.6 relativ
  // zur Räumlichkeit); Warp lässt sie zusätzlich beschleunigt vorbeiziehen
  float ex = 1.0 + uParallax * (depth - 0.45) * uDepthRange * 2.6 * uStarPar + uWarp * (0.4 + depth);
  // Verankerte Sterne bewegen sich exakt wie der Nebel an ihrer Position:
  // gleicher Zoom-Exponent, gleicher Kippwert, kein Stern-Parallax-Faktor
  ex = mix(ex, 1.0 + uParallax * (dNA - 0.45) * uDepthRange, anchorW);
  // Ferne Sterne nie rückwärts fliegen lassen (Exponent bliebe sonst negativ)
  ex = max(ex, 0.12);
  // Mond-Modus: Sterne stehen fest am Himmel (Exponent 0 = kein Mitzoomen).
  // Wer bewusst Bewegung will, zieht die Stern-Parallaxe ueber 100 %
  if (uMoonMode > 0.5) ex = 0.3 * max(0.0, uStarPar - 1.0);
  float scale = uCover * pow(uZoom, ex);
  vec2 sp1 = spinStar(aPos + aPm * uPmYears, uSpinAngleS);
  vec2 tOff = mix(uTilt * (depth - 0.45), uTiltB * (dNA - 0.45), anchorW);
  vec2 pr = (sp1 - uCenter - tOff) * scale;
  depth = mix(depth, dNA, anchorW);
  float c = cos(uAngle), s = sin(uAngle);
  // Inverse der Hintergrund-Rotation, damit Sterne auf dem Bild liegen bleiben
  vec2 p = mat2(c, s, -s, c) * pr;
  vec2 clip = vec2(p.x * 2.0 / uViewAspect, p.y * 2.0);

  // Nebel-Okklusion: Welcher Nebel-Punkt liegt an der Bildschirmposition
  // dieses Sterns? Gleiche Fixpunkt-Iteration wie im Hintergrund-Shader;
  // liegt der Nebel dort NÄHER an der Kamera als der Stern, schluckt seine
  // Dichte (Helligkeit des Starless-Bilds) das Sternlicht
  float occ = 0.0;
  float occStr = max(uOcclude, uMoonMode);
  if (occStr > 0.0) {
    vec2 qn = uCenter + pr / (uCover * uZoom);
    vec2 uvN = vec2(qn.x / uImgAspectS, qn.y) + 0.5;
    float dN = 0.02;
    for (int i = 0; i < 3; i++) {
      dN = textureLod(uDepthS, uvN, 0.0).r;
      dN = mix(dN, 0.02, uObjFarS);
      float exN = 1.0 + uParallax * (dN - 0.45) * uDepthRange;
      float scaleN = uCover * pow(uZoom, exN);
      qn = uCenter + pr / scaleN + uTiltB * (dN - 0.45);
      uvN = vec2(qn.x / uImgAspectS, qn.y) + 0.5;
    }
    if (uvN.x > 0.0 && uvN.x < 1.0 && uvN.y > 0.0 && uvN.y < 1.0) {
      vec3 cN = textureLod(uColorS, uvN, 0.0).rgb;
      float lum = dot(cN, vec3(0.299, 0.587, 0.114));
      float front = smoothstep(0.02, 0.14, dN - depth);
      float dens = smoothstep(0.04, 0.45, lum);
      if (uMoonMode > 0.5) {
        vec2 ddM = vec2(uvN.x - uMoonCS.x, (uvN.y - uMoonCS.y) / uImgAspectS);
        dens = 1.0 - smoothstep(uMoonRS * 0.99, uMoonRS * 1.02, length(ddM));
      }
      occ = occStr * front * dens;
    }
  }

  float px = aSize * 2.0 * scale * uPixelsY * uStarSize;
  float base = clamp(px, 1.2, 500.0);

  // Geschwindigkeits-Streifen: Position kurz danach mit demselben Tiefen-
  // Exponenten -> die Streifenlänge folgt der echten Geschwindigkeit dieses
  // Sterns (nahe Sterne ziehen lange Striche, ferne bleiben Punkte)
  float len = 0.0;
  vec2 dirPx = vec2(1.0, 0.0);
  vec2 clipMid = clip;
  if (uStreak > 0.0) {
    float scale2 = uCover * pow(uZoom2, ex);
    vec2 tOff2 = mix(uTilt2 * (depth - 0.45), uTiltB2 * (dNA - 0.45), anchorW);
    vec2 pr2 = (spinStar(aPos + aPm * uPmYears2, uSpinAngleS2) - uCenter2 - tOff2) * scale2;
    float c2 = cos(uAngle2), s2 = sin(uAngle2);
    vec2 p2 = mat2(c2, s2, -s2, c2) * pr2;
    vec2 clip2 = vec2(p2.x * 2.0 / uViewAspect, p2.y * 2.0);
    vec2 velClip = (clip2 - clip) * uStreak;
    // y negiert: gl_PointCoord zählt nach unten, der Clip-Space nach oben
    vec2 velPx = velClip * 0.5 * vec2(uPixelsY * uViewAspect, -uPixelsY);
    float fullLen = length(velPx);
    // Langsame Sterne bleiben perfekt runde Punkte: Erst wenn die Bewegung
    // deutlich über einen Sterndurchmesser hinausgeht, wächst der Schweif
    // weich an - sonst wirken alle Sterne leicht "eiförmig" verformt.
    // Wichtig: fullLen getrennt halten - dirPx muss mit der ECHTEN Länge
    // normiert werden, sonst verzerrt ein teilweiser Anlauffaktor die ganze
    // Kapsel-Geometrie (Sterne verschwanden bei mittleren Reglerwerten)
    float rawLen = fullLen * smoothstep(base * 0.4, base * 1.3, fullLen);
    // Nie größer werden als die GPU-Punktgröße erlaubt (sonst kappt der
    // Treiber das Sprite und der Sternkopf wird sichtbar "halbiert"),
    // plus 4 px Rand, damit der Kopf nie exakt auf der Sprite-Kante liegt
    len = clamp(rawLen, 0.0, max(uMaxPoint - base - 4.0, 0.0));
    if (fullLen > 1e-4) {
      dirPx = velPx / fullLen;
      // Kometen-Optik: Der Stern bleibt an seiner Position (Kopf), der
      // Schweif läuft entgegen der Flugrichtung aus -> Sprite nach hinten,
      // um die SICHTBARE Schweiflänge (nicht die volle Bewegung)
      clipMid = clip - velClip * 0.5 * (len / fullLen);
    }
  }
  gl_Position = vec4(clipMid, 0.0, 1.0);
  float size = base + min(len + 4.0, uMaxPoint - base);
  // Echtes Sternabbild: Sprite auf die Patch-Groesse aufziehen. Sobald ein
  // sichtbarer Streifen entsteht, faellt der Stern auf das prozedurale
  // Sprite zurueck (gestreckte Spikes/Halos wuerden haesslich verschmieren)
  vAtlasUv = vec3(-1.0);
  vPatchHalf = 0.0;
  // Absorbierte Paar-Partner (Marke -2) sind im Patch des helleren Sterns
  // enthalten - ihr eigenes Partikel wuerde sie doppelt zeichnen
  if (uRealStars > 0.5 && aAtlas.x < -1.5) vAlpha = 0.0;
  if (uRealStars > 0.5 && aAtlas.x >= 0.0 && len < base * 0.5) {
    float patchHalf = aAtlas.w * scale * uPixelsY * uStarSize;
    if (patchHalf > 1.5) {
      vPatchHalf = min(patchHalf, uMaxPoint * 0.5 - 1.0);
      size = max(size, vPatchHalf * 2.0 + 2.0);
      vAtlasUv = vec3(aAtlas.x, aAtlas.y, aAtlas.z);
      len = 0.0;
    }
  }
  gl_PointSize = size;
  vDir = dirPx;
  vLen = len;
  vBase = base;
  vSize = size;

  float seed = fract(aPos.x * 137.7 + aPos.y * 91.3) * 6.2831;
  float tw = sin(uTime * uTwSpeed * (1.0 + fract(seed) * 2.5) + seed * 10.0) * 0.5 + 0.5;
  vAlpha = 1.0 - uTwinkle * 0.55 * tw;
  // Kometen-Logik statt physikalischer Langzeitbelichtung: Der Sternkopf
  // behält IMMER seine volle Helligkeit, nur der Schweif läuft weich aus
  // (macht der Verlauf im Fragment-Shader). Eine globale Längen-Dämpfung
  // ließ schwache Sterne bei mittleren Reglerwerten unter die
  // Sichtbarkeitsschwelle fallen - der Regler war nicht dosierbar.
  vAlpha *= 1.0 - occ;
  float lumS = dot(aColor, vec3(0.299, 0.587, 0.114));
  vec3 cS = aColor;
  if (uStarSat > 1.0) {
    // Farb-Boost: Farbanteile relativ zum stärksten Kanal spreizen - die
    // Maskenfarben sind Richtung Weiß angehoben, lineares Nachsättigen
    // holt da kaum Farbe heraus; die Potenz macht zarte Tönungen kräftig,
    // ohne die Helligkeit des Sterns anzuheben
    float mx = max(cS.r, max(cS.g, cS.b)) + 1e-5;
    cS = pow(cS / mx, vec3(1.0 + (uStarSat - 1.0) * 2.0)) * mx;
  }
  vColor = max(mix(vec3(lumS), cS, min(uStarSat, 1.0)), 0.0) * uStarBright;
}`;

const starFS = `#version 300 es
precision highp float;
in vec3 vColor;
in float vAlpha;
in vec2 vDir;
in float vLen;
in float vBase;
in float vSize;
in vec3 vAtlasUv;
in float vPatchHalf;
uniform sampler2D uAtlas;   // echte Sternabbilder (Ausschnitte der Maske)
uniform float uStarBrightF; // Helligkeits-Regler (wie uStarBright im VS)
out vec4 outColor;
void main() {
  // Echtes Sternabbild: Patch aus dem Atlas statt prozeduraler Glocke.
  // Additives Blending -> schwarzer Patch-Hintergrund addiert nichts;
  // ein weicher radialer Rand vermeidet sichtbare Kachelkanten
  if (vAtlasUv.x >= 0.0 && vPatchHalf > 0.5) {
    vec2 d = (gl_PointCoord - 0.5) * vSize;
    float rn = length(d) / vPatchHalf;
    if (rn > 1.0) discard;
    vec2 uv = vec2(vAtlasUv.x + d.x / vPatchHalf * vAtlasUv.z,
                   vAtlasUv.y - d.y / vPatchHalf * vAtlasUv.z);
    vec3 c = texture(uAtlas, uv).rgb;
    float edge = 1.0 - smoothstep(0.78, 1.0, rn);
    outColor = vec4(c * edge * vAlpha * uStarBrightF, 1.0);
    return;
  }
  // Kapsel entlang der Flugrichtung: Abstand zur Streifen-Mittellinie,
  // normiert auf den Stern-Radius (vLen = 0 -> runder Stern wie bisher)
  vec2 d = (gl_PointCoord - 0.5) * vSize;
  float along = dot(d, vDir);
  float across = dot(d, vec2(-vDir.y, vDir.x));
  float da = max(abs(along) - vLen * 0.5, 0.0);
  vec2 q = vec2(da, across) / (vBase * 0.5);
  float r2 = dot(q, q); // 0 Mittellinie .. 1 Rand
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 9.0);
  float halo = exp(-r2 * 2.5) * 0.35;
  float a = (core + halo) * vAlpha;
  // Verlauf entlang des Schweifs: am Kopf (Sternposition, in Flugrichtung
  // vorn) volle Helligkeit, zum Ende hin weich auslaufend
  if (vLen > 0.5) {
    float s = clamp((along + vLen * 0.5) / max(vLen, 1.0), 0.0, 1.0);
    float grad = mix(0.10, 1.0, s * s);
    // Der Kometen-Verlauf blendet erst mit wachsender Streifenlänge ein -
    // bei winzigen Längen dimmte er sonst den ganzen Stern und der Regler
    // war nicht dosierbar (Sterne verschwanden bei kleinen Werten)
    a *= mix(1.0, grad, clamp(vLen / (vBase + 1.0), 0.0, 1.0));
  }
  outColor = vec4(vColor * a, a);
}`;

// --- Pass 2: Bloom ---

const brightFS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uStarsTex; // separate Sternebene (schwarz, wenn nicht getrennt)
void main() {
  vec3 c = texture(uScene, vUv).rgb + texture(uStarsTex, vUv).rgb;
  float l = max(max(c.r, c.g), c.b);
  // Empfindlicher (niedrige Schwelle, weiches Knie): auch schwache Sterne
  // glimmen - die Gesamtstärke regelt der Composite entsprechend sanfter
  float k = smoothstep(0.30, 0.78, l);
  outColor = vec4(c * k, 1.0);
}`;

const blurFS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform vec2 uDir; // 1 Texel in Blur-Richtung
void main() {
  const float W[5] = float[](0.227027, 0.194594, 0.121622, 0.054054, 0.016216);
  vec3 acc = texture(uScene, vUv).rgb * W[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uDir * float(i) * 1.5;
    acc += texture(uScene, vUv + o).rgb * W[i];
    acc += texture(uScene, vUv - o).rgb * W[i];
  }
  outColor = vec4(acc, 1.0);
}`;

// --- Pass 3: Composite (Bewegungsunschärfe, Warp-Farbsäume, Vignette) ---

const compFS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uSoft;  // stark weichgezeichnete Szene (für Klarheit)
uniform sampler2D uMed;   // mittel weichgezeichnete Szene (für Struktur)
uniform float uViewAspect;
uniform float uBloomStrength;
uniform float uShutter;   // "Belichtungszeit" der Bewegungsunschärfe in s
uniform float uZoomRate;  // d(ln zoom)/dt
uniform float uRotRate;   // rad/s
uniform vec2 uPanVel;     // Kamerafahrt in Ebenen-Einheiten/s
uniform float uChroma;    // Warp-Farbsäume
uniform float uVignette;
uniform float uFade;
uniform float uExposure;   // Blendenstufen
uniform float uContrast;   // 1 = neutral
uniform float uSaturation; // 1 = neutral
uniform float uClarity;    // 0 = aus, negativ = weich (Orton)
uniform float uStructure;  // feine Details, 0 = aus
uniform float uSharpen;    // 0 = aus
uniform vec2 uTexel;       // 1 px der Szene in UV
uniform sampler2D uStarsTex; // separate Sternebene ("nur Sterne"-Unschärfe)
uniform float uSplit;      // 1 = Bewegungsunschärfe nur auf die Sterne

void main() {
  vec2 r = vec2((vUv.x - 0.5) * uViewAspect, vUv.y - 0.5);

  // Bewegungsvektor dieses Pixels: radial (Zoom) + tangential (Rotation) + Fahrt
  vec2 vel = r * uZoomRate + vec2(-r.y, r.x) * uRotRate + uPanVel;
  vec2 off = vel * uShutter;
  off = vec2(off.x / uViewAspect, off.y);
  vec2 ca = vec2(r.x / uViewAspect, r.y) * uChroma * 0.02;

  // Die Sterne liegen immer auf einer eigenen Ebene (uStarsTex): so treffen
  // Klarheit/Struktur/Schärfe nur den Nebel - Sternbearbeitung wohnt im
  // Sterne-Tab. uSplit = 1: Sterne sind bereits als eigene Geschwindigkeits-
  // Streifen gerendert und bekommen KEINE Composite-Unschärfe mehr
  vec3 col;
  vec3 stars;
  if (uSplit > 0.5) {
    col = texture(uScene, vUv).rgb;
    stars = texture(uStarsTex, vUv).rgb;
  } else {
    vec3 acc = vec3(0.0);
    vec3 accS = vec3(0.0);
    const int N = 8;
    for (int i = 0; i < N; i++) {
      float f = float(i) / float(N - 1) - 0.5;
      vec2 o = off * f;
      acc.r += texture(uScene, vUv + o * (1.0 + uChroma) + ca).r;
      acc.g += texture(uScene, vUv + o).g;
      acc.b += texture(uScene, vUv + o * (1.0 - uChroma) - ca).b;
      accS.r += texture(uStarsTex, vUv + o * (1.0 + uChroma) + ca).r;
      accS.g += texture(uStarsTex, vUv + o).g;
      accS.b += texture(uStarsTex, vUv + o * (1.0 - uChroma) - ca).b;
    }
    col = acc / float(N);
    stars = accS / float(N);
  }

  // Klarheit: lokaler Kontrast gegen stark weichgezeichnete Szene
  if (uClarity != 0.0) {
    vec3 soft = texture(uSoft, vUv).rgb;
    col += (col - soft) * uClarity;
  }
  // Struktur: feiner Lokalkontrast gegen mittel weichgezeichnete Szene
  if (uStructure != 0.0) {
    vec3 med = texture(uMed, vUv).rgb;
    col += (col - med) * uStructure;
  }
  // Schärfe: Unsharp-Mask mit 1-Pixel-Radius
  if (uSharpen > 0.0) {
    vec3 nb = texture(uScene, vUv + vec2(uTexel.x, 0.0)).rgb
            + texture(uScene, vUv - vec2(uTexel.x, 0.0)).rgb
            + texture(uScene, vUv + vec2(0.0, uTexel.y)).rgb
            + texture(uScene, vUv - vec2(0.0, uTexel.y)).rgb;
    col += (texture(uScene, vUv).rgb - nb * 0.25) * uSharpen;
  }

  // Sterne erst NACH Klarheit/Struktur/Schärfe dazulegen
  col += stars;

  col += texture(uBloom, vUv).rgb * uBloomStrength;

  // Farbabstimmung: Belichtung -> Kontrast -> Sättigung
  col = max(col, 0.0) * exp2(uExposure);
  col = (col - 0.5) * uContrast + 0.5;
  float lum = dot(max(col, 0.0), vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSaturation);

  float d = length(r) / (0.7071 * max(uViewAspect, 1.0));
  col *= 1.0 - uVignette * smoothstep(0.45, 1.25, d);

  outColor = vec4(col * uFade, 1.0);
}`;

const bgProg = program(quadVS, bgFS);
const starProg = program(starVS, starFS);
const brightProg = program(quadVS, brightFS);
const blurProg = program(quadVS, blurFS);
const compProg = program(quadVS, compFS);

// Fullscreen-Dreieck
const quadVao = gl.createVertexArray();
gl.bindVertexArray(quadVao);
const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// Stern-Puffer
const starVao = gl.createVertexArray();
const starBuf = gl.createBuffer();

let texColor = null;
let texDepth = null;
let texSpinMask = null;
let texStarAtlas = null;

function makeTexture(source) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
  return t;
}

// --- Framebuffer für die Post-Processing-Kette ---

function makeFbo(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, w, h };
}

// 1x1-Schwarztextur: Platzhalter für die Sternebene, wenn nicht getrennt wird
const texBlack = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texBlack);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

let fbScene = null, fbStars = null, fbBloomA = null, fbBloomB = null, fbSoftA = null, fbSoftB = null,
    fbMedA = null, fbMedB = null;

function ensureFbos() {
  const w = canvas.width, h = canvas.height;
  if (fbScene && fbScene.w === w && fbScene.h === h) return;
  for (const f of [fbScene, fbStars, fbBloomA, fbBloomB, fbSoftA, fbSoftB, fbMedA, fbMedB]) {
    if (f) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); }
  }
  fbScene = makeFbo(w, h);
  fbStars = makeFbo(w, h);
  const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
  fbBloomA = makeFbo(bw, bh);
  fbBloomB = makeFbo(bw, bh);
  fbSoftA = makeFbo(bw, bh);
  fbSoftB = makeFbo(bw, bh);
  const mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
  fbMedA = makeFbo(mw, mh);
  fbMedB = makeFbo(mw, mh);
}

// ---------------------------------------------------------------- Bild-Dekodierung

/**
 * FITS-Bilddaten dekodieren (unkomprimiert): BITPIX 8/16/32 Integer sowie
 * -32/-64 Float, Mono oder RGB (NAXIS3 = 3), BSCALE/BZERO, Big-Endian.
 * FITS zählt Zeilen von unten nach oben -> beim Übertragen in den Canvas
 * wird vertikal gespiegelt. Eine im Header enthaltene TAN-Plate-Solve-
 * Lösung wird mitgeliefert (wcs), sodass kein separater Upload nötig ist.
 */
function decodeFits(buf, fileName) {
  const bytes = new Uint8Array(buf);
  const text = new TextDecoder("ascii").decode(
    bytes.subarray(0, Math.min(bytes.length, 2880 * 200)));
  const h = {};
  let end = -1;
  for (let off = 0; off + 80 <= text.length; off += 80) {
    const card = text.slice(off, off + 80);
    const key = card.slice(0, 8).trim();
    if (key === "END") { end = off + 80; break; }
    if (card[8] !== "=") continue;
    let val = card.slice(10).split("/")[0].trim();
    if (val.startsWith("'")) val = val.slice(1, val.lastIndexOf("'")).trim();
    h[key] = val;
  }
  if (end < 0) throw new Error("FITS: header end not found");
  const dataStart = Math.ceil(end / 2880) * 2880;
  const bitpix = parseInt(h.BITPIX, 10);
  const w = parseInt(h.NAXIS1, 10), hgt = parseInt(h.NAXIS2, 10);
  const planes = parseInt(h.NAXIS3 || "1", 10);
  if (!(w > 0) || !(hgt > 0)) throw new Error("FITS: no image data");
  if (planes !== 1 && planes !== 3) throw new Error("FITS: NAXIS3 = " + planes);
  const bscale = parseFloat(h.BSCALE || "1"), bzero = parseFloat(h.BZERO || "0");
  const n = w * hgt * planes;
  const bpp = Math.abs(bitpix) / 8;
  if (dataStart + n * bpp > buf.byteLength) throw new Error("FITS: file truncated");
  const dv = new DataView(buf, dataStart);
  const vals = new Float32Array(n);
  switch (bitpix) {
    case 8:   for (let i = 0; i < n; i++) vals[i] = dv.getUint8(i) * bscale + bzero; break;
    case 16:  for (let i = 0; i < n; i++) vals[i] = dv.getInt16(i * 2) * bscale + bzero; break;
    case 32:  for (let i = 0; i < n; i++) vals[i] = dv.getInt32(i * 4) * bscale + bzero; break;
    case -32: for (let i = 0; i < n; i++) vals[i] = dv.getFloat32(i * 4) * bscale + bzero; break;
    case -64: for (let i = 0; i < n; i++) vals[i] = dv.getFloat64(i * 8) * bscale + bzero; break;
    default: throw new Error("FITS: BITPIX " + bitpix);
  }
  // Robuste Normierung auf 0..255 über gesampelte Perzentile (einzelne
  // heiße Pixel sollen das Bild nicht abdunkeln); gemeinsame Skala für
  // alle Farbebenen, damit die Farbbalance erhalten bleibt
  const stride = Math.max(1, Math.floor(n / 1e6));
  const sample = [];
  for (let i = 0; i < n; i += stride) {
    if (isFinite(vals[i])) sample.push(vals[i]);
  }
  sample.sort((a, b) => a - b);
  const lo = sample[Math.floor((sample.length - 1) * 0.0002)];
  const hi = sample[Math.floor((sample.length - 1) * 0.9998)];
  const range = Math.max(1e-9, hi - lo);
  const rgba = new Uint8ClampedArray(w * hgt * 4);
  const plane = w * hgt;
  for (let y = 0; y < hgt; y++) {
    const srcRow = (hgt - 1 - y) * w; // FITS: Zeile 0 liegt unten
    for (let x = 0; x < w; x++) {
      const sIdx = srcRow + x, d = (y * w + x) * 4;
      rgba[d] = ((vals[sIdx] - lo) / range) * 255;
      if (planes === 3) {
        rgba[d + 1] = ((vals[sIdx + plane] - lo) / range) * 255;
        rgba[d + 2] = ((vals[sIdx + 2 * plane] - lo) / range) * 255;
      } else {
        rgba[d + 1] = rgba[d + 2] = rgba[d];
      }
      rgba[d + 3] = 255;
    }
  }
  const c = document.createElement("canvas");
  c.width = w; c.height = hgt;
  c.getContext("2d").putImageData(new ImageData(rgba, w, hgt), 0, 0);
  let wcs = null;
  try { wcs = parseWcsHeader(bytes.subarray(0, dataStart)); } catch { /* keine Lösung im Header */ }
  return { canvas: c, width: w, height: hgt, name: fileName, wcs };
}

async function decodeFile(file) {
  const name = file.name.toLowerCase();
  if (/\.(fits?|fts)$/.test(name)) {
    return decodeFits(await file.arrayBuffer(), file.name);
  }
  if (name.endsWith(".tif") || name.endsWith(".tiff")) {
    const buf = await file.arrayBuffer();
    const ifds = UTIF.decode(buf);
    if (!ifds.length) throw new Error(t("tiffError"));
    let best = ifds[0];
    for (const ifd of ifds) {
      UTIF.decodeImage(buf, ifd);
      if ((ifd.width * ifd.height) > (best.width * best.height || 0)) best = ifd;
    }
    const rgba = UTIF.toRGBA8(best);
    const c = document.createElement("canvas");
    c.width = best.width; c.height = best.height;
    const imgData = new ImageData(new Uint8ClampedArray(rgba.buffer, 0, best.width * best.height * 4), best.width, best.height);
    c.getContext("2d").putImageData(imgData, 0, 0);
    return { canvas: c, width: c.width, height: c.height, name: file.name };
  }
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0);
  bmp.close();
  return { canvas: c, width: c.width, height: c.height, name: file.name };
}

/** Bild auf maximale Kantenlänge verkleinern (gibt Canvas zurück). */
function downscale(img, maxEdge) {
  const s = Math.min(1, maxEdge / Math.max(img.width, img.height));
  if (s >= 1) return img.canvas;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * s));
  c.height = Math.max(1, Math.round(img.height * s));
  c.getContext("2d").drawImage(img.canvas, 0, 0, c.width, c.height);
  return c;
}

// ---------------------------------------------------------------- Tiefenkarte

/** Geglättete, kontrastgestreckte Luminanzkarte des Starless-Bildes. */
function computeLuminanceMap(radius, invert, maxEdge) {
  const res = maxEdge || state.depthRes;
  const src = downscale(state.starless, res);
  // Radius ist in Karten-Pixeln: bei hoeherer Aufloesung mitskalieren,
  // damit die Glaettung optisch identisch bleibt
  radius = Math.max(1, Math.round(radius * res / 768));
  const w = src.width, h = src.height;
  const data = src.getContext("2d").getImageData(0, 0, w, h).data;

  // Luminanz
  let lum = new Float32Array(w * h);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    lum[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }

  // Kontrast über Perzentile strecken
  const sorted = Float32Array.from(lum).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)];
  const hi = sorted[Math.floor(sorted.length * 0.98)];
  const range = Math.max(1e-3, hi - lo);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = Math.min(1, Math.max(0, (lum[i] - lo) / range));
  }

  // 3× Box-Blur ≈ Gauß
  let a = lum, b = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    boxBlurH(a, b, w, h, radius);
    boxBlurV(b, a, w, h, radius);
  }

  const dst = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < a.length; i++, j += 4) {
    let d = a[i];
    if (invert) d = 1 - d;
    const v = Math.round(d * 255);
    dst[j] = dst[j + 1] = dst[j + 2] = v;
    dst[j + 3] = 255;
  }

  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").putImageData(new ImageData(dst, w, h), 0, 0);
  return { canvas: c, data: dst, w, h };
}


/**
 * Mondscheibe im Starless-Bild finden: helle Region vor dunklem Himmel ->
 * Randpunkte -> konvexe Huelle -> Kreis-Fit (Kasa). Die Huelle sorgt dafuer,
 * dass bei Mondphasen der beleuchtete Rand (echter Kreisbogen) den Fit
 * dominiert und der Terminator weitgehend rausfaellt.
 * Rueckgabe { cx, cy, r } normiert (x und r auf Bildbreite, y auf Hoehe).
 */
function detectMoonDisk() {
  if (!state.starless) return null;
  const src = downscale(state.starless, 512);
  const w = src.width, h = src.height;
  const data = src.getContext("2d").getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  let hi = 0;
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    lum[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    if (lum[i] > hi) hi = lum[i];
  }
  const th = Math.max(18, hi * 0.25);
  const pts = [];
  let area = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (lum[i] < th) continue;
      area++;
      if (lum[i - 1] < th || lum[i + 1] < th || lum[i - w] < th || lum[i + w] < th) {
        pts.push([x, y]);
      }
    }
  }
  if (area < w * h * 0.004 || pts.length < 24) return null;

  // Konvexe Huelle (Monotone Chain)
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 8) return null;

  // Kreis-Fit nach Kasa: x^2+y^2 = a*x + b*y + c, kleinste Quadrate
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y] of hull) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    sxz += x * z; syz += y * z; sz += z;
  }
  const n = hull.length;
  const det = sxx * (syy * n - sy * sy) - sxy * (sxy * n - sy * sx) + sx * (sxy * sy - syy * sx);
  if (Math.abs(det) < 1e-6) return null;
  const a = (sxz * (syy * n - sy * sy) - sxy * (syz * n - sy * sz) + sx * (syz * sy - syy * sz)) / det;
  const b = (sxx * (syz * n - sy * sz) - sxz * (sxy * n - sx * sy) + sx * (sxy * sz - syz * sx)) / det;
  const c = (sxx * (syy * sz - syz * sy) - sxy * (sxy * sz - syz * sx) + sxz * (sxy * sy - syy * sx)) / det;
  const cx = a / 2, cy = b / 2;
  const r = Math.sqrt(Math.max(0, c + cx * cx + cy * cy));

  // Plausibilitaet: Radius sinnvoll, Zentrum nahe am Bild, helle Flaeche
  // passt zur Kreisflaeche (bei Phasen ist sie kleiner, nie viel groesser)
  const circleArea = Math.PI * r * r;
  if (r < Math.min(w, h) * 0.04 || r > Math.max(w, h) * 0.9) return null;
  if (cx < -0.3 * w || cx > 1.3 * w || cy < -0.3 * h || cy > 1.3 * h) return null;
  if (area > circleArea * 1.25 || area < circleArea * 0.12) return null;

  return { cx: cx / w, cy: cy / h, r: r / w };
}

/**
 * Kugel-Tiefenkarte fuer den Mond-Modus: innerhalb der erkannten Scheibe
 * echte Kugelgeometrie (Mitte nah, Rand kruemmt sich weg), aussen ferner
 * Himmel. Leichte Glaettung vermeidet eine harte Tiefenkante am Mondrand.
 */
function computeMoonSphereMap() {
  const src = downscale(state.starless, state.depthRes);
  const w = src.width, h = src.height;
  const d = state.moonDisk;
  const cx = d.cx * w, cy = d.cy * h, R = Math.max(2, d.r * w);
  let a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const rr = Math.hypot(x - cx, y - cy) / R;
      // Himmel liegt auf derselben Grundtiefe wie der Mondrand (0.5):
      // KEIN Tiefensprung an der Scheibenkante - der Sprung erzeugte beim
      // Vorbeiflug ein Echo/Doppelbild des Mondes (die Warp-Iteration fand
      // am Rand die falsche von zwei Loesungen). Der Himmel ist schwarz,
      // seine Bewegung ist unsichtbar - die Kugel waechst nur nach vorn
      a[y * w + x] = rr >= 1 ? 0.5 : 0.5 + 0.38 * Math.sqrt(1 - rr * rr);
    }
  }
  const b = new Float32Array(w * h);
  const rM = Math.max(1, Math.round(2 * state.depthRes / 768));
  boxBlurH(a, b, w, h, rM);
  boxBlurV(b, a, w, h, rM);
  const dst = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < a.length; i++, j += 4) {
    const v = Math.round(Math.min(1, Math.max(0, a[i])) * 255);
    dst[j] = dst[j + 1] = dst[j + 2] = v;
    dst[j + 3] = 255;
  }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").putImageData(new ImageData(dst, w, h), 0, 0);
  return { canvas: c, data: dst, w, h };
}


/**
 * Importierte Tiefenkarte aufbereiten: Luminanz wird 1:1 uebernommen
 * (keine Kontraststreckung - gemalte Werte bleiben exakt), Glaettung
 * und Invertieren wirken wie bei der automatischen Karte.
 */
function computeCustomDepthMap(radius, invert, maxEdge) {
  const res = maxEdge || state.depthRes;
  const src = downscale(state.customDepth, res);
  const w = src.width, h = src.height;
  const data = src.getContext("2d").getImageData(0, 0, w, h).data;
  let a = new Float32Array(w * h);
  for (let i = 0, j = 0; i < a.length; i++, j += 4) {
    a[i] = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) / 255;
  }
  const r = Math.max(1, Math.round(radius * res / 768));
  const b = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    boxBlurH(a, b, w, h, r);
    boxBlurV(b, a, w, h, r);
  }
  const dst = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < a.length; i++, j += 4) {
    let d = a[i];
    if (invert) d = 1 - d;
    const v = Math.round(Math.min(1, Math.max(0, d)) * 255);
    dst[j] = dst[j + 1] = dst[j + 2] = v;
    dst[j + 3] = 255;
  }
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").putImageData(new ImageData(dst, w, h), 0, 0);
  return { canvas: c, data: dst, w, h };
}

function buildDepthMap() {
  if (!state.starless) return;
  const m = state.moonMode && state.moonDisk
    ? computeMoonSphereMap()
    : state.customDepth
      ? computeCustomDepthMap(state.smooth, state.invertDepth)
      : computeLuminanceMap(state.smooth, state.invertDepth);
  state.depthCanvas = m.canvas;
  state.depthData = { data: m.data, w: m.w, h: m.h }; // CPU-Kopie für die Klick-Zuordnung

  if (texDepth) gl.deleteTexture(texDepth);
  texDepth = makeTexture(m.canvas);

  const pv = $("depthPreview");
  pv.height = Math.round(160 * m.h / m.w) || 107;
  pv.getContext("2d").drawImage(m.canvas, 0, 0, pv.width, pv.height);
}

/**
 * Eigene Helligkeitsmaske für die Galaxien-Rotation: unabhängig von der
 * Parallaxe-Tiefenkarte, mit eigener (typisch geringerer) Glättung – so
 * folgt die Drehung der Galaxienstruktur statt dem groben Tiefenverlauf.
 */
function buildSpinMask() {
  if (!state.starless) return;
  const m = computeLuminanceMap(state.spinMaskSmooth, false);
  if (texSpinMask) gl.deleteTexture(texSpinMask);
  texSpinMask = makeTexture(m.canvas);
  // CPU-Kopie für die Marker-Projektion (spinMaskAtPlane)
  const g = m.canvas.getContext("2d");
  state.spinMaskData = {
    w: m.canvas.width,
    h: m.canvas.height,
    data: g.getImageData(0, 0, m.canvas.width, m.canvas.height).data,
  };
}

function boxBlurH(src, dst, w, h, r) {
  const div = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + clampi(x, w)];
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc / div;
      acc += src[row + clampi(x + r + 1, w)] - src[row + clampi(x - r, w)];
    }
  }
}

function boxBlurV(src, dst, w, h, r) {
  const div = r * 2 + 1;
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += src[clampi(y, h) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc / div;
      acc += src[clampi(y + r + 1, h) * w + x] - src[clampi(y - r, h) * w + x];
    }
  }
}

function clampi(v, n) { return v < 0 ? 0 : (v >= n ? n - 1 : v); }

// ---------------------------------------------------------------- Stern-Extraktion


/**
 * Textur-Atlas mit den echten Pixel-Abbildern der hellsten Sterne: je Stern
 * wird ein Ausschnitt (inkl. Halo/Spikes-Rand) aus dem Sternmasken-Bild in
 * einen 2048er-Atlas gepackt (Shelf-Packing, hellste zuerst). Die Eintraege
 * speichern Zentrum (Textur-UV, y bereits geflippt wie makeTexture), halbe
 * Groesse in Atlas-UV und halbe Groesse in Ebenen-Einheiten.
 */
function buildStarAtlas(list, srcCanvas, srcData) {
  const A = 2048;
  const c = document.createElement("canvas");
  c.width = A; c.height = A;
  const g = c.getContext("2d");
  const entries = new Float32Array(list.length * 4).fill(-1);
  const h = srcCanvas.height;
  // Nachbarsuche ueber ein grobes Raster: fremde Sternkerne muessen aus
  // jedem Patch entfernt werden - sonst rendert ein enges Paar den Partner
  // DOPPELT (eigenes Sprite + Abbild im Patch des Nachbarn) und leuchtet
  // beim additiven Blending viel zu hell (Anthonys Doppelstern-Report)
  const CELL = 64;
  const gw = Math.ceil(srcCanvas.width / CELL), gh = Math.ceil(srcCanvas.height / CELL);
  const grid = new Map();
  list.forEach((st, i) => {
    const key = ((st.x / CELL) | 0) + ((st.y / CELL) | 0) * gw;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  });
  const coreR = (st) => Math.sqrt(st.area / Math.PI) * 0.9 + 2.5;
  // Enge Paare: ueberlappen sich die Kerne, wird der schwaechere Stern vom
  // helleren "absorbiert" - er bleibt im Patch des Partners sichtbar, sein
  // eigenes Partikel wird im Echtbild-Modus ausgeblendet (Marke -2). Ein
  // Ausradieren wuerde sonst den eigenen Kern mit treffen (Anthonys Paar)
  const absorbed = new Uint8Array(list.length);
  let x = 0, y = 0, rowH = 0, packed = 0;
  const N = Math.min(list.length, 2500);
  for (let i = 0; i < N; i++) {
    if (absorbed[i]) continue;
    const st = list[i];
    // Ausschnitt grosszuegig: 2,4x der Kernradius nimmt Halo und Spikes mit
    const rPx = Math.min(90, Math.max(4, Math.ceil(coreR(st) * 2.4)));
    const s = 2 * rPx + 2;
    if (x + s > A) { x = 0; y += rowH + 1; rowH = 0; }
    if (y + s > A) break;
    g.drawImage(srcCanvas, st.x - rPx, st.y - rPx, 2 * rPx, 2 * rPx, x + 1, y + 1, 2 * rPx, 2 * rPx);
    // Fremde Sternkerne im Patch weich ausradieren (schwarz = additiv nichts)
    const c0x = ((st.x - rPx) / CELL | 0) - 1, c1x = ((st.x + rPx) / CELL | 0) + 1;
    const c0y = ((st.y - rPx) / CELL | 0) - 1, c1y = ((st.y + rPx) / CELL | 0) + 1;
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const cell = grid.get(cx + cy * gw);
        if (!cell) continue;
        for (const j of cell) {
          if (j === i || absorbed[j]) continue;
          const nb = list[j];
          const dx = nb.x - st.x, dy = nb.y - st.y;
          const dist = Math.hypot(dx, dy);
          if (dist > rPx + coreR(nb) * 2) continue;
          if (j > i && dist < (coreR(st) + coreR(nb)) * 0.95) {
            // Kerne ueberlappen: Partner absorbieren statt radieren
            absorbed[j] = 1;
            entries[j * 4] = -2;
            continue;
          }
          // Schwache Nachbarn im Saum NICHT ausradieren: ihr doppelter
          // Beitrag ist unsichtbar, ein Loch im Saum faellt dagegen auf
          if (nb.flux < st.flux * 0.03) continue;
          // Hellere Nachbarn weich ausradieren - Radius so begrenzen, dass
          // der EIGENE Kern nie mit getroffen wird
          const eraseR = Math.min(coreR(nb) * 2.0, Math.max(0, dist - coreR(st) * 0.8));
          if (eraseR < 1.5) continue;
          const px = x + 1 + rPx + dx, py = y + 1 + rPx + dy;
          // Loch mit der Saumfarbe fuellen statt schwarz: der Saum eines
          // Sterns ist radialsymmetrisch - die Farbe an der gespiegelten
          // Stelle (gleicher Abstand, gegenueber) ist ein sauberer Ersatz
          // Direkt aus dem ImageData der Erkennung lesen (getImageData auf
          // dem Atlas erzwang tausende langsame Canvas-Synchronisationen)
          let fill = "rgba(0,0,0,1)";
          const mx = Math.round(st.x - dx), my = Math.round(st.y - dy);
          if (srcData && mx >= 0 && my >= 0 && mx < srcCanvas.width && my < srcCanvas.height) {
            const mi = (my * srcCanvas.width + mx) * 4;
            fill = `rgba(${srcData[mi]},${srcData[mi + 1]},${srcData[mi + 2]},1)`;
          }
          const grad = g.createRadialGradient(px, py, 0, px, py, eraseR);
          grad.addColorStop(0, fill);
          grad.addColorStop(0.6, fill.replace(",1)", ",0.9)"));
          grad.addColorStop(1, fill.replace(",1)", ",0)"));
          g.fillStyle = grad;
          g.beginPath();
          g.arc(px, py, eraseR, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    entries[i * 4]     = (x + 1 + rPx) / A;       // Zentrum u
    entries[i * 4 + 1] = 1 - (y + 1 + rPx) / A;   // Zentrum v (Flip wie makeTexture)
    entries[i * 4 + 2] = rPx / A;                 // halbe Groesse in Atlas-UV
    entries[i * 4 + 3] = rPx / h;                 // halbe Groesse in Ebenen-Einheiten
    x += s; rowH = Math.max(rowH, s);
    packed++;
  }
  return { canvas: c, entries, packed };
}

/**
 * Findet Sterne in der Maske über Zusammenhangskomponenten und baut den
 * GPU-Puffer: pro Stern [x, y, helligkeit, größe, r, g, b] in Ebenen-Einheiten.
 * Die Tiefen-Ebene wird erst im Vertexshader aus Seed/Streuung/Abstand bestimmt.
 */
function buildStarBuffer() {
  if (!state.stars) { state.maskStarFloats = null; state.maskStarCount = 0; uploadStars(); return; }
  const src = downscale(state.stars, 3000);
  const w = src.width, h = src.height;
  const data = src.getContext("2d").getImageData(0, 0, w, h).data;
  const imgAspect = state.stars.width / state.stars.height;

  const lum = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    lum[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  }

  const THRESH = 24;
  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(1 << 16);
  const found = [];

  for (let i = 0; i < lum.length; i++) {
    if (visited[i] || lum[i] < THRESH) continue;
    let sp = 0;
    stack[sp++] = i;
    visited[i] = 1;
    let flux = 0, cx = 0, cy = 0, area = 0, peak = 0;
    let sr = 0, sg = 0, sb = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      const v = lum[idx];
      const x = idx % w, y = (idx / w) | 0;
      flux += v; cx += x * v; cy += y * v; area++;
      if (v > peak) peak = v;
      const j = idx * 4;
      sr += data[j] * v; sg += data[j + 1] * v; sb += data[j + 2] * v;
      if (area > 4000) break; // Ausreißer (Nebelreste in der Maske) begrenzen
      if (x > 0     && !visited[idx - 1] && lum[idx - 1] >= THRESH && sp < stack.length) { visited[idx - 1] = 1; stack[sp++] = idx - 1; }
      if (x < w - 1 && !visited[idx + 1] && lum[idx + 1] >= THRESH && sp < stack.length) { visited[idx + 1] = 1; stack[sp++] = idx + 1; }
      if (y > 0     && !visited[idx - w] && lum[idx - w] >= THRESH && sp < stack.length) { visited[idx - w] = 1; stack[sp++] = idx - w; }
      if (y < h - 1 && !visited[idx + w] && lum[idx + w] >= THRESH && sp < stack.length) { visited[idx + w] = 1; stack[sp++] = idx + w; }
    }
    if (flux <= 0) continue;
    found.push({
      x: cx / flux, y: cy / flux,
      flux, area, peak,
      r: sr / flux, g: sg / flux, b: sb / flux,
    });
  }

  found.sort((p, q) => q.flux - p.flux);
  // Obergrenze für Masken-Sterne: moderne GPUs schaffen das locker, das
  // Gaia-Matching läuft über ein Suchgitter (linear) - bei dichten
  // Milchstraßenfeldern schnitt die alte 9000er-Grenze real ab
  const MAX = 25000;
  const list = found.slice(0, MAX);

  const FLOATS = 7;
  const buf = new Float32Array(list.length * FLOATS);
  let o = 0;
  for (const st of list) {
    const u = st.x / w, v = st.y / h;
    const bright = Math.min(1, st.flux / 20000);
    const radiusPx = Math.max(1.1, Math.sqrt(st.area / Math.PI) * 0.9 + bright * 2.5);
    const size = radiusPx / h; // Radius in Ebenen-Einheiten

    const norm = Math.max(st.r, st.g, st.b, 1);
    buf[o++] = (u - 0.5) * imgAspect;
    buf[o++] = 0.5 - v;               // ImageData ist top-down, Ebene ist y-up
    buf[o++] = bright;
    buf[o++] = size;
    buf[o++] = 0.35 + 0.65 * st.r / norm;
    buf[o++] = 0.35 + 0.65 * st.g / norm;
    buf[o++] = 0.35 + 0.65 * st.b / norm;
  }

  state.maskStarCount = list.length;
  state.maskStarFloats = buf;
  // Echte Sternabbilder: Atlas aus demselben Arbeits-Canvas wie die Erkennung
  state.starAtlas = buildStarAtlas(list, src, data);
  if (texStarAtlas) gl.deleteTexture(texStarAtlas);
  texStarAtlas = makeTexture(state.starAtlas.canvas);
  // Neue Maske -> alte Gaia-Zuordnung passt nicht mehr. Wenn der Katalog
  // gecacht ist, gleichen wir sofort neu ab - der Wissenschafts-Modus soll
  // einen Masken-Neuaufbau überleben, statt kommentarlos herauszufallen
  state.gaiaDepth = null;
  state.gaiaColorRGB = null;
  state.gaiaPM = null;
  if (state.gaiaCatalog && state.wcs && typeof matchGaia === "function") {
    try { matchGaia(state.gaiaCatalog); } catch { /* dann eben neu abgleichen */ }
  }
  if (typeof updateGaiaStatus === "function") updateGaiaStatus();
  uploadStars();
}

// ------------------------------------------------- Echte Tiefen (WCS + Gaia)

/**
 * Liest die Plate-Solve-Lösung (WCS) aus einem FITS-Header: CRVAL/CRPIX/CD-
 * Matrix einer TAN-Projektion. Es werden nur die ersten Header-Blöcke gelesen,
 * das Bild selbst bleibt unangetastet (funktioniert daher auch mit großen
 * FITS-Dateien und mit reinen .wcs-Headerdateien von astrometry.net).
 */
function parseWcsHeader(bytes) {
  const text = new TextDecoder("ascii").decode(bytes);
  const h = {};
  for (let off = 0; off + 80 <= text.length; off += 80) {
    const card = text.slice(off, off + 80);
    const key = card.slice(0, 8).trim();
    if (key === "END") break;
    if (card[8] !== "=") continue;
    let val = card.slice(10).split("/")[0].trim();
    if (val.startsWith("'")) val = val.slice(1, val.lastIndexOf("'")).trim();
    h[key] = val;
  }
  const num = (k) => (h[k] !== undefined ? parseFloat(h[k]) : undefined);
  const ctype = (h.CTYPE1 || "").toUpperCase();
  if (h.CTYPE1 !== undefined && !ctype.includes("TAN")) {
    throw new Error("CTYPE " + h.CTYPE1);
  }
  const crval1 = num("CRVAL1"), crval2 = num("CRVAL2");
  const crpix1 = num("CRPIX1"), crpix2 = num("CRPIX2");
  if ([crval1, crval2, crpix1, crpix2].some((v) => v === undefined || isNaN(v))) {
    throw new Error("no WCS");
  }
  // CD-Matrix direkt, oder aus PC-Matrix/CDELT(+CROTA2) zusammensetzen
  let cd11 = num("CD1_1"), cd12 = num("CD1_2"), cd21 = num("CD2_1"), cd22 = num("CD2_2");
  if (cd11 === undefined) {
    const cdelt1 = num("CDELT1"), cdelt2 = num("CDELT2");
    if (cdelt1 === undefined || cdelt2 === undefined) throw new Error("no CD/CDELT");
    const pc11 = num("PC1_1"), rot = (num("CROTA2") || 0) * Math.PI / 180;
    if (pc11 !== undefined) {
      cd11 = cdelt1 * pc11; cd12 = cdelt1 * (num("PC1_2") || 0);
      cd21 = cdelt2 * (num("PC2_1") || 0); cd22 = cdelt2 * (num("PC2_2") || 1);
    } else {
      cd11 = cdelt1 * Math.cos(rot); cd12 = -cdelt2 * Math.sin(rot);
      cd21 = cdelt1 * Math.sin(rot); cd22 = cdelt2 * Math.cos(rot);
    }
  }
  cd12 = cd12 || 0; cd21 = cd21 || 0;
  const det = cd11 * cd22 - cd12 * cd21;
  if (!det) throw new Error("singular CD");
  return {
    crval1, crval2, crpix1, crpix2,
    cd: [cd11, cd12, cd21, cd22],
    icd: [cd22 / det, -cd12 / det, -cd21 / det, cd11 / det],
    naxis1: num("NAXIS1") || num("IMAGEW") || 0,
    naxis2: num("NAXIS2") || num("IMAGEH") || 0,
  };
}

const D2R = Math.PI / 180, R2D = 180 / Math.PI;

/** FITS-Pixel (1-basiert) -> RA/Dec in Grad (inverse Gnomonik). */
function wcsPix2Sky(wcs, px, py) {
  const xi = (wcs.cd[0] * (px - wcs.crpix1) + wcs.cd[1] * (py - wcs.crpix2)) * D2R;
  const eta = (wcs.cd[2] * (px - wcs.crpix1) + wcs.cd[3] * (py - wcs.crpix2)) * D2R;
  const ra0 = wcs.crval1 * D2R, dec0 = wcs.crval2 * D2R;
  const rho = Math.hypot(xi, eta);
  if (rho < 1e-12) return { ra: wcs.crval1, dec: wcs.crval2 };
  const c = Math.atan(rho);
  const dec = Math.asin(Math.cos(c) * Math.sin(dec0) + (eta * Math.sin(c) * Math.cos(dec0)) / rho);
  const ra = ra0 + Math.atan2(xi * Math.sin(c),
    rho * Math.cos(dec0) * Math.cos(c) - eta * Math.sin(dec0) * Math.sin(c));
  return { ra: ((ra * R2D) % 360 + 360) % 360, dec: dec * R2D };
}

/** RA/Dec in Grad -> FITS-Pixel (1-basiert), null wenn hinter dem Himmelspol. */
function wcsSky2Pix(wcs, ra, dec) {
  const ra0 = wcs.crval1 * D2R, dec0 = wcs.crval2 * D2R;
  const a = ra * D2R, d = dec * D2R;
  const cosc = Math.sin(dec0) * Math.sin(d) + Math.cos(dec0) * Math.cos(d) * Math.cos(a - ra0);
  if (cosc <= 1e-6) return null;
  const xi = (Math.cos(d) * Math.sin(a - ra0)) / cosc * R2D;
  const eta = (Math.cos(dec0) * Math.sin(d) - Math.sin(dec0) * Math.cos(d) * Math.cos(a - ra0)) / cosc * R2D;
  return {
    px: wcs.crpix1 + wcs.icd[0] * xi + wcs.icd[1] * eta,
    py: wcs.crpix2 + wcs.icd[2] * xi + wcs.icd[3] * eta,
  };
}

/** Winkelabstand zweier Himmelspositionen in Grad. */
function angSep(ra1, dec1, ra2, dec2) {
  const d1 = dec1 * D2R, d2 = dec2 * D2R, dra = (ra2 - ra1) * D2R;
  const s = Math.sin((d2 - d1) / 2) ** 2 + Math.cos(d1) * Math.cos(d2) * Math.sin(dra / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(s))) * R2D;
}

/** Gaia DR3 über die VizieR-TAP-API abfragen (CSV, CORS-frei). */
async function queryGaia(ra, dec, radiusDeg) {
  const adql = `SELECT TOP 50000 RA_ICRS,DE_ICRS,Gmag,Plx,"BP-RP",pmRA,pmDE FROM "I/355/gaiadr3" ` +
    `WHERE 1=CONTAINS(POINT('ICRS',RA_ICRS,DE_ICRS),` +
    `CIRCLE('ICRS',${ra.toFixed(6)},${dec.toFixed(6)},${radiusDeg.toFixed(4)})) ` +
    `AND Plx>0.05 ORDER BY Gmag`;
  const url = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=csv&QUERY=" +
    encodeURIComponent(adql);
  const lines = (await fetchTapCsv(url)).trim().split("\n");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(",");
    if (p.length < 4) continue;
    const ra_ = +p[0], dec_ = +p[1], plx = +p[3];
    const bprp = p.length > 4 && p[4] !== "" ? +p[4] : NaN;
    const pmra = p.length > 5 && p[5] !== "" ? +p[5] : NaN;  // mas/Jahr (inkl. cos δ)
    const pmde = p.length > 6 && p[6] !== "" ? +p[6] : NaN;
    if (isFinite(ra_) && isFinite(dec_) && plx > 0) out.push({ ra: ra_, dec: dec_, plx, bprp, pmra, pmde });
  }
  return out;
}

/**
 * Gaia-Farbindex BP-RP -> RGB-Farbton: Näherung der Farbtemperatur
 * (Ballesteros-Formel über B-V) und daraus die Schwarzkörperfarbe.
 * Zurückgegeben wird der auf max=1 normierte Farbton (Helligkeit kommt
 * weiterhin aus dem Foto).
 */
function bprpToRgb(bprp) {
  const bv = Math.min(2.0, Math.max(-0.4, 0.8 * bprp - 0.03));
  let t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)); // Kelvin
  t = Math.min(30000, Math.max(2200, t)) / 100;
  let r, g, b;
  if (t <= 66) { r = 255; } else { r = 329.7 * Math.pow(t - 60, -0.1332); }
  if (t <= 66) { g = 99.47 * Math.log(t) - 161.12; } else { g = 288.1 * Math.pow(t - 60, -0.0755); }
  if (t >= 66) { b = 255; } else if (t <= 19) { b = 0; } else { b = 138.52 * Math.log(t - 10) - 305.04; }
  const m = Math.max(r, g, b, 1);
  return [
    Math.min(1, Math.max(0, r / m)),
    Math.min(1, Math.max(0, g / m)),
    Math.min(1, Math.max(0, b / m)),
  ];
}

/** 3x3-Gleichungssystem lösen (für die Affin-Anpassung). */
function solve3(M, b) {
  const [[a, c, d], [e, f, g], [h, k, l]] = M;
  const det = a * (f * l - g * k) - c * (e * l - g * h) + d * (e * k - f * h);
  if (Math.abs(det) < 1e-12) return null;
  const inv = [
    [(f * l - g * k) / det, (d * k - c * l) / det, (c * g - d * f) / det],
    [(g * h - e * l) / det, (a * l - d * h) / det, (d * e - a * g) / det],
    [(e * k - f * h) / det, (c * h - a * k) / det, (a * f - c * e) / det],
  ];
  return [
    inv[0][0] * b[0] + inv[0][1] * b[1] + inv[0][2] * b[2],
    inv[1][0] * b[0] + inv[1][1] * b[1] + inv[1][2] * b[2],
    inv[2][0] * b[0] + inv[2][1] * b[1] + inv[2][2] * b[2],
  ];
}

/**
 * Affine Abbildung Katalog -> Maske per kleinster Quadrate aus groben
 * Treffer-Paaren [gx, gy, dx, dy] schätzen.
 */
function affineFit(pairs) {
  let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0;
  let bx0 = 0, bx1 = 0, bx2 = 0, by0 = 0, by1 = 0, by2 = 0;
  for (const [gx, gy, dx, dy] of pairs) {
    sxx += gx * gx; sxy += gx * gy; sx += gx; syy += gy * gy; sy += gy;
    bx0 += gx * dx; bx1 += gy * dx; bx2 += dx;
    by0 += gx * dy; by1 += gy * dy; by2 += dy;
  }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, pairs.length]];
  const ax = solve3(M, [bx0, bx1, bx2]);
  const ay = solve3(M, [by0, by1, by2]);
  return ax && ay ? { ax, ay } : null;
}

/**
 * Ordnet Gaia-Sterne den erkannten Masken-Sternen zu und leitet echte Tiefen
 * ab. Die y-Orientierung des FITS (Zeile 1 unten oder oben) wird automatisch
 * bestimmt: Es gewinnt die Variante mit den meisten Treffern. Ein zweiter
 * Durchgang schätzt eine Affin-Korrektur aus den groben Treffern (gleicht
 * kleine Crop-/Skalierungs-/Drehungs-Abweichungen aus) und ordnet dann mit
 * enger Toleranz neu zu.
 */
function matchGaia(gaiaStars) {
  const wcs = state.wcs, mask = state.maskStarFloats;
  const n = state.maskStarCount;
  const imgAspect = state.stars.width / state.stars.height;
  const nax1 = wcs.naxis1 || state.stars.width, nax2 = wcs.naxis2 || state.stars.height;

  // Erkannte Sterne in ein Suchgitter legen (Ebenen-Einheiten, Bildhöhe = 1)
  const tolCoarse = 0.012; // Durchgang 1: ~1,2 % der Bildhöhe
  const tolFine = 0.0045;  // Durchgang 2 (nach Affin-Korrektur)
  const cell = tolCoarse;
  const grid = new Map();
  for (let i = 0; i < n; i++) {
    const x = mask[i * 7], y = mask[i * 7 + 1];
    const key = Math.round(x / cell) + ":" + Math.round(y / cell);
    (grid.get(key) || grid.set(key, []).get(key)).push(i);
  }
  const nearest = (x, y, used, tol) => {
    let best = -1, bd = tol * tol;
    const gx = Math.round(x / cell), gy = Math.round(y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const i of grid.get((gx + dx) + ":" + (gy + dy)) || []) {
        if (used[i]) continue;
        const ddx = mask[i * 7] - x, ddy = mask[i * 7 + 1] - y;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < bd) { bd = d2; best = i; }
      }
    }
    return best;
  };

  // Katalogsterne in Ebenen-Koordinaten projizieren (je y-Konvention);
  // Reihenfolge bleibt hellste zuerst (Abfrage ist nach Gmag sortiert)
  const project = (flipY) => {
    const pts = [];
    for (const g of gaiaStars) {
      const p = wcsSky2Pix(wcs, g.ra, g.dec);
      if (!p) continue;
      let u = p.px / nax1, v = flipY ? 1 - p.py / nax2 : p.py / nax2;
      if (state.flipH && !state.flipOnlyStarless) u = 1 - u;
      if (state.flipV && !state.flipOnlyStarless) v = 1 - v;
      if (u < -0.03 || u > 1.03 || v < -0.03 || v > 1.03) continue;
      pts.push({ ...g, x: (u - 0.5) * imgAspect, y: 0.5 - v });
    }
    return pts;
  };
  const runMatch = (pts, tol) => {
    const used = new Uint8Array(n), pairs = [];
    for (const g of pts) {
      const i = nearest(g.x, g.y, used, tol);
      if (i >= 0) { used[i] = 1; pairs.push({ i, g }); }
    }
    return pairs;
  };

  // Durchgang 1 (grob) für beide y-Konventionen, die bessere gewinnt
  const ptsA = project(true), ptsB = project(false);
  const pairsA = runMatch(ptsA, tolCoarse), pairsB = runMatch(ptsB, tolCoarse);
  const flipUsed = pairsA.length >= pairsB.length;
  const pts = flipUsed ? ptsA : ptsB;
  let pairs = flipUsed ? pairsA : pairsB;
  let fitUsed = null;

  // Durchgang 2: Affin-Korrektur schätzen und enger neu zuordnen; das
  // Ergebnis zählt nur, wenn es mehr Treffer liefert
  if (pairs.length >= 20) {
    const fit = affineFit(pairs.map(({ i, g }) => [g.x, g.y, mask[i * 7], mask[i * 7 + 1]]));
    if (fit) {
      const warped = pts.map((g) => ({
        ...g,
        x: fit.ax[0] * g.x + fit.ax[1] * g.y + fit.ax[2],
        y: fit.ay[0] * g.x + fit.ay[1] * g.y + fit.ay[2],
      }));
      const refined = runMatch(warped, tolFine);
      if (refined.length > pairs.length) { pairs = refined; fitUsed = fit; }
    }
  }
  if (pairs.length < 5) return null;

  // Himmelskoordinate -> Ebenen-Position unter der Gewinner-Transformation
  // (für die Eigenbewegungs-Vektoren)
  const planeOf = (ra, dec) => {
    const p = wcsSky2Pix(wcs, ra, dec);
    if (!p) return null;
    let u = p.px / nax1, v = flipUsed ? 1 - p.py / nax2 : p.py / nax2;
    if (state.flipH && !state.flipOnlyStarless) u = 1 - u;
    if (state.flipV && !state.flipOnlyStarless) v = 1 - v;
    let x = (u - 0.5) * imgAspect, y = 0.5 - v;
    if (fitUsed) {
      const nx = fitUsed.ax[0] * x + fitUsed.ax[1] * y + fitUsed.ax[2];
      const ny = fitUsed.ay[0] * x + fitUsed.ay[1] * y + fitUsed.ay[2];
      x = nx; y = ny;
    }
    return { x, y };
  };

  // Entfernungen (pc) logarithmisch auf die Tiefenebenen mappen: nahe Sterne
  // (10. Perzentil) -> vorn, ferne (90. Perzentil) -> hinten
  const dists = pairs.map(({ g }) => 1000 / g.plx).sort((x, y) => x - y);
  const p10 = Math.log(dists[Math.floor(dists.length * 0.1)]);
  const p90 = Math.log(dists[Math.min(dists.length - 1, Math.floor(dists.length * 0.9))]);
  const span = Math.max(0.2, p90 - p10);
  const depth = new Float32Array(n).fill(-1);
  const colors = new Float32Array(n * 3).fill(-1);
  const pm = new Float32Array(n * 2); // Ebenen-Einheiten pro Jahr (0 = keine)
  const K = 20000; // Jahre für den Differenzenquotienten
  for (const { i, g } of pairs) {
    const t = Math.min(1, Math.max(0, (Math.log(1000 / g.plx) - p10) / span));
    depth[i] = 0.98 - t * 0.93; // nah = 0.98, fern = 0.05
    if (isFinite(g.bprp)) {
      const [cr, cg, cb] = bprpToRgb(g.bprp);
      colors[i * 3] = cr; colors[i * 3 + 1] = cg; colors[i * 3 + 2] = cb;
    }
    // Eigenbewegung (mas/Jahr, pmRA inkl. cos δ) -> Ebenen-Vektor pro Jahr
    if (isFinite(g.pmra) && isFinite(g.pmde) && Math.hypot(g.pmra, g.pmde) < 10000) {
      const cosd = Math.max(0.05, Math.cos(g.dec * D2R));
      const p0 = planeOf(g.ra, g.dec);
      const p1 = planeOf(g.ra + (g.pmra / 3.6e6) * K / cosd, g.dec + (g.pmde / 3.6e6) * K);
      if (p0 && p1) { pm[i * 2] = (p1.x - p0.x) / K; pm[i * 2 + 1] = (p1.y - p0.y) / K; }
    }
  }
  state.gaiaDepth = depth;
  state.gaiaColorRGB = colors;
  state.gaiaPM = pm;
  // Gewinner-Transformation merken (für Objekt-Beschriftungen)
  state.wcsFlip = flipUsed;
  state.wcsFit = fitUsed;
  state.gaiaInfo = {
    matched: pairs.length, total: n,
    dMin: Math.round(Math.exp(p10) * 3.262), dMax: Math.round(Math.exp(p90) * 3.262), // Lichtjahre
  };
  reprojectLabels();
  uploadStars();
  return state.gaiaInfo;
}

/**
 * Himmelskoordinate -> Ebenen-Position mit der aktuell bekannten Transformation
 * (y-Konvention und Affin-Korrektur aus dem Gaia-Abgleich, sonst Standard).
 */
/**
 * Beschriftungs-Positionen mit der aktuell besten Transformation neu
 * berechnen: Der Gaia-Abgleich ermittelt y-Konvention (Flip) und
 * Affin-Korrektur erst NACH einer evtl. schon gelaufenen Objekterkennung -
 * ohne Reprojektion blieben die Marker auf gespiegelten Positionen stehen.
 */
/** Nebeldichte (0..1) an einem Ebenen-Punkt - Gegenstück zum Dichte-Gate
 *  des Anker-Features im Stern-Shader (Luminanz des Starless-Bilds). */
function lumDensAtPlane(x, y, imgAspect) {
  const img = state.starless;
  if (!img) return 0;
  const uu = x / imgAspect + 0.5, vv = 0.5 - y;
  if (uu <= 0 || uu >= 1 || vv <= 0 || vv >= 1) return 0;
  const c = lumDensAtPlane._c || (lumDensAtPlane._c = document.createElement("canvas"));
  c.width = 1; c.height = 1;
  const cx = c.getContext("2d", { willReadFrequently: true });
  cx.drawImage(img.canvas, uu * img.width, vv * img.height, 1, 1, 0, 0, 1, 1);
  const d = cx.getImageData(0, 0, 1, 1).data;
  const lum = (0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]) / 255;
  const t = Math.min(1, Math.max(0, (lum - 0.05) / 0.25));
  return t * t * (3 - 2 * t);
}

function reprojectLabels() {
  if (!state.wcs) return;
  for (const list of [state.objChoices, state.labels]) {
    if (!list) continue;
    for (const it of list) {
      if (it.ra === undefined) continue;
      const p = planeOfSky(it.ra, it.dec);
      if (p) { it.x = p.x; it.y = p.y; }
      delete it._chipSide; delete it._up; // Seitenwahl neu treffen lassen
      delete it._msN; delete it._dens;     // Sterntiefe/Dichte neu ermitteln
    }
  }
}

function planeOfSky(ra, dec) {
  const wcs = state.wcs;
  const img = state.starless || state.stars;
  if (!wcs || !img) return null;
  const nax1 = wcs.naxis1 || img.width, nax2 = wcs.naxis2 || img.height;
  const imgAspect = img.width / img.height;
  const p = wcsSky2Pix(wcs, ra, dec);
  if (!p) return null;
  const flip = state.wcsFlip !== false; // Standard: FITS-Zeile 1 unten
  let u = p.px / nax1, v = flip ? 1 - p.py / nax2 : p.py / nax2;
  if (state.flipH && !state.flipOnlyStarless) u = 1 - u;
  if (state.flipV && !state.flipOnlyStarless) v = 1 - v;
  let x = (u - 0.5) * imgAspect, y = 0.5 - v;
  const fit = state.wcsFit;
  if (fit) {
    const nx = fit.ax[0] * x + fit.ax[1] * y + fit.ax[2];
    const ny = fit.ay[0] * x + fit.ay[1] * y + fit.ay[2];
    x = nx; y = ny;
  }
  return { x, y };
}

// ---------------------------------------------------------------- Stern-Generator

/** Deterministischer Zufallsgenerator (für reproduzierbare Sternfelder). */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Erzeugt synthetische Sterne: Helligkeit nach Potenzgesetz (viele schwache,
 * wenige helle), Farben entlang der Sternsequenz (blau-weiß bis rötlich),
 * Positionen mit Rand über das Bild hinaus, damit beim seitlichen Flug und
 * bei starker Parallaxe neue Sterne ins Bild nachrücken. Der 🎲-Button
 * (Seed) würfelt eine neue Anordnung.
 */
function generateStars() {
  const n = state.genStars;
  if (n <= 0) return new Float32Array(0);
  const imgAspect = state.starless
    ? state.starless.width / state.starless.height
    : (state.stars ? state.stars.width / state.stars.height : 16 / 9);
  const rnd = mulberry32(Math.floor(state.seed * 65536) + 7);
  const M = 1.3; // 30 % Rand jenseits der Bildkanten
  const buf = new Float32Array(n * 7);
  let o = 0;
  for (let i = 0; i < n; i++) {
    const x = (rnd() - 0.5) * imgAspect * M;
    const y = (rnd() - 0.5) * M;
    const bright = Math.pow(rnd(), 3.2) * 0.9 + 0.03;
    const radiusPx = 0.8 + bright * 3.2 + rnd() * 0.9;
    const pick = rnd();
    let r, g, b;
    if (pick < 0.22)      { r = 0.72; g = 0.80; b = 1.00; } // blau-weiß
    else if (pick < 0.55) { r = 0.95; g = 0.95; b = 1.00; } // weiß
    else if (pick < 0.78) { r = 1.00; g = 0.93; b = 0.80; } // gelblich-weiß
    else if (pick < 0.93) { r = 1.00; g = 0.82; b = 0.62; } // orange
    else                  { r = 1.00; g = 0.66; b = 0.48; } // rötlich
    buf[o++] = x;
    buf[o++] = y;
    buf[o++] = bright;
    buf[o++] = radiusPx / 1500; // Radius in Ebenen-Einheiten (nominale Höhe)
    buf[o++] = r;
    buf[o++] = g;
    buf[o++] = b;
  }
  return buf;
}

/**
 * Masken-Sterne + generierte Sterne in den GPU-Puffer laden.
 * GPU-Layout: 8 Floats pro Stern [x, y, helligkeit, größe, r, g, b, gaia];
 * gaia = echte Tiefe 0..1 (aus state.gaiaDepth) oder -1, wenn nicht zugeordnet.
 */
function uploadStars() {
  const mask = state.maskStarFloats || new Float32Array(0);
  const gen = generateStars();
  const nMask = mask.length / 7, nGen = gen.length / 7;
  const n = nMask + nGen;
  state.starCount = n;
  if (!n) return;

  const F = 14; // [x, y, hell, größe, r, g, b, gaia, pmx, pmy, atlasU, atlasV, atlasHalfUv, atlasHalfPlane]
  const buf = new Float32Array(n * F);
  const gcol = state.gaiaColors && state.gaiaColorRGB ? state.gaiaColorRGB : null;
  const gpm = state.gaiaPM;
  const atl = state.starAtlas ? state.starAtlas.entries : null;
  for (let i = 0; i < nMask; i++) {
    buf.set(mask.subarray(i * 7, i * 7 + 7), i * F);
    buf[i * F + 7] = state.gaiaDepth ? state.gaiaDepth[i] : -1;
    if (atl && i * 4 + 3 < atl.length) {
      buf[i * F + 10] = atl[i * 4];
      buf[i * F + 11] = atl[i * 4 + 1];
      buf[i * F + 12] = atl[i * 4 + 2];
      buf[i * F + 13] = atl[i * 4 + 3];
    } else {
      buf[i * F + 10] = -1;
    }
    // Echte Katalogfarbe (nur Farbton) statt Fotofarbe, wenn aktiviert
    if (gcol && gcol[i * 3] >= 0) {
      buf[i * F + 4] = 0.35 + 0.65 * gcol[i * 3];
      buf[i * F + 5] = 0.35 + 0.65 * gcol[i * 3 + 1];
      buf[i * F + 6] = 0.35 + 0.65 * gcol[i * 3 + 2];
    }
    if (gpm) { buf[i * F + 8] = gpm[i * 2]; buf[i * F + 9] = gpm[i * 2 + 1]; }
  }
  for (let i = 0; i < nGen; i++) {
    buf.set(gen.subarray(i * 7, i * 7 + 7), (nMask + i) * F);
    buf[(nMask + i) * F + 7] = -1;
    buf[(nMask + i) * F + 10] = -1;
  }

  gl.bindVertexArray(starVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
  gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
  const stride = F * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 16);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 28);
  gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 2, gl.FLOAT, false, stride, 32);
  gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, stride, 40);
  gl.bindVertexArray(null);
}

// ------------------------------------------ Objekt-Overlay (Infokarte + Labels)

function overlayActive() {
  return (state.showLabels && state.labels && state.labels.some((l) => l.on)) ||
    (state.showInfo && state.objInfo);
}

/**
 * Zeichnet Infokarte und Feld-Beschriftungen in einen 2D-Kontext –
 * auflösungsunabhängig (alles relativ zur Höhe H), identisch für Vorschau
 * und Export. Die Labels folgen der Kamerafahrt (neutrale Tiefe).
 */
function drawOverlayTo(ctx, W, H, loopT, cam, fade) {
  if (!state.starless || !overlayActive()) return;
  // Schwarzblende des Videos mitmachen: Overlay nie vor dem Bild sichtbar
  const baseA = fade === undefined ? 1 : fade;
  if (baseA <= 0.01) return;
  // Beim Neustart der Zeitachse (Loop-Wiederholung, Export ab 0) die
  // gemerkten Chip-Seiten vergessen, damit jeder Durchlauf gleich aussieht
  if (state.labels && loopT + 0.5 < (drawOverlayTo._lastT || 0)) {
    for (const L of state.labels) { delete L._chipSide; delete L._up; }
  }
  drawOverlayTo._lastT = loopT;
  const lang = I18N.lang === "de" ? "de" : "en";
  const viewAspect = state.aspect;
  const imgAspect = state.starless.width / state.starless.height;
  const cover = coverBase(viewAspect, imgAspect);
  const scale = cover * cam.zoom;
  const rc = Math.cos(cam.angle), rs = Math.sin(cam.angle);
  // Marker exakt auf das Objekt pinnen: dieselbe tiefenabhängige
  // Transformation wie der Hintergrund-Shader (Parallaxe-Exponent + Kippen).
  // Eine tiefenneutrale Projektion würde beim Zoomen/Schwenken sichtbar
  // gegen das Objekt driften ("die Schrift springt").
  const parallax = state.parallax / 100;
  const depthRange = 0.85 * (0.4 + 1.8 * state.depthBoost / 100);
  const drK = parallax * depthRange;
  const bgTiltX = (state.tiltX / 100) * 0.08 + cam.tiltAddX + cam.driftTX * drK;
  const bgTiltY = (state.tiltY / 100) * 0.08 + cam.tiltAddY + cam.driftTY * drK;
  // Galaxien-Rotation: Objekte im Spin-Bereich wandern im Bild mit -
  // die Marker müssen dieselbe Verschiebung mitmachen wie der Hintergrund
  const spinAngle = state.spinSpeed * Math.PI / 180 * cam.te;
  const toScreen = (P) => {
    const S = spinDisplace(P.x, P.y, spinAngle);
    const d = state.objFar ? 0.02 : depthAtPlane(S.x, S.y, imgAspect);
    const ex = 1 + parallax * (d - 0.45) * depthRange;
    const scaleD = cover * Math.pow(cam.zoom, ex);
    const prx = (S.x - cam.cx - bgTiltX * (d - 0.45)) * scaleD;
    const pry = (S.y - cam.cy - bgTiltY * (d - 0.45)) * scaleD;
    const px = rc * prx - rs * pry, py = rs * prx + rc * pry;
    return { x: (px / viewAspect + 0.5) * W, y: (1 - (py + 0.5)) * H, scaleD };
  };
  // Stern-Labels folgen der STERN-Ebene: Sterne parallaxieren stärker als
  // der Nebel (Faktor 2,6 x Regler) - ein an den Nebel geklebter Marker
  // läuft seinem Stern beim Flug sichtbar davon. Tiefe wie im Stern-Shader:
  // Hash des nächstliegenden Maskensterns, ggf. Gaia-Tiefe, plus Verankerung
  const starParL = state.starPar / 100;
  const drKStarL = drK * 2.6 * starParL;
  const stTiltX = (state.tiltX / 100) * 0.08 + cam.tiltAddX + cam.driftTX * drKStarL;
  const stTiltY = (state.tiltY / 100) * 0.08 + cam.tiltAddY + cam.driftTY * drKStarL;
  const warpK = state.warp / 100;
  const sstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const starLabelDepth = (L) => {
    const m = state.maskStarFloats, n = state.maskStarCount;
    if (!m || !n) return null;
    if (L._msN !== n) {
      L._msN = n; L._msIdx = -1;
      let bd = 0.015 * 0.015; // nächster Maskenstern, max ~1,5 % Bildhöhe
      for (let i = 0; i < n; i++) {
        const dx = m[i * 7] - L.x, dy = m[i * 7 + 1] - L.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; L._msIdx = i; }
      }
    }
    if (L._msIdx < 0) return null;
    const i = L._msIdx;
    const ax = m[i * 7], ay = m[i * 7 + 1], bright = m[i * 7 + 2];
    let h = Math.sin(ax * 127.1 + ay * 311.7 + state.seed * 17.0) * 43758.5453;
    h -= Math.floor(h);
    let bs = bright * 0.12;
    if (state.starLayers > 0.5) { h = (Math.floor(h * state.starLayers) + 0.5) / state.starLayers; bs = 0; }
    let depth = Math.min(1, Math.max(0.02, state.starDist / 100 + (h - 0.5) * (state.spread / 100) * 1.15 + bs));
    const gd = state.gaiaDepth ? state.gaiaDepth[i] : -1;
    if (gd >= 0) {
      const amt = Math.max(state.gaiaAmt / 100, state.gaiaOnly ? 1 : 0);
      depth += (Math.min(1, Math.max(0.02, gd)) - depth) * amt;
    }
    return { depth, gd };
  };
  const toScreenStar = (L) => {
    const sd = starLabelDepth(L);
    if (!sd) return toScreen(L); // kein Maskenstern gefunden -> wie Nebel
    const S = state.spinStars ? spinDisplace(L.x, L.y, spinAngle) : { x: L.x, y: L.y };
    const dN = state.objFar ? 0.02 : depthAtPlane(L.x, L.y, imgAspect);
    let w = 0;
    if (state.anchorStars > 0) {
      if (L._dens === undefined) L._dens = lumDensAtPlane(L.x, L.y, imgAspect);
      const agree = sd.gd >= 0
        ? 1 - sstep(0.10, 0.28, Math.abs(Math.min(1, Math.max(0.02, sd.gd)) - dN))
        : 1;
      w = (state.anchorStars / 100) * L._dens * agree;
    }
    let ex = 1 + parallax * (sd.depth - 0.45) * depthRange * 2.6 * starParL + warpK * (0.4 + sd.depth);
    ex = ex * (1 - w) + (1 + parallax * (dN - 0.45) * depthRange) * w;
    ex = Math.max(ex, 0.12);
    const scaleD = cover * Math.pow(cam.zoom, ex);
    const tx = stTiltX * (sd.depth - 0.45) * (1 - w) + bgTiltX * (dN - 0.45) * w;
    const ty = stTiltY * (sd.depth - 0.45) * (1 - w) + bgTiltY * (dN - 0.45) * w;
    const prx = (S.x - cam.cx - tx) * scaleD;
    const pry = (S.y - cam.cy - ty) * scaleD;
    const px = rc * prx - rs * pry, py = rs * prx + rc * pry;
    return { x: (px / viewAspect + 0.5) * W, y: (1 - (py + 0.5)) * H, scaleD };
  };
  const u = H / 1000; // Skalierungseinheit (1000er-Referenzhöhe)
  const ACC = "rgba(157,184,255,";
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = baseA;

  // ---- Infokarte (blendet ein und wieder aus) ----
  // Vor den Beschriftungen gezeichnet, damit Chips ihr ausweichen können
  let cardRect = null;
  if (state.showInfo && state.objInfo) {
    const outStart = Math.min(7, state.duration - 2);
    const a = Math.min(1, Math.max(0, (loopT - 0.8) / 0.8)) *
      Math.min(1, Math.max(0, (outStart + 1 - loopT) / 1));
    if (a > 0.01) {
      ctx.globalAlpha = a * baseA;
      const info = state.objInfo;
      const f = info.facts ? info.facts[lang] : null;
      const title = f ? `${info.id} · ${f.name}` : info.id;
      const typeLine = f ? f.type : (OTYPE_NAMES[lang][info.otype] || "");
      const facts = [];
      if (f) {
        const LBL = lang === "de"
          ? { dist: "Entfernung", size: "Durchmesser", radius: "Gr\u00f6\u00dfe", stars: "Sterne", mass: "Masse", age: "Alter" }
          : { dist: "Distance", size: "Diameter", radius: "Size", stars: "Stars", mass: "Mass", age: "Age" };
        for (const k of ["dist", "size", "radius", "stars", "mass", "age"]) {
          if (f[k]) facts.push([LBL[k], f[k]]);
        }
      }
      const pad = 20 * u, colW = 195 * u;
      const cardW = Math.min(W - 40 * u, Math.max(300 * u, 2 * colW + 2 * pad));
      const rows = Math.ceil(facts.length / 2);
      const cardH = (56 + (typeLine ? 20 : 0) + rows * 40 + 14) * u;
      // Bei Hochformat (Reels/Shorts/TikTok) liegt unten die Bedienleiste
      // der Apps (Username, Audio, Caption) über dem Video – die Karte
      // sitzt dort in der Schutzzone, damit sie nicht verdeckt wird
      const bottomOff = (viewAspect < 1 ? 200 : 24) * u;
      const x0 = 24 * u, y0 = H - cardH - bottomOff;
      cardRect = { x0, y0, w: cardW, h: cardH };

      // Die Karte folgt dem gewählten Beschriftungs-Stil, damit die
      // Video-Overlays wie aus einem Guss wirken
      const style = state.labelStyle || "editorial";
      const monoF = `"Cascadia Code", "SF Mono", Consolas, monospace`;
      const T = {
        classic:   { box: "solid", fill: "rgba(8,10,16,0.74)", border: ACC + "0.5)", radius: 14,
                     tW: "800", tCol: "#eef2ff", subCol: "#aab8d8", kCol: "#ffffff", vCol: "#c6cfe4", accCol: ACC + "0.75)" },
        editorial: { box: "none", rule: "rgba(234,240,255,0.7)",
                     tW: "650", tCol: "#f2f5ff", subCol: "#c3cde6", kCol: "#eef2ff", vCol: "#c3cde6", accCol: "rgba(234,240,255,0.65)", shadow: true },
        glass:     { box: "solid", fill: "rgba(18,24,38,0.55)", border: "rgba(220,232,255,0.3)", radius: 18,
                     tW: "650", tCol: "#f2f6ff", subCol: "#b9c6e4", kCol: "#f2f6ff", vCol: "#b9c6e4", accCol: "rgba(220,232,255,0.6)" },
        hud:       { box: "hud", fill: "rgba(6,16,22,0.5)", border: "rgba(159,232,255,0.55)", radius: 2,
                     tW: "600", tCol: "#d9f4ff", subCol: "#8fd2ea", kCol: "#d9f4ff", vCol: "#9fdcf2", accCol: "rgba(159,232,255,0.7)", font: monoF, upper: true },
        micro:     { box: "none", rule: "rgba(255,255,255,0.5)",
                     tW: "600", tCol: "#ffffff", subCol: "#c9d2e8", kCol: "#ffffff", vCol: "#c9d2e8", accCol: "rgba(255,255,255,0.6)", shadow: true, upper: true },
        focus:     { box: "accent", fill: "rgba(16,21,34,0.85)", border: "rgba(167,196,255,0.45)", radius: 6,
                     tW: "650", tCol: "#eef3ff", subCol: "#a9b8d9", kCol: "#eef3ff", vCol: "#a9b8d9", accCol: ACC + "0.9)" },
      }[style] || { box: "solid", fill: "rgba(8,10,16,0.74)", border: ACC + "0.5)", radius: 14,
        tW: "800", tCol: "#eef2ff", subCol: "#aab8d8", kCol: "#ffffff", vCol: "#c6cfe4", accCol: ACC + "0.75)" };
      const fam = T.font || "system-ui, sans-serif";

      if (T.box !== "none") {
        ctx.fillStyle = T.fill;
        ctx.strokeStyle = T.border;
        ctx.lineWidth = 1.2 * u;
        ctx.beginPath();
        ctx.roundRect(x0, y0, cardW, cardH, T.radius * u);
        ctx.fill();
        ctx.stroke();
        if (T.box === "accent") {
          ctx.fillStyle = T.accCol;
          ctx.fillRect(x0, y0 + 5 * u, 3 * u, cardH - 10 * u);
        }
        if (T.box === "hud") {
          // Eckklammern wie bei den HUD-Labels
          ctx.strokeStyle = T.border;
          ctx.lineWidth = 1.8 * u;
          const arm = 15 * u;
          for (const [ex, ey] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            const cxp = x0 + ex * cardW, cyp = y0 + ey * cardH;
            ctx.beginPath();
            ctx.moveTo(cxp, cyp + (ey ? -arm : arm));
            ctx.lineTo(cxp, cyp);
            ctx.lineTo(cxp + (ex ? -arm : arm), cyp);
            ctx.stroke();
          }
        }
      }
      if (T.shadow) {
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur = 8 * u;
      }
      const titleTxt = T.upper ? title.toUpperCase() : title;
      ctx.fillStyle = T.tCol;
      ctx.font = `${T.tW} ${(T.upper ? 19 : 22) * u}px ${fam}`;
      ctx.fillText(titleTxt, x0 + pad, y0 + 33 * u, cardW - 2 * pad);
      if (T.box === "none") {
        // Feine Linie unter dem Titel ersetzt den Kasten
        ctx.strokeStyle = T.rule;
        ctx.lineWidth = 1 * u;
        ctx.beginPath();
        ctx.moveTo(x0 + pad, y0 + 41 * u);
        ctx.lineTo(x0 + cardW - pad, y0 + 41 * u);
        ctx.stroke();
      }
      if (typeLine) {
        ctx.fillStyle = T.subCol;
        ctx.font = `${13 * u}px ${fam}`;
        ctx.fillText(T.upper ? typeLine.toUpperCase() : typeLine, x0 + pad, y0 + 55 * u, cardW - 2 * pad);
      }
      facts.forEach(([k, v], i) => {
        const fx = x0 + pad + (i % 2) * colW;
        const fy = y0 + (typeLine ? 76 : 58) * u + Math.floor(i / 2) * 40 * u;
        ctx.fillStyle = T.kCol;
        ctx.font = `700 ${13.5 * u}px ${fam}`;
        ctx.fillText(T.upper ? k.toUpperCase() : k, fx, fy);
        ctx.fillStyle = T.vCol;
        ctx.font = `${13.5 * u}px ${fam}`;
        ctx.fillText(v, fx, fy + 17 * u, colW - 14 * u);
      });
      ctx.shadowBlur = 0;
      // Datenquelle dezent unter der Karte
      ctx.globalAlpha = a * 0.8 * baseA;
      ctx.fillStyle = T.accCol;
      ctx.font = `${10.5 * u}px ${fam}`;
      ctx.fillText("Data: SIMBAD/CDS · ESA Gaia DR3", x0 + 2 * u, y0 + cardH + 15 * u);
      ctx.globalAlpha = baseA;
    }
  }

  // ---- Feld-Beschriftungen (6 wählbare Stile) ----
  if (state.showLabels && state.labels) {
    const style = state.labelStyle || "editorial";
    const chipSafe = (viewAspect < 1 ? 200 : 8) * u; // Social-UI-Schutzzone
    // Platzierungs-System: belegte Flaechen (Infokarte + bereits gesetzte
    // Labels) sammeln und Kollisionen durch vertikales Ausweichen aufloesen -
    // Beschriftungen konnten sich sonst ueberlappen
    const placed = [];
    if (cardRect) placed.push({ x: cardRect.x0, y: cardRect.y0, w: cardRect.w, h: cardRect.h });
    const claim = (x, y, w, h, anchorY) => {
      const rr = { x, y, w, h };
      for (let it = 0; it < 5; it++) {
        let hit = null;
        for (const p of placed) {
          if (rr.x < p.x + p.w + 6 * u && rr.x + rr.w + 6 * u > p.x &&
              rr.y < p.y + p.h + 6 * u && rr.y + rr.h + 6 * u > p.y) { hit = p; break; }
        }
        if (!hit) break;
        rr.y = anchorY >= hit.y + hit.h / 2 ? hit.y + hit.h + 7 * u : hit.y - rr.h - 7 * u;
      }
      rr.y = Math.min(Math.max(rr.y, 8 * u), H - rr.h - chipSafe);
      placed.push(rr);
      return rr.y;
    };
    for (const L of state.labels) {
      if (!L.on) continue;
      const sp = L.star ? toScreenStar(L) : toScreen(L);
      if (sp.x < -80 * u || sp.x > W + 80 * u || sp.y < -80 * u || sp.y > H + 80 * u) continue;
      // Sanft ausblenden, wenn der Anker das Bild verlässt - vorher
      // verschwand die Beschriftung von einem Frame auf den nächsten
      const dOut = Math.max(0, -sp.x, sp.x - W, -sp.y, sp.y - H);
      const edgeA = 1 - Math.min(1, dOut / (70 * u));
      if (edgeA <= 0.01) continue;
      ctx.globalAlpha = edgeA * baseA;
      const r = Math.max(16 * u, (L.sizePlane * (L.sizeMul || 1) * sp.scaleD * H) / 2);
      const facts = OBJECT_FACTS[normObjId(L.id)];
      const name = L.id;
      let sub = facts
        ? `${facts[lang].name} · ${facts[lang].dist || ""}`.replace(/ · $/, "")
        : (OTYPE_NAMES[lang][L.otype] || L.otype);
      if (L.star && L.phys && state.starDetails) sub += starPhysShort(L.phys, lang);

      // Seite/Richtung EINMAL pro Durchlauf waehlen und behalten: Ein
      // Wechsel mitten im Flug liess die Beschriftung auf die andere Seite
      // springen, sobald der Text den Rand beruehrte - die Klemmung haelt
      // sie stattdessen kontinuierlich im Bild.
      const pickSide = (fitsRight) => {
        if (!L._chipSide) L._chipSide = fitsRight ? 1 : -1;
        return L._chipSide;
      };
      const pickUp = (fitsUp) => {
        if (!L._up) L._up = fitsUp ? 1 : -1;
        return L._up;
      };
      const measure = (fName, fSub, subText) => {
        ctx.font = fName;
        const wn = ctx.measureText(name).width;
        ctx.font = fSub;
        return { wn, ws: ctx.measureText(subText || sub).width };
      };

      if (style === "classic") {
        ctx.strokeStyle = ACC + "0.75)";
        ctx.lineWidth = 1.6 * u;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
        ctx.stroke();
        const { wn, ws } = measure(`700 ${15 * u}px system-ui, sans-serif`, `${11.5 * u}px system-ui, sans-serif`);
        const chipW = Math.max(wn, ws) + 24 * u;
        const chipH = 40 * u;
        const side = pickSide(sp.x + r + 14 * u + chipW < W - 8 * u);
        const right = side > 0;
        const cx0 = Math.min(Math.max(right ? sp.x + r + 14 * u : sp.x - r - 14 * u - chipW,
          8 * u), W - chipW - 8 * u);
        const cy0 = claim(cx0, sp.y - chipH / 2, chipW, chipH, sp.y);
        ctx.strokeStyle = ACC + "0.7)";
        ctx.lineWidth = 1.4 * u;
        ctx.beginPath();
        ctx.moveTo(right ? sp.x + r : sp.x - r, sp.y);
        ctx.lineTo(right ? cx0 : cx0 + chipW, cy0 + chipH / 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(8,10,16,0.72)";
        ctx.strokeStyle = ACC + "0.55)";
        ctx.beginPath();
        ctx.roundRect(cx0, cy0, chipW, chipH, 8 * u);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#e8eeff";
        ctx.font = `700 ${15 * u}px system-ui, sans-serif`;
        ctx.fillText(name, cx0 + 12 * u, cy0 + 17 * u);
        ctx.fillStyle = "#aab8d8";
        ctx.font = `${11.5 * u}px system-ui, sans-serif`;
        ctx.fillText(sub, cx0 + 12 * u, cy0 + 32 * u);

      } else if (style === "editorial") {
        // Punkt am Objekt, abgewinkelte Linie, freier Text ohne Box
        const { wn, ws } = measure(`650 ${17 * u}px system-ui, sans-serif`, `${12.5 * u}px system-ui, sans-serif`);
        const textW = Math.max(wn, ws);
        const diag = 52 * u;
        const side = pickSide(sp.x + 10 * u + diag + textW + 18 * u < W - 8 * u);
        const up = pickUp(sp.y - diag - 46 * u > 8 * u);
        let by = sp.y - up * (10 * u + diag);
        // Text (und Linie) horizontal ins Bild klemmen - lange Untertitel
        // wurden sonst am Bildrand abgeschnitten
        let tx = sp.x + side * (10 * u + diag) + side * 2 * u;
        if (side > 0) tx = Math.min(tx, W - textW - 10 * u);
        else tx = Math.max(tx, textW + 10 * u);
        const bx = tx - side * 2 * u;
        by = claim(side > 0 ? tx : tx - textW, by - 36 * u, textW + 8 * u, 42 * u, sp.y) + 36 * u;
        ctx.strokeStyle = "rgba(234,240,255,0.8)";
        ctx.lineWidth = 1.2 * u;
        ctx.beginPath();
        ctx.moveTo(sp.x + side * 8 * u, sp.y - up * 8 * u);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + side * (textW + 8 * u), by);
        ctx.stroke();
        ctx.fillStyle = "#eaf0ff";
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 3.2 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(234,240,255,0.65)";
        ctx.lineWidth = 1.2 * u;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 7.5 * u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.textAlign = side > 0 ? "left" : "right";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 8 * u;
        ctx.fillStyle = "#f2f5ff";
        ctx.font = `650 ${17 * u}px system-ui, sans-serif`;
        ctx.fillText(name, tx, by - 22 * u);
        ctx.fillStyle = "#c3cde6";
        ctx.font = `${12.5 * u}px system-ui, sans-serif`;
        ctx.fillText(sub, tx, by - 6 * u);
        ctx.shadowBlur = 0;
        ctx.textAlign = "left";

      } else if (style === "glass") {
        // Dünner Ring + Glas-Kapsel (Blur wird im Canvas durch dunklere
        // Halbtransparenz ersetzt)
        ctx.strokeStyle = "rgba(207,224,255,0.5)";
        ctx.lineWidth = 1.1 * u;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "rgba(207,224,255,0.08)";
        ctx.lineWidth = 5 * u;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2); ctx.stroke();
        const { wn, ws } = measure(`650 ${15 * u}px system-ui, sans-serif`, `${11.5 * u}px system-ui, sans-serif`);
        const gap = 9 * u, pad = 15 * u;
        const pillW = wn + ws + gap + 2 * pad;
        const pillH = 32 * u;
        const diag = 40 * u;
        const side = pickSide(sp.x + (r + diag) * 0.71 + pillW + 16 * u < W - 8 * u);
        const ax = sp.x + side * r * 0.71, ay = sp.y - r * 0.71;
        const bx2 = ax + side * diag * 0.71, by2 = ay - diag * 0.71;
        ctx.strokeStyle = "rgba(207,224,255,0.55)";
        ctx.lineWidth = 1.1 * u;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx2, by2); ctx.stroke();
        const px0 = Math.min(Math.max(side > 0 ? bx2 + 6 * u : bx2 - 6 * u - pillW, 8 * u), W - pillW - 8 * u);
        const py0 = claim(px0, by2 - pillH / 2, pillW, pillH, sp.y);
        ctx.fillStyle = "rgba(18,24,38,0.55)";
        ctx.strokeStyle = "rgba(220,232,255,0.3)";
        ctx.lineWidth = 1 * u;
        ctx.beginPath();
        ctx.roundRect(px0, py0, pillW, pillH, pillH / 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#f2f6ff";
        ctx.font = `650 ${15 * u}px system-ui, sans-serif`;
        ctx.fillText(name, px0 + pad, py0 + 21 * u);
        ctx.fillStyle = "#b9c6e4";
        ctx.font = `${11.5 * u}px system-ui, sans-serif`;
        ctx.fillText(sub, px0 + pad + wn + gap, py0 + 21 * u);

      } else if (style === "hud") {
        // Eckklammern + Monospace-Typo mit Trennlinie
        const arm = Math.max(12 * u, r * 0.3);
        ctx.strokeStyle = "rgba(159,232,255,0.85)";
        ctx.lineWidth = 1.6 * u;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.beginPath();
          ctx.moveTo(sp.x + sx * r, sp.y + sy * r - sy * arm);
          ctx.lineTo(sp.x + sx * r, sp.y + sy * r);
          ctx.lineTo(sp.x + sx * r - sx * arm, sp.y + sy * r);
          ctx.stroke();
        }
        const mono = `600 ${14 * u}px "Cascadia Code", "SF Mono", Consolas, monospace`;
        const monoSub = `${10.5 * u}px "Cascadia Code", "SF Mono", Consolas, monospace`;
        const subUp = sub.toUpperCase();
        const { wn, ws } = measure(mono, monoSub, subUp);
        const textW = Math.max(wn, ws);
        const diag = 26 * u;
        const side = pickSide(sp.x + r + diag + textW + 14 * u < W - 8 * u);
        const up = pickUp(sp.y - r - diag - 40 * u > 8 * u);
        ctx.strokeStyle = "rgba(159,232,255,0.7)";
        ctx.lineWidth = 1.2 * u;
        ctx.beginPath();
        ctx.moveTo(sp.x + side * r, sp.y - up * r);
        ctx.lineTo(sp.x + side * (r + diag), sp.y - up * (r + diag));
        ctx.stroke();
        const tx = Math.min(Math.max(side > 0 ? sp.x + side * (r + diag) + 6 * u
          : sp.x + side * (r + diag) - 6 * u - textW, 8 * u), W - textW - 8 * u);
        let ty = sp.y - up * (r + diag) - (up > 0 ? 24 * u : -14 * u);
        ty = claim(tx, ty - 16 * u, textW, 42 * u, sp.y) + 16 * u;
        ctx.shadowColor = "rgba(120,220,255,0.35)";
        ctx.shadowBlur = 10 * u;
        ctx.fillStyle = "#d9f4ff";
        ctx.font = mono;
        ctx.fillText(name, tx, ty);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(140,220,250,0.4)";
        ctx.lineWidth = 1 * u;
        ctx.beginPath();
        ctx.moveTo(tx, ty + 7 * u);
        ctx.lineTo(tx + textW, ty + 7 * u);
        ctx.stroke();
        ctx.fillStyle = "#8fd2ea";
        ctx.font = monoSub;
        ctx.fillText(subUp, tx, ty + 21 * u);

      } else if (style === "micro") {
        // Nur Typografie: gesperrte Versalien über feiner Linie + Zeiger
        const nameSp = name.split("").join("  ");
        const subUp = sub.toUpperCase().split("").join(" ");
        ctx.font = `600 ${14.5 * u}px system-ui, sans-serif`;
        const wn = ctx.measureText(nameSp).width;
        ctx.font = `${9.5 * u}px system-ui, sans-serif`;
        const ws = ctx.measureText(subUp).width;
        const halfW = Math.max(wn, ws) / 2 + 14 * u;
        const lift = 78 * u;
        const up = pickUp(sp.y - lift - 44 * u > 8 * u);
        let lineY = Math.min(Math.max(sp.y - up * lift, 44 * u), H - chipSafe - 10 * u);
        const cx1 = Math.min(Math.max(sp.x, halfW + 8 * u), W - halfW - 8 * u);
        const blockTop0 = up > 0 ? lineY - 40 * u : lineY - 4 * u;
        lineY += claim(cx1 - halfW, blockTop0, 2 * halfW, 46 * u, sp.y) - blockTop0;
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1 * u;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y - up * 6 * u);
        ctx.lineTo(sp.x, lineY);
        ctx.moveTo(cx1 - halfW, lineY);
        ctx.lineTo(cx1 + halfW, lineY);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 3 * u, 0, Math.PI * 2); ctx.fill();
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 8 * u;
        const tBase = up > 0 ? lineY - 8 * u : lineY + 30 * u;
        ctx.fillStyle = "#ffffff";
        ctx.font = `600 ${14.5 * u}px system-ui, sans-serif`;
        ctx.fillText(nameSp, cx1, tBase - 14 * u);
        ctx.fillStyle = "#c9d2e8";
        ctx.font = `${9.5 * u}px system-ui, sans-serif`;
        ctx.fillText(subUp, cx1, tBase);
        ctx.shadowBlur = 0;
        ctx.textAlign = "left";

      } else { // "focus"
        // Gestrichelter Fokus-Ring + Karte mit Akzentkante
        ctx.strokeStyle = "rgba(167,196,255,0.9)";
        ctx.lineWidth = 1.4 * u;
        ctx.lineCap = "round";
        ctx.setLineDash([3 * u, 7 * u]);
        ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineCap = "butt";
        ctx.strokeStyle = "rgba(167,196,255,0.3)";
        ctx.lineWidth = 0.8 * u;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, Math.max(6 * u, r - 7 * u), 0, Math.PI * 2); ctx.stroke();
        const { wn, ws } = measure(`650 ${15 * u}px system-ui, sans-serif`, `${11.5 * u}px system-ui, sans-serif`);
        const boxW = Math.max(wn, ws) + 30 * u;
        const boxH = 42 * u;
        const bx3 = Math.min(Math.max(sp.x - boxW / 2, 8 * u), W - boxW - 8 * u);
        const below = pickUp(sp.y + r + 12 * u + boxH <= H - chipSafe) > 0;
        const by3 = claim(bx3, below ? sp.y + r + 12 * u : sp.y - r - 12 * u - boxH, boxW, boxH, sp.y);
        ctx.fillStyle = "rgba(16,21,34,0.85)";
        ctx.strokeStyle = "rgba(167,196,255,0.45)";
        ctx.lineWidth = 1 * u;
        ctx.beginPath();
        ctx.roundRect(bx3, by3, boxW, boxH, 6 * u);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ACC + "0.9)";
        ctx.fillRect(bx3, by3 + 4 * u, 3 * u, boxH - 8 * u);
        ctx.fillStyle = "#eef3ff";
        ctx.font = `650 ${15 * u}px system-ui, sans-serif`;
        ctx.fillText(name, bx3 + 14 * u, by3 + 18 * u);
        ctx.fillStyle = "#a9b8d9";
        ctx.font = `${11.5 * u}px system-ui, sans-serif`;
        ctx.fillText(sub, bx3 + 14 * u, by3 + 33 * u);
      }
    }
  }

  ctx.restore();
}

// Transparente Overlay-Ebene über der Vorschau
const overlayCanvas = document.createElement("canvas");
overlayCanvas.id = "overlayCanvas";
overlayCanvas.style.cssText = "position:absolute; pointer-events:none; left:0; top:0;";
canvas.parentElement.style.position = "relative";
canvas.parentElement.appendChild(overlayCanvas);
const overlayCtx = overlayCanvas.getContext("2d");

function drawPreviewOverlay(loopT, cam, fade) {
  if (overlayCanvas.width !== canvas.width || overlayCanvas.height !== canvas.height) {
    overlayCanvas.width = canvas.width;
    overlayCanvas.height = canvas.height;
  }
  overlayCanvas.style.left = canvas.offsetLeft + "px";
  overlayCanvas.style.top = canvas.offsetTop + "px";
  overlayCanvas.style.width = canvas.clientWidth + "px";
  overlayCanvas.style.height = canvas.clientHeight + "px";
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  drawOverlayTo(overlayCtx, overlayCanvas.width, overlayCanvas.height, loopT, cam, fade);
  if (state.scenEdit && state.starless && !state.exporting && state.waypoints.length) {
    drawWaypointOverlay(overlayCtx, overlayCanvas.width, overlayCanvas.height, cam);
  }
}

// ---------------------------------------------------------------- Kamera & Zeit

function currentTime() {
  if (!state.playing) return state.pausedAt;
  return (performance.now() - state.t0) / 1000;
}

function smoothstep(x) {
  x = Math.min(1, Math.max(0, x));
  return x * x * (3 - 2 * x);
}

/**
 * Grund-Überdeckung des Ausschnitts. Mit "strikte Ränder" (Standard) wird sie
 * so weit vergrößert, dass Rotation, Kippen, Schwenk und Fahrt-Parallaxe den
 * sichtbaren Ausschnitt nie über die echte Bildfläche hinausschieben - sonst
 * spiegelt die Textur an den Rändern (sichtbar v. a. bei 21:9). Der Faktor
 * ist über den ganzen Flug konstant (Worst Case), damit nichts "pumpt".
 */
function coverBase(viewAspect, imgAspect) {
  const base = Math.max(viewAspect / imgAspect, 1) * 1.02;
  if (!state.strictEdges) return base;

  // Rotation: benötigte Halbbreite/-höhe des gedrehten Ausschnitts (bei
  // Zoom 1); über den Drehbereich des Flugs abgetastet
  const rotSpan = Math.abs(state.rotationSpeed) * state.duration * (state.loopMode ? 0.5 : 1);
  let needW = viewAspect / 2, needH = 0.5;
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const th = (state.orientation + (rotSpan * i) / steps) * Math.PI / 180;
    const ca = Math.abs(Math.cos(th)), sa = Math.abs(Math.sin(th));
    needW = Math.max(needW, (viewAspect * ca + sa) / 2);
    needH = Math.max(needH, (viewAspect * sa + ca) / 2);
  }

  // Seitliche Verschiebungen in Ebenen-Einheiten (Faktor 0.55 = max |d-0.45|)
  const drK = (state.parallax / 100) * 0.85 * (0.4 + 1.8 * state.depthBoost / 100);
  const tilt = (Math.abs(state.tiltX) + Math.abs(state.tiltY)) / 100 * 0.08;
  const sway = (state.swayAmp / 100) * 0.06 * 1.6;
  const ramp = (state.tiltRampAmp / 100) * 0.08;
  const T0 = (tilt + sway + ramp) * 0.55;

  // Fahrt-Parallaxe (Lateral) hängt von der erlaubten Strecke ab, die
  // wiederum mit der Überdeckung wächst -> kurze Fixpunkt-Iteration
  let cover = base;
  for (let i = 0; i < 6; i++) {
    let tx = T0, ty = T0;
    if (state.flightMode === "lateral") {
      const sc = cover * state.zoomBase;
      const freeX = Math.max(0, imgAspect / 2 - (viewAspect / 2) / sc) * 0.92;
      const freeY = Math.max(0, 0.5 - 0.5 / sc) * 0.92;
      tx += drK * 0.55 * freeX;
      ty += drK * 0.55 * freeY;
    }
    const cx = needW / Math.max(0.05, imgAspect / 2 - tx);
    const cy = needH / Math.max(0.05, 0.5 - ty);
    const next = Math.max(base, cx, cy);
    if (Math.abs(next - cover) < 1e-4) { cover = next; break; }
    cover = next;
  }
  return Math.min(cover, base * 2.5);
}

/**
 * Kamerazustand zu einem Zeitpunkt (für Rendering und Bewegungsunschärfe).
 * Ablauf: Rohzeit -> Loop-Dreieck (hin & zurück) -> Easing -> effektive
 * Flugzeit te, aus der Zoom, Rotation, Ziel-Fahrt und Schwenk berechnet werden.
 */

// ------------------------------------------------- Szenario-Flug (Wegpunkte)


/**
 * Kubisches Bezier-Easing wie CSS cubic-bezier(x1,y1,x2,y2):
 * P0=(0,0), P3=(1,1); fuer die Zeit k wird t mit Newton-Iteration
 * (Bisektion als Rueckfall) aus x(t)=k bestimmt, Ergebnis ist y(t).
 */
function bezierEase(x1, y1, x2, y2, k) {
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  let t = k;
  for (let i = 0; i < 6; i++) {
    const d = slopeX(t);
    if (Math.abs(d) < 1e-6) break;
    t -= (sampleX(t) - k) / d;
    t = Math.min(1, Math.max(0, t));
  }
  if (Math.abs(sampleX(t) - k) > 1e-4) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      t = (lo + hi) / 2;
      if (sampleX(t) < k) lo = t; else hi = t;
    }
  }
  return sampleY(t);
}

/** Position entlang einer Etappe: Gerade oder Bogen durch wp.via. */
function scenLegPos(a, b, k) {
  if (b.via) {
    const cx = 2 * b.via.x - (a.x + b.x) / 2;
    const cy = 2 * b.via.y - (a.y + b.y) / 2;
    const u = 1 - k;
    return { x: u * u * a.x + 2 * u * k * cx + k * k * b.x,
             y: u * u * a.y + 2 * u * k * cy + k * k * b.y };
  }
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** Gesamtdauer des Wegpunkt-Plans in Sekunden (Etappen + Pausen). */
function scenarioTotal() {
  const wps = state.waypoints;
  let total = 0;
  for (let i = 0; i < wps.length; i++) {
    total += Math.max(0, wps[i].hold || 0);
    if (i > 0) total += Math.max(0.2, wps[i].dur || 0.2);
  }
  return Math.max(0.4, total);
}

/**
 * Kameraposition entlang des Wegpunkt-Plans bei Fortschritt p (0..1).
 * Jede Etappe hat eigenes Easing; der Zoom interpoliert geometrisch
 * (wirkt gleichmaessig statt am Ende zu rasen). Position wird wie im
 * Zoom-Modus an die Bildkanten geklemmt.
 */
function scenarioAt(p) {
  const wps = state.waypoints;
  const total = scenarioTotal();
  let s = Math.min(1, Math.max(0, p)) * total;
  let ax = wps[0].x, ay = wps[0].y, zoom = Math.max(1, wps[0].zoom || 1);
  let ang = wps[0].angle || 0;
  outer:
  for (let i = 0; i < wps.length; i++) {
    if (i > 0) {
      const dur = Math.max(0.2, wps[i].dur || 0.2);
      if (s <= dur) {
        let k = s / dur;
        const easeMode = wps[i].ease || "smooth";
        if (easeMode === "custom") {
          const cv = wps[i].curve || [0.42, 0, 0.58, 1];
          k = bezierEase(cv[0], cv[1], cv[2], cv[3], k);
        } else if (easeMode !== "linear") {
          k = smoothstep(k);
        }
        const a = wps[i - 1], b = wps[i];
        const za = Math.max(1, a.zoom || 1), zb = Math.max(1, b.zoom || 1);
        const P = scenLegPos(a, b, k);
        ax = P.x;
        ay = P.y;
        zoom = za * Math.pow(zb / za, k);
        ang = (a.angle || 0) + ((b.angle || 0) - (a.angle || 0)) * k;
        break outer;
      }
      s -= dur;
    }
    ax = wps[i].x; ay = wps[i].y; zoom = Math.max(1, wps[i].zoom || 1);
    ang = wps[i].angle || 0;
    const hold = Math.max(0, wps[i].hold || 0);
    if (s <= hold) {
      // Schwebe-Effekt (optional je Wegpunkt): sanftes Treiben waehrend der
      // Pause, wie eine schwebende Kamera - weich ein- und ausblendend,
      // damit der Uebergang in die Etappen nahtlos bleibt
      if (wps[i].floatOn && hold > 0.4) {
        const ramp = smoothstep(Math.min(1, s / 1.2)) * smoothstep(Math.min(1, (hold - s) / 1.2));
        const amp = 0.006 / zoom;
        ax += amp * ramp * (Math.sin(s * 0.9 + i * 2.1) + 0.5 * Math.sin(s * 0.47 + 1.3));
        ay += amp * ramp * 0.8 * (Math.sin(s * 0.73 + i * 1.4 + 0.9) + 0.5 * Math.sin(s * 0.31 + 0.4));
      }
      break;
    }
    s -= hold;
  }
  const viewAspect = state.aspect;
  const imgAspect = state.starless
    ? state.starless.width / state.starless.height : 16 / 9;
  const cover = coverBase(viewAspect, imgAspect);
  const sc = cover * zoom;
  const freeX = Math.max(0, imgAspect / 2 - (viewAspect / 2) / sc) * 0.98;
  const freeY = Math.max(0, 0.5 - 0.5 / sc) * 0.98;
  return { zoom, angle: ang, cx: Math.min(freeX, Math.max(-freeX, ax)), cy: Math.min(freeY, Math.max(-freeY, ay)) };
}

function scenarioActive() {
  return state.scenarioOn && state.waypoints.length >= 2;
}

function camAt(loopT) {
  // Flugplan-Einrichtung: feste Kamera aus dem Steuerkreuz statt Animation
  if (state.scenEdit) {
    const v = state.scenView;
    return { zoom: v.zoom, angle: (state.orientation + v.angle) * Math.PI / 180,
      rate: 0, te: 0, tiltAddX: 0, tiltAddY: 0,
      cx: v.x, cy: v.y, driftTX: 0, driftTY: 0 };
  }
  const D = state.duration;
  const u = Math.min(1, Math.max(0, loopT / D));
  const p = state.loopMode ? 1 - Math.abs(1 - 2 * u) : u;
  let curve;
  switch (state.easeMode) {
    case "linear": curve = p; break;
    case "in":     curve = p * p; break;
    case "out":    curve = 1 - (1 - p) * (1 - p); break;
    default:       curve = smoothstep(p); // sanft beschleunigen & abbremsen
  }
  const e = state.ease / 100;
  const pe = p + (curve - p) * e;
  const te = pe * D * (state.loopMode ? 0.5 : 1);

  const rate = (state.speed / 100) * 0.09;
  let angle = (state.orientation + state.rotationSpeed * te) * Math.PI / 180;

  // Flugmodus: entweder in den Nebel zoomen oder seitlich übers Bild gleiten
  let zoom, cx, cy, driftTX = 0, driftTY = 0;
  if (scenarioActive()) {
    const sp = scenarioAt(p);
    zoom = sp.zoom; cx = sp.cx; cy = sp.cy;
    angle = (state.orientation + sp.angle) * Math.PI / 180;
  } else if (state.flightMode === "lateral") {
    // Konstanter Zoom; die Kamera fährt entlang der eingestellten Richtung
    // durch das Ziel (Klickpunkt). Die Strecke ist so begrenzt, dass der
    // Bildausschnitt nicht über den Rand hinausläuft.
    zoom = state.zoomBase;
    const viewAspect = state.aspect;
    const imgAspect = state.starless
      ? state.starless.width / state.starless.height : 16 / 9;
    const cover = coverBase(viewAspect, imgAspect);
    const sc = cover * zoom;
    const freeX = Math.max(0, imgAspect / 2 - (viewAspect / 2) / sc) * 0.92;
    const freeY = Math.max(0, 0.5 - 0.5 / sc) * 0.92;
    const tx = Math.min(freeX, Math.max(-freeX, state.target.x + (state.frameX / 100) * freeX));
    const ty = Math.min(freeY, Math.max(-freeY, state.target.y + (state.frameY / 100) * freeY));
    const dir = state.driftDir * Math.PI / 180;
    const ux = Math.cos(dir), uy = Math.sin(dir);
    let half = Infinity;
    if (Math.abs(ux) > 1e-6) half = Math.min(half, (freeX - Math.abs(tx)) / Math.abs(ux));
    if (Math.abs(uy) > 1e-6) half = Math.min(half, (freeY - Math.abs(ty)) / Math.abs(uy));
    if (!isFinite(half)) half = 0;
    half *= state.speed / 100;
    const off = (pe - 0.5) * 2 * half;
    cx = tx + off * ux;
    cy = ty + off * uy;
    // Fahrt-Parallaxe: wirkt wie ein animiertes Kippen – nahe Bereiche und
    // nahe Sterne ziehen schneller vorbei als ferne (Skalierung im Renderer)
    driftTX = off * ux;
    driftTY = off * uy;
  } else {
    zoom = state.zoomBase * Math.exp(rate * te);
  }

  // Schwenk-Animation: langsame elliptische Kippbewegung (Funktion von te,
  // dadurch im Loop-Modus automatisch nahtlos)
  let tiltAddX = 0, tiltAddY = 0;
  const swayA = scenarioActive() ? 0 : (state.swayAmp / 100) * 0.06;
  if (swayA > 0) {
    // Kreisende Kippbewegung statt Hin-und-her-Pendeln: Der Kipp-Vektor
    // läuft auf einer flachen Ellipse (Hauptachse = eingestellte Richtung).
    // Ohne Umkehrpunkte wirkt der Schwenk ruhig statt wackelig - das
    // Pendeln kehrte selbst bei langsamem Tempo sichtbar "hart" um.
    const period = 24 - (state.swayTempo / 100) * 18; // 24 s .. 6 s
    const ph = te * 2 * Math.PI / period;
    const dir = state.swayDir * Math.PI / 180;
    const rnd = state.swayRandom / 100;
    // Zufalls-Anteil: zweite, inkommensurable Frequenz macht die Bahn organisch
    const ex = Math.cos(ph) + rnd * 0.5 * Math.sin(ph * 0.63 + 1.3);
    const ey = 0.55 * Math.sin(ph) + rnd * 0.35 * Math.sin(ph * 0.41 + 0.7);
    // Sanft einschwingen (und im Loop-Modus über te wieder aus), damit der
    // Flug nicht mit bereits gekippter Kamera beginnt
    const ramp = smoothstep(Math.min(1, te / (period * 0.35)));
    tiltAddX = swayA * ramp * (Math.cos(dir) * ex - Math.sin(dir) * ey);
    tiltAddY = swayA * ramp * (Math.sin(dir) * ex + Math.cos(dir) * ey);
  }

  // Gerichteter Kipp-Schwenk: die Kamera kippt über die gesamte Flugdauer
  // langsam in eine Richtung (folgt der Beschleunigungskurve; basiert auf pe,
  // das im Loop-Modus hin & zurück läuft -> nahtlos). Volle Stärke entspricht
  // einer Fahrt des Kipp-Reglers von -100 nach +100, mittig neutral.
  const rampA = scenarioActive() ? 0 : (state.tiltRampAmp / 100) * 0.08;
  if (rampA > 0) {
    const rdir = state.tiltRampDir * Math.PI / 180;
    const q = (pe - 0.5) * 2; // -1 .. +1 über die Flugdauer
    tiltAddX += rampA * Math.cos(rdir) * q;
    tiltAddY += rampA * Math.sin(rdir) * q;
  }

  // Kamerafahrt zum Zoomziel (nur Zoom-Modus): Die Kamera schwenkt über die
  // gesamte Flugdauer langsam zum Ziel (folgt der Beschleunigungskurve, im
  // Loop-Modus nahtlos hin & zurück). Startpunkt ist der per Regler
  // verschiebbare Ausschnitt; beides wird an die Bildkanten geklemmt, damit
  // nie über den Bildrand hinaus geschwenkt wird.
  if (state.flightMode !== "lateral" && !scenarioActive()) {
    const viewAspect = state.aspect;
    const imgAspect = state.starless
      ? state.starless.width / state.starless.height : 16 / 9;
    const cover = coverBase(viewAspect, imgAspect);
    const sc = cover * zoom;
    const freeX = Math.max(0, imgAspect / 2 - (viewAspect / 2) / sc) * 0.98;
    const freeY = Math.max(0, 0.5 - 0.5 / sc) * 0.98;
    const fx = (state.frameX / 100) * freeX;
    const fy = (state.frameY / 100) * freeY;
    const hasTarget = state.target.x !== 0 || state.target.y !== 0;
    if (hasTarget) {
      cx = Math.min(freeX, Math.max(-freeX, fx + (state.target.x - fx) * pe));
      cy = Math.min(freeY, Math.max(-freeY, fy + (state.target.y - fy) * pe));
    } else {
      // Ohne Klick-Ziel zoomt die Kamera GERADE in die Mitte des
      // verschobenen Ausschnitts: Der Punkt, den der Nutzer per Regler in
      // die Mitte geschoben hat, bleibt fest im Zentrum (Bezug ist der
      // Start-Zoom, sonst wandert er mit dem wachsenden Spielraum) -
      // vorher driftete die Kamera stattdessen seitlich zur Bildmitte.
      // Wer diesen Drift-Effekt will, klickt einfach ein Zoomziel an.
      const sc0 = cover * state.zoomBase;
      const freeX0 = Math.max(0, imgAspect / 2 - (viewAspect / 2) / sc0) * 0.98;
      const freeY0 = Math.max(0, 0.5 - 0.5 / sc0) * 0.98;
      cx = Math.min(freeX, Math.max(-freeX, (state.frameX / 100) * freeX0));
      cy = Math.min(freeY, Math.max(-freeY, (state.frameY / 100) * freeY0));
    }
  }
  return { zoom, angle, rate, te, tiltAddX, tiltAddY, cx, cy, driftTX, driftTY };
}

function animParams(t) {
  const loopT = state.exporting ? t : t % state.duration;
  const cam = camAt(loopT);
  let fade = 1;
  const fadeDur = state.fade / 10;
  if (!state.loopMode && fadeDur > 0) {
    const fadeIn = Math.min(1, loopT / fadeDur);
    const fadeOut = Math.min(1, Math.max(0, (state.duration - loopT) / fadeDur));
    fade = Math.min(fadeIn, fadeOut);
  }
  return { loopT, cam, fade };
}

// ---------------------------------------------------------------- Rendering

// Größte darstellbare Punktgröße der GPU (einmalig abgefragt): Intel-GPUs
// melden z. B. nur 255 px - längere Streifen-Sprites würden gekappt
let _maxPoint = 0;
function maxPointSize() {
  if (!_maxPoint) {
    const r = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    _maxPoint = Math.min(r ? r[1] : 1024, 2048);
  }
  return _maxPoint;
}

function render(forcedT) {
  const w = canvas.width, h = canvas.height;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (!texColor || !texDepth) return;

  ensureFbos();

  const t = forcedT !== undefined ? forcedT : currentTime();
  const { loopT, cam, fade } = animParams(t);
  const viewAspect = state.aspect;
  const imgAspect = state.starless.width / state.starless.height;
  const cover = coverBase(viewAspect, imgAspect);
  const parallax = state.parallax / 100;
  const warp = state.warp / 100;
  const depthRange = 0.85 * (0.4 + 1.8 * state.depthBoost / 100);
  const tiltX = (state.tiltX / 100) * 0.08 + cam.tiltAddX;
  const tiltY = (state.tiltY / 100) * 0.08 + cam.tiltAddY;
  // Seitlicher Flug: die Fahrt-Parallaxe nutzt den Kipp-Mechanismus
  // (tiefenabhängige Verschiebung); Sterne reagieren wie beim Zoom stärker
  const drK = parallax * depthRange;
  const drKStar = drK * 2.6 * (state.starPar / 100);
  const bgTiltX = tiltX + cam.driftTX * drK;
  const bgTiltY = tiltY + cam.driftTY * drK;
  const starTiltX = tiltX + cam.driftTX * drKStar;
  const starTiltY = tiltY + cam.driftTY * drKStar;

  // ---- Pass 1: Szene in FBO ----
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbScene.fb);
  gl.viewport(0, 0, fbScene.w, fbScene.h);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.disable(gl.BLEND);
  gl.useProgram(bgProg);
  gl.bindVertexArray(quadVao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texColor);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texDepth);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, texSpinMask || texBlack);
  gl.activeTexture(gl.TEXTURE0);
  u1i(bgProg, "uColor", 0);
  u1i(bgProg, "uDepth", 1);
  u1i(bgProg, "uSpinMask", 2);
  u1f(bgProg, "uViewAspect", viewAspect);
  u1f(bgProg, "uImgAspect", imgAspect);
  u1f(bgProg, "uZoom", cam.zoom);
  u1f(bgProg, "uParallax", parallax);
  u1f(bgProg, "uAngle", cam.angle);
  u1f(bgProg, "uCover", cover);
  u2f(bgProg, "uCenter", cam.cx, cam.cy);
  u2f(bgProg, "uTilt", bgTiltX, bgTiltY);
  u1f(bgProg, "uDepthRange", depthRange);
  // Bikubisch abtasten, sobald die Textur vergrößert dargestellt wird
  const texH = state.texColorH || 2048;
  const magnify = (cover * cam.zoom * fbScene.h) / texH;
  u2f(bgProg, "uColorTexel", 1 / (state.texColorW || 2048), 1 / texH);
  u1f(bgProg, "uBicubic", magnify > 1.05 ? 1 : 0);
  u1f(bgProg, "uObjFar", state.objFar ? 1 : 0);
  // Galaxien-Rotation (te-basiert -> im Loop-Modus nahtlos hin & zurück)
  u1f(bgProg, "uSpinAngle", state.spinSpeed * Math.PI / 180 * cam.te);
  u2f(bgProg, "uSpinCenter", state.spinCenter.x, state.spinCenter.y);
  const mdU = state.moonMode && state.moonDisk ? state.moonDisk : null;
  u1f(bgProg, "uMoonMode", mdU ? 1 : 0);
  u2f(bgProg, "uMoonC", mdU ? mdU.cx : 0, mdU ? 1 - mdU.cy : 0);
  u1f(bgProg, "uMoonR", mdU ? mdU.r : 1);
  u1f(bgProg, "uSpinRadius", Math.max(0.02, (state.spinRadius / 100) * 0.75));
  u1f(bgProg, "uSpinDiff", state.spinDiff / 100);
  const spinTiltRad = state.spinTilt * Math.PI / 180;
  u3f(bgProg, "uSpinEll", Math.cos(spinTiltRad), Math.sin(spinTiltRad), 1 - (state.spinFlat / 100) * 0.7);
  // Masken-Vorschau nie im Export; im "Zentrum setzen"-Modus automatisch an
  u1f(bgProg, "uSpinShow", (state.spinShow || state.spinPick) && !state.exporting ? 1 : 0);
  u1f(bgProg, "uSpinMaskAmt", texSpinMask ? state.spinMaskAmt / 100 : 0);
  // Nebelfarben (HII/OIII/SII): Sättigung als Faktor, Farbton als Kreisanteil
  const bandSat = [state.h2Sat / 100, state.o3Sat / 100, state.s2Sat / 100];
  const bandHue = [state.h2Hue / 360, state.o3Hue / 360, state.s2Hue / 360];
  const bandShow = state.exporting ? 0 : ({ h2: 1, o3: 2, s2: 3 }[state.bandShow] || 0);
  u3f(bgProg, "uBandSat", bandSat[0], bandSat[1], bandSat[2]);
  u3f(bgProg, "uBandHue", bandHue[0], bandHue[1], bandHue[2]);
  u3f(bgProg, "uBandCen", state.h2Det / 360, state.o3Det / 360, state.s2Det / 360);
  u3f(bgProg, "uBandWidth", state.h2Width / 360, state.o3Width / 360, state.s2Width / 360);
  u1f(bgProg, "uBandShow", bandShow);
  u1f(bgProg, "uBandFeather", state.bandFeather / 100);
  u1f(bgProg, "uBandOn",
    bandSat.some((v) => v !== 1) || bandHue.some((v) => v !== 0) || bandShow ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Bewegungsgrößen numerisch aus der Kamerakurve ableiten (für die
  // Geschwindigkeits-Streifen der Sterne und die Composite-Unschärfe)
  const dt = 0.05;
  const cam2 = camAt(Math.min(loopT + dt, state.duration));

  // "Nur Sterne"-Unschärfe: Sterne als Geschwindigkeits-Streifen in eine
  // eigene Ebene rendern – Streifenlänge pro Stern nach seiner echten
  // Bildschirmgeschwindigkeit (nahe Sterne lang, ferne fast punktförmig)
  const splitBlur = state.mblurStars && state.mblur > 0 && state.starCount > 0;
  const tilt2X = (state.tiltX / 100) * 0.08 + cam2.tiltAddX;
  const tilt2Y = (state.tiltY / 100) * 0.08 + cam2.tiltAddY;
  const starTilt2X = tilt2X + cam2.driftTX * drKStar;
  const starTilt2Y = tilt2Y + cam2.driftTY * drKStar;

  // Sterne IMMER in die eigene Ebene rendern (nicht nur bei "nur Sterne"-
  // Unschärfe): Klarheit/Struktur/Schärfe im Look-Tab treffen so nur das
  // Starless-Bild - die Sternbearbeitung wohnt im Sterne-Tab
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbStars.fb);
  gl.viewport(0, 0, fbStars.w, fbStars.h);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (state.starCount > 0) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(starProg);
    gl.bindVertexArray(starVao);
    u1f(starProg, "uViewAspect", viewAspect);
    u1f(starProg, "uZoom", cam.zoom);
    u1f(starProg, "uParallax", parallax);
    u1f(starProg, "uAngle", cam.angle);
    u1f(starProg, "uCover", cover);
    u1f(starProg, "uPixelsY", fbScene.h);
    u1f(starProg, "uTime", cam.te); // effektive Flugzeit: im Loop-Modus nahtlos
    u1f(starProg, "uSeed", state.seed);
    u1f(starProg, "uStarBase", state.starDist / 100);
    u1f(starProg, "uSpread", (state.spread / 100) * 1.15);
    u1f(starProg, "uLayers", state.starLayers);
    u1f(starProg, "uStarPar", state.starPar / 100);
    u1f(starProg, "uTwinkle", state.twinkle / 100);
    u1f(starProg, "uTwSpeed", state.twinkleSpeed / 100);
    u1f(starProg, "uWarp", warp);
    u1f(starProg, "uDepthRange", depthRange);
    u1f(starProg, "uStarSize", state.starSize / 100);
    u1f(starProg, "uStarBright", state.starBright / 100);
    u1f(starProg, "uStarSat", state.starSat / 100);
    u2f(starProg, "uCenter", cam.cx, cam.cy);
    u2f(starProg, "uTilt", starTiltX, starTiltY);
    u1f(starProg, "uZoom2", cam2.zoom);
    u1f(starProg, "uAngle2", cam2.angle);
    u2f(starProg, "uCenter2", cam2.cx, cam2.cy);
    u2f(starProg, "uTilt2", starTilt2X, starTilt2Y);
    u1f(starProg, "uStreak", splitBlur ? (state.mblur / 100) / dt : 0);
    u1f(starProg, "uMaxPoint", maxPointSize());
    u1f(starProg, "uGaiaAmt", state.gaiaAmt / 100);
    u1f(starProg, "uGaiaOnly", state.gaiaOnly && state.gaiaDepth ? 1 : 0);
    // Sterne mit der Galaxien-Rotation mitdrehen (gleiche Parameter wie bgFS)
    u1f(starProg, "uSpinStars", state.spinStars ? 1 : 0);
    u1f(starProg, "uSpinAngleS", state.spinSpeed * Math.PI / 180 * cam.te);
    u1f(starProg, "uSpinAngleS2", state.spinSpeed * Math.PI / 180 * cam2.te);
    u2f(starProg, "uSpinCenterS", state.spinCenter.x, state.spinCenter.y);
    u1f(starProg, "uSpinRadiusS", Math.max(0.02, (state.spinRadius / 100) * 0.75));
    u1f(starProg, "uSpinDiffS", state.spinDiff / 100);
    u3f(starProg, "uSpinEllS", Math.cos(spinTiltRad), Math.sin(spinTiltRad), 1 - (state.spinFlat / 100) * 0.7);
    u1f(starProg, "uSpinMaskAmtS", texSpinMask ? state.spinMaskAmt / 100 : 0);
    u1f(starProg, "uImgAspectS", imgAspect);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, texSpinMask || texBlack);
    gl.activeTexture(gl.TEXTURE0);
    u1i(starProg, "uSpinMaskS", 5);
    // Eigenbewegungs-Zeitraffer: Jahre wachsen mit der Flugzeit (loop-sicher)
    const pmSpan = state.duration * (state.loopMode ? 0.5 : 1);
    u1f(starProg, "uPmYears", state.gaiaPmYears * (cam.te / pmSpan));
    u1f(starProg, "uPmYears2", state.gaiaPmYears * (cam2.te / pmSpan));
    // Nebel-Okklusion: Tiefe + Dichte des Nebels an der Sternposition
    u1f(starProg, "uOcclude", state.occlude / 100);
    const mdS = state.moonMode && state.moonDisk ? state.moonDisk : null;
    u1f(starProg, "uMoonMode", mdS ? 1 : 0);
    u2f(starProg, "uMoonCS", mdS ? mdS.cx : 0, mdS ? 1 - mdS.cy : 0);
    u1f(starProg, "uMoonRS", mdS ? mdS.r : 1);
    u1f(starProg, "uAnchor", state.anchorStars / 100);
    u2f(starProg, "uTiltB2", tilt2X + cam2.driftTX * drK, tilt2Y + cam2.driftTY * drK);
    u1f(starProg, "uObjFarS", state.objFar ? 1 : 0);
    u2f(starProg, "uTiltB", bgTiltX, bgTiltY);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, texDepth);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, texColor);
    if (texStarAtlas) {
      gl.activeTexture(gl.TEXTURE8);
      gl.bindTexture(gl.TEXTURE_2D, texStarAtlas);
      u1i(starProg, "uAtlas", 8);
    }
    gl.activeTexture(gl.TEXTURE0);
    u1i(starProg, "uDepthS", 6);
    u1i(starProg, "uColorS", 7);
    u1f(starProg, "uRealStars", state.realStars && texStarAtlas ? 1 : 0);
    u1f(starProg, "uStarBrightF", state.starBright / 100);
    gl.drawArrays(gl.POINTS, 0, state.starCount);
    gl.disable(gl.BLEND);
  }

  // ---- Pass 2: Bloom (Viertelauflösung) ----
  // Sanfter als früher: die niedrigere Bright-Pass-Schwelle bringt die
  // Empfindlichkeit, die Stärke bleibt zurückhaltend
  const bloomStrength = (state.bloom / 100) * 0.7;
  if (bloomStrength > 0) {
    gl.bindVertexArray(quadVao);
    gl.activeTexture(gl.TEXTURE0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbBloomA.fb);
    gl.viewport(0, 0, fbBloomA.w, fbBloomA.h);
    gl.useProgram(brightProg);
    gl.bindTexture(gl.TEXTURE_2D, fbScene.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fbStars.tex);
    gl.activeTexture(gl.TEXTURE0);
    u1i(brightProg, "uScene", 0);
    u1i(brightProg, "uStarsTex", 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(blurProg);
    u1i(blurProg, "uScene", 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbBloomB.fb);
    gl.bindTexture(gl.TEXTURE_2D, fbBloomA.tex);
    u2f(blurProg, "uDir", 1 / fbBloomA.w, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbBloomA.fb);
    gl.bindTexture(gl.TEXTURE_2D, fbBloomB.tex);
    u2f(blurProg, "uDir", 0, 1 / fbBloomA.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---- Pass 2b: weichgezeichnete Szene für "Klarheit" (Viertelauflösung) ----
  const clarity = (state.clarity / 100) * 0.8;
  if (clarity !== 0) {
    gl.bindVertexArray(quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(blurProg);
    u1i(blurProg, "uScene", 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbSoftA.fb);
    gl.viewport(0, 0, fbSoftA.w, fbSoftA.h);
    gl.bindTexture(gl.TEXTURE_2D, fbScene.tex);
    u2f(blurProg, "uDir", 2 / fbSoftA.w, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbSoftB.fb);
    gl.bindTexture(gl.TEXTURE_2D, fbSoftA.tex);
    u2f(blurProg, "uDir", 0, 2 / fbSoftA.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---- Pass 2c: mittel weichgezeichnete Szene für "Struktur" (halbe Auflösung) ----
  const structure = (state.structure / 100) * 0.9;
  if (structure !== 0) {
    gl.bindVertexArray(quadVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(blurProg);
    u1i(blurProg, "uScene", 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbMedA.fb);
    gl.viewport(0, 0, fbMedA.w, fbMedA.h);
    gl.bindTexture(gl.TEXTURE_2D, fbScene.tex);
    u2f(blurProg, "uDir", 1 / fbMedA.w, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbMedB.fb);
    gl.bindTexture(gl.TEXTURE_2D, fbMedA.tex);
    u2f(blurProg, "uDir", 0, 1 / fbMedA.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---- Pass 3: Composite auf den Bildschirm ----
  const zoomRate = Math.log(cam2.zoom / cam.zoom) / dt + warp * 0.6;
  const rotRate = (cam2.angle - cam.angle) / dt;
  // Fahrt zum Ziel: Inhalt wandert entgegen der Zielrichtung über den Schirm
  const panX = -(cam2.cx - cam.cx) / dt * cover * cam.zoom;
  const panY = -(cam2.cy - cam.cy) / dt * cover * cam.zoom;
  // gleiche inverse Rotation wie im Stern-Shader (Bildebene -> Canvas)
  const rc = Math.cos(cam.angle), rs = Math.sin(cam.angle);
  const pvx = rc * panX - rs * panY;
  const pvy = rs * panX + rc * panY;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, w, h);
  gl.useProgram(compProg);
  gl.bindVertexArray(quadVao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fbScene.tex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, fbBloomA.tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, clarity !== 0 ? fbSoftB.tex : fbScene.tex);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, structure !== 0 ? fbMedB.tex : fbScene.tex);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, fbStars.tex);
  u1i(compProg, "uScene", 0);
  u1i(compProg, "uBloom", 1);
  u1i(compProg, "uSoft", 2);
  u1i(compProg, "uMed", 3);
  u1i(compProg, "uStarsTex", 4);
  u1f(compProg, "uSplit", splitBlur ? 1 : 0);
  u1f(compProg, "uViewAspect", viewAspect);
  u1f(compProg, "uBloomStrength", bloomStrength);
  u1f(compProg, "uShutter", (state.mblur / 100) * 1.5);
  u1f(compProg, "uZoomRate", zoomRate);
  u1f(compProg, "uRotRate", rotRate);
  u2f(compProg, "uPanVel", pvx, pvy);
  u1f(compProg, "uChroma", warp * 0.5);
  u1f(compProg, "uVignette", state.vignette / 100);
  u1f(compProg, "uFade", fade);
  u1f(compProg, "uExposure", (state.exposure / 100) * 2);
  u1f(compProg, "uContrast", 1 + (state.contrast / 100) * 0.6);
  u1f(compProg, "uSaturation", 1 + state.saturation / 100);
  u1f(compProg, "uClarity", clarity);
  u1f(compProg, "uStructure", structure);
  u1f(compProg, "uSharpen", (state.sharpen / 100) * 1.2);
  u2f(compProg, "uTexel", 1 / fbScene.w, 1 / fbScene.h);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Objekt-Overlay (Infokarte + Labels) über der Vorschau
  drawPreviewOverlay(loopT, cam, fade);

  // Transport-UI
  const prog = (loopT / state.duration) * 100;
  $("timelineFill").style.width = prog + "%";
  $("timecode").textContent = loopT.toFixed(1) + " s";
}

function frame() {
  if (!state.offlineExport) render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- Canvas-Größe

function fitCanvas() {
  if (state.exporting) return;
  const wrap = $("canvasWrap");
  // Mobil (schmale Bildschirme) nutzt die Vorschau immer die volle Fläche
  const mobile = window.innerWidth <= 820;
  const scaleView = (mobile ? 100 : state.viewScale) / 100;
  const availW = (wrap.clientWidth - 36) * scaleView;
  const availH = (wrap.clientHeight - 36) * scaleView;
  let w = availW, h = w / state.aspect;
  if (h > availH) { h = availH; w = h * state.aspect; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = Math.round(w) + "px";
  canvas.style.height = Math.round(h) + "px";
}
window.addEventListener("resize", fitCanvas);
fitCanvas();

// ---------------------------------------------------------------- UI-Verdrahtung

// Doppelklick auf einen Regler setzt ihn auf seinen Standardwert zurück
// (wie in Lightroom); das input-Event zieht State und Anzeige nach
document.addEventListener("dblclick", (e) => {
  const el = e.target;
  if (el && el.tagName === "INPUT" && el.type === "range") {
    el.value = el.defaultValue;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
});

function bindSlider(id, outId, key, fmt) {
  const el = $(id), out = $(outId);
  el.addEventListener("input", () => {
    const v = parseFloat(el.value);
    state[key] = v;
    out.textContent = fmt(v);
  });
  out.textContent = fmt(parseFloat(el.value));
}

const asInt = (v) => String(v);
const asPct = (v) => v + " %";
bindSlider("ctlZoom", "outZoom", "zoomBase", (v) => v.toFixed(2) + "×");
bindSlider("ctlSpeed", "outSpeed", "speed", asInt);
bindSlider("ctlEase", "outEase", "ease", asInt);
bindSlider("ctlParallax", "outParallax", "parallax", asInt);
bindSlider("ctlDepthBoost", "outDepthBoost", "depthBoost", asInt);
bindSlider("ctlRotation", "outRotation", "rotationSpeed", (v) => v.toFixed(1) + " °/s");
bindSlider("ctlOrient", "outOrient", "orientation", (v) => v + "°");
bindSlider("ctlFrameX", "outFrameX", "frameX", asInt);
bindSlider("ctlFrameY", "outFrameY", "frameY", asInt);
bindSlider("ctlSpinSpeed", "outSpinSpeed", "spinSpeed", (v) => v.toFixed(1) + " °/s");
bindSlider("ctlSpinRadius", "outSpinRadius", "spinRadius", asInt);
bindSlider("ctlSpinDiff", "outSpinDiff", "spinDiff", asInt);
bindSlider("ctlSpinFlat", "outSpinFlat", "spinFlat", asInt);
bindSlider("ctlSpinTilt", "outSpinTilt", "spinTilt", (v) => v + "°");
bindSlider("ctlSpinMaskAmt", "outSpinMaskAmt", "spinMaskAmt", asInt);

let spinMaskTimer = null;
$("ctlSpinMaskSmooth").addEventListener("input", () => {
  state.spinMaskSmooth = parseInt($("ctlSpinMaskSmooth").value, 10);
  $("outSpinMaskSmooth").textContent = state.spinMaskSmooth;
  clearTimeout(spinMaskTimer);
  spinMaskTimer = setTimeout(buildSpinMask, 200);
});
bindSlider("ctlTiltX", "outTiltX", "tiltX", asInt);
bindSlider("ctlTiltY", "outTiltY", "tiltY", asInt);
bindSlider("ctlSwayAmp", "outSwayAmp", "swayAmp", asInt);
bindSlider("ctlSwayTempo", "outSwayTempo", "swayTempo", asInt);
bindSlider("ctlDuration", "outDuration", "duration", (v) => v + " s");
bindSlider("ctlSpread", "outSpread", "spread", asInt);
bindSlider("ctlStarDist", "outStarDist", "starDist", asInt);
bindSlider("ctlTwinkle", "outTwinkle", "twinkle", asInt);
bindSlider("ctlTwinkleSpeed", "outTwinkleSpeed", "twinkleSpeed", asPct);
bindSlider("ctlStarSize", "outStarSize", "starSize", asPct);
bindSlider("ctlStarBright", "outStarBright", "starBright", asPct);
bindSlider("ctlStarSat", "outStarSat", "starSat", asPct);
bindSlider("ctlLayers", "outLayers", "starLayers", (v) => v === 0 ? "∞" : String(v));
bindSlider("ctlStarPar", "outStarPar", "starPar", asPct);
bindSlider("ctlSwayDir", "outSwayDir", "swayDir", (v) => v + "°");
bindSlider("ctlSwayRandom", "outSwayRandom", "swayRandom", asInt);
bindSlider("ctlTiltRamp", "outTiltRamp", "tiltRampAmp", asInt);
bindSlider("ctlTiltRampDir", "outTiltRampDir", "tiltRampDir", (v) => v + "°");
bindSlider("ctlFade", "outFade", "fade", (v) => (v / 10).toFixed(1) + " s");
bindSlider("ctlDriftDir", "outDriftDir", "driftDir", (v) => v + "°");

$("ctlEaseMode").addEventListener("change", () => {
  state.easeMode = $("ctlEaseMode").value;
});

$("ctlFlightMode").addEventListener("change", () => {
  state.flightMode = $("ctlFlightMode").value;
  $("driftRow").hidden = state.flightMode !== "lateral";
  state.t0 = performance.now();
  state.pausedAt = 0;
});

let genTimer = null;
$("ctlGenStars").addEventListener("input", () => {
  state.genStars = parseInt($("ctlGenStars").value, 10);
  $("outGenStars").textContent = String(state.genStars);
  clearTimeout(genTimer);
  genTimer = setTimeout(uploadStars, 120);
});

let stretchTimer = null;
$("ctlStretch").addEventListener("input", () => {
  state.stretchAmount = parseInt($("ctlStretch").value, 10);
  $("outStretch").textContent = state.stretchAmount;
  clearTimeout(stretchTimer);
  stretchTimer = setTimeout(() => {
    if (state.starsOriginal && !state.maskStretched) processStarMask();
  }, 400);
});
bindSlider("ctlBloom", "outBloom", "bloom", asInt);
bindSlider("ctlMblur", "outMblur", "mblur", asInt);
bindSlider("ctlWarp", "outWarp", "warp", asInt);
bindSlider("ctlVignette", "outVignette", "vignette", asInt);
bindSlider("ctlExposure", "outExposure", "exposure", asInt);
bindSlider("ctlContrast", "outContrast", "contrast", asInt);
bindSlider("ctlSaturation", "outSaturation", "saturation", asInt);
bindSlider("ctlClarity", "outClarity", "clarity", asInt);
bindSlider("ctlStructure", "outStructure", "structure", asInt);
const asDeg = (v) => v + "°";
bindSlider("ctlH2Sat", "outH2Sat", "h2Sat", asPct);
bindSlider("ctlH2Hue", "outH2Hue", "h2Hue", asDeg);
bindSlider("ctlO3Sat", "outO3Sat", "o3Sat", asPct);
bindSlider("ctlO3Hue", "outO3Hue", "o3Hue", asDeg);
bindSlider("ctlS2Sat", "outS2Sat", "s2Sat", asPct);
bindSlider("ctlS2Hue", "outS2Hue", "s2Hue", asDeg);
bindSlider("ctlH2Det", "outH2Det", "h2Det", asDeg);
bindSlider("ctlO3Det", "outO3Det", "o3Det", asDeg);
bindSlider("ctlS2Det", "outS2Det", "s2Det", asDeg);
const asDegPM = (v) => "\u00b1" + v + "\u00b0";
bindSlider("ctlH2Width", "outH2Width", "h2Width", asDegPM);
bindSlider("ctlO3Width", "outO3Width", "o3Width", asDegPM);
bindSlider("ctlS2Width", "outS2Width", "s2Width", asDegPM);
bindSlider("ctlBandFeather", "outBandFeather", "bandFeather", asPct);
$("ctlBandShow").addEventListener("change", () => {
  state.bandShow = $("ctlBandShow").value;
});
bindSlider("ctlSharpen", "outSharpen", "sharpen", asInt);

$("ctlMblurStars").addEventListener("change", () => {
  state.mblurStars = $("ctlMblurStars").checked;
});

// Rotationszentrum der Galaxie: nächster Klick in die Vorschau setzt es
$("ctlSpinShow").addEventListener("change", () => {
  state.spinShow = $("ctlSpinShow").checked;
});

$("btnSpinCenter").addEventListener("click", () => {
  state.spinPick = !state.spinPick;
  $("btnSpinCenter").classList.toggle("active", state.spinPick);
});

$("ctlLoop").addEventListener("change", () => {
  state.loopMode = $("ctlLoop").checked;
  updateScenarioUi();
  state.t0 = performance.now();
  state.pausedAt = 0;
});

// ---- Cineastische Presets (Effekte + Look) ----

const PRESET_SLIDERS = {
  bloom: "ctlBloom", mblur: "ctlMblur", warp: "ctlWarp", vignette: "ctlVignette",
  exposure: "ctlExposure", contrast: "ctlContrast", saturation: "ctlSaturation",
  clarity: "ctlClarity", structure: "ctlStructure", sharpen: "ctlSharpen",
};

const PRESETS = {
  // alles neutral / aus
  neutral:   { bloom: 0,  mblur: 0,  warp: 0,  vignette: 0,  exposure: 0,   contrast: 0,  saturation: 0,    clarity: 0,   structure: 0,  sharpen: 0 },
  // klassischer Kino-Look: sanfter Glow, Filmkorn-freier Kontrast, Vignette
  kino:      { bloom: 35, mblur: 35, warp: 0,  vignette: 35, exposure: 5,   contrast: 18, saturation: 8,    clarity: 15,  structure: 10, sharpen: 10 },
  // dunkel, entsättigt, hoher Kontrast – bedrohlich-episch
  deepspace: { bloom: 25, mblur: 20, warp: 0,  vignette: 50, exposure: -12, contrast: 28, saturation: -18,  clarity: 25,  structure: 20, sharpen: 10 },
  // träumerischer Orton-Glow, weiche Nebel, kräftige Farben
  glow:      { bloom: 75, mblur: 30, warp: 0,  vignette: 25, exposure: 8,   contrast: -8, saturation: 15,   clarity: -35, structure: -10, sharpen: 0 },
  // dramatisches Schwarzweiß
  mono:      { bloom: 30, mblur: 25, warp: 0,  vignette: 45, exposure: 0,   contrast: 30, saturation: -100, clarity: 35,  structure: 25, sharpen: 15 },
  // Hyperraum: Warp + Streifen nur auf den Sternen (mblurStars) - der Nebel
  // bleibt scharf, sonst brennt das Bild bei hellen Kernen komplett aus
  hyper:     { bloom: 28, mblur: 50, warp: 45, vignette: 30, exposure: 5,   contrast: 12, saturation: 10,   clarity: 10,  structure: 5,  sharpen: 0, mblurStars: true },
};

$("ctlPreset").addEventListener("change", () => {
  const preset = PRESETS[$("ctlPreset").value];
  if (!preset) return;
  for (const [key, id] of Object.entries(PRESET_SLIDERS)) {
    const el = $(id);
    el.value = preset[key];
    el.dispatchEvent(new Event("input"));
  }
  $("ctlMblurStars").checked = !!preset.mblurStars;
  $("ctlMblurStars").dispatchEvent(new Event("change"));
});

// ------------------------------------------------ Einfach-Modus & Flug-Presets

// Neutralwerte, auf die jedes Flug-Preset zuerst zurücksetzt
const SIMPLE_DEFAULTS = {
  ctlZoom: 1, ctlSpeed: 40, ctlEase: 60, ctlParallax: 60, ctlDepthBoost: 33,
  ctlRotation: 0, ctlOrient: 0, ctlFrameX: 0, ctlFrameY: 0, ctlTiltX: 0,
  ctlTiltY: 0, ctlSwayAmp: 0, ctlSwayTempo: 40, ctlSwayDir: 0, ctlSwayRandom: 0,
  ctlTiltRamp: 0, ctlTiltRampDir: 0, ctlFade: 0, ctlDriftDir: 90,
  ctlSpinSpeed: 0, ctlSpinRadius: 40, ctlSpinDiff: 40, ctlSpinFlat: 0,
  ctlSpinTilt: 0, ctlSpinMaskAmt: 0,
  ctlSpread: 70, ctlStarDist: 55, ctlLayers: 0, ctlStarPar: 100,
  ctlTwinkle: 25, ctlTwinkleSpeed: 100, ctlStarSize: 100, ctlStarBright: 100,
  ctlStarSat: 100, ctlGenStars: 0,
};

// 8 Objekt-Presets: 3 Nebel, 3 Galaxien, 2 Sternhaufen. "look" wählt den
// Look-Preset aus Sektion 5 mit; "set"/"checks" überschreiben danach gezielt.
// Nach Michaels Beta-Test deutlich gezähmt - die Effektstärke skaliert
// die Bewegungs-Parameter zusätzlich (50 = wie hier definiert)
const FLIGHT_PRESETS = {
  nebGentle:      { look: "neutral", set: { ctlSpeed: 30, ctlParallax: 60, ctlDepthBoost: 40, ctlStarPar: 250, ctlBloom: 15 } },
  nebDrift:       { look: "neutral", flightMode: "lateral", set: { ctlZoom: 1.35, ctlSpeed: 55, ctlStarPar: 260, ctlGenStars: 1000, ctlMblur: 18, ctlBloom: 15 }, checks: { ctlMblurStars: true } },
  nebHyper:       { look: "hyper", set: { ctlSpeed: 65, ctlStarPar: 300, ctlTwinkleSpeed: 150 } },
  galMajestic:    { look: "neutral", set: { ctlSpeed: 25, ctlParallax: 40, ctlDepthBoost: 30, ctlStarPar: 300, ctlTiltRamp: 12, ctlBloom: 15 } },
  galSpin:        { look: "neutral", set: { ctlSpeed: 15, ctlSpinSpeed: 0.8, ctlSpinRadius: 65, ctlSpinDiff: 40, ctlSpinMaskAmt: 50, ctlBloom: 12 } },
  galFlyby:       { look: "neutral", flightMode: "lateral", set: { ctlZoom: 1.35, ctlSpeed: 55, ctlTiltRamp: 15, ctlTiltRampDir: 90, ctlStarPar: 280, ctlMblur: 18, ctlBloom: 15 }, checks: { ctlMblurStars: true } },
  clusterDive:    { look: "neutral", set: { ctlSpeed: 50, ctlSpread: 90, ctlStarPar: 380, ctlTwinkle: 35, ctlBloom: 25 } },
  clusterSparkle: { look: "neutral", flightMode: "lateral", set: { ctlZoom: 1.3, ctlSpeed: 30, ctlTwinkle: 45, ctlTwinkleSpeed: 160, ctlSwayAmp: 20, ctlSwayRandom: 40, ctlBloom: 20 } },
};

// Effektstärke im Einfach-Modus: skaliert die Bewegungs-Parameter eines
// Presets um ihre Neutralwerte herum (50 = Preset wie definiert)
const FX_SCALED = { ctlSpeed: 40, ctlTiltRamp: 0, ctlSwayAmp: 0, ctlMblur: 0, ctlWarp: 0, ctlSpinSpeed: 0, ctlStarPar: 100 };
state.simpleFx = (() => {
  const v = parseInt(localStorage.getItem("astrofly-simplefx"), 10);
  return v >= 10 && v <= 100 ? v : 50;
})();
state.activePreset = null;

function setCtl(id, value) {
  const el = $(id);
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event("input"));
}

function applyFlightPreset(name) {
  const p = FLIGHT_PRESETS[name];
  if (!p) return;
  // Erst alles auf neutral, dann das Preset darüber
  $("ctlFlightMode").value = p.flightMode || "zoom";
  $("ctlFlightMode").dispatchEvent(new Event("change"));
  $("ctlEaseMode").value = "linear";
  $("ctlEaseMode").dispatchEvent(new Event("change"));
  $("ctlLoop").checked = false;
  $("ctlLoop").dispatchEvent(new Event("change"));
  for (const [id, v] of Object.entries(SIMPLE_DEFAULTS)) setCtl(id, v);
  $("ctlPreset").value = p.look;
  $("ctlPreset").dispatchEvent(new Event("change")); // setzt Look + mblurStars
  const k = state.simpleFx / 50;
  for (const [id, v] of Object.entries(p.set || {})) {
    const base = FX_SCALED[id];
    setCtl(id, base === undefined ? v : base + (v - base) * k);
  }
  for (const [id, v] of Object.entries(p.checks || {})) {
    $(id).checked = v;
    $(id).dispatchEvent(new Event("change"));
  }
  // Richtungswahl nur bei seitlichen Flügen anbieten und anwenden
  const lateral = p.flightMode === "lateral";
  $("simpleDirRow").hidden = !lateral;
  if (lateral) setCtl("ctlDriftDir", $("ctlSimpleDir").value);
  state.activePreset = name;
  for (const card of document.querySelectorAll(".pcard")) {
    card.classList.toggle("active", card.dataset.preset === name);
  }
}

// Effektstärke + Richtung wirken sofort auf das aktive Preset
$("ctlSimpleFx").value = state.simpleFx;
$("outSimpleFx").textContent = state.simpleFx + " %";
$("ctlSimpleFx").addEventListener("input", () => {
  state.simpleFx = parseInt($("ctlSimpleFx").value, 10);
  $("outSimpleFx").textContent = state.simpleFx + " %";
  localStorage.setItem("astrofly-simplefx", state.simpleFx);
  if (state.activePreset) applyFlightPreset(state.activePreset);
});
$("ctlSimpleDir").addEventListener("input", () => {
  $("outSimpleDir").textContent = $("ctlSimpleDir").value + "°";
  setCtl("ctlDriftDir", $("ctlSimpleDir").value);
});

for (const card of document.querySelectorAll(".pcard")) {
  card.addEventListener("click", () => applyFlightPreset(card.dataset.preset));
}

// Dauer-Regler im Einfach-Modus spiegelt den echten Dauer-Regler
$("ctlSimpleDuration").addEventListener("input", () => {
  const v = $("ctlSimpleDuration").value;
  $("outSimpleDuration").textContent = v + " s";
  setCtl("ctlDuration", v);
});

// Einfach/Profi-Umschaltung + Tab-Navigation: Jede Sektion trägt data-tab
// (ihren Profi-Tab) und optional data-easy (im Einfach-Modus sichtbar).
// Im Einfach-Modus werden die data-easy-Sektionen gestapelt angezeigt,
// im Profi-Modus nur die Sektionen des aktiven Tabs.
state.uiMode = localStorage.getItem("astrofly-mode") || "simple";
state.activeTab = localStorage.getItem("astrofly-tab") || "bilder";

function applyUiMode() {
  const simple = state.uiMode === "simple";
  $("modeSimple").classList.toggle("active", simple);
  $("modePro").classList.toggle("active", !simple);
  $("proTabs").hidden = simple;
  for (const b of document.querySelectorAll("#proTabs button")) {
    b.classList.toggle("active", b.dataset.tab === state.activeTab);
  }
  for (const sec of document.querySelectorAll("#panel section")) {
    if (sec.id === "simpleSection") { sec.hidden = !simple; continue; }
    sec.hidden = simple ? !sec.hasAttribute("data-easy")
                        : sec.dataset.tab !== state.activeTab;
  }
  localStorage.setItem("astrofly-mode", state.uiMode);
  localStorage.setItem("astrofly-tab", state.activeTab);
}
// Panel-Breite per Anfasser verstellbar (wird gespeichert)
{
  const savedW = parseInt(localStorage.getItem("astrofly-panelw") || "0", 10);
  if (savedW >= 300 && savedW <= 640) {
    $("panel").style.width = savedW + "px";
    $("panel").style.minWidth = savedW + "px";
  }
  let panelDrag = false;
  $("panelResize").addEventListener("pointerdown", (e) => {
    panelDrag = true;
    e.preventDefault();
    $("panelResize").setPointerCapture(e.pointerId);
  });
  $("panelResize").addEventListener("pointermove", (e) => {
    if (!panelDrag) return;
    const left = $("panel").getBoundingClientRect().left;
    const w = Math.min(640, Math.max(300, Math.round(e.clientX - left)));
    $("panel").style.width = w + "px";
    $("panel").style.minWidth = w + "px";
    localStorage.setItem("astrofly-panelw", String(w));
  });
  for (const evName of ["pointerup", "pointercancel"]) {
    $("panelResize").addEventListener(evName, () => { panelDrag = false; });
  }
}

$("modeSimple").addEventListener("click", () => { state.uiMode = "simple"; applyUiMode(); });
$("modePro").addEventListener("click", () => { state.uiMode = "pro"; applyUiMode(); });
for (const b of document.querySelectorAll("#proTabs button")) {
  b.addEventListener("click", () => {
    state.activeTab = b.dataset.tab;
    $("panelbody").scrollTop = 0;
    applyUiMode();
    setScenEdit(state.uiMode === "pro" && state.activeTab === "szenario");
  });
}
applyUiMode();

let smoothTimer = null;
$("ctlSmooth").addEventListener("input", () => {
  state.smooth = parseInt($("ctlSmooth").value, 10);
  $("outSmooth").textContent = state.smooth;
  clearTimeout(smoothTimer);
  smoothTimer = setTimeout(buildDepthMap, 200);
});
$("ctlInvert").addEventListener("change", () => {
  state.invertDepth = $("ctlInvert").checked;
  buildDepthMap();
});
// Tiefenkarte exportieren / eigene Tiefenkarte importieren
function updateDepthCustomUi(msg) {
  const status = $("depthCustomStatus");
  const active = !!state.customDepth;
  status.hidden = !msg && !active;
  status.textContent = msg || (active
    ? t("depthCustomActive", state.customDepth.width + "\u00d7" + state.customDepth.height) : "");
  $("btnDepthClear").hidden = !active;
}

$("btnDepthExport").addEventListener("click", () => {
  if (!state.starless) return;
  // In nativer Bildaufloesung rechnen, damit in Photoshop & Co.
  // pixelgenau auf dem Original gearbeitet werden kann
  const native = Math.max(state.starless.width, state.starless.height);
  const m = state.customDepth
    ? computeCustomDepthMap(state.smooth, state.invertDepth, native)
    : computeLuminanceMap(state.smooth, state.invertDepth, native);
  m.canvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const base = (state.starless.name || "astrofly").replace(/\.[^.]+$/, "");
    a.download = base + "-depthmap.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, "image/png");
});

$("btnDepthImport").addEventListener("click", () => {
  if (!state.starless) {
    updateDepthCustomUi(t("depthNoStarless"));
    return;
  }
  $("fileDepth").click();
});

$("fileDepth").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !state.starless) return;
  try {
    const img = await decodeFile(file);
    const aImg = img.width / img.height;
    const aStar = state.starless.width / state.starless.height;
    if (Math.abs(aImg - aStar) / aStar > 0.01) {
      updateDepthCustomUi(t("depthAspectErr"));
      return;
    }
    state.customDepth = img;
    updateDepthCustomUi();
    buildDepthMap();
  } catch (err) {
    console.error(err);
    updateDepthCustomUi(t("loadFailed", file.name, err.message));
  }
});

$("btnDepthClear").addEventListener("click", () => {
  state.customDepth = null;
  updateDepthCustomUi();
  buildDepthMap();
});

$("ctlDepthRes").addEventListener("change", () => {
  state.depthRes = parseInt($("ctlDepthRes").value, 10);
  buildDepthMap();
  buildSpinMask();
});

$("btnShuffle").addEventListener("click", () => {
  state.seed = Math.random() * 1000;
  if (state.genStars > 0) uploadStars(); // generierte Sterne neu würfeln
});

// Format
$("aspectBtns").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  for (const b of $("aspectBtns").children) b.classList.remove("active");
  btn.classList.add("active");
  const [aw, ah] = btn.dataset.aspect.split(":").map(Number);
  state.aspect = aw / ah;
  state.aspectName = btn.dataset.aspect;
  fitCanvas();
});

// Zoomziel-Anzeige (sprachabhängig, wird bei Sprachwechsel aktualisiert)
function updateTargetInfo() {
  const el = $("targetInfo");
  if (!state.starless || (state.target.x === 0 && state.target.y === 0)) {
    el.setAttribute("data-i18n", "targetCenter");
    el.textContent = t("targetCenter");
  } else {
    el.removeAttribute("data-i18n");
    const imgAspect = state.starless.width / state.starless.height;
    el.textContent = t("targetAt",
      (state.target.x / imgAspect * 100 + 50).toFixed(0),
      (50 - state.target.y * 100).toFixed(0));
  }
}
I18N.onChange.push(updateTargetInfo);

// ------------------------------------------ Echte Tiefen (Gaia): Bedienung

bindSlider("ctlGaiaAmt", "outGaiaAmt", "gaiaAmt", (v) => v + " %");
bindSlider("ctlGaiaPm", "outGaiaPm", "gaiaPmYears", (v) => v.toLocaleString());
bindSlider("ctlOcclude", "outOcclude", "occlude", (v) => v + " %");
bindSlider("ctlAnchor", "outAnchor", "anchorStars", (v) => v + " %");

// Laufende Katalog-Abfragen prominent über der Vorschau anzeigen -
// die kleine Statuszeile im Panel übersieht man leicht
function stageToast(text) {
  const el = $("stageToast");
  if (!el) return;
  if (!text) { el.hidden = true; return; }
  $("stageToastText").textContent = text;
  el.hidden = false;
}

// Statuszeile: transienter Text (Laden/Fehler) oder Zustand aus state
let gaiaTransient = null; // { key, args } | null
function updateGaiaStatus() {
  const el = $("gaiaStatus");
  if (!el) return;
  $("btnGaia").disabled = !(state.wcs && state.maskStarCount > 0);

  // Wissenschafts-Modus erst ab 75 % Erkennungsrate freischalten
  const g = state.gaiaDepth && state.gaiaInfo ? state.gaiaInfo : null;
  const pct = g ? Math.round((g.matched / Math.max(1, g.total)) * 100) : 0;
  const sciAllowed = pct >= 75;
  $("ctlGaiaOnly").disabled = !sciAllowed;
  // Solange NUR echte Gaia-Tiefen zählen, sind die Zufalls-Tiefen-Regler
  // und die Mischstärke ohne Funktion - sichtbar ausgrauen
  const gaiaLock = state.gaiaOnly && sciAllowed;
  for (const id of ["ctlStarDist", "ctlSpread", "ctlLayers", "ctlGaiaAmt"]) {
    const el = document.getElementById(id);
    if (el) el.disabled = gaiaLock;
  }
  $("ctlGaiaColors").disabled = !state.gaiaDepth;
  $("btnObjects").disabled = !(state.wcs && state.starless);
  if (!sciAllowed && state.gaiaOnly) {
    state.gaiaOnly = false;
    $("ctlGaiaOnly").checked = false;
  }

  stageToast(gaiaTransient && gaiaTransient.key === "gaiaQuerying" ? t("gaiaQuerying") : null);
  if (gaiaTransient) { el.textContent = t(gaiaTransient.key, ...gaiaTransient.args); return; }
  if (g) {
    el.textContent = t("gaiaResult", g.matched, g.total, pct, g.dMin, g.dMax) +
      (sciAllowed ? "" : " " + t("gaiaSciLocked"));
  } else if (state.wcs) {
    el.textContent = t("gaiaWcsOk", state.wcs._name || "WCS");
  } else {
    el.textContent = t("gaiaIdle");
  }
}
I18N.onChange.push(updateGaiaStatus);

$("btnGaiaHelp").addEventListener("click", () => {
  $("gaiaHelp").hidden = !$("gaiaHelp").hidden;
});

$("ctlGaiaOnly").addEventListener("change", () => {
  state.gaiaOnly = $("ctlGaiaOnly").checked;
  updateGaiaStatus();
});

$("ctlSpinStars").addEventListener("change", () => {
  state.spinStars = $("ctlSpinStars").checked;
});

$("ctlGaiaColors").addEventListener("change", () => {
  state.gaiaColors = $("ctlGaiaColors").checked;
  uploadStars(); // Farben stecken im Vertex-Puffer
});

$("ctlObjFar").addEventListener("change", () => {
  state.objFar = $("ctlObjFar").checked;
});

$("ctlStrictEdges").addEventListener("change", () => {
  state.strictEdges = $("ctlStrictEdges").checked;
});

// --------------------------- Objekt-Erkennung (SIMBAD) & Overlay-Bedienung

/**
 * Infokarte nach der aktuellen Auswahl setzen. "auto" bevorzugt die erkannte
 * Region (Gesamtkomplex), sonst das größte Objekt; ansonsten gilt die vom
 * Nutzer getroffene Wahl (Region oder ein bestimmtes Objekt).
 */
function applyCardChoice() {
  const items = state.objChoices || [];
  if (!items.length) { state.objInfo = null; return; }
  const reg = state.objRegion;
  const c = state.cardChoice || "auto";
  if (reg && (c === "auto" || c === "region")) {
    state.objInfo = { id: reg.id, facts: { de: reg.de, en: reg.en }, otype: reg.otype };
    return;
  }
  const pick = items.find((it) => it.id === c) || items[0];
  state.objInfo = { id: pick.id,
    facts: OBJECT_FACTS[normObjId(pick.id)] || starFacts(pick) || null, otype: pick.otype };
}

function rebuildObjList() {
  const box = $("objList");
  box.innerHTML = "";
  const lang = I18N.lang === "de" ? "de" : "en";
  // Auswahl, welches Objekt die Infokarte beschreibt (Auto/Region/Einzelobjekt)
  const row = $("cardObjRow");
  const sel = $("ctlCardObj");
  const items = state.objChoices || [];
  row.hidden = !items.length;
  sel.innerHTML = "";
  if (items.length) {
    const add = (value, text) => {
      const o = document.createElement("option");
      o.value = value; o.textContent = text;
      sel.appendChild(o);
    };
    add("auto", t("cardAuto"));
    if (state.objRegion) add("region", `${t("cardRegion")}: ${state.objRegion[lang].name}`);
    for (const it of items) {
      const facts = OBJECT_FACTS[normObjId(it.id)];
      add(it.id, facts ? `${it.id} – ${facts[lang].name}` : it.id);
    }
    sel.value = state.cardChoice || "auto";
    if (sel.selectedIndex < 0) sel.value = "auto";
  }
  if (!state.labels) return;
  for (const L of state.labels) {
    const lab = document.createElement("label");
    lab.className = "check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = L.on;
    cb.addEventListener("change", () => { L.on = cb.checked; });
    const span = document.createElement("span");
    const facts = OBJECT_FACTS[normObjId(L.id)];
    span.textContent = facts ? `${L.id} – ${facts[lang].name}` : L.id;
    // Ringgröße pro Label anpassbar (SIMBAD-Größen fehlen oft oder passen
    // nicht zum Ausschnitt)
    const rg = document.createElement("input");
    rg.type = "range";
    rg.min = 30; rg.max = 300; rg.value = Math.round((L.sizeMul || 1) * 100);
    rg.className = "objsize";
    rg.title = t("objRingSize");
    rg.addEventListener("input", () => { L.sizeMul = rg.value / 100; });
    lab.appendChild(cb);
    lab.appendChild(span);
    lab.appendChild(rg);
    box.appendChild(lab);
  }
}
I18N.onChange.push(rebuildObjList);

$("ctlShowInfo").addEventListener("change", () => { state.showInfo = $("ctlShowInfo").checked; });
$("ctlShowLabels").addEventListener("change", () => { state.showLabels = $("ctlShowLabels").checked; });
$("ctlStarDetails").addEventListener("change", () => { state.starDetails = $("ctlStarDetails").checked; });
$("ctlCardObj").addEventListener("change", () => {
  state.cardChoice = $("ctlCardObj").value;
  applyCardChoice();
});

// Beschriftungs-Stil (wird gespeichert)
{
  const saved = localStorage.getItem("astrofly-labelstyle");
  if (["editorial", "glass", "hud", "micro", "focus", "classic"].includes(saved)) {
    state.labelStyle = saved;
  }
  $("ctlLabelStyle").value = state.labelStyle;
  $("ctlLabelStyle").addEventListener("change", () => {
    state.labelStyle = $("ctlLabelStyle").value;
    localStorage.setItem("astrofly-labelstyle", state.labelStyle);
  });
}

$("btnObjects").addEventListener("click", async () => {
  if (!state.wcs || !state.starless) return;
  const wcs = state.wcs;
  const img = state.starless;
  const nax1 = wcs.naxis1 || img.width, nax2 = wcs.naxis2 || img.height;
  const c = wcsPix2Sky(wcs, nax1 / 2, nax2 / 2);
  const corner = wcsPix2Sky(wcs, 1, 1);
  const radius = Math.min(6, angSep(c.ra, c.dec, corner.ra, corner.dec) * 1.05 + 0.02);
  $("objStatus").textContent = t("objDetecting");
  stageToast(t("objDetecting"));
  $("btnObjects").disabled = true;
  try {
    const objs = await querySimbad(c.ra, c.dec, radius);
    // Markante Sterne (Wolf-Rayet, helle Sterne mit Eigennamen) sind ein
    // Bonus - scheitert nur diese Abfrage, fehlt lediglich die Stern-Ebene
    let starObjs = [];
    try { starObjs = await querySimbadStars(c.ra, c.dec, radius); } catch { /* optional */ }
    const imgAspect = img.width / img.height;
    const degPerPx = Math.sqrt(Math.abs(wcs.cd[0] * wcs.cd[3] - wcs.cd[1] * wcs.cd[2]));
    const items = [];
    for (const o of objs.concat(starObjs)) {
      if (o.star) {
        // Markante Sterne: kein Katalogfilter, feste kleine Ringgröße (~3');
        // durch die Größensortierung nie das Hauptobjekt der Infokarte
        const ps = planeOfSky(o.ra, o.dec);
        if (!ps) continue;
        if (Math.abs(ps.x) > imgAspect / 2 || Math.abs(ps.y) > 0.5) continue;
        items.push({ id: o.id, otype: o.otype, x: ps.x, y: ps.y,
          ra: o.ra, dec: o.dec,
          sizePlane: (3 / 60) / degPerPx / nax2, star: true });
        continue;
      }
      // Kuratierte Klassiker immer durchlassen: SIMBAD führt manche Teile
      // bekannter Objekte ohne oder mit kryptischem Typ (z. B. Cirrusnebel:
      // NGC 6992 = "sh", NGC 6995 ganz ohne Typ)
      const curated = OBJECT_FACTS[normObjId(o.id)] || OBJ_ARCMIN[normObjId(o.id)];
      if (!INTERESTING_OTYPES.has(o.otype) && !curated) continue;
      // Nur die bekannten Kataloge beschriften (keine kryptischen Survey-Ids)
      if (!/^(M|NGC|IC|SH2-)\d/.test(normObjId(o.id))) continue;
      const p = planeOfSky(o.ra, o.dec);
      if (!p) continue;
      if (Math.abs(p.x) > imgAspect / 2 || Math.abs(p.y) > 0.5) continue;
      const sizePlane = (o.sizeArcmin / 60) / degPerPx / nax2;
      items.push({ id: prettyObjId(o.id), otype: o.otype, x: p.x, y: p.y,
        ra: o.ra, dec: o.dec, sizePlane });
    }
    // Gaia-Astrophysik für die markanten Sterne (Radius/Masse/Alter) -
    // optionaler Bonus, Fehler hier kosten nur die Zusatzinfos
    try { await queryStarParams(items.filter((it) => it.star)); } catch { /* optional */ }
    if (!items.length) {
      state.objInfo = null; state.labels = null;
      state.objChoices = null; state.objRegion = null;
      rebuildObjList();
      $("objStatus").textContent = t("objNone");
    } else {
      items.sort((a, b) => b.sizePlane - a.sizePlane);
      state.objChoices = items;
      state.objRegion = findObjectRegion(items);
      state.cardChoice = "auto";
      applyCardChoice();
      // Hauptobjekt nur beschriften, wenn es nicht das halbe Bild füllt
      const labels = items.filter((it, idx) => idx > 0 || it.sizePlane < 0.35).slice(0, 6);
      state.labels = labels.map((it) => ({ ...it, on: true }));
      rebuildObjList();
      $("objStatus").textContent = t("objFound", items.length, state.objInfo.id);
    }
  } catch (e) {
    $("objStatus").textContent = e.server ? t("objSrvErr", e.status) : t("objNetErr");
  }
  stageToast(null);
  $("btnObjects").disabled = !state.wcs;
});

$("btnWcs").addEventListener("click", () => $("fileWcs").click());
$("fileWcs").addEventListener("change", async () => {
  const file = $("fileWcs").files[0];
  if (!file) return;
  gaiaTransient = null;
  try {
    // Nur die ersten Header-Blöcke lesen (reicht für die WCS-Keywords)
    const head = new Uint8Array(await file.slice(0, 57600).arrayBuffer());
    const wcs = parseWcsHeader(head);
    wcs._name = file.name;
    state.wcs = wcs;
    state.wcsFlip = undefined; state.wcsFit = null;
    state.gaiaCatalog = null;
    state.gaiaDepth = null; state.gaiaInfo = null; state.gaiaColorRGB = null; state.gaiaPM = null;
    reprojectLabels();
    uploadStars();
  } catch (e) {
    state.wcs = null;
    gaiaTransient = { key: "gaiaWcsErr", args: [] };
  }
  updateGaiaStatus();
  $("fileWcs").value = "";
});

$("btnGaia").addEventListener("click", async () => {
  if (!state.wcs || !state.maskStarCount) return;
  const wcs = state.wcs;
  const nax1 = wcs.naxis1 || state.stars.width, nax2 = wcs.naxis2 || state.stars.height;
  const c = wcsPix2Sky(wcs, nax1 / 2, nax2 / 2);
  // Radius: halbe Bilddiagonale plus etwas Reserve
  const corner = wcsPix2Sky(wcs, 1, 1);
  const radius = Math.min(6, angSep(c.ra, c.dec, corner.ra, corner.dec) * 1.1 + 0.02);
  gaiaTransient = { key: "gaiaQuerying", args: [] };
  updateGaiaStatus();
  $("btnGaia").disabled = true;
  try {
    const stars = await queryGaia(c.ra, c.dec, radius);
    gaiaTransient = null;
    // Katalog behalten: Damit übersteht der Abgleich einen Masken-Neuaufbau
    // (Stretch, Spiegeln, neue Maske) ohne neue Netzabfrage
    state.gaiaCatalog = stars;
    const info = matchGaia(stars);
    if (!info) gaiaTransient = { key: "gaiaNoMatch", args: [] };
  } catch (e) {
    gaiaTransient = e.server
      ? { key: "gaiaSrvErr", args: [e.status] }
      : { key: "gaiaNetErr", args: [] };
  }
  updateGaiaStatus();
});

// Zoomziel per Klick in die Vorschau
canvas.addEventListener("click", (e) => {
  if (!state.starless || state.exporting) return;
  if (state.scenEdit) {
    if (scenDragDist > 6) return; // Zieh-Ende ist kein Auswahl-Klick
    const rect = canvas.getBoundingClientRect();
    const cam = camAt(0);
    let best = -1, bd = 20; // Trefferradius in CSS-Pixeln
    state.waypoints.forEach((wp, i) => {
      const S = wpToScreen(wp.x, wp.y, cam, canvas.width, canvas.height);
      const sx = (S.x / canvas.width) * rect.width;
      const sy = (S.y / canvas.height) * rect.height;
      const d = Math.hypot(e.clientX - rect.left - sx, e.clientY - rect.top - sy);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) selectWaypoint(best);
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / rect.width;
  const fy = (e.clientY - rect.top) / rect.height;
  // Canvas-Punkt -> Bildebene mit der aktuellen Kamera (neutrale Tiefe)
  const { cam } = animParams(currentTime());
  const px = (fx - 0.5) * state.aspect;
  const py = (0.5 - fy);
  const c = Math.cos(cam.angle), s = Math.sin(cam.angle);
  const rx = c * px + s * py;   // R(a) wie im Shader (mat2 ist spaltenweise)
  const ry = -s * px + c * py;
  const imgAspect = state.starless.width / state.starless.height;
  const cover = coverBase(state.aspect, imgAspect);
  // Fixpunkt-Iteration wie im Shader: die Tiefe des angeklickten Objekts
  // bestimmt seine effektive Zoomrate, sonst trifft der Klick daneben
  const parallax = state.parallax / 100;
  const depthRange = 0.85 * (0.4 + 1.8 * state.depthBoost / 100);
  let qx = cam.cx + rx / (cover * cam.zoom);
  let qy = cam.cy + ry / (cover * cam.zoom);
  for (let i = 0; i < 3; i++) {
    const d = depthAtPlane(qx, qy, imgAspect);
    const exD = 1 + parallax * (d - 0.45) * depthRange;
    const sc = cover * Math.pow(cam.zoom, exD);
    qx = cam.cx + rx / sc;
    qy = cam.cy + ry / sc;
  }
  const clampedX = Math.min(imgAspect * 0.475, Math.max(-imgAspect * 0.475, qx));
  const clampedY = Math.min(0.475, Math.max(-0.475, qy));
  const wasSpinPick = state.spinPick;
  if (state.spinPick) {
    state.spinCenter = { x: clampedX, y: clampedY };
    state.spinPick = false;
    $("btnSpinCenter").classList.remove("active");
  } else {
    state.target.x = clampedX;
    state.target.y = clampedY;
    updateTargetInfo();
  }

  // Marker kurz einblenden
  const marker = $("targetMarker");
  marker.textContent = wasSpinPick ? "🌀" : "🎯";
  marker.hidden = false;
  marker.style.left = (canvas.offsetLeft + fx * rect.width) + "px";
  marker.style.top = (canvas.offsetTop + fy * rect.height) + "px";
  marker.style.animation = "none";
  void marker.offsetWidth; // Animation neu starten
  marker.style.animation = "";
});
canvas.addEventListener("dblclick", () => {
  if (state.scenEdit) return;
  state.target.x = 0;
  state.target.y = 0;
  updateTargetInfo();
});

// Transport
$("btnPlay").addEventListener("click", () => {
  if (state.scenEdit) setScenEdit(false);
  if (state.playing) {
    state.pausedAt = currentTime();
    state.playing = false;
    $("btnPlay").textContent = "▶";
  } else {
    state.t0 = performance.now() - state.pausedAt * 1000;
    state.playing = true;
    $("btnPlay").textContent = "⏸";
  }
});
$("btnRestart").addEventListener("click", () => {
  state.t0 = performance.now();
  state.pausedAt = 0;
});
// Leertaste = Play/Pause - außer wenn gerade ein Bedienelement den Fokus hat
// (Slider/Buttons reagieren selbst auf die Leertaste, Textfelder tippen)
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const el = document.activeElement;
  if (el && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) return;
  e.preventDefault();
  $("btnPlay").click();
});
$("timeline").addEventListener("click", (e) => {
  const rect = $("timeline").getBoundingClientRect();
  const f = (e.clientX - rect.left) / rect.width;
  const t = f * state.duration;
  state.t0 = performance.now() - t * 1000;
  state.pausedAt = t;
});

// ---------------------------------------------------------------- Dateien laden

async function loadFile(which, file) {
  const status = $("loadStatus");
  status.classList.remove("error");
  status.textContent = t("loading", file.name);
  try {
    const img = await decodeFile(file);
    if (which === "starless") {
      state.starless = img;
      $("nameStarless").removeAttribute("data-i18n");
      $("nameStarless").textContent = `${file.name} (${img.width}×${img.height})`;
      $("dropStarless").classList.add("loaded");
      if (texColor) gl.deleteTexture(texColor);
      const colSrc = downscale(img, 4096);
      texColor = makeTexture(colSrc);
      state.texColorW = colSrc.width;
      state.texColorH = colSrc.height;
      if (state.customDepth) {
        state.customDepth = null;
        updateDepthCustomUi(t("depthCustomCleared"));
      }
      if (state.moonMode) {
        state.moonDisk = detectMoonDisk();
        if (!state.moonDisk) {
          state.moonMode = false;
          $("ctlMoonMode").checked = false;
          $("moonStatus").textContent = t("moonNotFound");
        } else {
          $("moonStatus").textContent = t("moonFound", Math.round(state.moonDisk.r * 200));
        }
      }
      buildDepthMap();
      buildSpinMask();
      setScenEdit(state.scenEdit);
      // generierte Sterne nutzen das Seitenverhältnis des Starless-Bildes
      if (state.genStars > 0) uploadStars();
      // Export-Dateiname vom Bildnamen ableiten (bleibt überschreibbar)
      $("ctlFilename").placeholder = deriveExportName();
    } else {
      state.starsOriginal = img;
      $("nameStars").removeAttribute("data-i18n");
      $("nameStars").textContent = `${file.name} (${img.width}×${img.height})`;
      $("dropStars").classList.add("loaded");
      processStarMask();
    }
    // Plate-Solve-Lösung aus dem FITS-Header direkt übernehmen - der
    // separate WCS-Upload im Wissenschafts-Tab entfällt dann
    if (img.wcs) {
      img.wcs._name = file.name;
      state.wcs = img.wcs;
      state.wcsFlip = undefined; state.wcsFit = null;
      state.gaiaCatalog = null;
      state.gaiaDepth = null; state.gaiaInfo = null; state.gaiaColorRGB = null; state.gaiaPM = null;
      gaiaTransient = { key: "gaiaWcsAuto", args: [file.name] };
      reprojectLabels();
      uploadStars();
      updateGaiaStatus();
    }
    if (state.starless) {
      $("placeholder").style.display = "none";
      $("btnExport").disabled = false;
      state.t0 = performance.now();
      if (which === "starless") status.textContent = t("starlessLoaded");
    }
    // JPEG-Kompression erzeugt in dunklen Bereichen Chroma-Artefakte, die
    // Tiefenkarte und Nebelfarben-Masken stoeren - freundlich drauf hinweisen
    if (/\.jpe?g$/i.test(file.name)) {
      status.textContent = (status.textContent + " " + t("jpegWarn")).trim();
    }
  } catch (err) {
    console.error(err);
    status.classList.add("error");
    status.textContent = t("loadFailed", file.name, err.message);
  }
}

// ------------------------------------------------- Eigene Presets (localStorage)

// Welche Regler in welche Preset-Gruppe gehoeren. Bewusst NUR Regler-Werte:
// Bilddaten, Gaia-Abgleich und Plate-Solve werden nie mitgespeichert.
const USER_PRESET_GROUPS = {
  camera: ["ctlFlightMode", "ctlDriftDir", "ctlZoom", "ctlSpeed", "ctlEase",
    "ctlEaseMode", "ctlParallax", "ctlDepthBoost", "ctlRotation", "ctlOrient",
    "ctlFrameX", "ctlFrameY", "ctlTiltX", "ctlTiltY", "ctlSwayAmp",
    "ctlSwayTempo", "ctlSwayDir", "ctlSwayRandom", "ctlTiltRamp",
    "ctlTiltRampDir", "ctlFade", "ctlDuration", "ctlLoop", "ctlSpinSpeed",
    "ctlSpinRadius", "ctlSpinDiff", "ctlSpinFlat", "ctlSpinTilt",
    "ctlSpinMaskAmt", "ctlSpinStars"],
  stars: ["ctlSpread", "ctlStarDist", "ctlLayers", "ctlStarPar", "ctlTwinkle",
    "ctlTwinkleSpeed", "ctlStarSize", "ctlStarBright", "ctlStarSat",
    "ctlGenStars", "ctlOcclude", "ctlAnchor"],
  look: ["ctlBloom", "ctlMblur", "ctlMblurStars", "ctlWarp", "ctlVignette",
    "ctlExposure", "ctlContrast", "ctlSaturation", "ctlClarity",
    "ctlStructure", "ctlSharpen", "ctlH2Det", "ctlH2Width", "ctlH2Sat",
    "ctlH2Hue", "ctlO3Det", "ctlO3Width", "ctlO3Sat", "ctlO3Hue", "ctlS2Det",
    "ctlS2Width", "ctlS2Sat", "ctlS2Hue", "ctlBandFeather", "ctlLabelStyle"],
  format: ["ctlRes"],
};
const UP_KEY = "astrofly-user-presets";
const UP_GROUP_CHECKS = { camera: "upIncCamera", stars: "upIncStars",
  look: "upIncLook", format: "upIncFormat" };

function userPresets() {
  try { return JSON.parse(localStorage.getItem(UP_KEY)) || {}; } catch { return {}; }
}
function applyUserPreset(name) {
  const p = userPresets()[name];
  if (!p) return false;
  for (const [id, v] of Object.entries(p.values)) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.type === "checkbox") {
      el.checked = !!v;
      el.dispatchEvent(new Event("change"));
    } else {
      el.value = v;
      el.dispatchEvent(new Event("input"));
      el.dispatchEvent(new Event("change"));
    }
  }
  if (p.aspect) {
    const btn = document.querySelector(`#aspectBtns button[data-aspect="${p.aspect}"]`);
    if (btn) btn.click();
  }
  return true;
}

function rebuildUserPresetList() {
  const sel = $("userPresetSel");
  const cur = sel.value;
  sel.innerHTML = "";
  const names = Object.keys(userPresets()).sort();
  for (const name of names) {
    const o = document.createElement("option");
    o.value = o.textContent = name;
    sel.appendChild(o);
  }
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  const none = names.length === 0;
  $("btnPresetApply").disabled = none;
  $("btnPresetDelete").disabled = none;
  // Eigene Presets als Ein-Klick-Karten - auf der Easy-Seite UND im
  // Presets-Tab: ein Klick, und die gespeicherte Animation liegt zu 90 %
  // fertig auf dem eigenen Bild
  for (const [gridId, headId] of [["userPresetGrid", "userPresetGroupHead"],
                                  ["userPresetGrid2", "userPresetGroupHead2"]]) {
    const grid = document.getElementById(gridId);
    const head = document.getElementById(headId);
    if (!grid || !head) continue;
    grid.innerHTML = "";
    for (const name of names) {
      const b = document.createElement("button");
      b.className = "pcard";
      const bold = document.createElement("b");
      bold.textContent = name;
      b.appendChild(bold);
      b.addEventListener("click", () => applyUserPreset(name));
      grid.appendChild(b);
    }
    grid.hidden = none;
    head.hidden = none;
  }
}
$("btnPresetSave").addEventListener("click", () => {
  const name = $("userPresetName").value.trim();
  if (!name) { $("userPresetName").focus(); return; }
  const groups = Object.keys(UP_GROUP_CHECKS).filter((g) => $(UP_GROUP_CHECKS[g]).checked);
  const values = {};
  for (const g of groups) {
    for (const id of USER_PRESET_GROUPS[g]) {
      const el = document.getElementById(id);
      if (!el) continue;
      values[id] = el.type === "checkbox" ? el.checked : el.value;
    }
  }
  const all = userPresets();
  all[name] = { groups, values,
    aspect: groups.includes("format") ? (state.aspectName || "16:9") : null };
  localStorage.setItem(UP_KEY, JSON.stringify(all));
  rebuildUserPresetList();
  $("userPresetSel").value = name;
  $("userPresetStatus").textContent = t("upSaved", name);
});
$("btnPresetApply").addEventListener("click", () => {
  const name = $("userPresetSel").value;
  if (applyUserPreset(name)) $("userPresetStatus").textContent = t("upApplied", name);
});
$("btnPresetDelete").addEventListener("click", () => {
  const all = userPresets();
  delete all[$("userPresetSel").value];
  localStorage.setItem(UP_KEY, JSON.stringify(all));
  rebuildUserPresetList();
  $("userPresetStatus").textContent = "";
});
rebuildUserPresetList();

/** Spiegelt ein Bildobjekt ({width, height, canvas, ...}) in place -
 *  weitere Eigenschaften (z. B. eingebettetes WCS) bleiben erhalten. */
function flipImage(img, fh, fv) {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const x = c.getContext("2d");
  x.translate(fh ? img.width : 0, fv ? img.height : 0);
  x.scale(fh ? -1 : 1, fv ? -1 : 1);
  x.drawImage(img.canvas, 0, 0);
  img.canvas = c;
}

/**
 * Bild spiegeln (Starless + Sternmaske gemeinsam, sonst passt die Maske
 * nicht mehr aufs Bild): komplette Pipeline neu aufbauen. Ein bestehender
 * Gaia-Abgleich wird ungültig (Maskensterne neu extrahiert) - die
 * Beschriftungen werden über die Spiegel-Flags sofort mitgespiegelt.
 */
function flipMask(fh, fv) {
  if (state.starsOriginal) {
    flipImage(state.starsOriginal, fh, fv);
    processStarMask();
  } else if (state.stars) {
    flipImage(state.stars, fh, fv);
    buildStarBuffer();
  }
}

function applyImageFlip(fh, fv) {
  if (state.starless) {
    flipImage(state.starless, fh, fv);
    if (state.customDepth) flipImage(state.customDepth, fh, fv);
    if (texColor) gl.deleteTexture(texColor);
    const colSrc = downscale(state.starless, 4096);
    texColor = makeTexture(colSrc);
    state.texColorW = colSrc.width;
    state.texColorH = colSrc.height;
    buildDepthMap();
    buildSpinMask();
  }
  // "Nur Starless": Maske und damit das Koordinatensystem bleiben stehen -
  // für den Fall, dass Starless und Maske gegeneinander gespiegelt sind
  if (!state.flipOnlyStarless) flipMask(fh, fv);
  reprojectLabels();
  uploadStars();
  updateGaiaStatus();
}
// ------------------------------------------------- Szenario-Tab (Wegpunkte)

// Flugplan-Overlay: nummerierte Wegpunkte, Pfad und Bogen-Punkte in der
// Vorschau (nur waehrend der Einrichtung, nie im Export)
let wpSel = -1;

function wpToScreen(qx, qy, cam, W, H) {
  const viewAspect = state.aspect;
  const imgAspect = state.starless.width / state.starless.height;
  const cover = coverBase(viewAspect, imgAspect);
  const parallax = state.parallax / 100;
  const depthRange = 0.85 * (0.4 + 1.8 * state.depthBoost / 100);
  const d = depthAtPlane(qx, qy, imgAspect);
  const ex = 1 + parallax * (d - 0.45) * depthRange;
  const scaleD = cover * Math.pow(cam.zoom, ex);
  const prx = (qx - cam.cx) * scaleD;
  const pry = (qy - cam.cy) * scaleD;
  const rc = Math.cos(cam.angle), rs = Math.sin(cam.angle);
  const px = rc * prx - rs * pry, py = rs * prx + rc * pry;
  return { x: (px / viewAspect + 0.5) * W, y: (1 - (py + 0.5)) * H };
}

function drawWaypointOverlay(ctx, W, H, cam) {
  ctx.save(); // eigener Zustand: nichts darf in die Infokarten-Zeichnung lecken
  const wps = state.waypoints;
  const px = W / 1000; // grob aufloesungsunabhaengige Strichstaerken
  // Pfad (mit Boegen) als Linie
  ctx.lineWidth = 2 * px;
  ctx.strokeStyle = "rgba(143, 176, 255, 0.55)";
  ctx.setLineDash([6 * px, 5 * px]);
  for (let i = 1; i < wps.length; i++) {
    ctx.beginPath();
    for (let k = 0; k <= 16; k++) {
      const P = scenLegPos(wps[i - 1], wps[i], k / 16);
      const S = wpToScreen(P.x, P.y, cam, W, H);
      if (k === 0) ctx.moveTo(S.x, S.y); else ctx.lineTo(S.x, S.y);
    }
    ctx.stroke();
    // Bogen-Punkt als Raute
    if (wps[i].via) {
      const V = wpToScreen(wps[i].via.x, wps[i].via.y, cam, W, H);
      ctx.save();
      ctx.translate(V.x, V.y);
      ctx.rotate(Math.PI / 4);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(143, 176, 255, 0.9)";
      ctx.fillRect(-5 * px, -5 * px, 10 * px, 10 * px);
      ctx.restore();
      ctx.setLineDash([6 * px, 5 * px]);
    }
  }
  ctx.setLineDash([]);
  // Nummerierte Marker
  for (let i = 0; i < wps.length; i++) {
    const S = wpToScreen(wps[i].x, wps[i].y, cam, W, H);
    const r = 14 * px;
    const sel = i === wpSel;
    ctx.beginPath();
    ctx.arc(S.x, S.y, r, 0, Math.PI * 2);
    ctx.fillStyle = sel ? "#8fb0ff" : "rgba(10, 14, 22, 0.85)";
    ctx.fill();
    ctx.lineWidth = (sel ? 2.5 : 1.5) * px;
    ctx.strokeStyle = "#8fb0ff";
    ctx.stroke();
    ctx.fillStyle = sel ? "#0a0e16" : "#dfe6f5";
    ctx.font = `600 ${13 * px}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), S.x, S.y + 0.5 * px);
  }
  ctx.restore();
}

/** Ankunftszeit an Wegpunkt i im Plan (Sekunden ab Flugbeginn). */
function scenarioArrival(i) {
  const wps = state.waypoints;
  let tA = 0;
  for (let j = 0; j <= i && j < wps.length; j++) {
    if (j > 0) tA += Math.max(0.2, wps[j].dur || 0.2);
    if (j < i) tA += Math.max(0, wps[j].hold || 0);
  }
  return tA;
}

/** Wegpunkt auswaehlen: Highlight im Bild UND in der Liste (beide Wege). */
function selectWaypoint(i) {
  wpSel = i;
  document.querySelectorAll("#wpList .wprow").forEach((row, idx) => {
    row.classList.toggle("sel", idx === i);
  });
  const row = document.querySelectorAll("#wpList .wprow")[i];
  if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/** Kamera-Regler sperren/freigeben und Videolaenge an den Plan koppeln. */
function updateScenarioUi() {
  const on = scenarioActive();
  for (const id of ["ctlFlightMode", "ctlDriftDir", "ctlZoom", "ctlSpeed",
    "ctlEaseMode", "ctlEase", "ctlDuration",
    "ctlRotation", "ctlSwayAmp", "ctlTiltRamp"]) {
    const el = $(id);
    if (el) el.disabled = on;
  }
  if (on) {
    const total = scenarioTotal();
    state.duration = state.loopMode ? total * 2 : total;
    $("outDuration").textContent = state.duration.toFixed(1).replace(/\.0$/, "") + " s";
    $("scenStatus").textContent = t("scenActive", state.waypoints.length,
      state.duration.toFixed(1).replace(/\.0$/, ""));
  } else {
    state.duration = parseFloat($("ctlDuration").value);
    $("outDuration").textContent = state.duration + " s";
    $("scenStatus").textContent = state.scenarioOn && state.waypoints.length < 2
      ? t("scenNeedTwo") : "";
  }
}

/** Wegpunkt-Liste als editierbare Zeilen neu aufbauen. */
function rebuildWaypointList() {
  const list = $("wpList");
  list.innerHTML = "";
  const imgAspect = state.starless
    ? state.starless.width / state.starless.height : 16 / 9;
  state.waypoints.forEach((wp, i) => {
    const row = document.createElement("div");
    row.className = "wprow" + (i === wpSel ? " sel" : "");
    row.addEventListener("click", (e) => {
      if (e.target.closest("input, select, button")) return;
      selectWaypoint(i);
    });
    const pos = `${Math.round(wp.x / imgAspect * 200)} | ${Math.round(wp.y * 200)}`;
    row.innerHTML =
      `<b>${i + 1}</b><span class="wppos">${pos}</span>` +
      `<label>${t("wpZoom")} <input type="number" data-k="zoom" min="1" max="8" step="0.05" value="${wp.zoom}"></label>` +
      `<label>${t("wpAngle")} <input type="number" data-k="angle" min="-180" max="180" step="0.5" value="${wp.angle || 0}"></label>` +
      (i > 0 ? `<label>${t("wpDur")} <input type="range" data-r="dur" min="0.2" max="10" step="0.1" value="${Math.min(10, wp.dur)}"><input type="number" data-k="dur" min="0.2" max="60" step="0.1" value="${wp.dur}"></label>` : "") +
      `<label>${t("wpHold")} <input type="range" data-r="hold" min="0" max="10" step="0.1" value="${Math.min(10, wp.hold)}"><input type="number" data-k="hold" min="0" max="30" step="0.1" value="${wp.hold}"></label>` +
      (i > 0 ? `<select data-k="ease"><option value="smooth">${t("wpEaseSmooth")}</option><option value="linear">${t("wpEaseLinear")}</option><option value="custom">${t("wpEaseCustom")}</option></select>` : "") +
      (i > 0 ? `<button class="wpbtn" data-a="curve" title="${t("wpCurve")}">&#8767;</button>` : "") +
      `<label class="wpchk" title="${t("wpFloatTip")}"><input type="checkbox" data-k="floatOn"${wp.floatOn ? " checked" : ""}> ${t("wpFloat")}</label>` +
      (i > 0 ? `<button class="wpbtn" data-a="via" title="${wp.via ? t("wpViaClear") : t("wpViaSet")}">${wp.via ? "\u222a\u2715" : "\u222a"}</button>` : "") +
      `<button class="wpbtn" data-a="play" title="${t("wpPlayFrom")}">\u25b6</button>` +
      `<button class="wpbtn" data-a="goto" title="${t("wpGoto")}">\u2316</button>` +
      `<button class="wpbtn" data-a="up" title="\u2191">\u2191</button>` +
      `<button class="wpbtn" data-a="down" title="\u2193">\u2193</button>` +
      `<button class="wpbtn" data-a="del" title="\u2715">\u2715</button>`;
    const sel = row.querySelector('select[data-k="ease"]');
    if (sel) sel.value = wp.ease || "smooth";
    row.querySelectorAll("input[data-k], select[data-k]").forEach((el) => {
      el.addEventListener("change", () => {
        const k = el.dataset.k;
        wp[k] = k === "ease" ? el.value
          : el.type === "checkbox" ? el.checked : parseFloat(el.value);
        if (k === "ease" && el.value === "custom") openEaseEditor(i);
        const rng = row.querySelector(`input[data-r="${k}"]`);
        if (rng) rng.value = String(Math.min(10, wp[k]));
        updateScenarioUi();
      });
    });
    row.querySelectorAll("input[data-r]").forEach((el) => {
      el.addEventListener("input", () => {
        const k = el.dataset.r;
        wp[k] = parseFloat(el.value);
        const num = row.querySelector(`input[data-k="${k}"]`);
        if (num) num.value = el.value;
        updateScenarioUi();
      });
    });
    row.querySelectorAll("button[data-a]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const a = btn.dataset.a;
        if (a === "curve") {
          openEaseEditor(i);
          return;
        }
        if (a === "via") {
          // Bogen setzen: aktueller Bildmittelpunkt der Einrichtung wird der
          // Zwischenpunkt der Etappe; erneuter Klick entfernt den Bogen
          wp.via = wp.via ? null : { x: state.scenView.x, y: state.scenView.y };
          rebuildWaypointList();
          return;
        }
        if (a === "play") {
          if (!state.scenarioOn) {
            state.scenarioOn = true;
            $("ctlScenOn").checked = true;
            updateScenarioUi();
          }
          setScenEdit(false);
          const tStart = Math.min(state.duration - 0.01, scenarioArrival(i));
          state.pausedAt = tStart;
          state.t0 = performance.now() - tStart * 1000;
          if (!state.playing) $("btnPlay").click();
          return;
        }
        if (a === "goto") {
          if (!state.scenarioOn) {
            state.scenarioOn = true;
            $("ctlScenOn").checked = true;
            updateScenarioUi();
          }
          state.scenView = { x: wp.x, y: wp.y, zoom: wp.zoom, angle: wp.angle || 0 };
          setScenEdit(true);
          return;
        }
        if (a === "del") state.waypoints.splice(i, 1);
        wpSel = -1;
        $("easeEditor").hidden = true; easeEditIdx = -1;
        if (a === "up" && i > 0) [state.waypoints[i - 1], state.waypoints[i]] = [state.waypoints[i], state.waypoints[i - 1]];
        if (a === "down" && i < state.waypoints.length - 1) [state.waypoints[i + 1], state.waypoints[i]] = [state.waypoints[i], state.waypoints[i + 1]];
        rebuildWaypointList();
        updateScenarioUi();
      });
    });
    list.appendChild(row);
  });
}

// Kurven-Editor fuer eigenes Easing je Etappe (Bezier wie in Schnittprogrammen)
let easeEditIdx = -1;

function easeEditorLayout() {
  const cv = $("easeCanvas");
  const P = 24; // Innenabstand
  return { cv, g: cv.getContext("2d"), P, w: cv.width - P * 2, h: cv.height - P * 2 };
}

function drawEaseEditor() {
  const wp = state.waypoints[easeEditIdx];
  if (!wp) return;
  const { cv, g, P, w, h } = easeEditorLayout();
  const c = wp.curve || [0.42, 0, 0.58, 1];
  const X = (x) => P + x * w;
  const Y = (y) => P + (1 - y) * h;
  g.clearRect(0, 0, cv.width, cv.height);
  // Raster
  g.strokeStyle = "#1d2331"; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(X(i / 4), Y(0)); g.lineTo(X(i / 4), Y(1)); g.stroke();
    g.beginPath(); g.moveTo(X(0), Y(i / 4)); g.lineTo(X(1), Y(i / 4)); g.stroke();
  }
  // Diagonale (linear) als Referenz
  g.strokeStyle = "#2a3145";
  g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(1), Y(1)); g.stroke();
  // Griff-Linien
  g.strokeStyle = "#4a5570";
  g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(c[0]), Y(c[1])); g.stroke();
  g.beginPath(); g.moveTo(X(1), Y(1)); g.lineTo(X(c[2]), Y(c[3])); g.stroke();
  // Kurve
  g.strokeStyle = "#8fb0ff"; g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i <= 60; i++) {
    const k = i / 60;
    const y = bezierEase(c[0], c[1], c[2], c[3], k);
    if (i === 0) g.moveTo(X(k), Y(y)); else g.lineTo(X(k), Y(y));
  }
  g.stroke();
  // Griffe
  for (const [hx, hy] of [[c[0], c[1]], [c[2], c[3]]]) {
    g.fillStyle = "#eef2ff";
    g.beginPath(); g.arc(X(hx), Y(hy), 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#8fb0ff"; g.lineWidth = 1.5;
    g.beginPath(); g.arc(X(hx), Y(hy), 6, 0, Math.PI * 2); g.stroke();
  }
}

function openEaseEditor(i) {
  easeEditIdx = i;
  const wp = state.waypoints[i];
  if (!wp.curve) wp.curve = wp.ease === "linear" ? [0.25, 0.25, 0.75, 0.75] : [0.42, 0, 0.58, 1];
  wp.ease = "custom";
  $("easeEditor").hidden = false;
  $("easeEditWp").textContent = String(i + 1);
  rebuildWaypointList();
  drawEaseEditor();
}

let easeDrag = -1;
$("easeCanvas").addEventListener("pointerdown", (e) => {
  const wp = state.waypoints[easeEditIdx];
  if (!wp) return;
  const { cv, P, w, h } = easeEditorLayout();
  const r = cv.getBoundingClientRect();
  const sx = cv.width / r.width, sy = cv.height / r.height;
  const px = (e.clientX - r.left) * sx, py = (e.clientY - r.top) * sy;
  const c = wp.curve;
  const d = (hx, hy) => Math.hypot(px - (P + hx * w), py - (P + (1 - hy) * h));
  easeDrag = d(c[0], c[1]) < d(c[2], c[3]) ? 0 : 2;
  if (Math.min(d(c[0], c[1]), d(c[2], c[3])) > 30) { easeDrag = -1; return; }
  $("easeCanvas").setPointerCapture(e.pointerId);
});
$("easeCanvas").addEventListener("pointermove", (e) => {
  if (easeDrag < 0) return;
  const wp = state.waypoints[easeEditIdx];
  if (!wp) return;
  const { cv, P, w, h } = easeEditorLayout();
  const r = cv.getBoundingClientRect();
  const sx = cv.width / r.width, sy = cv.height / r.height;
  const px = (e.clientX - r.left) * sx, py = (e.clientY - r.top) * sy;
  wp.curve[easeDrag] = Math.min(1, Math.max(0, (px - P) / w));
  wp.curve[easeDrag + 1] = Math.min(1.4, Math.max(-0.4, 1 - (py - P) / h));
  drawEaseEditor();
});
for (const evName of ["pointerup", "pointercancel"]) {
  $("easeCanvas").addEventListener(evName, () => { easeDrag = -1; });
}
for (const btn of document.querySelectorAll("#easePresets button")) {
  btn.addEventListener("click", () => {
    const wp = state.waypoints[easeEditIdx];
    if (!wp) return;
    wp.curve = btn.dataset.c.split(",").map(Number);
    drawEaseEditor();
  });
}
$("btnEaseClose").addEventListener("click", () => {
  $("easeEditor").hidden = true;
  easeEditIdx = -1;
});

// Sprachwechsel: dynamisch gebaute Wegpunkt-Zeilen und Status neu uebersetzen
I18N.onChange.push(() => {
  rebuildWaypointList();
  updateScenarioUi();
});

$("wpDurNextR").addEventListener("input", () => {
  $("wpDurNext").value = $("wpDurNextR").value;
});
$("wpDurNext").addEventListener("change", () => {
  $("wpDurNextR").value = String(Math.min(10, parseFloat($("wpDurNext").value) || 5));
});

$("btnWpAdd").addEventListener("click", () => {
  if (!state.scenarioOn) {
    state.scenarioOn = true;
    $("ctlScenOn").checked = true;
  }
  if (!state.scenEdit) setScenEdit(true);
  const v = state.scenView;
  const durNext = Math.min(60, Math.max(0.2, parseFloat($("wpDurNext").value) || 5));
  state.waypoints.push({
    x: v.x, y: v.y, zoom: +v.zoom.toFixed(3), angle: +v.angle.toFixed(1),
    dur: durNext, hold: 0.5, ease: "smooth",
  });
  rebuildWaypointList();
  updateScenarioUi();
});

// Flugplan-Einrichtung: Steuerkreuz im Bild (Pan/Zoom/Rotation), gedrueckt
// halten wiederholt. Der eingerichtete Blick wird per Wegpunkt gespeichert.
function scenClampView() {
  const v = state.scenView;
  v.zoom = Math.min(8, Math.max(1, v.zoom));
  const imgAspect = state.starless
    ? state.starless.width / state.starless.height : 16 / 9;
  const cover = coverBase(state.aspect, imgAspect);
  const sc = cover * v.zoom;
  const freeX = Math.max(0, imgAspect / 2 - (state.aspect / 2) / sc) * 0.98;
  const freeY = Math.max(0, 0.5 - 0.5 / sc) * 0.98;
  v.x = Math.min(freeX, Math.max(-freeX, v.x));
  v.y = Math.min(freeY, Math.max(-freeY, v.y));
}

function scenPadStep(action) {
  const v = state.scenView;
  const pan = 0.02 / v.zoom;
  const a = (state.orientation + v.angle) * Math.PI / 180;
  const c = Math.cos(a), s = Math.sin(a);
  // Bildschirm-Richtung in die (gedrehte) Bildebene uebersetzen
  const move = (dx, dy) => { v.x += pan * (dx * c + dy * s); v.y += pan * (-dx * s + dy * c); };
  switch (action) {
    case "up": move(0, 1); break;
    case "down": move(0, -1); break;
    case "left": move(-1, 0); break;
    case "right": move(1, 0); break;
    case "zin": v.zoom *= 1.03; break;
    case "zout": v.zoom /= 1.03; break;
    case "rotl": v.angle -= 1; break;
    case "rotr": v.angle += 1; break;
  }
  scenClampView();
}

function setScenEdit(on) {
  on = on && state.scenarioOn; // Einrichtung nur, wenn der Plan aktiviert ist
  if (on && !state.scenEdit) {
    const last = state.waypoints[state.waypoints.length - 1];
    state.scenView = last
      ? { x: last.x, y: last.y, zoom: last.zoom, angle: last.angle || 0 }
      : { x: 0, y: 0, zoom: state.zoomBase, angle: 0 };
    scenClampView();
  }
  state.scenEdit = on;
  if (on && state.playing) {
    state.pausedAt = currentTime();
    state.playing = false;
    $("btnPlay").textContent = "\u25b6";
  }
  $("scenPad").hidden = !on || !state.starless;
}

for (const btn of document.querySelectorAll("#scenPad button")) {
  const action = btn.dataset.p;
  if (action === "set") {
    btn.addEventListener("click", () => $("btnWpAdd").click());
    continue;
  }
  let rep = null;
  const start = (e) => {
    e.preventDefault();
    scenPadStep(action);
    clearInterval(rep);
    rep = setInterval(() => scenPadStep(action), 60);
  };
  const stop = () => { clearInterval(rep); rep = null; };
  btn.addEventListener("pointerdown", start);
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(ev, stop);
}

// Maussteuerung in der Einrichtung: Mausrad zoomt, Links-Ziehen greift das
// Bild (Kamera folgt der Maus), Rechts-Ziehen dreht die Kamera
let scenDrag = null;
let scenDragDist = 0;
canvas.addEventListener("wheel", (e) => {
  if (!state.scenEdit || !state.starless) return;
  e.preventDefault();
  state.scenView.zoom *= Math.exp(-e.deltaY * 0.0013);
  scenClampView();
}, { passive: false });
canvas.addEventListener("pointerdown", (e) => {
  if (!state.scenEdit || !state.starless) return;
  if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
  e.preventDefault();
  scenDrag = { b: e.button, x: e.clientX, y: e.clientY };
  scenDragDist = 0;
  // Linksklick auf einen Wegpunkt-Marker: den Punkt verschieben statt pannen
  if (e.button === 0 && state.waypoints.length) {
    const rect = canvas.getBoundingClientRect();
    const cam = camAt(0);
    let best = -1, bd = 18;
    state.waypoints.forEach((wp, i) => {
      const S = wpToScreen(wp.x, wp.y, cam, canvas.width, canvas.height);
      const sx = (S.x / canvas.width) * rect.width;
      const sy = (S.y / canvas.height) * rect.height;
      const d = Math.hypot(e.clientX - rect.left - sx, e.clientY - rect.top - sy);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) {
      scenDrag.wp = best;
      selectWaypoint(best);
    }
  }
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!scenDrag || !state.scenEdit) return;
  const dx = e.clientX - scenDrag.x, dy = e.clientY - scenDrag.y;
  scenDrag.x = e.clientX; scenDrag.y = e.clientY;
  scenDragDist += Math.abs(dx) + Math.abs(dy);
  // Wegpunkt-Marker ziehen: Zeigerposition -> Bildebene (gleiche
  // tiefenbewusste Fixpunkt-Iteration wie das Klick-Ziel)
  if (scenDrag.wp !== undefined) {
    const wp = state.waypoints[scenDrag.wp];
    const rect = canvas.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const cam = camAt(0);
    const px = (fx - 0.5) * state.aspect;
    const py = (0.5 - fy);
    const c = Math.cos(cam.angle), s = Math.sin(cam.angle);
    const rx = c * px + s * py;
    const ry = -s * px + c * py;
    const imgAspect = state.starless.width / state.starless.height;
    const cover = coverBase(state.aspect, imgAspect);
    const parallax = state.parallax / 100;
    const depthRange = 0.85 * (0.4 + 1.8 * state.depthBoost / 100);
    let qx = cam.cx + rx / (cover * cam.zoom);
    let qy = cam.cy + ry / (cover * cam.zoom);
    for (let i = 0; i < 3; i++) {
      const d = depthAtPlane(qx, qy, imgAspect);
      const exD = 1 + parallax * (d - 0.45) * depthRange;
      const sc = cover * Math.pow(cam.zoom, exD);
      qx = cam.cx + rx / sc;
      qy = cam.cy + ry / sc;
    }
    wp.x = Math.min(imgAspect * 0.475, Math.max(-imgAspect * 0.475, qx));
    wp.y = Math.min(0.475, Math.max(-0.475, qy));
    return;
  }
  const v = state.scenView;
  if (scenDrag.b === 1 || scenDrag.b === 2) {
    v.angle += dx * 0.25;
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const imgAspect = state.starless.width / state.starless.height;
  const cover = coverBase(state.aspect, imgAspect);
  const k = 1 / (rect.height * cover * v.zoom);
  const a = (state.orientation + v.angle) * Math.PI / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const mx = -dx * k, my = dy * k;
  v.x += mx * c + my * s;
  v.y += -mx * s + my * c;
  scenClampView();
});
for (const evName of ["pointerup", "pointercancel"]) {
  canvas.addEventListener(evName, () => {
    // Nach dem Verschieben eines Markers die Zeilen-Anzeige auffrischen
    if (scenDrag && scenDrag.wp !== undefined) rebuildWaypointList();
    scenDrag = null;
  });
}
canvas.addEventListener("contextmenu", (e) => {
  if (state.scenEdit) e.preventDefault();
});

$("btnScenReset").addEventListener("click", () => {
  if (!state.scenarioOn) return;
  if (!state.scenEdit) setScenEdit(true);
  state.scenView = { x: 0, y: 0, zoom: 1, angle: 0 };
});

$("selMoonObj").addEventListener("change", () => {
  state.moonObj = $("selMoonObj").value;
});

$("ctlScenOn").addEventListener("change", () => {
  state.scenarioOn = $("ctlScenOn").checked;
  setScenEdit(state.scenarioOn && state.uiMode === "pro" && state.activeTab === "szenario");
  updateScenarioUi();
});

// Mond-Modus: Scheibe erkennen und Kugel-Tiefe aktivieren (Prototyp)
$("ctlRealStars").addEventListener("change", () => {
  state.realStars = $("ctlRealStars").checked;
});

$("ctlMoonMode").addEventListener("change", () => {
  const on = $("ctlMoonMode").checked;
  const status = $("moonStatus");
  $("moonObjRow").hidden = !on;
  if (on) {
    if (!state.starless) {
      $("ctlMoonMode").checked = false;
      status.textContent = t("moonNoImage");
      return;
    }
    state.moonDisk = detectMoonDisk();
    if (!state.moonDisk) {
      $("ctlMoonMode").checked = false;
      state.moonMode = false;
      status.textContent = t("moonNotFound");
      buildDepthMap();
      return;
    }
    state.moonMode = true;
    status.textContent = t("moonFound", Math.round(state.moonDisk.r * 200));
  } else {
    state.moonMode = false;
    status.textContent = "";
  }
  buildDepthMap();
});

$("ctlFlipH").addEventListener("change", () => {
  state.flipH = $("ctlFlipH").checked;
  applyImageFlip(true, false);
});
$("ctlFlipV").addEventListener("change", () => {
  state.flipV = $("ctlFlipV").checked;
  applyImageFlip(false, true);
});
// Umfang wechseln, während eine Spiegelung aktiv ist: die Maske zieht
// nach (Spiegelung anwenden bzw. zurücknehmen), Labels folgen
$("ctlFlipOnly").addEventListener("change", () => {
  state.flipOnlyStarless = $("ctlFlipOnly").checked;
  if (state.flipH || state.flipV) {
    flipMask(state.flipH, state.flipV);
    reprojectLabels();
    uploadStars();
    updateGaiaStatus();
  }
});

// Demo-Bilder (Orionnebel, aufgenommen von Michael Döhler) aus dem Repo laden –
// so kann jeder die App sofort ausprobieren, auch ohne eigene Dateien
$("btnDemo").addEventListener("click", async () => {
  const status = $("loadStatus");
  status.classList.remove("error");
  status.textContent = t("demoLoading");
  $("btnDemo").disabled = true;
  try {
    const fetchImg = async (url, name) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return new File([await r.blob()], name, { type: "image/jpeg" });
    };
    const starless = await fetchImg("demo/orion_starless.jpg", "orion_demo.jpg");
    const stars = await fetchImg("demo/orion_starmask.jpg", "orion_demo_starmask.jpg");
    await loadFile("starless", starless);
    await loadFile("stars", stars);
    // Plate-Solve-Lösung des Demobilds automatisch übernehmen –
    // Gaia-Abgleich und Objekterkennung sind damit sofort nutzbar
    try {
      const rw = await fetch("demo/orion.wcs");
      if (rw.ok) {
        const wcs = parseWcsHeader(new Uint8Array(await rw.arrayBuffer()));
        wcs._name = "orion.wcs";
        gaiaTransient = null;
        state.wcs = wcs;
        state.wcsFlip = undefined;
        state.wcsFit = null;
        state.gaiaCatalog = null;
        state.gaiaDepth = null; state.gaiaInfo = null; state.gaiaColorRGB = null; state.gaiaPM = null;
        reprojectLabels();
        uploadStars();
        updateGaiaStatus();
      }
    } catch { /* Demo funktioniert auch ohne Plate-Solve */ }
    status.textContent = t("demoLoaded", state.starCount) +
      (state.wcs && state.wcs._name === "orion.wcs" ? " " + t("demoWcs") : "");
  } catch (err) {
    console.error(err);
    status.classList.add("error");
    status.textContent = location.protocol === "file:"
      ? t("demoNeedsHttp") : t("demoFailed", err.message);
  } finally {
    $("btnDemo").disabled = false;
  }
});

$("fileStarless").addEventListener("change", (e) => {
  if (e.target.files[0]) loadFile("starless", e.target.files[0]);
});
$("fileStars").addEventListener("change", (e) => {
  if (e.target.files[0]) loadFile("stars", e.target.files[0]);
});

// Drag & Drop auf die Buttons und die Bühne
for (const [zone, which] of [["dropStarless", "starless"], ["dropStars", "stars"]]) {
  const el = $(zone);
  el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("dragover"); });
  el.addEventListener("dragleave", () => el.classList.remove("dragover"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("dragover");
    if (e.dataTransfer.files[0]) loadFile(which, e.dataTransfer.files[0]);
  });
}
const stage = $("stage");
stage.addEventListener("dragover", (e) => e.preventDefault());
stage.addEventListener("drop", (e) => {
  e.preventDefault();
  const files = [...e.dataTransfer.files];
  if (files[0]) loadFile("starless", files[0]);
  if (files[1]) loadFile("stars", files[1]);
});

// ---------------------------------------------------------------- Export

function exportDims() {
  const base = parseInt($("ctlRes").value, 10); // kurze Kante
  let w, h;
  if (state.aspect >= 1) { h = base; w = Math.round(base * state.aspect); }
  else { w = base; h = Math.round(base / state.aspect); }
  return [w & ~1, h & ~1];
}

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

function saveBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

function beginExport(w, h) {
  state.exporting = true;
  canvas.width = w;
  canvas.height = h;
  $("btnExport").disabled = true;
  $("exportProgressWrap").hidden = false;
  $("exportProgress").style.width = "0%";
}

function endExport(message) {
  state.exporting = false;
  state.offlineExport = false;
  $("btnExport").disabled = false;
  $("exportProgressWrap").hidden = true;
  fitCanvas();
  state.t0 = performance.now();
  $("exportStatus").textContent = message;
}

/** Basisnamen aus dem Starless-Dateinamen ableiten ("orion_starless.tif" -> "orion"). */
function deriveExportName() {
  const n = (state.starless && state.starless.name) || "";
  let base = n.replace(/\.[a-z0-9]+(\s*×3)?$/i, "");
  base = base.replace(/star_?less|sternlos/gi, "");
  base = base.replace(/[-_ .]{2,}/g, "_").replace(/^[-_ .]+|[-_ .]+$/g, "");
  return base || "astrofly";
}

function exportFilename(ext) {
  const custom = $("ctlFilename").value.trim().replace(/[\\/:*?"<>|]/g, "");
  const base = custom || deriveExportName();
  return `${base}_${state.aspectName.replace(":", "x")}_${state.duration}s.${ext}`;
}

/**
 * Bevorzugter Weg: deterministischer Offline-Export über WebCodecs.
 * Jedes Frame wird einzeln gerendert und kodiert – das Ergebnis ist auch
 * dann flüssig (30 fps), wenn der Rechner nicht in Echtzeit rendern kann.
 * Gibt false zurück, wenn WebCodecs/H.264 nicht verfügbar ist.
 */
// Safari/WebKit: Der WebCodecs-Export erzeugt dort MP4s mit fehlerhaften
// Metadaten (Schnitt-Apps wie Instagram Edits zeigen nur ein Standbild) und
// kann die Seite sogar zum Absturz bringen. Safari nimmt deshalb immer den
// bewährten MediaRecorder-Weg – der liefert dort saubere H.264-MP4s.
const IS_SAFARI = /apple/i.test(navigator.vendor || "") &&
  !/crios|fxios|chrome|edg/i.test(navigator.userAgent);

// In-App-Browser (Instagram, Facebook, TikTok & Co.): deren WebView kann
// Blob-Downloads nicht speichern – der Export liefe am Ende ins Leere
// ("Seite kann nicht geladen werden"). Wir warnen früh und blocken den Export.
const IS_INAPP = /instagram|fban|fbav|fbios|fb_iab|tiktok|musical_ly|snapchat|line\//i
  .test(navigator.userAgent);

async function exportOffline(w, h, fps) {
  if (typeof VideoEncoder === "undefined" || IS_SAFARI) return false;

  // Codec-Kandidaten: H.264 in MP4 (Chrome/Edge), sonst VP9/VP8 in WebM
  const bitrate = Math.min(50_000_000, Math.round(w * h * fps * 0.12));
  const candidates = [];
  if (typeof Mp4Muxer !== "undefined") {
    candidates.push({ codec: (w > 1920 || h > 1920) ? "avc1.640033" : "avc1.640028", container: "mp4" });
  }
  if (typeof WebMMuxer !== "undefined") {
    candidates.push({ codec: "vp09.00.41.08", container: "webm" });
    candidates.push({ codec: "vp8", container: "webm" });
  }

  let config = null, container = null;
  for (const cand of candidates) {
    const c = {
      codec: cand.codec, width: w, height: h, framerate: fps,
      bitrate, latencyMode: "quality",
    };
    try {
      const support = await VideoEncoder.isConfigSupported(c);
      if (support.supported) { config = c; container = cand.container; break; }
    } catch { /* Kandidat nicht unterstützt */ }
  }
  if (!config) return false;

  beginExport(w, h);
  state.offlineExport = true;
  const status = $("exportStatus");
  status.textContent = t("renderingOffline", w, h, state.duration);

  const muxer = container === "mp4"
    ? new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: { codec: "avc", width: w, height: h },
        fastStart: "in-memory",
      })
    : new WebMMuxer.Muxer({
        target: new WebMMuxer.ArrayBufferTarget(),
        video: { codec: config.codec.startsWith("vp09") ? "V_VP9" : "V_VP8", width: w, height: h, frameRate: fps },
      });
  let encodeError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encodeError = e; },
  });
  encoder.configure(config);

  const totalFrames = Math.round(state.duration * fps);
  // Overlay (Infokarte/Labels) wird über einen 2D-Zwischenpuffer eingebrannt
  const burnOverlay = overlayActive();
  let compCanvas = null, compCtx = null;
  if (burnOverlay) {
    compCanvas = document.createElement("canvas");
    compCanvas.width = w; compCanvas.height = h;
    compCtx = compCanvas.getContext("2d");
  }
  try {
    for (let i = 0; i < totalFrames; i++) {
      const t = i / fps;
      render(t);
      let src = canvas;
      if (burnOverlay) {
        compCtx.drawImage(canvas, 0, 0, w, h);
        const ap = animParams(t);
        drawOverlayTo(compCtx, w, h, ap.loopT, ap.cam, ap.fade);
        src = compCanvas;
      }
      const vf = new VideoFrame(src, {
        timestamp: Math.round(i * 1e6 / fps),
        duration: Math.round(1e6 / fps),
      });
      encoder.encode(vf, { keyFrame: i % (fps * 3) === 0 });
      vf.close();
      if (encodeError) throw encodeError;

      // Encoder nicht fluten und UI am Leben halten
      while (encoder.encodeQueueSize > 8) {
        await new Promise((r) => setTimeout(r, 4));
      }
      if (i % 3 === 0) {
        $("exportProgress").style.width = ((i + 1) / totalFrames * 100).toFixed(1) + "%";
        await new Promise((r) => setTimeout(r));
      }
    }
    status.textContent = t("finalizing");
    await encoder.flush();
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: "video/" + container });
    const name = exportFilename(container);
    saveBlob(blob, name);
    endExport(t("doneFps", name, (blob.size / 1e6).toFixed(1)));
  } catch (err) {
    console.error(err);
    try { encoder.close(); } catch { /* bereits geschlossen */ }
    endExport(t("exportFailed", err.message));
  }
  return true;
}

/** Fallback: Echtzeit-Aufnahme über MediaRecorder (WebM/MP4). */
function exportRealtime(w, h, fps) {
  const status = $("exportStatus");
  const mime = pickMime();
  if (!mime || typeof MediaRecorder === "undefined") {
    status.textContent = t("noExportSupport");
    return;
  }

  beginExport(w, h);
  state.playing = true;
  state.t0 = performance.now();
  status.textContent = t("renderingRealtime", w, h, state.duration);

  // Overlay einbrennen: Stream kommt dann aus einem 2D-Zwischenpuffer
  const burnOverlay = overlayActive();
  let compCanvas = null, compCtx = null;
  if (burnOverlay) {
    compCanvas = document.createElement("canvas");
    compCanvas.width = w; compCanvas.height = h;
    compCtx = compCanvas.getContext("2d");
  }
  const stream = (burnOverlay ? compCanvas : canvas).captureStream(fps);
  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: Math.min(60_000_000, Math.round(w * h * fps * 0.15)),
  });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    const name = exportFilename(ext);
    saveBlob(blob, name);
    endExport(t("done", name, (blob.size / 1e6).toFixed(1)));
  };

  rec.start(250);
  const tick = () => {
    const t = (performance.now() - state.t0) / 1000;
    if (burnOverlay) {
      compCtx.drawImage(canvas, 0, 0, w, h);
      const ap = animParams(Math.min(t, state.duration));
      drawOverlayTo(compCtx, w, h, ap.loopT, ap.cam, ap.fade);
    }
    $("exportProgress").style.width = Math.min(100, (t / state.duration) * 100) + "%";
    if (t >= state.duration) rec.stop();
    else if (state.exporting) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

$("btnExport").addEventListener("click", async () => {
  if (state.exporting || !texColor) return;
  if (IS_INAPP) {
    // Nicht rendern lassen und dann am Speichern scheitern - klar sagen, warum
    $("exportStatus").textContent = t("inappExport");
    return;
  }
  const [w, h] = exportDims();
  const fps = 30;
  const usedOffline = await exportOffline(w, h, fps);
  if (!usedOffline) exportRealtime(w, h, fps);
});

// Browser-Hinweis im Export-Panel: Safari nutzt den Kompatibilitätsmodus,
// reine WebM-Browser (z. B. Firefox) bekommen eine MP4-Warnung
(async () => {
  const hint = $("exportBrowserHint");
  if (IS_INAPP) {
    hint.setAttribute("data-i18n", "inappExport");
    hint.textContent = t("inappExport");
    hint.hidden = false;
    const banner = $("inappBanner");
    banner.setAttribute("data-i18n", "inappExport");
    banner.textContent = t("inappExport");
    banner.hidden = false;
    return;
  }
  // Firefox kann das Video nicht zuverlässig rendern/exportieren (kein
  // WebCodecs-MP4, MediaRecorder-Probleme) - deutliche Warnung ganz oben
  if (/firefox/i.test(navigator.userAgent)) {
    for (const el of [hint, $("inappBanner")]) {
      el.setAttribute("data-i18n", "firefoxWarn");
      el.textContent = t("firefoxWarn");
      el.hidden = false;
    }
    return;
  }
  if (IS_SAFARI) {
    hint.setAttribute("data-i18n", "safariExport");
    hint.textContent = t("safariExport");
    hint.hidden = false;
    return;
  }
  let mp4 = false;
  if (typeof VideoEncoder !== "undefined" && typeof Mp4Muxer !== "undefined") {
    try {
      const s = await VideoEncoder.isConfigSupported({
        codec: "avc1.640028", width: 1920, height: 1080, framerate: 30, bitrate: 8_000_000,
      });
      mp4 = !!s.supported;
    } catch { /* bleibt false */ }
  }
  if (!mp4 && typeof MediaRecorder !== "undefined") {
    mp4 = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1") ||
      MediaRecorder.isTypeSupported("video/mp4");
  }
  if (!mp4) {
    hint.setAttribute("data-i18n", "webmExport");
    hint.textContent = t("webmExport");
    hint.hidden = false;
  }
})();

// ---------------------------------------------------------------- Feedback

const FEEDBACK_REPO = "https://github.com/michaeld1988/AstroFly";
const FEEDBACK_MAIL = "mail@michaeldoehler.com";
const INSTAGRAM_URL = "https://www.instagram.com/astrofly_app/";

/** Technische Angaben für Bug-Reports (nur was der Browser ohnehin preisgibt). */
function feedbackDiagnostics() {
  let gpu = "unknown";
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  } catch { /* optional */ }
  return [
    "App: AstroFly (" + location.host + ")",
    "Browser: " + navigator.userAgent,
    "GPU: " + gpu,
    "Language: " + I18N.lang,
    "Screen: " + screen.width + "×" + screen.height,
  ].join("\n");
}

$("btnFeedbackGithub").addEventListener("click", () => {
  const body = t("feedbackBodyIntro") + "\n---\n" + feedbackDiagnostics();
  const url = FEEDBACK_REPO + "/issues/new?title=" +
    encodeURIComponent("[Feedback] ") + "&body=" + encodeURIComponent(body);
  window.open(url, "_blank", "noopener");
});

$("btnInstagram").addEventListener("click", () => {
  window.open(INSTAGRAM_URL, "_blank", "noopener");
});

$("btnFeedbackMail").addEventListener("click", () => {
  const body = t("feedbackMailIntro") + "---\n" + feedbackDiagnostics();
  location.href = "mailto:" + FEEDBACK_MAIL +
    "?subject=" + encodeURIComponent("AstroFly Feedback") +
    "&body=" + encodeURIComponent(body);
});

// ---------------------------------------------------------------- Hilfen

/** Tiefe (0..1) an einem Punkt der Bildebene, aus der CPU-Kopie der Tiefenkarte. */
/**
 * Wohin verschiebt die Galaxien-Rotation einen Ebenen-Punkt? Umkehrung von
 * spinWarp aus dem Hintergrund-Shader: Dort wird für den Anzeige-Punkt die
 * Bildquelle bei +a gesucht, ein Bildpunkt erscheint also um -a gedreht.
 * Der Winkel hängt nur vom drehinvarianten Radius ab; die Helligkeitsmaske
 * wertet der Shader am Anzeige-Punkt aus, deshalb hier die Fixpunkt-Iteration.
 */
function spinDisplace(px, py, spinAngle) {
  if (!spinAngle) return { x: px, y: py };
  const cx = state.spinCenter.x, cy = state.spinCenter.y;
  const rad = Math.max(0.02, (state.spinRadius / 100) * 0.75);
  const tilt = state.spinTilt * Math.PI / 180;
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const flat = 1 - (state.spinFlat / 100) * 0.7;
  const dx = px - cx, dy = py - cy;
  const ex = c * dx + s * dy, ey = (-s * dx + c * dy) / flat;
  const r = Math.hypot(ex, ey) / rad;
  if (r >= 1) return { x: px, y: py };
  const ft = Math.min(1, Math.max(0, (r - 1) / (0.55 - 1)));
  const fall = ft * ft * (3 - 2 * ft);
  const diffW = 1 + (0.25 / (0.25 + 0.75 * r) - 1) * (state.spinDiff / 100);
  let out = { x: px, y: py };
  for (let i = 0; i < 2; i++) {
    const a = -spinAngle * fall * diffW * spinMaskAtPlane(out.x, out.y);
    const ca = Math.cos(a), sa = Math.sin(a);
    const rx = ca * ex + sa * ey, ry = (-sa * ex + ca * ey) * flat;
    out = { x: cx + c * rx - s * ry, y: cy + s * rx + c * ry };
    if (!state.spinMaskAmt || !state.spinMaskData) break;
  }
  return out;
}

/** Gewicht der Spin-Helligkeitsmaske an einem Ebenen-Punkt (wie spinMaskW im Shader). */
function spinMaskAtPlane(qx, qy) {
  const md = state.spinMaskData;
  if (!md || !state.spinMaskAmt || !state.starless) return 1;
  const imgAspect = state.starless.width / state.starless.height;
  const u = Math.min(1, Math.max(0, qx / imgAspect + 0.5));
  const v = Math.min(1, Math.max(0, qy + 0.5)); // Ebene ist y-up
  const col = Math.round(u * (md.w - 1));
  const row = Math.round((1 - v) * (md.h - 1));
  const m = md.data[(row * md.w + col) * 4] / 255;
  return 1 + (m - 1) * (state.spinMaskAmt / 100);
}

function depthAtPlane(qx, qy, imgAspect) {
  const dd = state.depthData;
  if (!dd) return 0.45;
  const u = Math.min(1, Math.max(0, qx / imgAspect + 0.5));
  const v = Math.min(1, Math.max(0, qy + 0.5)); // Ebene ist y-up
  // Bilinear statt Nearest-Neighbor: Die Marker-Projektion nutzt die Tiefe
  // für den Parallaxe-Exponenten - gestufte Werte ließen die Beschriftungen
  // bei langsamer Kamerabewegung sichtbar "zittern"
  const fx = u * (dd.w - 1), fy = (1 - v) * (dd.h - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(dd.w - 1, x0 + 1), y1 = Math.min(dd.h - 1, y0 + 1);
  const ax = fx - x0, ay = fy - y0;
  const at = (x, y) => dd.data[(y * dd.w + x) * 4] / 255;
  return (at(x0, y0) * (1 - ax) + at(x1, y0) * ax) * (1 - ay) +
         (at(x0, y1) * (1 - ax) + at(x1, y1) * ax) * ay;
}

// Vorschaugröße (wird gespeichert)
{
  const saved = parseInt(localStorage.getItem("astrofly-viewscale"), 10);
  if (saved >= 40 && saved <= 100) state.viewScale = saved;
  const el = $("ctlViewSize");
  el.value = state.viewScale;
  el.addEventListener("input", () => {
    state.viewScale = parseInt(el.value, 10);
    localStorage.setItem("astrofly-viewscale", el.value);
    fitCanvas();
  });
  fitCanvas();
}

// ---------------------------------------------------------------- Sternmasken-Streckung

/**
 * Iterative, farberhaltende Asinh-Streckung für lineare Sternmasken.
 * Pro Durchgang wird die Luminanz moderat gestreckt (asinh) und RGB
 * proportional skaliert, sodass die Sternfarben exakt erhalten bleiben.
 * Gestoppt wird, sobald das 99,9-Perzentil der Luminanz das Ziel erreicht –
 * bereits gestreckte Masken bleiben dadurch praktisch unverändert.
 */
function stretchStarMask(srcCanvas) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const cx = c.getContext("2d", { willReadFrequently: true });
  cx.drawImage(srcCanvas, 0, 0);
  const id = cx.getImageData(0, 0, w, h);
  const d = id.data;
  const n = w * h;

  const K = 10;                    // moderate Stärke pro Durchgang
  const denom = Math.asinh(K);
  // Ziel-Perzentil aus der eingestellten Intensität (0..100 -> 0.12..0.6)
  const TARGET = 0.12 + 0.0048 * state.stretchAmount;
  const MAX_PASSES = 14;

  let passes = 0;
  while (passes < MAX_PASSES) {
    const hist = new Uint32Array(256);
    for (let j = 0; j < d.length; j += 4) {
      hist[(d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8]++;
    }
    let cum = 0, p999 = 1;
    const cut = n * 0.999;
    for (let v = 0; v < 256; v++) {
      cum += hist[v];
      if (cum >= cut) { p999 = v / 255; break; }
    }
    if (p999 >= TARGET) break;

    for (let j = 0; j < d.length; j += 4) {
      const L = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) / 255;
      if (L <= 0) continue;
      const scale = Math.asinh(K * L) / denom / L;
      d[j]     = Math.min(255, d[j] * scale);
      d[j + 1] = Math.min(255, d[j + 1] * scale);
      d[j + 2] = Math.min(255, d[j + 2] * scale);
    }
    passes++;
  }
  if (passes > 0) cx.putImageData(id, 0, 0);
  return { canvas: c, passes };
}

/** Sternmaske (neu) verarbeiten: optional strecken, dann Sterne extrahieren. */
function processStarMask() {
  const orig = state.starsOriginal;
  if (!orig) return;
  const status = $("loadStatus");
  // Auf Arbeitsgröße verkleinern (dort findet auch die Sternerkennung statt)
  const work = downscale(orig, 3000);
  let passes = 0;
  let canvas = work;
  if (!state.maskStretched) {
    const res = stretchStarMask(work);
    canvas = res.canvas;
    passes = res.passes;
  }
  state.stars = { canvas, width: canvas.width, height: canvas.height, name: orig.name };
  buildStarBuffer();
  status.classList.remove("error");
  status.textContent = t("starsDetected", state.maskStarCount) +
    (passes > 0 ? " " + t("stretchInfo", passes) : "");
}

$("ctlMaskStretched").addEventListener("change", () => {
  state.maskStretched = $("ctlMaskStretched").checked;
  if (state.starsOriginal) processStarMask();
});

// ---------------------------------------------------------------- Panel-Menüs

// ?-Hilfen: Erklärtexte erscheinen erst auf Klick aufs Fragezeichen.
// stopPropagation, damit der Klick in einem <label> nicht die Checkbox schaltet
document.addEventListener("click", (e) => {
  const qm = e.target.closest(".qm");
  if (!qm || !qm.dataset.help) return;
  e.preventDefault();
  e.stopPropagation();
  const el = $(qm.dataset.help);
  if (el) el.hidden = !el.hidden;
});
