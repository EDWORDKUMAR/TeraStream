# iTeraPlay Clone - Full Stack TeraBox Video Player & Downloader

A full-stack, reverse-engineered clone of [iTeraPlay.com](https://iteraplay.com/) that allows users to stream TeraBox videos online with adaptive HLS (`.m3u8`) playback and download files directly at maximum speed without installing the TeraBox application.

---

## 🔍 How iTeraPlay Works Under The Hood (Reverse Engineering Findings)

By analyzing `iteraplay.com`'s frontend JavaScript bundles and backend network traffic, here is the complete breakdown of how it works:

### 1. Frontend Architecture
* **Stack**: Next.js (App Router) + Tailwind CSS + ArtPlayer + Hls.js.
* **Core APIs**:
  * `POST /api/stream`: Extracts video stream URLs (M3U8 playlists) and metadata.
  * `POST /api/download`: Generates direct high-speed download links.
  * `GET /api/home/search`: Loads trending / recent videos encrypted with AES (`iteraplay_super_secret_enc_key_2026_v2`).
* **Player Implementation**:
  * Integrates **ArtPlayer** with **Hls.js** to handle `.m3u8` manifests.
  * **Adaptive Bitrate & Fallback**: Detects connection speed (`navigator.connection.downlink`) to select initial quality (1080p, 720p, 480p, 360p). If network stalls or errors occur on 1080p, the player automatically falls back down to lower qualities (480p/360p).
  * **Custom Subtitles**: Parses `.srt` and `.vtt` subtitle files directly in the browser and renders synced text layers over the video.

### 2. The Streaming & Bypass Mechanism
* **TeraBox API (`PanAPI`)**:
  * When a link (`https://terabox.com/s/1...` or `?surl=...`) is received, the backend extracts the `surl` identifier.
  * Queries TeraBox's internal API (`/share/list` or `/api/shorturlinfo`) to fetch file metadata (`name`, `fs_id`, `size`, `thumbs`).
  * Requests transcoding HLS manifests from TeraBox streaming endpoints (`/share/streaming?type=M3U8_AUTO_...`).
* **The Cloudflare Worker Proxy Layer**:
  * Raw TeraBox video segments (`.ts` chunks) cannot be played directly in browser players due to CORS, IP restrictions, and expired tokens.
  * iTeraPlay routes streams through Cloudflare Workers (`*.workers.dev`):
    * `/fast_stream?token=...m3u8` rewrites the M3U8 manifest.
    * Every `.ts` segment URL in the playlist is rewritten to route through the proxy `/segment?token=...`.
    * When the player requests segments, the proxy injects necessary headers (`User-Agent`, `Referer: https://terabox.com/`) and streams the binary video chunks to the player with `Access-Control-Allow-Origin: *`.

---

## 🚀 Features of This Clone

- 🎬 **Online Streaming with ArtPlayer & Hls.js**: Smooth playback with adaptive quality switching (1080p, 720p, 480p, 360p).
- ⚡ **Built-in M3U8 & Segment Proxy**: Built-in backend proxy that rewrites M3U8 playlists and streams `.ts` chunks with CORS bypass.
- 📥 **Fast Direct Downloads**: High-speed multi-threaded download links with HTTP 206 Partial Content Range support.
- 📁 **Multi-File & Folder Support**: When a share link contains multiple files or folders, displays a list with individual play and download options.
- 🎨 **Modern Glassmorphism UI**: Clean dark and light modes, responsive for mobile and desktop, glowing accents, and signature loading cat animation.
- 📜 **Playback History**: Keeps track of recently played videos with thumbnails and metadata.

---

## 🛠️ Project Structure

```
iteraplay/
├── server.js                # Express server, proxy handlers, and API endpoints
├── services/
│   └── teraboxService.js    # Link parsing, PanAPI resolver, M3U8 rewriter, and fallbacks
├── public/
│   ├── index.html           # Modern responsive single-page application
│   ├── css/
│   │   └── style.css        # Custom styles, dark/light themes, animations
│   └── js/
│       └── app.js           # Frontend logic, ArtPlayer + HLS initialization
├── package.json
└── README.md
```

---

## 📦 How To Run

1. **Install Dependencies** (if not already installed):
   ```bash
   npm install
   ```

2. **Start the Application**:
   ```bash
   npm start
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

4. Paste any public TeraBox link (e.g. `https://terabox.com/s/...` or `https://teraboxapp.com/s/...`) and click **Watch Video Online** or **Fast Download**!
