/* AstroFly – AI upscaler (3×, non-generative)
 *
 * Model: "Sub-pixel CNN" (Shi et al. 2016) from the ONNX model zoo –
 * a small, deterministic super-resolution network trained with MSE loss.
 * It reconstructs real image detail and does not invent content
 * (no GAN/diffusion), so the astrophoto is not falsified.
 *
 * Runtime: ONNX Runtime Web. Uses WebGPU when the browser exposes a
 * capable GPU (fast on modern cards, e.g. Nvidia RTX), otherwise falls
 * back to single-threaded WASM on the CPU (much slower).
 *
 * The model has a fixed 224×224 input and upscales the luminance channel
 * 3×. Larger images are processed in overlapping tiles; only the central
 * 192×192 region of each tile is written to the output, which avoids
 * visible seams. Chroma is upscaled bicubically by the browser.
 */

"use strict";

const Upscaler = {
  SCALE: 3,
  TILE: 224,
  OVERLAP: 16,       // Kontextrand pro Seite; nur die Mitte wird übernommen
  gpu: null,         // { desc } wenn WebGPU verfügbar
  session: null,
  running: false,
};

/** WebGPU-Fähigkeit prüfen (einmalig beim Start). */
Upscaler.detect = async function () {
  if (!navigator.gpu) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    let desc = "";
    try {
      const info = adapter.info ||
        (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null);
      if (info) desc = [info.vendor, info.architecture].filter(Boolean).join(" ");
    } catch { /* Adapter-Info ist optional */ }
    Upscaler.gpu = { desc };
    return Upscaler.gpu;
  } catch {
    return null;
  }
};

/** ONNX Runtime bei Bedarf nachladen (hält den normalen Seitenstart schlank). */
Upscaler.loadRuntime = function () {
  if (window.ort) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/ort/ort.all.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("ONNX Runtime could not be loaded"));
    document.head.appendChild(s);
  });
};

Upscaler.getSession = async function () {
  if (Upscaler.session) return Upscaler.session;
  await Upscaler.loadRuntime();
  ort.env.wasm.wasmPaths = new URL("vendor/ort/", location.href).href;
  ort.env.wasm.numThreads = 1; // GitHub Pages hat keine Cross-Origin-Isolation
  const providers = Upscaler.gpu ? ["webgpu", "wasm"] : ["wasm"];
  Upscaler.session = await ort.InferenceSession.create(
    "vendor/ort/super-resolution-10.onnx",
    { executionProviders: providers },
  );
  return Upscaler.session;
};

/**
 * Bild 3× hochskalieren. Gibt ein neues Canvas zurück.
 * onProgress(0..100) wird zwischen den Kacheln aufgerufen.
 */
Upscaler.upscale = async function (srcCanvas, onProgress) {
  const session = await Upscaler.getSession();
  const { SCALE, TILE, OVERLAP } = Upscaler;
  const STEP = TILE - 2 * OVERLAP;

  // Quelle ggf. auf Mindestgröße auffüllen (Kanten strecken statt schwarz)
  let src = srcCanvas;
  const w = srcCanvas.width, h = srcCanvas.height;
  const pw = Math.max(TILE, w), ph = Math.max(TILE, h);
  if (pw !== w || ph !== h) {
    src = document.createElement("canvas");
    src.width = pw; src.height = ph;
    const c = src.getContext("2d");
    c.drawImage(srcCanvas, 0, 0);
    if (pw > w) c.drawImage(srcCanvas, w - 1, 0, 1, h, w, 0, pw - w, h);
    if (ph > h) c.drawImage(src, 0, h - 1, pw, 1, 0, h, pw, ph - h);
  }
  const srcCtx = src.getContext("2d", { willReadFrequently: true });

  // Chroma-Basis: bikubisch skaliertes Original (Y wird pro Kachel ersetzt)
  const out = document.createElement("canvas");
  out.width = w * SCALE;
  out.height = h * SCALE;
  const outCtx = out.getContext("2d", { willReadFrequently: true });
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(srcCanvas, 0, 0, out.width, out.height);

  // Kachelraster: Schrittweite STEP, letzte Kachel an den Rand geklemmt
  const xs = [], ys = [];
  for (let x = 0; ; x += STEP) {
    xs.push(Math.min(x, src.width - TILE));
    if (x >= src.width - TILE) break;
  }
  for (let y = 0; ; y += STEP) {
    ys.push(Math.min(y, src.height - TILE));
    if (y >= src.height - TILE) break;
  }

  const total = xs.length * ys.length;
  let done = 0;
  const input = new Float32Array(TILE * TILE);

  for (const ty of ys) {
    for (const tx of xs) {
      const tile = srcCtx.getImageData(tx, ty, TILE, TILE).data;
      for (let i = 0, j = 0; i < input.length; i++, j += 4) {
        input[i] = (0.299 * tile[j] + 0.587 * tile[j + 1] + 0.114 * tile[j + 2]) / 255;
      }
      const feeds = {};
      feeds[session.inputNames[0]] =
        new ort.Tensor("float32", input, [1, 1, TILE, TILE]);
      const result = await session.run(feeds);
      const y3 = result[session.outputNames[0]].data; // 672×672 Luminanz

      // Nur den inneren Bereich übernehmen (an Bildrändern bis zum Rand)
      const x0 = tx === 0 ? 0 : OVERLAP;
      const y0 = ty === 0 ? 0 : OVERLAP;
      const x1 = tx + TILE >= src.width ? TILE : TILE - OVERLAP;
      const y1 = ty + TILE >= src.height ? TILE : TILE - OVERLAP;
      const ox = (tx + x0) * SCALE, oy = (ty + y0) * SCALE;
      const ow = Math.min((x1 - x0) * SCALE, out.width - ox);
      const oh = Math.min((y1 - y0) * SCALE, out.height - oy);
      if (ow <= 0 || oh <= 0) { done++; continue; }

      const block = outCtx.getImageData(ox, oy, ow, oh);
      const bd = block.data;
      const T3 = TILE * SCALE;
      for (let by = 0; by < oh; by++) {
        const srcRow = (y0 * SCALE + by) * T3 + x0 * SCALE;
        for (let bx = 0; bx < ow; bx++) {
          const j = (by * ow + bx) * 4;
          const r = bd[j], g = bd[j + 1], b = bd[j + 2];
          // Chroma behalten, Luminanz durch Netz-Ausgabe ersetzen (BT.601)
          const yOld = 0.299 * r + 0.587 * g + 0.114 * b;
          const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
          const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
          const yNew = Math.min(1, Math.max(0, y3[srcRow + bx])) * 255;
          bd[j]     = yNew + 1.402 * cr;
          bd[j + 1] = yNew - 0.344136 * cb - 0.714136 * cr;
          bd[j + 2] = yNew + 1.772 * cb;
        }
      }
      outCtx.putImageData(block, ox, oy);

      done++;
      if (onProgress) onProgress(Math.round(done / total * 100));
      // UI nicht blockieren
      await new Promise((r) => setTimeout(r));
    }
  }
  return out;
};
