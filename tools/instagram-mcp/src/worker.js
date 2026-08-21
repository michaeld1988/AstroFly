// AstroFly Instagram MCP-Server (Cloudflare Worker, ohne Abhängigkeiten)
//
// Verbindet Claude über das Model Context Protocol (Streamable HTTP) mit der
// offiziellen Instagram-API ("Instagram API with Instagram Login",
// graph.instagram.com). Kann Posts/Reels/Carousels veröffentlichen, Kommentare
// unter eigenen Posts lesen und beantworten sowie Insights abrufen.
//
// Worker-Konfiguration:
//   IG_ACCESS_TOKEN (Secret)   Long-lived Access Token des Instagram-Kontos
//   SECRET_PATH     (Secret)   geheimes URL-Segment, z. B. "mcp-8f3kq0..." -
//                              der Connector wird unter /<SECRET_PATH> erreicht
//   GRAPH_VERSION   (optional) API-Version, Default "v23.0"
//   TOKENS          (KV)       optional: automatische Token-Erneuerung
//
// Der Token bleibt ausschließlich im Worker (Secret/KV) und taucht nie in
// Tool-Antworten auf.

const GRAPH_HOST = "https://graph.instagram.com";
const SERVER_INFO = { name: "astrofly-instagram-mcp", version: "1.0.0" };

// ------------------------------------------------------------ Graph-API-Client

function graphVersion(env) {
  return env.GRAPH_VERSION || "v23.0";
}

async function getToken(env) {
  if (env.TOKENS) {
    const t = await env.TOKENS.get("ig_token");
    if (t) return t;
  }
  return env.IG_ACCESS_TOKEN;
}

function igErrorText(data, status) {
  const e = data && data.error;
  if (e) return `Instagram-API-Fehler (${e.code || status}): ${e.message || JSON.stringify(e)}`;
  return `Instagram-API-Fehler: HTTP ${status}`;
}

/** GET/POST gegen graph.instagram.com/<version><path>; wirft bei Fehlern. */
async function graph(env, method, path, params) {
  const token = await getToken(env);
  if (!token) throw new Error("Kein Access Token konfiguriert (Secret IG_ACCESS_TOKEN fehlt).");
  const search = new URLSearchParams(params || {});
  search.set("access_token", token);
  const url = `${GRAPH_HOST}/${graphVersion(env)}${path}`;
  const res = method === "GET"
    ? await fetch(`${url}?${search}`)
    : await fetch(url, { method, body: search });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(igErrorText(data, res.status));
  return data;
}

/**
 * Long-lived Tokens laufen nach 60 Tagen ab. Mit KV-Binding wird der Token
 * automatisch wöchentlich erneuert (Graph verlangt Mindestalter 24 h, deshalb
 * wird beim ersten Aufruf nur der Zeitstempel gesetzt). Fehler sind unkritisch:
 * der nächste Request versucht es erneut.
 */
async function maybeRefreshToken(env) {
  if (!env.TOKENS) return;
  const now = Date.now();
  const ts = Number(await env.TOKENS.get("ig_token_ts"));
  if (!ts) { await env.TOKENS.put("ig_token_ts", String(now)); return; }
  if (now - ts < 7 * 864e5) return;
  try {
    await refreshTokenNow(env);
  } catch {
    // morgen erneut versuchen statt bei jedem Request
    await env.TOKENS.put("ig_token_ts", String(now - 6 * 864e5));
  }
}

async function refreshTokenNow(env) {
  if (!env.TOKENS) {
    throw new Error("Kein KV-Namespace TOKENS gebunden - automatische Erneuerung nicht möglich. " +
      "In wrangler.jsonc das kv_namespaces-Binding einrichten (siehe README).");
  }
  const token = await getToken(env);
  const res = await fetch(`${GRAPH_HOST}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(igErrorText(data, res.status));
  await env.TOKENS.put("ig_token", data.access_token);
  await env.TOKENS.put("ig_token_ts", String(Date.now()));
  return { refreshed: true, expiresInDays: Math.round((data.expires_in || 0) / 86400) };
}

// ------------------------------------------------------- Veröffentlichungs-Flow

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createContainer(env, params) {
  const d = await graph(env, "POST", "/me/media", params);
  return d.id;
}

/** Wartet, bis ein Container fertig verarbeitet ist (Bilder: Sekunden, Videos: länger). */
async function waitFinished(env, id, tries, delayMs) {
  for (let i = 0; i < tries; i++) {
    const s = await graph(env, "GET", `/${id}`, { fields: "status_code" });
    if (s.status_code === "FINISHED") return true;
    if (s.status_code === "ERROR") {
      throw new Error(`Container ${id}: Verarbeitung fehlgeschlagen (Status ERROR). ` +
        "Häufigste Ursache: Medien-URL nicht öffentlich erreichbar oder Format nicht unterstützt.");
    }
    await sleep(delayMs);
  }
  return false;
}

async function publishContainer(env, id) {
  const d = await graph(env, "POST", "/me/media_publish", { creation_id: id });
  return d.id;
}

function pendingResult(creationId) {
  return {
    status: "processing",
    creation_id: creationId,
    hint: "Video wird noch verarbeitet. Mit ig_container_status prüfen und danach mit ig_publish_container veröffentlichen.",
  };
}

// ----------------------------------------------------------------- MCP-Tools

const TOOLS = [
  {
    name: "ig_profile",
    description: "Profil des verbundenen Instagram-Kontos abrufen (Username, Follower, Anzahl Beiträge).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ig_recent_media",
    description: "Die letzten eigenen Beiträge auflisten (ID, Caption, Typ, Permalink, Likes, Kommentaranzahl). Die IDs werden für ig_comments und ig_media_insights gebraucht.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "Anzahl Beiträge (Default 10, max 50)" } },
      additionalProperties: false,
    },
  },
  {
    name: "ig_comments",
    description: "Kommentare (inkl. Antworten) unter einem eigenen Beitrag lesen.",
    inputSchema: {
      type: "object",
      properties: {
        media_id: { type: "string", description: "Media-ID aus ig_recent_media" },
        limit: { type: "number", description: "Anzahl Kommentare (Default 25)" },
      },
      required: ["media_id"],
      additionalProperties: false,
    },
  },
  {
    name: "ig_reply_to_comment",
    description: "Auf einen Kommentar unter einem eigenen Beitrag antworten (erscheint als Antwort des Kontos).",
    inputSchema: {
      type: "object",
      properties: {
        comment_id: { type: "string", description: "Kommentar-ID aus ig_comments" },
        message: { type: "string", description: "Antworttext" },
      },
      required: ["comment_id", "message"],
      additionalProperties: false,
    },
  },
  {
    name: "ig_publish_image",
    description: "Ein einzelnes Bild als Feed-Post veröffentlichen. Die Bild-URL muss öffentlich erreichbar sein (JPEG empfohlen).",
    inputSchema: {
      type: "object",
      properties: {
        image_url: { type: "string", description: "Öffentliche URL des Bildes" },
        caption: { type: "string", description: "Caption inkl. Hashtags" },
      },
      required: ["image_url"],
      additionalProperties: false,
    },
  },
  {
    name: "ig_publish_carousel",
    description: "Mehrere Bilder (2-10) als Carousel-Post veröffentlichen. Alle URLs müssen öffentlich erreichbar sein.",
    inputSchema: {
      type: "object",
      properties: {
        image_urls: { type: "array", items: { type: "string" }, description: "Öffentliche Bild-URLs in Slide-Reihenfolge" },
        caption: { type: "string", description: "Caption inkl. Hashtags" },
      },
      required: ["image_urls"],
      additionalProperties: false,
    },
  },
  {
    name: "ig_publish_reel",
    description: "Ein Video als Reel veröffentlichen (MP4/H.264, 9:16 empfohlen). Videoverarbeitung dauert oft länger als ein Tool-Aufruf: bei status \"processing\" mit ig_container_status prüfen und mit ig_publish_container abschließen.",
    inputSchema: {
      type: "object",
      properties: {
        video_url: { type: "string", description: "Öffentliche URL des Videos" },
        caption: { type: "string", description: "Caption inkl. Hashtags" },
        cover_url: { type: "string", description: "Optionale öffentliche URL des Titelbilds" },
        share_to_feed: { type: "boolean", description: "Auch im Feed zeigen (Default true)" },
      },
      required: ["video_url"],
      additionalProperties: false,
    },
  },
  {
    name: "ig_container_status",
    description: "Verarbeitungsstatus eines Upload-Containers prüfen (FINISHED, IN_PROGRESS, ERROR).",
    inputSchema: {
      type: "object",
      properties: { creation_id: { type: "string", description: "Container-ID aus einem ig_publish_*-Aufruf" } },
      required: ["creation_id"],
      additionalProperties: false,
    },
  },
  {
    name: "ig_publish_container",
    description: "Einen fertig verarbeiteten Container (status FINISHED) veröffentlichen.",
    inputSchema: {
      type: "object",
      properties: { creation_id: { type: "string", description: "Container-ID" } },
      required: ["creation_id"],
      additionalProperties: false,
    },
  },
  {
    name: "ig_account_insights",
    description: "Konto-Insights abrufen (z. B. reach, follower_count). Zeitraum über period/since/until.",
    inputSchema: {
      type: "object",
      properties: {
        metrics: { type: "string", description: "Kommagetrennte Metriken (Default \"reach,follower_count\")" },
        period: { type: "string", description: "day, week oder days_28 (Default day)" },
        since: { type: "string", description: "Optional: Unix-Timestamp oder YYYY-MM-DD" },
        until: { type: "string", description: "Optional: Unix-Timestamp oder YYYY-MM-DD" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "ig_media_insights",
    description: "Insights eines einzelnen Beitrags abrufen (Default: reach, likes, comments, saved, shares, views).",
    inputSchema: {
      type: "object",
      properties: {
        media_id: { type: "string", description: "Media-ID aus ig_recent_media" },
        metrics: { type: "string", description: "Kommagetrennte Metriken (überschreibt den Default)" },
      },
      required: ["media_id"],
      additionalProperties: false,
    },
  },
  {
    name: "ig_refresh_token",
    description: "Access Token sofort erneuern (läuft sonst nach 60 Tagen ab; mit KV-Binding passiert das automatisch wöchentlich). Der Token selbst wird nie ausgegeben.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function callTool(env, name, args) {
  const a = args || {};
  switch (name) {
    case "ig_profile":
      return graph(env, "GET", "/me", {
        fields: "user_id,username,name,followers_count,follows_count,media_count",
      });

    case "ig_recent_media": {
      const d = await graph(env, "GET", "/me/media", {
        fields: "id,caption,media_type,permalink,timestamp,like_count,comments_count",
        limit: String(Math.min(a.limit || 10, 50)),
      });
      return d.data || [];
    }

    case "ig_comments": {
      const d = await graph(env, "GET", `/${a.media_id}/comments`, {
        fields: "id,text,username,timestamp,like_count,replies{id,text,username,timestamp}",
        limit: String(a.limit || 25),
      });
      return d.data || [];
    }

    case "ig_reply_to_comment": {
      const d = await graph(env, "POST", `/${a.comment_id}/replies`, { message: a.message });
      return { replied: true, reply_id: d.id };
    }

    case "ig_publish_image": {
      const params = { image_url: a.image_url };
      if (a.caption) params.caption = a.caption;
      const id = await createContainer(env, params);
      if (!(await waitFinished(env, id, 6, 1500))) return pendingResult(id);
      const mediaId = await publishContainer(env, id);
      return { published: true, media_id: mediaId };
    }

    case "ig_publish_carousel": {
      const urls = a.image_urls || [];
      if (urls.length < 2 || urls.length > 10) {
        throw new Error("Ein Carousel braucht 2 bis 10 Bilder.");
      }
      const children = [];
      for (const u of urls) {
        children.push(await createContainer(env, { image_url: u, is_carousel_item: "true" }));
      }
      for (const c of children) {
        if (!(await waitFinished(env, c, 6, 1500))) return pendingResult(c);
      }
      const params = { media_type: "CAROUSEL", children: children.join(",") };
      if (a.caption) params.caption = a.caption;
      const id = await createContainer(env, params);
      if (!(await waitFinished(env, id, 6, 1500))) return pendingResult(id);
      const mediaId = await publishContainer(env, id);
      return { published: true, media_id: mediaId, slides: children.length };
    }

    case "ig_publish_reel": {
      const params = { media_type: "REELS", video_url: a.video_url };
      if (a.caption) params.caption = a.caption;
      if (a.cover_url) params.cover_url = a.cover_url;
      if (a.share_to_feed === false) params.share_to_feed = "false";
      const id = await createContainer(env, params);
      if (!(await waitFinished(env, id, 8, 2500))) return pendingResult(id);
      const mediaId = await publishContainer(env, id);
      return { published: true, media_id: mediaId };
    }

    case "ig_container_status":
      return graph(env, "GET", `/${a.creation_id}`, { fields: "status_code,status" });

    case "ig_publish_container": {
      const mediaId = await publishContainer(env, a.creation_id);
      return { published: true, media_id: mediaId };
    }

    case "ig_account_insights": {
      const params = {
        metric: a.metrics || "reach,follower_count",
        period: a.period || "day",
      };
      if (a.since) params.since = a.since;
      if (a.until) params.until = a.until;
      const d = await graph(env, "GET", "/me/insights", params);
      return d.data || [];
    }

    case "ig_media_insights": {
      const d = await graph(env, "GET", `/${a.media_id}/insights`, {
        metric: a.metrics || "reach,likes,comments,saved,shares,views",
      });
      return d.data || [];
    }

    case "ig_refresh_token":
      return refreshTokenNow(env);

    default:
      throw new Error(`Unbekanntes Tool: ${name}`);
  }
}

// ------------------------------------------------- MCP über Streamable HTTP

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleRpc(env, msg) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(msg && msg.id !== undefined ? msg.id : null, -32600, "Ungültiger Request");
  }
  // Notifications (ohne id) brauchen keine Antwort
  if (msg.id === undefined) return null;

  switch (msg.method) {
    case "initialize":
      return rpcResult(msg.id, {
        protocolVersion: typeof msg.params?.protocolVersion === "string"
          ? msg.params.protocolVersion : "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, { tools: TOOLS });
    case "tools/call": {
      const { name, arguments: args } = msg.params || {};
      try {
        const result = await callTool(env, name, args);
        return rpcResult(msg.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      } catch (e) {
        return rpcResult(msg.id, {
          content: [{ type: "text", text: String(e.message || e) }],
          isError: true,
        });
      }
    }
    default:
      return rpcError(msg.id, -32601, `Methode nicht unterstützt: ${msg.method}`);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (!env.SECRET_PATH) {
      return new Response("SECRET_PATH ist nicht konfiguriert (wrangler secret put SECRET_PATH).", { status: 500 });
    }
    const url = new URL(request.url);
    if (url.pathname !== `/${env.SECRET_PATH}`) {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json(rpcError(null, -32700, "Kein gültiges JSON"), { status: 400 });
    }

    // Gelegenheit für die wöchentliche Token-Erneuerung (läuft im Hintergrund)
    if (ctx && ctx.waitUntil) ctx.waitUntil(maybeRefreshToken(env));

    const reply = await handleRpc(env, body);
    if (reply === null) return new Response(null, { status: 202 });
    return Response.json(reply);
  },
};
