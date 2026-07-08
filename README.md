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

## Run locally

Download the repository and open `index.html` in your browser – that's it,
no build step required.

## Usage

1. **Load images** – select a starless image and a star mask as TIFF, PNG or
   JPG, or drag & drop them (16-bit TIFF is supported).
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

   **Zoom target:** simply **click** the preview – the camera gently flies
   toward that point over the course of the clip. Double-click resets the
   target to the image center.
4. **Stars**
   | Control | Effect |
   |---|---|
   | Layer spread | How strongly the stars are randomly distributed across depth layers |
   | Distance to nebula | Base depth of the stars relative to the starless image (far ↔ near) |
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
   | Sharpness | Fine detail sharpening |
6. **Aspect ratio** – 1:1, 16:9, 21:9, 4:3 or 9:16 (portrait, e.g. for reels).
7. **Export** – choose a resolution and click **"Export video"**.
   The video is rendered and saved automatically as a file
   (MP4 in Chrome/Edge, otherwise WebM).

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
