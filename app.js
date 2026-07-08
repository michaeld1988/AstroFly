/* AstroFlug – 3D-Kamerafahrt durch Astrofotos
 *
 * Pipeline:
 *   Starless-Bild  -> Farbtextur + Tiefenkarte (geglättete Luminanz)
 *   Sternmaske     -> Sternpartikel (Blob-Erkennung) mit eigener 3D-Tiefe
 *   WebGL2 Pass 1  -> Szene (Parallax-Nebel + Sterne) in Framebuffer
 *   WebGL2 Pass 2  -> Bloom (Bright-Pass + Gauß-Blur in Viertelauflösung)
 *   WebGL2 Pass 3  -> Composite: Bewegungsunschärfe, Warp-Farbsäume,
 *                     Vignette, Ein-/Ausblendung
 *   MediaRecorder  -> Export als WebM/MP4
 */

"use strict";

// ---------------------------------------------------------------- Zustand

const state = {
  starless: null,        // { canvas, width, height, name }
  stars: null,
  depthCanvas: null,
  starCount: 0,

  aspect: 16 / 9,
  aspectName: "16:9",

  zoomBase: 1.4,
  speed: 40,             // 0..100
  ease: 60,              // Beschleunigen/Abbremsen 0..100
  parallax: 60,          // 0..100
  depthBoost: 33,        // Räumlichkeit/Tiefenumfang 0..100
  rotationSpeed: 2,      // °/s
  orientation: 0,        // °
  tiltX: 0,              // -100..100
  tiltY: 0,
  swayAmp: 0,            // Schwenk-Animation Stärke 0..100
  swayTempo: 40,         // Schwenk-Tempo 0..100
  duration: 20,          // s
  loopMode: false,       // hin & zurück, nahtlos
  smooth: 18,
  invertDepth: false,
  target: { x: 0, y: 0 }, // Zoomziel in Bildebenen-Einheiten (0,0 = Mitte)

  spread: 70,            // Stern-Ebenen-Streuung 0..100
  starDist: 55,          // Stern-Grundtiefe (Abstand zum Nebel) 0..100
  twinkle: 25,           // 0..100
  starSize: 100,         // % Sterngröße
  starBright: 100,       // % Sternhelligkeit
  starSat: 100,          // % Sternsättigung
  seed: 1,               // Zufalls-Seed für Stern-Ebenen

  bloom: 40,             // 0..100
  mblur: 25,             // 0..100
  warp: 0,               // 0..100
  vignette: 20,          // 0..100
  exposure: 0,           // -100..100 (Blendenstufen ±2)
  contrast: 0,           // -100..100
  saturation: 0,         // -100..100
  clarity: 0,            // -100..100 (negativ = weich/Orton)
  sharpen: 0,            // 0..100

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
  alert("WebGL2 wird von diesem Browser nicht unterstützt.");
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
uniform float uViewAspect;  // Breite/Höhe des Ausgabeformats
uniform float uImgAspect;   // Breite/Höhe des Bildes
uniform float uZoom;        // aktueller Gesamtzoom
uniform float uParallax;    // 0..1
uniform float uAngle;       // rad
uniform float uCover;       // Grundskalierung, damit Bild das Format füllt
uniform vec2 uCenter;       // Kameraziel in Bildebenen-Einheiten
uniform vec2 uTilt;         // Kipp-Parallaxe in Bildebenen-Einheiten
uniform float uDepthRange;  // Räumlichkeit: Spreizung der Tiefen-Zoomraten

vec2 imgUv(vec2 q) {
  return vec2(q.x / uImgAspect, q.y) + 0.5;
}

void main() {
  // Canvas-Punkt in Ebenen-Einheiten (Höhe = 1)
  vec2 p = vec2((vUv.x - 0.5) * uViewAspect, vUv.y - 0.5);
  float c = cos(uAngle), s = sin(uAngle);
  vec2 pr = mat2(c, -s, s, c) * p;

  // Parallax: nahe Bereiche (hohe Tiefe) zoomen überproportional;
  // Kippen verschiebt sie zusätzlich seitlich. Tiefe ist erst nach dem
  // Sampeln bekannt -> Fixpunkt-Iteration.
  vec2 uv = imgUv(uCenter + pr / (uCover * uZoom));
  for (int i = 0; i < 3; i++) {
    float d = texture(uDepth, uv).r;
    float ex = 1.0 + uParallax * (d - 0.45) * uDepthRange;
    float scale = uCover * pow(uZoom, ex);
    uv = imgUv(uCenter + pr / scale + uTilt * (d - 0.45));
  }

  outColor = vec4(texture(uColor, uv).rgb, 1.0);
}`;

// --- Pass 1b: Sterne (Punkt-Sprites mit individueller Tiefe) ---

const starVS = `#version 300 es
layout(location=0) in vec2 aPos;    // Ebenen-Einheiten: x in ±imgAspect/2, y in ±0.5
layout(location=1) in float aBright;// 0..1 (Helligkeit/Fluss)
layout(location=2) in float aSize;  // Radius in Ebenen-Einheiten
layout(location=3) in vec3 aColor;
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
uniform float uTwinkle;   // Funkel-Stärke 0..1
uniform float uWarp;      // 0..1: Sterne rasen zusätzlich an der Kamera vorbei
uniform float uDepthRange;
uniform float uStarSize;   // Größen-Multiplikator
uniform float uStarBright; // Helligkeits-Multiplikator
uniform float uStarSat;    // Sättigung (0 = weiß, 1 = original, 2 = kräftig)
uniform vec2 uCenter;
uniform vec2 uTilt;
out vec3 vColor;
out float vAlpha;

void main() {
  // Reproduzierbare Zufalls-Tiefe pro Stern; "Neu mischen" ändert den Seed
  float h = fract(sin(aPos.x * 127.1 + aPos.y * 311.7 + uSeed * 17.0) * 43758.5453);
  float depth = clamp(uStarBase + (h - 0.5) * uSpread + aBright * 0.12, 0.02, 1.0);

  // Sterne parallaxieren stärker als der Nebel (Faktor ~1.76 relativ zur
  // Räumlichkeit); Warp lässt sie zusätzlich beschleunigt vorbeiziehen
  float ex = 1.0 + uParallax * (depth - 0.45) * uDepthRange * 1.76 + uWarp * (0.4 + depth);
  float scale = uCover * pow(uZoom, ex);
  vec2 pr = (aPos - uCenter - uTilt * (depth - 0.45)) * scale;
  float c = cos(uAngle), s = sin(uAngle);
  // Inverse der Hintergrund-Rotation, damit Sterne auf dem Bild liegen bleiben
  vec2 p = mat2(c, s, -s, c) * pr;
  gl_Position = vec4(p.x * 2.0 / uViewAspect, p.y * 2.0, 0.0, 1.0);

  float px = aSize * 2.0 * scale * uPixelsY * uStarSize;
  gl_PointSize = clamp(px, 1.2, 500.0);

  float seed = fract(aPos.x * 137.7 + aPos.y * 91.3) * 6.2831;
  float tw = sin(uTime * (1.0 + fract(seed) * 2.5) + seed * 10.0) * 0.5 + 0.5;
  vAlpha = 1.0 - uTwinkle * 0.55 * tw;
  float lumS = dot(aColor, vec3(0.299, 0.587, 0.114));
  vColor = max(mix(vec3(lumS), aColor, uStarSat), 0.0) * uStarBright;
}`;

const starFS = `#version 300 es
precision highp float;
in vec3 vColor;
in float vAlpha;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0; // 0 Mitte .. 1 Rand
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 9.0);
  float halo = exp(-r2 * 2.5) * 0.35;
  float a = (core + halo) * vAlpha;
  outColor = vec4(vColor * a, a);
}`;

// --- Pass 2: Bloom ---

const brightFS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  float l = max(max(c.r, c.g), c.b);
  float k = smoothstep(0.55, 0.85, l);
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
uniform float uSharpen;    // 0 = aus
uniform vec2 uTexel;       // 1 px der Szene in UV

void main() {
  vec2 r = vec2((vUv.x - 0.5) * uViewAspect, vUv.y - 0.5);

  // Bewegungsvektor dieses Pixels: radial (Zoom) + tangential (Rotation) + Fahrt
  vec2 vel = r * uZoomRate + vec2(-r.y, r.x) * uRotRate + uPanVel;
  vec2 off = vel * uShutter;
  off = vec2(off.x / uViewAspect, off.y);
  vec2 ca = vec2(r.x / uViewAspect, r.y) * uChroma * 0.02;

  vec3 acc = vec3(0.0);
  const int N = 8;
  for (int i = 0; i < N; i++) {
    float f = float(i) / float(N - 1) - 0.5;
    vec2 o = off * f;
    acc.r += texture(uScene, vUv + o * (1.0 + uChroma) + ca).r;
    acc.g += texture(uScene, vUv + o).g;
    acc.b += texture(uScene, vUv + o * (1.0 - uChroma) - ca).b;
  }
  vec3 col = acc / float(N);

  // Klarheit: lokaler Kontrast gegen stark weichgezeichnete Szene
  if (uClarity != 0.0) {
    vec3 soft = texture(uSoft, vUv).rgb;
    col += (col - soft) * uClarity;
  }
  // Schärfe: Unsharp-Mask mit 1-Pixel-Radius
  if (uSharpen > 0.0) {
    vec3 nb = texture(uScene, vUv + vec2(uTexel.x, 0.0)).rgb
            + texture(uScene, vUv - vec2(uTexel.x, 0.0)).rgb
            + texture(uScene, vUv + vec2(0.0, uTexel.y)).rgb
            + texture(uScene, vUv - vec2(0.0, uTexel.y)).rgb;
    col += (texture(uScene, vUv).rgb - nb * 0.25) * uSharpen;
  }

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

let fbScene = null, fbBloomA = null, fbBloomB = null, fbSoftA = null, fbSoftB = null;

function ensureFbos() {
  const w = canvas.width, h = canvas.height;
  if (fbScene && fbScene.w === w && fbScene.h === h) return;
  for (const f of [fbScene, fbBloomA, fbBloomB, fbSoftA, fbSoftB]) {
    if (f) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); }
  }
  fbScene = makeFbo(w, h);
  const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
  fbBloomA = makeFbo(bw, bh);
  fbBloomB = makeFbo(bw, bh);
  fbSoftA = makeFbo(bw, bh);
  fbSoftB = makeFbo(bw, bh);
}

// ---------------------------------------------------------------- Bild-Dekodierung

async function decodeFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".tif") || name.endsWith(".tiff")) {
    const buf = await file.arrayBuffer();
    const ifds = UTIF.decode(buf);
    if (!ifds.length) throw new Error("TIFF konnte nicht gelesen werden");
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

function buildDepthMap() {
  if (!state.starless) return;
  const src = downscale(state.starless, 768);
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
  const radius = state.smooth;
  let a = lum, b = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    boxBlurH(a, b, w, h, radius);
    boxBlurV(b, a, w, h, radius);
  }

  const dst = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < a.length; i++, j += 4) {
    let d = a[i];
    if (state.invertDepth) d = 1 - d;
    const v = Math.round(d * 255);
    dst[j] = dst[j + 1] = dst[j + 2] = v;
    dst[j + 3] = 255;
  }

  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").putImageData(new ImageData(dst, w, h), 0, 0);
  state.depthCanvas = c;

  if (texDepth) gl.deleteTexture(texDepth);
  texDepth = makeTexture(c);

  const pv = $("depthPreview");
  pv.height = Math.round(160 * h / w) || 107;
  pv.getContext("2d").drawImage(c, 0, 0, pv.width, pv.height);
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
 * Findet Sterne in der Maske über Zusammenhangskomponenten und baut den
 * GPU-Puffer: pro Stern [x, y, helligkeit, größe, r, g, b] in Ebenen-Einheiten.
 * Die Tiefen-Ebene wird erst im Vertexshader aus Seed/Streuung/Abstand bestimmt.
 */
function buildStarBuffer() {
  if (!state.stars) return;
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
  const MAX = 9000;
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

  state.starCount = list.length;

  gl.bindVertexArray(starVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
  gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
  const stride = FLOATS * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 16);
  gl.bindVertexArray(null);
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
 * Kamerazustand zu einem Zeitpunkt (für Rendering und Bewegungsunschärfe).
 * Ablauf: Rohzeit -> Loop-Dreieck (hin & zurück) -> Easing -> effektive
 * Flugzeit te, aus der Zoom, Rotation, Ziel-Fahrt und Schwenk berechnet werden.
 */
function camAt(loopT) {
  const D = state.duration;
  const u = Math.min(1, Math.max(0, loopT / D));
  const p = state.loopMode ? 1 - Math.abs(1 - 2 * u) : u;
  const e = state.ease / 100;
  const pe = p + (smoothstep(p) - p) * e;
  const te = pe * D * (state.loopMode ? 0.5 : 1);

  const rate = (state.speed / 100) * 0.09;
  const zoom = state.zoomBase * Math.exp(rate * te);
  const angle = (state.orientation + state.rotationSpeed * te) * Math.PI / 180;

  // Schwenk-Animation: langsame elliptische Kippbewegung (Funktion von te,
  // dadurch im Loop-Modus automatisch nahtlos)
  let tiltAddX = 0, tiltAddY = 0;
  const swayA = (state.swayAmp / 100) * 0.06;
  if (swayA > 0) {
    const period = 16 - (state.swayTempo / 100) * 12; // 16 s .. 4 s
    const ph = te * 2 * Math.PI / period;
    tiltAddX = swayA * Math.sin(ph);
    tiltAddY = swayA * 0.7 * Math.sin(ph * 0.8 + 1.3);
  }

  return {
    zoom, angle, rate, te, tiltAddX, tiltAddY,
    cx: state.target.x * pe,
    cy: state.target.y * pe,
  };
}

function animParams(t) {
  const loopT = state.exporting ? t : t % state.duration;
  const cam = camAt(loopT);
  let fade = 1;
  if (!state.loopMode) {
    const fadeIn = Math.min(1, loopT / 0.8);
    const fadeOut = Math.min(1, Math.max(0, (state.duration - loopT) / 0.8));
    fade = Math.min(fadeIn, fadeOut);
  }
  return { loopT, cam, fade };
}

// ---------------------------------------------------------------- Rendering

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
  const cover = Math.max(viewAspect / imgAspect, 1) * 1.02;
  const parallax = state.parallax / 100;
  const warp = state.warp / 100;
  const depthRange = 0.85 * (0.4 + 1.8 * state.depthBoost / 100);
  const tiltX = (state.tiltX / 100) * 0.08 + cam.tiltAddX;
  const tiltY = (state.tiltY / 100) * 0.08 + cam.tiltAddY;

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
  u1i(bgProg, "uColor", 0);
  u1i(bgProg, "uDepth", 1);
  u1f(bgProg, "uViewAspect", viewAspect);
  u1f(bgProg, "uImgAspect", imgAspect);
  u1f(bgProg, "uZoom", cam.zoom);
  u1f(bgProg, "uParallax", parallax);
  u1f(bgProg, "uAngle", cam.angle);
  u1f(bgProg, "uCover", cover);
  u2f(bgProg, "uCenter", cam.cx, cam.cy);
  u2f(bgProg, "uTilt", tiltX, tiltY);
  u1f(bgProg, "uDepthRange", depthRange);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

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
    u1f(starProg, "uSpread", (state.spread / 100) * 0.9);
    u1f(starProg, "uTwinkle", state.twinkle / 100);
    u1f(starProg, "uWarp", warp);
    u1f(starProg, "uDepthRange", depthRange);
    u1f(starProg, "uStarSize", state.starSize / 100);
    u1f(starProg, "uStarBright", state.starBright / 100);
    u1f(starProg, "uStarSat", state.starSat / 100);
    u2f(starProg, "uCenter", cam.cx, cam.cy);
    u2f(starProg, "uTilt", tiltX, tiltY);
    gl.drawArrays(gl.POINTS, 0, state.starCount);
    gl.disable(gl.BLEND);
  }

  // ---- Pass 2: Bloom (Viertelauflösung) ----
  const bloomStrength = (state.bloom / 100) * 1.2;
  if (bloomStrength > 0) {
    gl.bindVertexArray(quadVao);
    gl.activeTexture(gl.TEXTURE0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbBloomA.fb);
    gl.viewport(0, 0, fbBloomA.w, fbBloomA.h);
    gl.useProgram(brightProg);
    gl.bindTexture(gl.TEXTURE_2D, fbScene.tex);
    u1i(brightProg, "uScene", 0);
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

  // ---- Pass 3: Composite auf den Bildschirm ----
  // Bewegungsgrößen numerisch aus der Kamerakurve ableiten
  const dt = 0.05;
  const cam2 = camAt(Math.min(loopT + dt, state.duration));
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
  u1i(compProg, "uScene", 0);
  u1i(compProg, "uBloom", 1);
  u1i(compProg, "uSoft", 2);
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
  u1f(compProg, "uSharpen", (state.sharpen / 100) * 1.2);
  u2f(compProg, "uTexel", 1 / fbScene.w, 1 / fbScene.h);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Transport-UI
  const prog = (loopT / state.duration) * 100;
  $("timelineFill").style.width = prog + "%";
  $("timecode").textContent = loopT.toFixed(1).replace(".", ",") + " s";
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
  const availW = wrap.clientWidth - 36;
  const availH = wrap.clientHeight - 36;
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
bindSlider("ctlZoom", "outZoom", "zoomBase", (v) => v.toFixed(2).replace(".", ",") + "×");
bindSlider("ctlSpeed", "outSpeed", "speed", asInt);
bindSlider("ctlEase", "outEase", "ease", asInt);
bindSlider("ctlParallax", "outParallax", "parallax", asInt);
bindSlider("ctlDepthBoost", "outDepthBoost", "depthBoost", asInt);
bindSlider("ctlRotation", "outRotation", "rotationSpeed", (v) => v.toFixed(1).replace(".", ",") + " °/s");
bindSlider("ctlOrient", "outOrient", "orientation", (v) => v + "°");
bindSlider("ctlTiltX", "outTiltX", "tiltX", asInt);
bindSlider("ctlTiltY", "outTiltY", "tiltY", asInt);
bindSlider("ctlSwayAmp", "outSwayAmp", "swayAmp", asInt);
bindSlider("ctlSwayTempo", "outSwayTempo", "swayTempo", asInt);
bindSlider("ctlDuration", "outDuration", "duration", (v) => v + " s");
bindSlider("ctlSpread", "outSpread", "spread", asInt);
bindSlider("ctlStarDist", "outStarDist", "starDist", asInt);
bindSlider("ctlTwinkle", "outTwinkle", "twinkle", asInt);
bindSlider("ctlStarSize", "outStarSize", "starSize", asPct);
bindSlider("ctlStarBright", "outStarBright", "starBright", asPct);
bindSlider("ctlStarSat", "outStarSat", "starSat", asPct);
bindSlider("ctlBloom", "outBloom", "bloom", asInt);
bindSlider("ctlMblur", "outMblur", "mblur", asInt);
bindSlider("ctlWarp", "outWarp", "warp", asInt);
bindSlider("ctlVignette", "outVignette", "vignette", asInt);
bindSlider("ctlExposure", "outExposure", "exposure", asInt);
bindSlider("ctlContrast", "outContrast", "contrast", asInt);
bindSlider("ctlSaturation", "outSaturation", "saturation", asInt);
bindSlider("ctlClarity", "outClarity", "clarity", asInt);
bindSlider("ctlSharpen", "outSharpen", "sharpen", asInt);

$("ctlLoop").addEventListener("change", () => {
  state.loopMode = $("ctlLoop").checked;
  state.t0 = performance.now();
  state.pausedAt = 0;
});

// ---- Cineastische Presets (Effekte + Look) ----

const PRESET_SLIDERS = {
  bloom: "ctlBloom", mblur: "ctlMblur", warp: "ctlWarp", vignette: "ctlVignette",
  exposure: "ctlExposure", contrast: "ctlContrast", saturation: "ctlSaturation",
  clarity: "ctlClarity", sharpen: "ctlSharpen",
};

const PRESETS = {
  // alles neutral / aus
  neutral:   { bloom: 0,  mblur: 0,  warp: 0,  vignette: 0,  exposure: 0,   contrast: 0,  saturation: 0,    clarity: 0,   sharpen: 0 },
  // klassischer Kino-Look: sanfter Glow, Filmkorn-freier Kontrast, Vignette
  kino:      { bloom: 35, mblur: 35, warp: 0,  vignette: 35, exposure: 5,   contrast: 18, saturation: 8,    clarity: 15,  sharpen: 10 },
  // dunkel, entsättigt, hoher Kontrast – bedrohlich-episch
  deepspace: { bloom: 25, mblur: 20, warp: 0,  vignette: 50, exposure: -12, contrast: 28, saturation: -18,  clarity: 25,  sharpen: 10 },
  // träumerischer Orton-Glow, weiche Nebel, kräftige Farben
  glow:      { bloom: 75, mblur: 30, warp: 0,  vignette: 25, exposure: 8,   contrast: -8, saturation: 15,   clarity: -35, sharpen: 0 },
  // dramatisches Schwarzweiß
  mono:      { bloom: 30, mblur: 25, warp: 0,  vignette: 45, exposure: 0,   contrast: 30, saturation: -100, clarity: 35,  sharpen: 15 },
  // Hyperraum: Warp + starke Bewegungsunschärfe
  hyper:     { bloom: 55, mblur: 65, warp: 70, vignette: 30, exposure: 5,   contrast: 12, saturation: 10,   clarity: 10,  sharpen: 0 },
};

let applyingPreset = false;
$("ctlPreset").addEventListener("change", () => {
  const preset = PRESETS[$("ctlPreset").value];
  if (!preset) return;
  applyingPreset = true;
  for (const [key, id] of Object.entries(PRESET_SLIDERS)) {
    const el = $(id);
    el.value = preset[key];
    el.dispatchEvent(new Event("input"));
  }
  applyingPreset = false;
});
// Manuelles Verstellen eines Look-Reglers => Preset-Auswahl auf "eigener Look"
for (const id of Object.values(PRESET_SLIDERS)) {
  $(id).addEventListener("input", () => {
    if (!applyingPreset) $("ctlPreset").value = "";
  });
}

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

$("btnShuffle").addEventListener("click", () => {
  state.seed = Math.random() * 1000;
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

// Zoomziel per Klick in die Vorschau
canvas.addEventListener("click", (e) => {
  if (!state.starless || state.exporting) return;
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
  const cover = Math.max(state.aspect / imgAspect, 1) * 1.02;
  const qx = cam.cx + rx / (cover * cam.zoom);
  const qy = cam.cy + ry / (cover * cam.zoom);
  state.target.x = Math.min(imgAspect * 0.475, Math.max(-imgAspect * 0.475, qx));
  state.target.y = Math.min(0.475, Math.max(-0.475, qy));
  $("targetInfo").textContent =
    `Ziel: ${(state.target.x / imgAspect * 100 + 50).toFixed(0)} % / ${(50 - state.target.y * 100).toFixed(0) } %`;

  // Marker kurz einblenden
  const marker = $("targetMarker");
  marker.hidden = false;
  marker.style.left = (canvas.offsetLeft + fx * rect.width) + "px";
  marker.style.top = (canvas.offsetTop + fy * rect.height) + "px";
  marker.style.animation = "none";
  void marker.offsetWidth; // Animation neu starten
  marker.style.animation = "";
});
canvas.addEventListener("dblclick", () => {
  state.target.x = 0;
  state.target.y = 0;
  $("targetInfo").textContent = "Ziel: Bildmitte";
});

// Transport
$("btnPlay").addEventListener("click", () => {
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
  status.textContent = `Lade ${file.name} …`;
  try {
    const img = await decodeFile(file);
    if (which === "starless") {
      state.starless = img;
      $("nameStarless").textContent = `${file.name} (${img.width}×${img.height})`;
      $("dropStarless").classList.add("loaded");
      if (texColor) gl.deleteTexture(texColor);
      texColor = makeTexture(downscale(img, 4096));
      buildDepthMap();
    } else {
      state.stars = img;
      $("nameStars").textContent = `${file.name} (${img.width}×${img.height})`;
      $("dropStars").classList.add("loaded");
      buildStarBuffer();
      status.textContent = `${state.starCount} Sterne erkannt.`;
    }
    if (state.starless) {
      $("placeholder").style.display = "none";
      $("btnExport").disabled = false;
      state.t0 = performance.now();
      if (which === "starless") status.textContent = "Starless-Bild geladen.";
    }
  } catch (err) {
    console.error(err);
    status.classList.add("error");
    status.textContent = `Fehler beim Laden von ${file.name}: ${err.message}`;
  }
}

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

function exportFilename(ext) {
  return `astroflug_${state.aspectName.replace(":", "x")}_${state.duration}s.${ext}`;
}

/**
 * Bevorzugter Weg: deterministischer Offline-Export über WebCodecs.
 * Jedes Frame wird einzeln gerendert und kodiert – das Ergebnis ist auch
 * dann flüssig (30 fps), wenn der Rechner nicht in Echtzeit rendern kann.
 * Gibt false zurück, wenn WebCodecs/H.264 nicht verfügbar ist.
 */
async function exportOffline(w, h, fps) {
  if (typeof VideoEncoder === "undefined") return false;

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
  status.textContent = `Rendere ${w}×${h} · ${state.duration} s (Offline-Modus) …`;

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
  try {
    for (let i = 0; i < totalFrames; i++) {
      const t = i / fps;
      render(t);
      const vf = new VideoFrame(canvas, {
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
    status.textContent = "Finalisiere Video …";
    await encoder.flush();
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: "video/" + container });
    const name = exportFilename(container);
    saveBlob(blob, name);
    endExport(`Fertig: ${name} (${(blob.size / 1e6).toFixed(1)} MB, 30 fps)`);
  } catch (err) {
    console.error(err);
    try { encoder.close(); } catch { /* bereits geschlossen */ }
    endExport(`Export fehlgeschlagen: ${err.message}`);
  }
  return true;
}

/** Fallback: Echtzeit-Aufnahme über MediaRecorder (WebM/MP4). */
function exportRealtime(w, h, fps) {
  const status = $("exportStatus");
  const mime = pickMime();
  if (!mime || typeof MediaRecorder === "undefined") {
    status.textContent = "Dieser Browser unterstützt keinen Video-Export.";
    return;
  }

  beginExport(w, h);
  state.playing = true;
  state.t0 = performance.now();
  status.textContent = `Rendere ${w}×${h} · ${state.duration} s in Echtzeit …`;

  const stream = canvas.captureStream(fps);
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
    endExport(`Fertig: ${name} (${(blob.size / 1e6).toFixed(1)} MB)`);
  };

  rec.start(250);
  const tick = () => {
    const t = (performance.now() - state.t0) / 1000;
    $("exportProgress").style.width = Math.min(100, (t / state.duration) * 100) + "%";
    if (t >= state.duration) rec.stop();
    else if (state.exporting) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

$("btnExport").addEventListener("click", async () => {
  if (state.exporting || !texColor) return;
  const [w, h] = exportDims();
  const fps = 30;
  const usedOffline = await exportOffline(w, h, fps);
  if (!usedOffline) exportRealtime(w, h, fps);
});
