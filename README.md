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

Chrome or Edge recommended – they also support MP4 export; Firefox exports WebM.

The interface is available in **English and German** – switch with the
EN/DE toggle at the top left (your choice is remembered; the app follows
your browser language on first visit).

## Run locally

Download the repository and open `index.html` in your browser – that's it,
no build step required.

## Usage

1. **Load images** – select a starless image and a star mask as TIFF, PNG or
   JPG, or drag & drop them (16-bit TIFF is supported).

   **Linear star masks are stretched automatically:** if your star mask
   comes straight from stacking (linear, not yet stretched in Siril or
   PixInsight), AstroFly applies an iterative, color-preserving asinh
   stretch – moderate strength per pass, stopping automatically once the
   histogram target is reached, so bright stars don't blow out and star
   colors stay exactly as they are (RGB is scaled proportionally to the
   luminance ratio). Already-stretched masks are detected by the same
   criterion and pass through nearly unchanged; you can also tick
   *"Star mask is already stretched"* to skip the stretch entirely.

   **✨ AI upscaler (3×, optional):** enhances real detail in the starless
   image before the flight – great for smaller images that would look soft
   at deep zoom. It uses a small, **non-generative** super-resolution
   network (deterministic sub-pixel CNN): it only reconstructs detail that
   is actually in the image and never invents content, so your astrophoto
   stays authentic. Runs GPU-accelerated via WebGPU where available –
   fast on modern graphics cards such as **Nvidia RTX 2000 or newer**
   (the app shows whether GPU acceleration is active); without a capable
   GPU it falls back to a much slower CPU mode. Requires the online
   version (or a local web server).
2. **Depth map** – computed automatically from the brightness of the starless
   image: bright nebula regions appear "closer" to the camera.
   *Smoothing* softens the map, *Invert depth* flips the effect.
3. **Camera & animation**
   | Control | Effect |
   |---|---|
   | Zoom | Start framing (initial magnification) |
   | Speed | How fast the camera flies into the image |
   | Ease in & out | Smooth acceleration and deceleration of the flight |
   | 3D effect | Strength of the parallax (depth impression) |
   | Depth range | How much near and far regions differ in flight speed |
   | Rotation | Camera roll during the flight (°/s) |
   | Rotate framing | Static rotation of the crop (0–360°) |
   | Tilt horizontal/vertical | Tilts the camera – near regions shift relative to far ones (tilt parallax) |
   | Camera sway | Animated tilt: slow, elliptical camera movement (amount + tempo) |
   | Duration | Length of the video (5–60 s) |
   | Loop mode | Camera flies in and seamlessly back out – perfect for endless loops on social media |

   **Zoom target:** simply **click** the preview – the camera centers that
   point during the first part of the flight and then zooms (and rotates)
   right into it. The click is depth-aware, so it lands exactly on the
   object you aimed at. Double-click resets the target to the image center.

   **Preview size:** the 🔍 slider below the preview scales the viewport
   (40–100 %); your choice is remembered.
4. **Stars**
   | Control | Effect |
   |---|---|
   | Layer spread | How strongly the stars are randomly distributed across depth layers |
   | Distance to nebula | Base depth of the stars relative to the starless image (far ↔ near) |
   | Depth layers (count) | Snap stars onto a set number of discrete depth layers (∞ = continuous random depths) |
   | Star parallax | How strongly the stars move relative to the nebula zoom (up to 300 %) |
   | Twinkle | Strength of the star twinkle |
   | Size / Brightness / Saturation | Adjust the appearance of the stars (20–300 % / 0–300 % / 0–200 %) |
   | 🎲 Reshuffle layers | Rolls a new random distribution of the star layers |
5. **Effects & look**
   **Presets:** Cinematic, Deep Space, Dreamy Glow, Monochrome, Hyperspace
   and Neutral – each sets all look controls to a matched cinematic style;
   every control remains individually adjustable afterwards.
   | Control | Effect |
   |---|---|
   | Bloom | Glow around bright stars and nebula cores |
   | Motion blur | Radial/tangential blur along the flight motion |
   | Warp | Stars race past the camera with color fringing and streaks – hyperspace feeling |
   | Vignette | Cinematic edge darkening |
   | Exposure | Brighter/darker (±2 stops) |
   | Contrast | Global contrast |
   | Saturation | Color intensity of the whole image |
   | Clarity | Local contrast (negative = soft Orton glow) |
   | Structure | Fine-detail enhancement (multi-scale local contrast) – brings out more real detail at native resolution, no AI involved |
   | Sharpness | Fine detail sharpening |
6. **Aspect ratio** – 1:1, 16:9, 21:9, 4:3 or 9:16 (portrait, e.g. for reels).
7. **Export** – choose a resolution and click **"Export video"**.
   The video is rendered and saved automatically as a file
   (MP4 in Chrome/Edge, otherwise WebM).
8. **Feedback** – found a bug or have an idea? Use the feedback buttons to
   open a pre-filled [GitHub issue](https://github.com/michaeld1988/AstroFly/issues)
   or an email draft. Technical details (browser, GPU) are included
   automatically; nothing is ever sent without your action.

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
- AI upscaler via [ONNX Runtime Web](https://onnxruntime.ai/) (loaded lazily
  on first use; WebGPU with WASM fallback) and the sub-pixel CNN
  super-resolution model from the ONNX model zoo, processed in overlapping
  224×224 tiles on the luminance channel.
