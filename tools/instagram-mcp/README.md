# AstroFly Instagram MCP-Server

Verbindet Claude (claude.ai / Claude Code) über das Model Context Protocol mit
dem Instagram-Konto **@astrofly_app** – über die **offizielle Instagram-API**
(„Instagram API with Instagram Login", `graph.instagram.com`). Läuft als
Cloudflare Worker (kostenloser Plan reicht), ohne Abhängigkeiten.

## Was der Server kann

| Tool | Funktion |
|---|---|
| `ig_profile` | Kontodaten: Username, Follower, Beitragszahl |
| `ig_recent_media` | Letzte eigene Beiträge mit Likes/Kommentarzahl |
| `ig_comments` | Kommentare (inkl. Antworten) unter einem eigenen Beitrag |
| `ig_reply_to_comment` | Auf einen Kommentar antworten |
| `ig_publish_image` | Einzelbild als Feed-Post veröffentlichen |
| `ig_publish_carousel` | 2–10 Bilder als Carousel veröffentlichen |
| `ig_publish_reel` | Video als Reel veröffentlichen |
| `ig_container_status` / `ig_publish_container` | Video-Verarbeitung prüfen / abschließen |
| `ig_account_insights` / `ig_media_insights` | Reichweite & Co. für Konto bzw. Beitrag |
| `ig_refresh_token` | Access Token manuell erneuern (läuft sonst automatisch) |

**Was prinzipiell nicht geht** (Beschränkung der offiziellen API): Kommentare
unter fremden Beiträgen schreiben, fremde Feeds lesen, Direktnachrichten.

## Einrichtung

### Schritt 1: Meta-App und Access Token (einmalig, ca. 15 Minuten)

1. Auf https://developers.facebook.com mit dem Facebook/Meta-Konto anmelden und
   über **Meine Apps → App erstellen** eine neue App anlegen. Beim Anwendungsfall
   **Instagram** wählen (Business-Typ).
2. In der App unter **Instagram → API-Setup mit Instagram-Anmeldung** das Konto
   **@astrofly_app** hinzufügen (Login mit den Instagram-Zugangsdaten). Das Konto
   muss ein Professional-Konto sein – ist es bereits (Insights sind sichtbar).
3. Dort einen **Access Token generieren**. Benötigte Berechtigungen:
   `instagram_business_basic`, `instagram_business_content_publish`,
   `instagram_business_manage_comments`, `instagram_business_manage_insights`.
4. Den Token kopieren – er ist 60 Tage gültig; der Worker erneuert ihn danach
   automatisch jede Woche (KV-Binding, siehe unten). **Den Token niemals in
   dieses Repository committen.**

### Schritt 2: Cloudflare Worker deployen (einmalig, ca. 10 Minuten)

Voraussetzung: kostenloses Konto auf https://dash.cloudflare.com, Node.js lokal.

```bash
cd tools/instagram-mcp
npm install                 # installiert nur wrangler (Deploy-Werkzeug)
npx wrangler login          # öffnet den Browser zum Cloudflare-Login

# KV-Namespace für die Token-Erneuerung anlegen und die ausgegebene ID
# in wrangler.jsonc bei "HIER_DIE_ID_EINTRAGEN" eintragen:
npx wrangler kv namespace create TOKENS

# Geheimnisse setzen (werden interaktiv abgefragt, landen nur bei Cloudflare):
npx wrangler secret put IG_ACCESS_TOKEN   # der Token aus Schritt 1
npx wrangler secret put SECRET_PATH       # frei erfundenes geheimes URL-Segment,
                                          # z. B. "mcp-k92hf03xnq" (ohne Slash)

npx wrangler deploy
```

Der Deploy gibt die Worker-URL aus, z. B.
`https://astrofly-instagram-mcp.<name>.workers.dev`. Die vollständige
Connector-URL ist diese Adresse **plus** das geheime Segment:
`https://astrofly-instagram-mcp.<name>.workers.dev/mcp-k92hf03xnq`

### Schritt 3: Mit claude.ai verbinden (einmalig, 2 Minuten)

Auf claude.ai unter **Einstellungen → Connectors → Custom Connector
hinzufügen** die vollständige Connector-URL eintragen. Danach stehen die
`ig_*`-Tools in den Sessions zur Verfügung (in Claude-Code-Sessions ggf. den
Connector für die Session aktivieren).

## Medien-URLs zum Veröffentlichen

Die Instagram-API lädt Bilder/Videos **von einer öffentlichen URL** – es gibt
keinen Direkt-Upload. Bewährter Weg für AstroFly:

- **Bilder (Slides):** in einen Ordner eines öffentlichen GitHub-Repos legen
  (z. B. `media/` in diesem Repo, falls öffentlich) – die
  `raw.githubusercontent.com`-URL funktioniert direkt. JPEG verwenden
  (PNG konvertiert Instagram notfalls selbst, JPEG ist zuverlässiger).
- **Videos (Reels):** am besten über GitHub Pages ausliefern (korrekter
  `video/mp4`-MIME-Type), z. B. über das AstroFly-Pages-Repo. MP4 (H.264+AAC),
  9:16, max. 100 MB.

## Sicherheit

- Der Zugriff ist nur über das geheime URL-Segment möglich (`SECRET_PATH`) –
  wer die URL nicht kennt, bekommt 404. Die URL daher wie ein Passwort
  behandeln; bei Verdacht einfach `wrangler secret put SECRET_PATH` mit neuem
  Wert ausführen und den Connector aktualisieren.
- Der Access Token liegt ausschließlich als Cloudflare-Secret bzw. im
  KV-Namespace und taucht in keiner Tool-Antwort auf.
- Zum Widerrufen: Token in der Meta-App ungültig machen oder die App unter
  Instagram → Einstellungen → Apps und Websites trennen.

## Tests

```bash
npm test
```

Simuliert die Graph-API vollständig (kein echter Instagram-Zugriff): Handshake,
alle Tool-Aufrufe, Veröffentlichungs-Flow, Fehlerpfade, Token-Vorrang aus KV
und Zugriffsschutz.
