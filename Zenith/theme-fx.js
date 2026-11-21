// --- theme-fx.js ---
class ThemeFXEngine {
    constructor() {
        this.currentTheme = null;
        this.cleanupFn = null;
        this.enabled = true;
        this.audioData = {
            analyser: null,
            freqBuffer: null,
            timeBuffer: null,
            isPlaying: false,
        };
        this.container = null;
        this.onPlaybackChange = null;
        this.init();
    }

    init() {
        this.container = document.createElement("div");
        this.container.id = "theme-fx-layer";
        this.container.style.cssText =
            "position:fixed;inset:0;pointer-events:none;z-index:5;overflow:hidden;";
        document.body.appendChild(this.container);

        const themeLink = document.getElementById("theme-link");
        if (themeLink) {
            const themeObserver = new MutationObserver(() =>
                this.detectTheme(),
            );
            themeObserver.observe(themeLink, {
                attributes: true,
                attributeFilter: ["href"],
            });
        }

        const gfxObserver = new MutationObserver(() => {
            const isLowGfx = document.body.classList.contains("low-gfx");
            this.setEnabled(!isLowGfx);
        });
        gfxObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ["class"],
        });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                this.pauseLoops();
            } else if (this.enabled) {
                this.resumeLoops();
            }
        });

        if (document.body.classList.contains("low-gfx")) {
            this.enabled = false;
            this.container.style.display = "none";
        }

        setTimeout(() => this.detectTheme(), 100);
    }

    setEnabled(enabled) {
        if (this.enabled === enabled) return;
        this.enabled = enabled;

        if (!this.enabled) {
            this.pauseLoops();
            this.container.style.display = "none";
            this.container.innerHTML = "";
        } else {
            this.container.style.display = "block";
            this.resumeLoops();
        }
    }

    pauseLoops() {
        if (this.cleanupFn) {
            this.cleanupFn();
            this.cleanupFn = null;
        }
        this.onPlaybackChange = null;
    }

    resumeLoops() {
        if (this.currentTheme) {
            const theme = this.currentTheme;
            this.currentTheme = null;
            this.applyThemeFX(theme);
        }
    }

    setAudioContext(analyser) {
        this.audioData.analyser = analyser;
        if (analyser) {
            this.audioData.freqBuffer = new Uint8Array(
                analyser.frequencyBinCount,
            );
            this.audioData.timeBuffer = new Uint8Array(
                analyser.frequencyBinCount,
            );
        }
    }

    setPlayingState(isPlaying) {
        this.audioData.isPlaying = isPlaying;
        if (this.enabled && this.onPlaybackChange) {
            this.onPlaybackChange(isPlaying);
        }
    }

    getBassEnergy() {
        if (
            !this.enabled ||
            !this.audioData.analyser ||
            !this.audioData.freqBuffer
        ) {
            return 0;
        }
        this.audioData.analyser.getByteFrequencyData(this.audioData.freqBuffer);
        let sum = 0;
        for (let i = 0; i < 8; i++) sum += this.audioData.freqBuffer[i];
        return sum / 8 / 255;
    }

    detectTheme() {
        const themeLink = document.getElementById("theme-link");
        const rawHref = themeLink ? themeLink.getAttribute("href") : "";
        let themeName = "main.css";
        if (rawHref) {
            const parts = rawHref.split("/");
            themeName = parts[parts.length - 1] || "main.css";
        }
        this.applyThemeFX(themeName);
    }

    applyThemeFX(themeName) {
        if (this.currentTheme === themeName && this.cleanupFn) return;
        this.currentTheme = themeName;

        this.pauseLoops();
        this.container.innerHTML = "";

        if (!this.enabled) return;

        switch (themeName) {
            case "frutigeraero.css":
                this.initFrutigerAero();
                break;
            case "y2k-futurism.css":
                this.initY2KOscilloscope();
                break;
            case "lofi.css":
                this.initLofiTonearm();
                break;
            default:
                break;
        }
    }

    initFrutigerAero() {
        const canvas = document.createElement("canvas");
        canvas.style.cssText =
            "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
        this.container.appendChild(canvas);
        const ctx = canvas.getContext("2d");

        const sprite = document.createElement("canvas");
        sprite.width = 64;
        sprite.height = 64;
        const sCtx = sprite.getContext("2d");
        const grad = sCtx.createRadialGradient(22, 20, 2, 32, 32, 30);
        grad.addColorStop(0, "rgba(255, 255, 255, 0.72)");
        grad.addColorStop(0.35, "rgba(120, 235, 255, 0.25)");
        grad.addColorStop(0.85, "rgba(0, 190, 255, 0.14)");
        grad.addColorStop(1, "rgba(56, 239, 125, 0.22)");
        sCtx.beginPath();
        sCtx.arc(32, 32, 29, 0, Math.PI * 2);
        sCtx.fillStyle = grad;
        sCtx.fill();
        sCtx.lineWidth = 1.25;
        sCtx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        sCtx.stroke();

        sCtx.beginPath();
        sCtx.ellipse(23, 19, 8, 4, -0.55, 0, Math.PI * 2);
        sCtx.fillStyle = "rgba(255, 255, 255, 0.65)";
        sCtx.fill();

        let w = (canvas.width = window.innerWidth);
        let h = (canvas.height = window.innerHeight);
        const resize = () => {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
        };
        window.addEventListener("resize", resize);

        const bubbles = [];
        for (let i = 0; i < 14; i++) {
            bubbles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                r: 10 + Math.random() * 18,
                vy: 0.45 + Math.random() * 0.85,
                wobble: Math.random() * Math.PI * 2,
                wobbleSpeed: 0.015 + Math.random() * 0.015,
            });
        }

        let animId = null;
        let lastTime = 0;
        const loop = (now) => {
            if (!this.enabled) {
                animId = null;
                return;
            }
            animId = requestAnimationFrame(loop);
            if (document.hidden) return;

            const interval = Math.max(window.__zenithFrameInterval || 20, 32);
            if (now - lastTime < interval) return;
            lastTime = now;

            ctx.clearRect(0, 0, w, h);
            const bass = this.audioData.isPlaying ? this.getBassEnergy() : 0;

            for (const b of bubbles) {
                b.y -= b.vy * (1 + bass * 1.4);
                b.wobble += b.wobbleSpeed;
                b.x += Math.sin(b.wobble) * 0.45;

                if (b.y + b.r < 0) {
                    b.y = h + b.r + Math.random() * 40;
                    b.x = Math.random() * w;
                }

                const size = b.r * 2;
                ctx.globalAlpha = 0.5;
                ctx.drawImage(sprite, b.x - b.r, b.y - b.r, size, size);
            }
            ctx.globalAlpha = 1;
        };
        animId = requestAnimationFrame(loop);

        this.cleanupFn = () => {
            if (animId) cancelAnimationFrame(animId);
            animId = null;
            window.removeEventListener("resize", resize);
            canvas.remove();
        };
    }

    initY2KOscilloscope() {
        const stage = document.querySelector(".player-stage");
        if (!stage) return;

        const canvas = document.createElement("canvas");
        canvas.style.cssText =
            "position:fixed;pointer-events:none;z-index:1;opacity:0.28;";
        this.container.appendChild(canvas);
        const ctx = canvas.getContext("2d");

        let rect = stage.getBoundingClientRect();
        const syncRect = () => {
            rect = stage.getBoundingClientRect();
            canvas.style.left = `${rect.left}px`;
            canvas.style.top = `${rect.top}px`;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            canvas.width = Math.max(1, Math.floor(rect.width * 0.5));
            canvas.height = Math.max(1, Math.floor(rect.height * 0.5));
        };
        syncRect();

        const observer = new ResizeObserver(syncRect);
        observer.observe(stage);
        window.addEventListener("resize", syncRect);

        let animId = null;
        let lastTime = 0;

        const loop = (now) => {
            if (!this.enabled || !this.audioData.isPlaying) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                animId = null;
                return;
            }
            animId = requestAnimationFrame(loop);
            if (document.hidden) return;

            const interval = window.__zenithFrameInterval || 20;
            if (now - lastTime < interval) return;
            lastTime = now;

            if (!this.audioData.analyser || !this.audioData.timeBuffer) return;
            this.audioData.analyser.getByteTimeDomainData(
                this.audioData.timeBuffer,
            );

            const w = canvas.width;
            const h = canvas.height;
            const midY = h * 0.5;
            const buf = this.audioData.timeBuffer;
            const stepX = w / (buf.length - 1);

            ctx.clearRect(0, 0, w, h);
            ctx.beginPath();
            for (let i = 0; i < buf.length; i++) {
                const v = (buf[i] - 128) / 128;
                const y = midY + v * (h * 0.24);
                const x = i * stepX;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = "#00f0ff";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        };

        this.onPlaybackChange = (playing) => {
            if (playing && !animId && this.enabled) {
                lastTime = 0;
                animId = requestAnimationFrame(loop);
            }
        };

        if (this.audioData.isPlaying) {
            animId = requestAnimationFrame(loop);
        }

        this.cleanupFn = () => {
            if (animId) cancelAnimationFrame(animId);
            animId = null;
            observer.disconnect();
            window.removeEventListener("resize", syncRect);
            canvas.remove();
        };
    }

    initLofiTonearm() {
        const cover = document.querySelector(".cover-wrapper");
        if (!cover) return;

        const tonearm = document.createElement("div");
        tonearm.id = "lofi-tonearm";
        tonearm.style.cssText = `
            position: absolute;
            top: -10px;
            right: -22px;
            width: 64px;
            height: 132px;
            pointer-events: none;
            z-index: 25;
            transform-origin: 48px 16px;
            transition: transform 0.55s cubic-bezier(0.25, 0.9, 0.3, 1);
            transform: rotate(-28deg);
        `;
        tonearm.innerHTML = `
            <svg width="64" height="132" viewBox="0 0 64 132" fill="none">
                <circle cx="48" cy="16" r="12" fill="#1f1610" stroke="#d99b43" stroke-width="2"/>
                <circle cx="48" cy="16" r="4" fill="#d99b43"/>
                <path d="M48 16 L40 84 L20 112" stroke="#d99b43" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                <rect x="10" y="108" width="14" height="10" rx="2" transform="rotate(-35 17 113)" fill="#2a1b12" stroke="#f59e0b" stroke-width="1.5"/>
            </svg>
        `;
        cover.appendChild(tonearm);

        const setArmState = (playing) => {
            tonearm.style.transform = playing
                ? "rotate(6deg)"
                : "rotate(-28deg)";
        };
        setArmState(this.audioData.isPlaying);
        this.onPlaybackChange = setArmState;

        this.cleanupFn = () => {
            tonearm.remove();
        };
    }
}

window.ThemeFX = new ThemeFXEngine();
