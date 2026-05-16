# Zenith Player 🌌

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-blueviolet)
![License](https://img.shields.io/badge/license-MIT-orange)
![Version](https://img.shields.io/badge/version-2.1.0-green)

**Zenith** is a high-end, indie audio player built for those who value both sound quality and aesthetic "ricing". It combines modern glassmorphism with retro-futuristic themes and springy animations inspired by the Hyprland compositor.

---

## Key Features

- **Premium Themes**: Switch between **Zenith Ultra**, **Cosmic**, **Frutiger Aero**, **Terminal**, **Winamp**, and **MacGlass** with `Ctrl + T`.
- **FL Studio Playback Logic**: Features a smart marker system—when you stop, the playback position reverts to your last set marker.
- **Seamless Crossfade**: Smooth 1.5s transitions between tracks for a gapless listening experience.
- **Hyprland Animations**: Springy, elastic UI transitions using custom bezier curves for that "premium rice" feel.
- **Smart Album Art**: Automatic recursive searching for covers, folders, and front-art in your music directories.
- **Per-Track Memory**: Zenith remembers your Equalizer, Volume, and Speed settings for **every single track** individually.
- **Global Control**: Manage your music from anywhere with Global Media Keys (`Play`, `Next`, `Prev`) or `Alt + P`.
- **Dual-Mode Minimize**: 
    - **Left Click**: Minimize to taskbar.
    - **Right Click**: Hide to system tray.

---

## 🛠 Installation & Development

### 1. Requirements
- [Node.js](https://nodejs.org/) installed on your system.

### 2. Setup
```bash
# Clone the repository
git clone https://github.com/ewasion137/ZenithPlayer.git

# Install dependencies
npm install

# Run the app
npm start
```

### 3. Build (Release)
To create a production-ready installer for your current OS:
```bash
npm run build
```

---

## 🎮 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `Alt + P` | Global Play / Pause |
| `Alt + Right` | Next Track |
| `Alt + Left` | Previous Track |
| `Ctrl + T` | Switch Theme |
| `Ctrl + F` | Focus Search |

---

## 🐧 Linux Support
Zenith is fully compatible with **GNU/Linux**. It features cross-platform path handling and optimized file watching for non-recursive file systems. 


<img width="1920" height="1034" alt="image" src="https://github.com/user-attachments/assets/7c495769-59f3-4855-a7f9-16f3c22830a2" />
