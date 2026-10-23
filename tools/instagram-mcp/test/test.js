// Tests für den Instagram-MCP-Worker: MCP-Handshake, Tool-Aufrufe gegen eine
// gemockte Graph-API, Veröffentlichungs-Flow, Fehlerpfade und Zugriffsschutz.
import assert from "node:assert";
import worker from "../src/worker.js";

// ---- Mocks -----------------------------------------------------------------

const kvStore = new Map();
const kv = {
  async get(k) { return kvStore.has(k) ? kvStore.get(k) : null; },
  async put(k, v) { kvStore.set(k, v); },
};

const graphCalls = [];
globalThis.fetch = async (input, init) => {
  const url = String(input);
  const method = (init && init.method) || "GET";
  const params = method === "GET"
    ? new URL(url).searchParams
    : new URLSearchParams(String(init.body));
  graphCalls.push({ url, method, params });
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

  if (url.includes("/me?") || url.endsWith("/me")) {
    return json({ user_id: "178414", username: "astrofly_app", followers_count: 321, media_count: 12 });
  }
  if (url.includes("/me/media?")) {
    return json({ data: [{ id: "M1", caption: "FITS support just landed", like_count: 4, comments_count: 1 }] });
  }
  if (url.includes("/M1/comments")) {
    return json({ data: [{ id: "K1", text: "Any recommended settings?", username: "darkstar_astro" }] });
  }
  if (url.includes("/K1/replies")) {
    return json({ id: "K2" });
  }
  if (url.includes("/me/media_publish")) {
    return json({ id: "P9" });
  }
  if (url.includes("/me/media") && method === "POST") {
    return json({ id: "C1" });
  }
  if (url.includes("/C1?")) {
    return json({ status_code: "FINISHED" });
  }
  if (url.includes("/BROKEN/insights")) {
    return json({ error: { message: "Unsupported get request", code: 100 } }, 400);
  }
  if (url.includes("/refresh_access_token")) {
    return json({ access_token: "NEW_TOKEN", expires_in: 5184000 });
  }
  throw new Error("Unerwarteter fetch im Test: " + method + " " + url);
};

const env = { IG_ACCESS_TOKEN: "TESTTOKEN", SECRET_PATH: "mcp-test", TOKENS: kv };
const ctx = { waitUntil(p) { /* im Test synchron ignoriert */ } };

function post(body, path = "/mcp-test") {
  return worker.fetch(new Request("https://ig.example.workers.dev" + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env, ctx);
}

async function call(name, args, id = 1) {
  const res = await post({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
  const body = await res.json();
  return body.result;
}

// ---- Tests -----------------------------------------------------------------

const checks = [];
function check(name, ok) { checks.push([name, ok]); }

// Zugriffsschutz
{
  const res = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, "/falscher-pfad");
  check("Falscher Pfad wird abgewiesen (404)", res.status === 404);
  const res2 = await worker.fetch(new Request("https://ig.example.workers.dev/mcp-test"), env, ctx);
  check("GET wird abgewiesen (405)", res2.status === 405);
}

// MCP-Handshake
{
  const res = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } });
  const body = await res.json();
  check("initialize liefert serverInfo", body.result?.serverInfo?.name === "astrofly-instagram-mcp");
  check("initialize spiegelt Protokollversion", body.result?.protocolVersion === "2025-06-18");
  const notif = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  check("Notification wird mit 202 beantwortet", notif.status === 202);
}

// Tools
{
  const res = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const body = await res.json();
  check("tools/list liefert 12 Tools", body.result?.tools?.length === 12);
  check("Alle Tools haben ein Schema", body.result.tools.every((t) => t.inputSchema?.type === "object"));
}

// Profil + Kommentare + Antwort
{
  const r = await call("ig_profile", {});
  check("ig_profile liefert Username", r.content[0].text.includes("astrofly_app"));
  const media = await call("ig_recent_media", { limit: 5 });
  check("ig_recent_media liefert Beiträge", media.content[0].text.includes("FITS support"));
  const com = await call("ig_comments", { media_id: "M1" });
  check("ig_comments liefert Kommentar", com.content[0].text.includes("darkstar_astro"));
  const rep = await call("ig_reply_to_comment", { comment_id: "K1", message: "Thank you!" });
  check("ig_reply_to_comment antwortet", rep.content[0].text.includes('"replied": true'));
  const replyCall = graphCalls.find((c) => c.url.includes("/K1/replies"));
  check("Antwort-POST enthält Nachricht", replyCall && replyCall.params.get("message") === "Thank you!");
}

// Veröffentlichen: Container -> Status -> Publish
{
  const r = await call("ig_publish_image", { image_url: "https://example.com/slide1.jpg", caption: "Test #astrofly" });
  check("ig_publish_image veröffentlicht (media_id)", r.content[0].text.includes('"media_id": "P9"'));
  const create = graphCalls.find((c) => c.url.includes("/me/media") && c.method === "POST" && c.params.get("image_url"));
  check("Container-POST enthält Caption", create && create.params.get("caption") === "Test #astrofly");
  check("Publish-POST nutzt creation_id", graphCalls.some((c) => c.url.includes("media_publish") && c.params.get("creation_id") === "C1"));
}

// Fehlerpfad: Graph-Fehler wird als Tool-Fehler gemeldet, nicht als Crash
{
  const r = await call("ig_media_insights", { media_id: "BROKEN" });
  check("Graph-Fehler wird als isError gemeldet", r.isError === true && r.content[0].text.includes("Unsupported get request"));
}

// Token: KV hat Vorrang vor dem Secret
{
  kvStore.set("ig_token", "KV_TOKEN");
  graphCalls.length = 0;
  await call("ig_profile", {});
  const c = graphCalls.find((c) => c.url.includes("/me"));
  check("KV-Token hat Vorrang", c && c.params.get("access_token") === "KV_TOKEN");
  kvStore.delete("ig_token");
}

// Token-Erneuerung speichert in KV, gibt den Token aber nicht aus
{
  const r = await call("ig_refresh_token", {});
  check("ig_refresh_token meldet Erfolg", r.content[0].text.includes('"refreshed": true'));
  check("Neuer Token liegt in KV", kvStore.get("ig_token") === "NEW_TOKEN");
  check("Token taucht nicht in der Antwort auf", !r.content[0].text.includes("NEW_TOKEN"));
}

// Carousel-Validierung
{
  const r = await call("ig_publish_carousel", { image_urls: ["nur-eins.jpg"] });
  check("Carousel mit 1 Bild wird abgelehnt", r.isError === true && r.content[0].text.includes("2 bis 10"));
}

// ---- Auswertung ------------------------------------------------------------

let fail = 0;
for (const [name, ok] of checks) {
  console.log((ok ? "PASS" : "FAIL") + ": " + name);
  if (!ok) fail++;
}
console.log(fail === 0 ? "ALL OK" : "FAILURES: " + fail);
process.exit(fail === 0 ? 0 : 1);
