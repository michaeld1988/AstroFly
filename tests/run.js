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
        obj: typeof objSeg !== "undefined" && !!objSeg && !!texObjF && state.obj3d === true,
      }));
      check(channel, "Alpha: Film-Panel, Service Worker, Canvas-Name", a.film && a.sw && !!a.canvasLabel, JSON.stringify(a));
      // Wolken-Objekte: aufgebaut, Ruhebild = Foto (gegen die klassische Engine), Flugbild ohne GL-Fehler
      const o = await page.evaluate(async () => {
        const grab = () => { const px = new Uint8Array(640 * 360 * 4); gl.readPixels(0, 0, 640, 360, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
        const set = (on) => { const el = document.getElementById("ctlObj3d"); el.checked = on; el.dispatchEvent(new Event("change", { bubbles: true })); };
        canvas.width = 640; canvas.height = 360;
        applyFlightPreset("nebGentle");
        const sc = state.starCount;
        state.starCount = 0;
        set(true); render(0); gl.finish(); const a = grab();
        render(state.duration / 4); gl.finish(); const err = gl.getError(); const m = grab();
        set(false); state.vol = false; render(0); gl.finish(); const b = grab();
        set(true); state.vol = true; state.starCount = sc;
        let d = 0, mv = 0;
        for (let i = 0; i < a.length; i += 4) { d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); mv += Math.abs(a[i] - m[i]); }
        return { built: !!objSeg && !!texObjF, isles: objSeg ? objSeg.nIsle : 0, restDiff: d / (640 * 360 * 3), moved: mv / (640 * 360), err };
      });
      check(channel, "Alpha: Wolken-Objekte (Ruhebild = Foto, Flug rendert)", a.obj && o.built && o.err === 0 && o.restDiff < 1.5 && o.moved > 0.05, JSON.stringify(o));
      // Export-Farbwandlung: Testfarben muessen exakt als BT.709 im begrenzten Bereich ankommen
      // (Weiss 235, Schwarz 16), auch bei Breiten, die nicht durch 8 teilbar sind
      const y = await page.evaluate(async () => {
        const conv = typeof yuvConverter === "function" ? yuvConverter() : null;
        if (!conv) return { skipped: true };
        const cols = [[255, 255, 255], [0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [128, 128, 128]];
        const want = [[235, 128, 128], [16, 128, 128], [63, 102, 240], [173, 42, 26], [32, 240, 118], [126, 128, 128]];
        let worst = 0, cs = null;
        for (const [w, h] of [[96, 36], [90, 50]]) {
          const c = document.createElement("canvas"); c.width = w; c.height = h;
          const x = c.getContext("2d");
          cols.forEach((k, i) => { x.fillStyle = `rgb(${k[0]},${k[1]},${k[2]})`; x.fillRect(i * 14, 0, i === 5 ? w : 14, h); });
          if (!conv.resize(w, h)) return { fail: "resize " + w };
          const vf = conv.frame(c, { timestamp: 0 });
          if (!vf) return { fail: "frame " + w };
          cs = vf.colorSpace.toJSON();
          const buf = new Uint8Array(vf.allocationSize());
          const lay = await vf.copyTo(buf);
          vf.close();
          cols.forEach((k, i) => {
            const px = i * 14 + 6, py = h - 4;   // untere Zeilen: prueft zugleich die Zeilenreihenfolge nicht (einfarbig), Spalten schon
            const got = [
              buf[lay[0].offset + py * lay[0].stride + px],
              buf[lay[1].offset + (py >> 1) * lay[1].stride + (px >> 1)],
              buf[lay[2].offset + (py >> 1) * lay[2].stride + (px >> 1)],
            ];
            for (let j = 0; j < 3; j++) worst = Math.max(worst, Math.abs(got[j] - want[i][j]));
          });
          // Zeilenreihenfolge: obere Bildhaelfte weiss, untere schwarz
          x.fillStyle = "#fff"; x.fillRect(0, 0, w, h / 2); x.fillStyle = "#000"; x.fillRect(0, h / 2, w, h / 2);
          const v2 = conv.frame(c, { timestamp: 0 });
          const b2 = new Uint8Array(v2.allocationSize());
          const l2 = await v2.copyTo(b2);
          v2.close();
          if (b2[l2[0].offset + 2 * l2[0].stride + 5] !== 235 || b2[l2[0].offset + (h - 3) * l2[0].stride + 5] !== 16) return { fail: "Zeilen " + w };
        }
        return { worst, cs };
      });
      check(channel, "Alpha: Export-Farbwandlung (BT.709, begrenzter Bereich)", y.skipped || (!y.fail && y.worst <= 1 && y.cs && y.cs.fullRange === false && y.cs.matrix === "bt709"), JSON.stringify(y));
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
