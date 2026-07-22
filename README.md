# 🌌 AstroFly – 3D camera flight through astrophotos

Turns a **starless image** and a **star mask** (e.g. from StarNet++,
StarXTerminator or PixInsight) into an animated 3D camera flight that makes
the viewer feel like they are traveling through space toward the nebula or
galaxy.

The app runs entirely in your browser – **no installation required**,
your images never leave your computer (all processing happens locally,
nothing is uploaded).

## ✨ Try it online

**https://michaeld1988.github.io/AstroFly/**

Example flights & updates: [@astrofly_app on Instagram](https://www.instagram.com/astrofly_app/)

Chrome or Edge recommended – they support the fastest, frame-perfect MP4
export. Safari exports MP4 via a compatibility mode (realtime recording);
Firefox exports WebM (not accepted by Instagram/TikTok).

**No images at hand?** Click **"✨ Try it with a demo image"** – it loads a
bundled Orion Nebula (starless + star mask, photographed by Michael Döhler)
so you can experience the 3D flight in seconds, even on your phone.

The layout is **mobile-friendly**: on narrow screens the preview sits on
top and the control panel scrolls below it. For serious work (16-bit TIFFs,
4K export) a desktop browser is still recommended.

The interface is available in **English and German** – switch with the
EN/DE toggle at the top left (your choice is remembered; the app follows
your browser language on first visit).

## Run locally

Download the repository and open `index.html` in your browser – that's it,
no build step required.

All panel sections are collapsible – click a heading to open or close it
(the state is remembered).

## Usage

1. **Load images** – select a starless image and a star mask as TIFF, PNG or
   JPG, or drag & drop them (16-bit TIFF is supported). Or click the
   **demo button** to load the bundled Orion Nebula example
   (`demo/`, © Michael Döhler).

   **Linear star masks are stretched automatically:** if your star mask
   comes straight from stacking (linear, not yet stretched in Siril or
   PixInsight), AstroFly applies an iterative, color-preserving asinh
   stretch – moderate strength per pass, stopping automatically once the
   histogram target is reached, so bright stars don't blow out and star
   colors stay exactly as they are (RGB is scaled proportionally to the
   luminance ratio). Already-stretched masks are detected by the same
   criterion and pass through nearly unchanged; you can also tick
   *"Star mask is already stretched"* to skip the stretch entirely, and the
   *stretch intensity* slider controls how far the stretch goes.

2. **Depth map** – computed automatically from the brightness of the starless
   image: bright nebula regions appear "closer" to the camera.
   *Smoothing* softens the map, *Invert depth* flips the effect.
3. **Camera & animation**
   | Control | Effect |
   |---|---|
   | Flight mode | **Toward the nebula** (classic zoom flight) or **lateral drift** – the camera glides across the image at constant zoom while near regions and stars pass by faster (parallax), like a slow sideways space flight |
   | Flight direction | Direction of the lateral drift (0–360°); a click on the preview sets the center of the path |
   | Zoom | Start framing (initial magnification) – in lateral mode, more zoom also allows a longer travel range |
   | Speed | How fast the camera flies into the image (lateral mode: how far it travels) |
   | Acceleration | Ease in & out, accelerate only, decelerate only, or linear (constant speed) – plus a strength slider |
   | 3D effect | Strength of the parallax (depth impression) |
   | Depth range | How much near and far regions differ in flight speed |
   | Rotation | Camera roll during the flight (°/s) |
   | Rotate framing | Static rotation of the crop (0–360°) |
   | Shift framing horizontal/vertical | Moves the visible crop within the image – e.g. when your object sits outside the default center crop; automatically clamped to the image edges, so no black borders can appear |
   | Tilt horizontal/vertical | Tilts the camera – near regions shift relative to far ones (tilt parallax) |
   | Camera sway | Animated tilt with adjustable direction (0–360°), tempo and a randomness slider (0 = clean directional rocking, 100 = organic wobble) |
   | Duration | Length of the video (5–60 s) |
   | Fade in/out | Black-to-image and image-to-black fade, adjustable 0–3 s (0 = off) |
   | Loop mode | Camera flies in and seamlessly back out – perfect for endless loops on social media |
   | Galaxy spin | Rotates only the region around a click-set spin center (radius, soft edge falloff) – with adjustable differential rotation (inner faster, like a real galaxy) and an ellipse option for inclined galaxies; foreground stars do not rotate. An optional brightness mask (independent of the parallax depth map, with its own smoothing) confines the spin to the bright galaxy structure. A red mask overlay (Photoshop-style, auto-shown while picking the center, never exported) visualizes exactly where and how strongly the spin acts |

   **Zoom target:** simply **click** the preview – the camera pans slowly
   toward that point over the whole flight while zooming in (following the
   chosen acceleration curve, seamless in loop mode). The click is
   depth-aware, so it lands exactly on the object you aimed at.
   Double-click resets the target to the image center.

   **Preview size:** the 🔍 slider below the preview scales the viewport
   (40–100 %); your choice is remembered.
4. **Stars**
   | Control | Effect |
   |---|---|
   | Layer spread | How strongly the stars are randomly distributed across depth layers |
   | Distance to nebula | Base depth of the stars relative to the starless image (far ↔ near) |
   | Depth layers (count) | Snap stars onto a set number of discrete depth layers (∞ = continuous random depths) |
   | Star parallax | How strongly the stars move relative to the nebula zoom (up to 600 %) |
   | Twinkle | Strength of the star twinkle |
   | Twinkle speed | Tempo of the twinkle (10–300 %) |
   | Size / Brightness / Saturation | Adjust the appearance of the stars (20–300 % / 0–300 % / 0–200 %) |
   | Generated stars | Adds up to 3000 synthetic stars with a realistic brightness distribution (many faint, few bright) and natural star colors – ideal for lateral flights or sparse star masks; also works without a star mask |
   | 🎲 Reshuffle layers | Rolls a new random distribution of the star layers (and of the generated stars) |
5. **Effects & look**
   **Presets:** Neutral (default, all off), Cinematic, Deep Space,
   Dreamy Glow, Monochrome and Hyperspace – each sets all look controls to
   a matched cinematic style; every control remains individually adjustable
   afterwards.
   | Control | Effect |
   |---|---|
   | Bloom | Glow around bright stars and nebula cores |
   | Motion blur | Radial/tangential blur along the flight motion – optionally on the stars only, keeping the nebula sharp |
   | Warp | Stars race past the camera with color fringing and streaks – hyperspace feeling |
   | Vignette | Cinematic edge darkening |
   | Exposure | Brighter/darker (±2 stops) |
   | Contrast | Global contrast |
   | Saturation | Color intensity of the whole image |
   | Clarity | Local contrast (negative = soft Orton glow) |
   | Structure | Fine-detail enhancement (multi-scale local contrast) – brings out more real detail at native resolution, no AI involved |
   | Sharpness | Fine detail sharpening |
6. **Aspect ratio** – 1:1, 16:9, 21:9, 4:3, 5:4 or 9:16 (portrait, e.g. for reels).
7. **Export** – choose a resolution and click **"Export video"**.
   The video is rendered and saved automatically as a file
   (MP4 in Chrome/Edge, otherwise WebM). The file name is derived from
   your starless image (with "starless" stripped) and can be overridden
   in the file-name field.
8. **Feedback** – found a bug or have an idea? Use the feedback buttons to
   open a pre-filled [GitHub issue](https://github.com/michaeld1988/AstroFly/issues)
   or an email draft. Technical details (browser, GPU) are included
   automatically; nothing is ever sent without your action.
   Example flights and updates are posted on
   [Instagram (@astrofly_app)](https://www.instagram.com/astrofly_app/).

## How the 3D effect works

- A **depth map** (smoothed, contrast-stretched luminance) is generated from
  the starless image. While zooming in, "near" regions scale
  disproportionately (`zoom^f(depth)`), which creates the parallax of the
  nebula.
- The **individual stars are detected** in the star mask (blob detection) and
  rendered as glowing particles, each with its own random depth. As a result,
  the stars pass the viewer at different speeds during the flight – like a
  real journey through a star field, including subtle twinkling.
- The effects run as a **GPU post-processing chain**: the scene is rendered
  into a framebuffer, bloom comes from a bright pass + Gaussian blur at
  quarter resolution, motion blur from multi-sampling along each pixel's
  motion vector (zoom radial, rotation tangential, camera travel).

## Tech

- Pure HTML/CSS/JavaScript, WebGL2 rendering, no build tools.
- TIFF decoding via [UTIF.js](https://github.com/photopea/UTIF.js)
  (`vendor/UTIF.js`, incl. `pako` for deflate-compressed TIFFs).
- Video export via WebCodecs (frame-by-frame offline rendering, guaranteed
  smooth 30 fps, muxed with `mp4-muxer`/`webm-muxer`) with MediaRecorder
  (`canvas.captureStream`) as fallback.
