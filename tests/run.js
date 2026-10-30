// AstroFly Smoke-Tests: laden die App in einem echten Chromium (Playwright)
// und pruefen je Kanal (live, beta, alpha), was ein Nutzer als Erstes merkt:
// Seite laedt fehlerfrei, Demo wird erkannt, jeder Flug-Preset rendert ein
// Bild, Gaia-Abgleich gegen den echten Katalogserver, Offline-Export liefert
// eine Datei. Aufruf: node tests/run.js  (CHANNELS=root,beta,alpha NETWORK=1)
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CHANNELS = (process.env.CHANNELS || "root,beta,alpha").split(",").map((s) => s.trim()).filter(Boolean);
const NETWORK = process.env.NETWORK !== "0";
const MIME = { html: "text/html", js: "text/javascript", css: "text/css", json: "application/json",
  webmanifest: "application/manifest+json", png: "image/png", jpg: "image/jpeg", wcs: "application/octet-stream" };

function serve() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end("not found"); return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).slice(1)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, port: srv.address().port })));
}

const results = [];
function check(channel, name, pass, detail) {
  results.push({ channel, name, pass: !!pass, detail: detail === undefined ? "" : String(detail) });
  console.log(`${pass ? "PASS" : "FAIL"}  [${channel}] ${name}${detail !== undefined ? "  (" + detail + ")" : ""}`);
}

async function testChannel(browser, base, channel) {
  const url = base + (channel === "root" ? "/" : `/${channel}/`) + "index.html";
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Katalogserver (CDS, GAVO) antworten unter Last mit Fehlerseiten ohne
  // CORS-Header - der Browser meldet das als Konsolenfehler, die App faengt
  // es ab (Ausweichserver). Das ist kein Fehler der App
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|ERR_CERT|Failed to load resource|vizier|simbad|uni-heidelberg|esac\.esa/.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); });
  await page.addInitScript(() => {
    localStorage.setItem("astrofly-tour-seen", "1");
    localStorage.setItem("astrofly-mode", "pro");
    // Export: statt Download die Groesse merken
    window.__savedBlob = null;
    window.addEventListener("DOMContentLoaded", () => { window.saveBlob = (blob) => { window.__savedBlob = blob.size; }; });
  });
  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(800);
    check(channel, "Seite laedt ohne JS-Fehler", errors.length === 0, errors[0]);

    // Demo laden
    await page.click("#btnDemo");
    await page.waitForFunction(() => typeof state !== "undefined" && state.starless && state.maskStarCount > 0 && state.wcs, null, { timeout: 240000 });
    const demo = await page.evaluate(() => ({ stars: state.maskStarCount, w: state.starless.width }));
    check(channel, "Demo erkannt (Sterne, WCS)", demo.stars > 2000 && demo.w > 1000, `${demo.stars} Sterne`);

    // Jeder Flug-Preset rendert ein nicht-schwarzes Bild ohne GL-Fehler
    const presets = await page.evaluate(() => {
      const out = {};
      canvas.width = 640; canvas.height = 360;
      for (const name of Object.keys(FLIGHT_PRESETS)) {
        applyFlightPreset(name);
        render(Math.min(2, state.duration / 2)); gl.finish();
        const px = new Uint8Array(640 * 360 * 4);
        gl.readPixels(0, 0, 640, 360, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
        out[name] = { glErr: gl.getError(), mean: sum / (640 * 360 * 3) };
      }
      return out;
    });
    const bad = Object.entries(presets).filter(([, r]) => r.glErr !== 0 || r.mean < 2);
    check(channel, `Alle ${Object.keys(presets).length} Flug-Presets rendern`, bad.length === 0, bad.map(([n, r]) => `${n}: glErr=${r.glErr} mean=${r.mean.toFixed(1)}`).join("; "));
    check(channel, "Presets ohne JS-Fehler", errors.length === 0, errors[0]);

    // Gaia-Abgleich gegen den echten Server
    if (NETWORK) {
      await page.evaluate(() => { applyFlightPreset("cineKubrick"); document.getElementById("btnGaia").click(); });
      await page.waitForFunction(() => !document.getElementById("btnGaia").disabled &&
        !/Gaia-Katalog ab|Querying/.test(document.getElementById("gaiaStatus").textContent), null, { timeout: 300000 });
      const g = await page.evaluate(() => ({ info: state.gaiaInfo, status: document.getElementById("gaiaStatus").textContent }));
      const ratio = g.info ? g.info.matched / Math.max(1, g.info.total) : 0;
      // Schwelle bewusst niedrig: einzelne Kacheln scheitern, wenn CDS unter
      // Last ist (Ausweichserver braucht laenger) - ein echter Defekt liegt
      // deutlich darunter (vor dem CORS-Fix: 0 %)
      check(channel, "Gaia-Abgleich >= 50 % (echter Server)", ratio >= 0.5, g.info ? `${g.info.matched}/${g.info.total} (${Math.round(ratio * 100)} %)` : g.status);
    }

    // Offline-Export (2 s, klein): liefert eine Datei
    const exp = await page.evaluate(async () => {
      state.duration = 2; state.superSample = false;
      const ok = await exportOffline(320, 180, 24);
      for (let i = 0; i < 100 && ok && window.__savedBlob === null; i++) await new Promise((r) => setTimeout(r, 100));
      return { ok, size: window.__savedBlob, status: document.getElementById("exportStatus").textContent };
    });
    check(channel, "Offline-Export liefert Datei", exp.ok === false || (exp.size > 2000), exp.ok === false ? "kein WebCodecs (uebersprungen)" : `${exp.size} Bytes`);

    if (channel === "alpha") {
      const a = await page.evaluate(async () => ({
        film: !!document.getElementById("ctlHalation") && !!document.getElementById("ctlDof"),
        sw: !!(await navigator.serviceWorker.getRegistration()),
        canvasLabel: document.getElementById("glcanvas").getAttribute("aria-label"),
      }));
      check(channel, "Alpha: Film-Panel, Service Worker, Canvas-Name", a.film && a.sw && !!a.canvasLabel, JSON.stringify(a));
    }
    check(channel, "Keine JS-Fehler insgesamt", errors.length === 0, errors.slice(0, 2).join(" | "));
  } catch (e) {
    check(channel, "Ablauf", false, e.message.slice(0, 300));
  } finally {
    await ctx.close();
  }
}

(async () => {
  const { srv, port } = await serve();
  const base = `http://127.0.0.1:${port}`;
  const launch = { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] };
  if (process.env.PW_CHROMIUM) launch.executablePath = process.env.PW_CHROMIUM;
  const browser = await chromium.launch(launch);
  for (const ch of CHANNELS) {
    if (!fs.existsSync(path.join(ROOT, ch === "root" ? "index.html" : `${ch}/index.html`))) { console.log(`skip [${ch}]: nicht vorhanden`); continue; }
    await testChannel(browser, base, ch);
  }
  await browser.close();
  srv.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} Pruefungen bestanden`);
  if (failed.length) { for (const f of failed) console.log(`  FAIL [${f.channel}] ${f.name}: ${f.detail}`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
