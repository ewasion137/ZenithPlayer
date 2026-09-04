# ZENITH PLAYER

Desktop audio player built with Electron and the Web Audio API. Built for local libraries, raw audio streams, heavy EQ tweaking. Runs on Windows and GNU/Linux.

## What It Actually Does

### Real Audio Engine & DSP
- 7-band EQ with frequencies: 60Hz, 170Hz, 350Hz, 1kHz, 3.5kHz, 10kHz and 14kHz.
- Automatic per-track state memory. Volume, speed and custom EQ curves are stored individually for every single file.
- FL Studio style playback logic. Spacebar stops playback and returns cursor back to your last start marker.

### YouTube & Spotify Stream Resolution
- Paste raw YouTube links, Spotify track URLs or plain search queries directly into the search bar.
- Uses an automated yt-dlp binary. Extracts audio streams, thumbnails and track metadata without running a headless browser.

### Hardware & Performance Control
- Low-GFX mode switch. Shuts down background shaders, glass blurs, drop shadows and real-time spectrum canvas loops to drop GPU usage to 0% (NEARLY).

### System
- Global keyboard hooks (`Alt + P`, `Alt + Left` and `Alt + Right`) alongside hardware media keys.
- Discord Rich Presence integration with track name, artist, cover art and live timestamps.
- Left-click on minimize - minimizes to the OS taskbar. Right-click makes the player into the tray.
- Add tracks to your local folder and the library updates automatically.

### Theme Engine
Cycle interface presets with `Ctrl + T`:
- Ultra
- Cosmic
- Frutiger Aero
- Terminal
- Winamp
- MacGlass
- Kocmoc Unleashed (Reference...)

---

## Keybinds

| Shortcut | Scope | Action |
|---|---|---|
| `Alt + P` | Global | Play / Pause |
| `Alt + Right` | Global | Next track |
| `Alt + Left` | Global | Previous track |
| `Ctrl + T` | Local | Cycle theme |

---

## Installation & Build

### Requirements
- Node.js (v18+ recommended)
- npm

### Run
```bash
# Install packages
npm install

# Start player
npm start
```

### Build
```bash
npm run build
```

---

## Stack
- Electron
- Web Audio API (AudioBufferSourceNode, BiquadFilterNode and AnalyserNode)
- yt-dlp via `yt-dlp-wrap`
- music-metadata
- discord-rpc

---

### License - MIT