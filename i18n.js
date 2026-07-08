/* AstroFly – language support (English / German)
 *
 * Static HTML elements are marked with data-i18n / data-i18n-html /
 * data-i18n-title attributes; dynamic strings use t(key, ...args).
 * The chosen language is stored in localStorage.
 */

"use strict";

const I18N = {
  lang: localStorage.getItem("astrofly-lang") ||
    ((navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en"),
  onChange: [],
  dict: {
    en: {
      docTitle: "AstroFly – 3D flight through astrophotos",
      subtitle: "3D camera flight from starless image + star mask",
      sec1: "1 · Load images",
      starlessLabel: "Starless image",
      starmaskLabel: "Star mask",
      noFile: "– no file –",
      sec2: "2 · Depth map",
      smoothing: "Smoothing",
      invertDepth: "Invert depth (dark = near)",
      sec3: "3 · Camera & animation",
      zoom: "Zoom (start framing)",
      speed: "Speed",
      ease: "Ease in & out",
      parallax: "3D effect",
      depthRange: "Depth range",
      rotation: "Rotation",
      orient: "Rotate framing",
      tiltX: "Tilt horizontal",
      tiltY: "Tilt vertical",
      swayAmp: "Camera sway (amount)",
      swayTempo: "Sway tempo",
      duration: "Duration",
      loopMode: "Loop mode (there & back, seamless)",
      tip: "🎯 <b>Zoom target:</b> Click the preview to choose where the camera flies to. Double-click = back to center.",
      targetCenter: "Target: image center",
      targetAt: (x, y) => `Target: ${x} % / ${y} %`,
      sec4: "4 · Stars",
      spread: "Layer spread",
      starDist: "Distance to nebula",
      twinkle: "Twinkle",
      starSize: "Size",
      starBright: "Brightness",
      starSat: "Saturation (stars)",
      shuffle: "🎲 Reshuffle layers",
      sec5: "5 · Effects & look",
      presetLabel: "🎬 Preset",
      presetCustom: "– custom look –",
      presetKino: "Cinematic",
      presetDeep: "Deep Space",
      presetGlow: "Dreamy Glow",
      presetMono: "Monochrome",
      presetHyper: "Hyperspace",
      presetNeutral: "Neutral (all off)",
      bloom: "Bloom",
      mblur: "Motion blur",
      warp: "Warp",
      vignette: "Vignette",
      exposure: "Exposure",
      contrast: "Contrast",
      saturation: "Saturation",
      clarity: "Clarity",
      sharpen: "Sharpness",
      sec6: "6 · Aspect ratio",
      sec7: "7 · Export",
      exportBtn: "⬇ Export video",
      placeholder1: "Load a <b>starless image</b> and a <b>star mask</b><br>to start your flight through space.",
      placeholder2: "You can also drag &amp; drop files here<br>(1st file = starless, 2nd file = star mask).",
      playTitle: "Play/Pause",
      restartTitle: "Restart",
      webgl2: "WebGL2 is not supported by this browser.",
      tiffError: "Could not read TIFF file",
      loading: (n) => `Loading ${n} …`,
      starsDetected: (n) => `${n} stars detected.`,
      starlessLoaded: "Starless image loaded.",
      loadFailed: (n, msg) => `Failed to load ${n}: ${msg}`,
      noExportSupport: "This browser does not support video export.",
      renderingOffline: (w, h, s) => `Rendering ${w}×${h} · ${s} s (offline mode) …`,
      renderingRealtime: (w, h, s) => `Rendering ${w}×${h} · ${s} s in real time …`,
      finalizing: "Finalizing video …",
      doneFps: (n, mb) => `Done: ${n} (${mb} MB, 30 fps)`,
      done: (n, mb) => `Done: ${n} (${mb} MB)`,
      exportFailed: (msg) => `Export failed: ${msg}`,
    },
    de: {
      docTitle: "AstroFly – 3D-Flug durch Astrofotos",
      subtitle: "3D-Kamerafahrt aus Starless-Bild + Sternmaske",
      sec1: "1 · Bilder laden",
      starlessLabel: "Starless-Bild",
      starmaskLabel: "Sternmaske",
      noFile: "– keine Datei –",
      sec2: "2 · Tiefenkarte",
      smoothing: "Glättung",
      invertDepth: "Tiefe umkehren (dunkel = nah)",
      sec3: "3 · Kamera & Animation",
      zoom: "Zoom (Start-Ausschnitt)",
      speed: "Geschwindigkeit",
      ease: "Beschleunigen & Abbremsen",
      parallax: "3D-Effekt",
      depthRange: "Räumlichkeit (Tiefenumfang)",
      rotation: "Rotation",
      orient: "Ausschnitt drehen",
      tiltX: "Kippen horizontal",
      tiltY: "Kippen vertikal",
      swayAmp: "Schwenk-Animation (Stärke)",
      swayTempo: "Schwenk-Tempo",
      duration: "Dauer",
      loopMode: "Loop-Modus (hin & zurück, nahtlos)",
      tip: "🎯 <b>Zoomziel:</b> In die Vorschau klicken, um zu bestimmen, wohin die Kamera fliegt. Doppelklick = zurück zur Mitte.",
      targetCenter: "Ziel: Bildmitte",
      targetAt: (x, y) => `Ziel: ${x} % / ${y} %`,
      sec4: "4 · Sterne",
      spread: "Ebenen-Streuung",
      starDist: "Abstand zum Nebel",
      twinkle: "Funkeln",
      starSize: "Größe",
      starBright: "Helligkeit",
      starSat: "Sättigung (Sterne)",
      shuffle: "🎲 Ebenen neu mischen",
      sec5: "5 · Effekte & Look",
      presetLabel: "🎬 Preset",
      presetCustom: "– eigener Look –",
      presetKino: "Kino",
      presetDeep: "Deep Space",
      presetGlow: "Traumglühen",
      presetMono: "Monochrom",
      presetHyper: "Hyperraum",
      presetNeutral: "Neutral (alles aus)",
      bloom: "Bloom",
      mblur: "Bewegungsunschärfe",
      warp: "Warp",
      vignette: "Vignette",
      exposure: "Belichtung",
      contrast: "Kontrast",
      saturation: "Sättigung",
      clarity: "Klarheit",
      sharpen: "Schärfe",
      sec6: "6 · Format",
      sec7: "7 · Export",
      exportBtn: "⬇ Video exportieren",
      placeholder1: "Lade ein <b>Starless-Bild</b> und eine <b>Sternmaske</b>,<br>um den Flug durchs Weltall zu starten.",
      placeholder2: "Du kannst Dateien auch direkt hierher ziehen<br>(1. Datei = Starless, 2. Datei = Sternmaske).",
      playTitle: "Wiedergabe/Pause",
      restartTitle: "Von vorn",
      webgl2: "WebGL2 wird von diesem Browser nicht unterstützt.",
      tiffError: "TIFF konnte nicht gelesen werden",
      loading: (n) => `Lade ${n} …`,
      starsDetected: (n) => `${n} Sterne erkannt.`,
      starlessLoaded: "Starless-Bild geladen.",
      loadFailed: (n, msg) => `Fehler beim Laden von ${n}: ${msg}`,
      noExportSupport: "Dieser Browser unterstützt keinen Video-Export.",
      renderingOffline: (w, h, s) => `Rendere ${w}×${h} · ${s} s (Offline-Modus) …`,
      renderingRealtime: (w, h, s) => `Rendere ${w}×${h} · ${s} s in Echtzeit …`,
      finalizing: "Finalisiere Video …",
      doneFps: (n, mb) => `Fertig: ${n} (${mb} MB, 30 fps)`,
      done: (n, mb) => `Fertig: ${n} (${mb} MB)`,
      exportFailed: (msg) => `Export fehlgeschlagen: ${msg}`,
    },
  },
};

function t(key, ...args) {
  const v = I18N.dict[I18N.lang][key] ?? I18N.dict.en[key] ?? key;
  return typeof v === "function" ? v(...args) : v;
}

function applyLanguage() {
  document.documentElement.lang = I18N.lang;
  document.title = t("docTitle");
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll("[data-i18n-html]")) {
    el.innerHTML = t(el.dataset.i18nHtml);
  }
  for (const el of document.querySelectorAll("[data-i18n-title]")) {
    el.title = t(el.dataset.i18nTitle);
  }
  document.getElementById("langEn").classList.toggle("active", I18N.lang === "en");
  document.getElementById("langDe").classList.toggle("active", I18N.lang === "de");
  for (const fn of I18N.onChange) fn();
}

function setLanguage(lang) {
  I18N.lang = lang;
  localStorage.setItem("astrofly-lang", lang);
  applyLanguage();
}

document.getElementById("langEn").addEventListener("click", () => setLanguage("en"));
document.getElementById("langDe").addEventListener("click", () => setLanguage("de"));
applyLanguage();
