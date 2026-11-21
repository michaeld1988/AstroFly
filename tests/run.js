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

    // Spiegelserver: VizieR meldet Datenbankfehler als "gueltige" leere Antwort (HTTP 200).
    // Das darf nicht als "keine Sterne" durchgehen, sondern muss zum naechsten Server fuehren
    const mir = await page.evaluate(async () => {
      if (typeof fetchCds !== "function") return { skipped: true };
      const orig = window.fetchTapCsv, keep = { ...cdsHost }, calls = [];
      const dbErr = "#\n#   VizieR Astronomical Server\n# Report from: stdb_pg_conn,     Status: STDB_ERR\n#Couldn't connect with server\n#\n\n#RESOURCE=\n#Name:\n#Title:\n";
      const empty = "#\n#RESOURCE=yCat_1355\n#Name: I/355\n#Table\tI_355_gaiadr3:\n#Name: I/355/gaiadr3\n";
      window.fetchTapCsv = async (url) => { calls.push(new URL(url).host); return calls.length === 1 ? dbErr : empty; };
      let txt = "", err = null;
      try { txt = await fetchCds("vizier", "/viz-bin/asu-tsv?test"); } catch (e) { err = e.message; }
      window.fetchTapCsv = orig; Object.assign(cdsHost, keep);
      return { calls, switched: calls.length === 2 && calls[0] !== calls[1], gotEmpty: /yCat_1355/.test(txt), err };
    });
    check(channel, "Spiegelserver: Datenbankfehler von VizieR gilt nicht als leeres Ergebnis", mir.skipped || (mir.switched && mir.gotEmpty && !mir.err), JSON.stringify(mir));

    // Gaia-Abgleich gegen den echten Server
    if (NETWORK) {
      const gaiaRun = async () => {
        await page.evaluate(() => { applyFlightPreset("cineKubrick"); document.getElementById("btnGaia").click(); });
        await page.waitForFunction(() => !document.getElementById("btnGaia").disabled &&
          !/Gaia-Katalog ab|Querying/.test(document.getElementById("gaiaStatus").textContent), null, { timeout: 300000 });
        const g = await page.evaluate(() => ({ info: state.gaiaInfo, status: document.getElementById("gaiaStatus").textContent }));
        return { g, ratio: g.info ? g.info.matched / Math.max(1, g.info.total) : 0 };
      };
      // Der Katalogserver gehoert nicht zur App und antwortet unter Last
      // zeitweise lueckenhaft (derselbe Lauf: ein Kanal 99 %, der naechste
      // fast nichts). Ein einzelner Aussetzer ist kein Befund: einmal
      // wiederholen, erst zwei Fehlschlaege zaehlen
      let { g, ratio } = await gaiaRun();
      let tries = 1;
      if (ratio < 0.5) {
        await page.waitForTimeout(10000);
        ({ g, ratio } = await gaiaRun());
        tries = 2;
      }
      // Schwelle bewusst niedrig: einzelne Kacheln scheitern, wenn CDS unter
      // Last ist (Ausweichserver braucht laenger) - ein echter Defekt liegt
      // deutlich darunter (vor dem CORS-Fix: 0 %)
      check(channel, "Gaia-Abgleich >= 50 % (echter Server)", ratio >= 0.5,
        (g.info ? `${g.info.matched}/${g.info.total} (${Math.round(ratio * 100)} %)` : g.status) + (tries > 1 ? " | 2. Versuch" : ""));
      // Objekt-Erkennung gegen den echten Server: SIMBAD in Strassburg oder,
      // wenn der ausfaellt, einer der Spiegel (Harvard, IDIA)
      await page.evaluate(() => document.getElementById("btnObjects").click());
      await page.waitForFunction(() => !document.getElementById("btnObjects").disabled, null, { timeout: 180000 });
      const ob = await page.evaluate(() => ({ ids: (state.objChoices || []).map((o) => o.id),
        status: document.getElementById("objStatus").textContent, host: typeof cdsHost !== "undefined" ? cdsHost : null }));
      check(channel, "Objekt-Erkennung findet M 42 (SIMBAD oder Spiegel)", ob.ids.includes("M 42"),
        `${ob.ids.slice(0, 6).join(", ")} | ${ob.status} | Server ${JSON.stringify(ob.host)}`);
    }

    // Offline-Export (2 s, klein): liefert eine Datei
    const exp = await page.evaluate(async () => {
      state.duration = 2; state.superSample = false;
      const ok = await exportOffline(320, 180, 24);
      for (let i = 0; i < 100 && ok && window.__savedBlob === null; i++) await new Promise((r) => setTimeout(r, 100));
      return { ok, size: window.__savedBlob, status: document.getElementById("exportStatus").textContent };
    });
    check(channel, "Offline-Export liefert Datei", exp.ok === false || (exp.size > 2000), exp.ok === false ? "kein WebCodecs (uebersprungen)" : `${exp.size} Bytes`);

    // Exportgroessen: 21:9 in 4K waere 5040 x 2160 - so breit kodiert H.264 nicht, der Export
    // fiel still auf WebM zurueck. Die laengere Kante bleibt deshalb bei 3840 px
    const dm = await page.evaluate(async () => {
      const res = document.getElementById("ctlRes"), keepRes = res.value;
      const keepBtn = document.querySelector("#aspectBtns button.active");
      const pick = (asp, r) => {
        document.querySelector(`#aspectBtns button[data-aspect="${asp}"]`).click();
        res.value = r; res.dispatchEvent(new Event("change", { bubbles: true }));
        return exportDims();
      };
      const dims = {};
      for (const [asp, r] of [["21:9", "2160"], ["21:9", "1080"], ["16:9", "2160"], ["9:16", "2160"], ["1:1", "2160"]]) dims[asp + "@" + r] = pick(asp, r).join("x");
      const [w, h] = pick("21:9", "2160");
      let h264 = null;
      if (typeof VideoEncoder !== "undefined") {
        const ok = async (cw, ch) => { try { return (await VideoEncoder.isConfigSupported({ codec: "avc1.640033", width: cw, height: ch, framerate: 30, bitrate: 30e6 })).supported; } catch { return false; } };
        h264 = { uhd: await ok(3840, 2160), wide: await ok(w, h), alt: await ok(5040, 2160) };
      }
      res.value = keepRes; res.dispatchEvent(new Event("change", { bubbles: true }));
      if (keepBtn) keepBtn.click();
      return { dims, h264 };
    });
    check(channel, "Export 21:9 in 4K passt in H.264 (MP4 statt WebM)",
      dm.dims["21:9@2160"] === "3840x1646" && dm.dims["21:9@1080"] === "2520x1080" && dm.dims["16:9@2160"] === "3840x2160" &&
      dm.dims["9:16@2160"] === "2160x3840" && dm.dims["1:1@2160"] === "2160x2160" && (!dm.h264 || !dm.h264.uhd || dm.h264.wide),
      JSON.stringify(dm));

    // Funktionen, die Alpha und Beta der Live-Version voraushaben
    if (channel !== "root") {
      const a = await page.evaluate(async () => ({
        film: !!document.getElementById("ctlHalation") && !!document.getElementById("ctlAnamorph") && !document.getElementById("ctlDof"),
        sw: !!(await navigator.serviceWorker.getRegistration()),
        canvasLabel: document.getElementById("glcanvas").getAttribute("aria-label"),
        obj: typeof objSeg !== "undefined" && !!objSeg && !!texObjF && state.obj3d === true,
      }));
      check(channel, "Film-Regler, Service Worker, Canvas-Name", a.film && a.sw && !!a.canvasLabel, JSON.stringify(a));
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
      check(channel, "Wolken-Objekte (Ruhebild = Foto, Flug rendert)", a.obj && o.built && o.err === 0 && o.restDiff < 1.5 && o.moved > 0.05, JSON.stringify(o));
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
      check(channel, "Export-Farbwandlung (BT.709, begrenzter Bereich)", y.skipped || (!y.fail && y.worst <= 1 && y.cs && y.cs.fullRange === false && y.cs.matrix === "bt709"), JSON.stringify(y));
      // Film & Farbe (a12): Flares aus dem Bild, Weissabgleich, Titelkarte im Hochformat,
      // und alte Werte entfernter Regler duerfen nichts brechen
      const f = await page.evaluate(async () => {
        const grab = (w, h) => { const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
        const mean = (px) => { const m = [0, 0, 0]; for (let i = 0; i < px.length; i += 4) { m[0] += px[i]; m[1] += px[i + 1]; m[2] += px[i + 2]; } return m.map((v) => v / (px.length / 4)); };
        canvas.width = 640; canvas.height = 360;
        applyFlightPreset("nebGentle");
        const shot = () => { render(1); gl.finish(); return grab(640, 360); };
        setCtl("ctlAnamorph", 0); const a0 = shot();
        setCtl("ctlAnamorph", 100); const a1 = shot(); const errFlare = gl.getError();
        let add = 0, less = 0;
        for (let i = 0; i < a0.length; i += 4) { const d = (a1[i] + a1[i + 1] + a1[i + 2]) - (a0[i] + a0[i + 1] + a0[i + 2]); if (d > 0) add += d; else less -= d; }
        setCtl("ctlAnamorph", 0);
        const neutral = wbGains();
        setCtl("ctlTemp", 60); const warm = mean(shot());
        setCtl("ctlTemp", -60); const cool = mean(shot());
        setCtl("ctlTemp", 0); setCtl("ctlTint", 60); const mag = mean(shot());
        setCtl("ctlTint", 0); const base = mean(shot());
        // Titelkarte 9:16 mit langem Namen: am linken und rechten Rand darf keine Schrift stehen
        // (Marker und Infokarte aus, sie duerfen bis an den Rand reichen)
        const keep = { tc: state.titleCard, cc: state.cardCustom, oi: state.objInfo, sl: state.showLabels, si: state.showInfo };
        state.titleCard = true; state.cardCustom = { name: "California Nebula" }; state.objInfo = null;
        state.showLabels = false; state.showInfo = false;
        const W = 360, H = 640, c = document.createElement("canvas"); c.width = W; c.height = H;
        const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
        drawOverlayTo(x, W, H, 2.4, camAt(2.4), 1);
        const im = x.getImageData(0, 0, W, H).data;
        let edge = 0, mid = 0;
        for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
          const v = im[(yy * W + xx) * 4];
          if (xx < W * 0.04 || xx >= W * 0.96) edge = Math.max(edge, v); else mid = Math.max(mid, v);
        }
        state.titleCard = keep.tc; state.cardCustom = keep.cc; state.objInfo = keep.oi; state.showLabels = keep.sl; state.showInfo = keep.si;
        // Alt-Daten: Projekt-Regler und Stil-Code mit entfernten Reglern
        let oldOk = true;
        try { applyControls({ ctlDof: 40, ctlFocusA: 20, ctlGrainSize: 3, ctlWeave: 50, ctlShutter: "180", ctlAnamBokeh: true, ctlTemp: 12 }); } catch (e) { oldOk = false; }
        const tempSet = document.getElementById("ctlTemp").value;
        const sc = parseStyleCode('alt: { look: "film", set: { ctlDof: 30, ctlGrainSize: 2, ctlTemp: 15 }, checks: { ctlAnamBokeh: true } },');
        try { applyStyleCode(sc); } catch (e) { oldOk = false; }
        const scTemp = document.getElementById("ctlTemp").value;
        setCtl("ctlTemp", 0);
        return { errFlare, add: Math.round(add / 1000), less: Math.round(less / 1000), neutral,
          warmRB: +(warm[0] / warm[2]).toFixed(3), coolRB: +(cool[0] / cool[2]).toFixed(3), baseRB: +(base[0] / base[2]).toFixed(3),
          magG: +(mag[1] / (mag[0] + mag[2])).toFixed(3), baseG: +(base[1] / (base[0] + base[2])).toFixed(3),
          edge, mid, oldOk, tempSet, scSet: Object.keys(sc.set).join(","), scTemp };
      });
      check(channel, "Flares kommen als Licht dazu (kein GL-Fehler)", f.errFlare === 0 && f.add > 20 && f.less < f.add * 0.05, JSON.stringify({ err: f.errFlare, add: f.add, less: f.less }));
      check(channel, "Temperatur und Toenung (neutral = 1/1/1, Richtung stimmt)",
        f.neutral.every((v) => Math.abs(v - 1) < 1e-9) && f.warmRB > f.baseRB * 1.1 && f.coolRB < f.baseRB * 0.9 && f.magG < f.baseG * 0.95,
        JSON.stringify({ warm: f.warmRB, base: f.baseRB, cool: f.coolRB, magG: f.magG, baseG: f.baseG }));
      check(channel, "Titelkarte bleibt im Hochformat im Bild", f.mid > 150 && f.edge < 60, JSON.stringify({ rand: f.edge, mitte: f.mid }));
      check(channel, "alte Projekte und Stil-Codes mit entfernten Reglern laden", f.oldOk && f.tempSet === "12" && f.scSet === "ctlTemp" && f.scTemp === "15",
        JSON.stringify({ ok: f.oldOk, temp: f.tempSet, set: f.scSet, stil: f.scTemp }));
      // Look -> Bearbeiten (a14): Gruppen und Reihenfolge wie in Lightroom, kein Regler verloren,
      // der alte Tab "film" fuehrt hierher, auf- und zugeklappte Gruppen werden gemerkt
      const lk = await page.evaluate(async () => {
        const sec = document.querySelector('section[data-tab="look"]');
        const dets = [...sec.querySelectorAll(":scope > details.adv")];
        const panels = dets.map((d) => [d.querySelector("summary").dataset.i18n, [...d.querySelectorAll("input,select")].map((e) => e.id).join(",")]);
        const subs = TAB_GROUPS.find((g) => g.id === "look").subs.map((x) => x[0]).join(",");
        const det = dets[3];
        det.open = false; await new Promise((r) => setTimeout(r, 80));
        const closed = (JSON.parse(localStorage.getItem("astrofly-panels") || "{}")).panDetail;
        det.open = true; await new Promise((r) => setTimeout(r, 80));
        const reopened = (JSON.parse(localStorage.getItem("astrofly-panels") || "{}")).panDetail;
        return { panels, subs, film: !!document.querySelector('section[data-tab="film"]'), alias: TAB_ALIAS.film, closed, reopened };
      });
      const wantPanels = [
        ["panLight", "ctlExposure,ctlContrast,ctlFilmic,ctlLift"],
        ["panColor", "ctlTemp,ctlTint,ctlSaturation,ctlSplitTone"],
        ["panEffects", "ctlStructure,ctlClarity,ctlHaze,ctlHazeTint,ctlVignette,ctlGrain,ctlBloom,ctlHalation"],
        ["panDetail", "ctlSharpen"],
        ["panOptics", "ctlAnamorph,ctlWarp,ctlMblur,ctlMblurStars,ctlLetterbox"],
        ["panScene", "ctlNebFlow,ctlExtinct,ctlRelight"],
      ];
      check(channel, "Look-Regler in Lightroom-Gruppen (Licht, Farbe, Effekte, Details, Optik)",
        JSON.stringify(lk.panels) === JSON.stringify(wantPanels) && lk.subs === "sterne,look,nebel,presets" && !lk.film && lk.alias === "look" &&
        lk.closed === false && lk.reopened === true,
        JSON.stringify({ gruppen: lk.panels.map((x) => x[0]), subs: lk.subs, film: lk.film, alias: lk.alias, zu: lk.closed, auf: lk.reopened }));
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
