class ThemeFXEngine {
    constructor() {
        this.currentTheme = null;
        this.cleanupFn = null;
        this.enabled = true;
        this.audioData = {
            analyser: null,
            dataArray: null,
            isPlaying: false
        };
        this.container = null;
        this.init();
    }

    init() {
        this.container = document.createElement('div');
        this.container.id = 'theme-fx-layer';
        this.container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:90;overflow:hidden;';
        document.body.appendChild(this.container);

        const themeLink = document.getElementById('theme-link');
        if (themeLink) {
            const themeObserver = new MutationObserver(() => this.detectTheme());
            themeObserver.observe(themeLink, { attributes: true, attributeFilter: ['href'] });
        }

        const gfxObserver = new MutationObserver(() => {
            const isLowGfx = document.body.classList.contains('low-gfx');
            this.setEnabled(!isLowGfx);
        });
        gfxObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseLoops();
            } else if (this.enabled) {
                this.resumeLoops();
            }
        });

        if (document.body.classList.contains('low-gfx')) {
            this.enabled = false;
            this.container.style.display = 'none';
        }

        setTimeout(() => this.detectTheme(), 100);
    }

    setEnabled(enabled) {
        if (this.enabled === enabled) return;
        this.enabled = enabled;

        if (!this.enabled) {
            this.pauseLoops();
            this.container.style.display = 'none';
            this.container.innerHTML = '';
        } else {
            this.container.style.display = 'block';
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

    setAudioContext(analyser, dataArray) {
        this.audioData.analyser = analyser;
        this.audioData.dataArray = dataArray;
    }

    setPlayingState(isPlaying) {
        this.audioData.isPlaying = isPlaying;
        if (this.enabled && this.onPlaybackChange) {
            this.onPlaybackChange(isPlaying);
        }
    }

    getBassEnergy() {
        if (!this.enabled || !this.audioData.analyser || !this.audioData.dataArray) return 0;
        this.audioData.analyser.getByteFrequencyData(this.audioData.dataArray);
        let sum = 0;
        for (let i = 0; i < 8; i++) sum += this.audioData.dataArray[i];
        return (sum / 8) / 255;
    }

    detectTheme() {
        const themeLink = document.getElementById('theme-link');
        let themeName = 'main.css';
        if (themeLink && themeLink.href) {
            const parts = themeLink.href.split('/');
            themeName = parts[parts.length - 1] || 'main.css';
        }
        this.applyThemeFX(themeName);
    }

    applyThemeFX(themeName) {
        if (this.currentTheme === themeName && this.cleanupFn) return;
        this.currentTheme = themeName;

        this.pauseLoops();
        this.container.innerHTML = '';

        if (!this.enabled) return;

        switch (themeName) {
            case 'frutigeraero.css':
                this.initFrutigerAero();
                break;
            case 'y2k-futurism.css':
                this.initY2K();
                break;
            case 'dreamcore.css':
                this.initDreamcore();
                break;
            case 'lofi.css':
                this.initLofi();
                break;
            case 'kinetic.css':
                this.initKinetic();
                break;
            default:
                break;
        }
    }

    initFrutigerAero() {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:auto;cursor:default;';
        this.container.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;
        const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
        window.addEventListener('resize', resize);

        const bubbles = [];
        for (let i = 0; i < 16; i++) {
            bubbles.push({
                x: Math.random() * w,
                y: h + Math.random() * h,
                r: 8 + Math.random() * 16,
                vy: 0.7 + Math.random() * 1.2,
                wobble: Math.random() * Math.PI * 2,
                wobbleSpeed: 0.02 + Math.random() * 0.02
            });
        }

        let mouse = { x: -1000, y: -1000 };
        const onMouseMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
        window.addEventListener('mousemove', onMouseMove);

        let animId;
        const loop = () => {
            if (!this.enabled) return;
            ctx.clearRect(0, 0, w, h);
            const bass = this.getBassEnergy();

            for (const b of bubbles) {
                b.y -= b.vy * (1 + bass * 1.5);
                b.wobble += b.wobbleSpeed;
                b.x += Math.sin(b.wobble) * 0.6;

                if (b.y + b.r < 0) {
                    b.y = h + b.r + Math.random() * 50;
                    b.x = Math.random() * w;
                }

                ctx.save();
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);

                const grad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
                grad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
                grad.addColorStop(0.5, 'rgba(0, 210, 255, 0.2)');
                grad.addColorStop(1, 'rgba(56, 239, 125, 0.3)');
                ctx.fillStyle = grad;
                ctx.fill();

                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.stroke();
                ctx.restore();
            }
            animId = requestAnimationFrame(loop);
        };
        loop();

        this.cleanupFn = () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', onMouseMove);
            canvas.remove();
        };
    }

    initY2K() {
        const cover = document.querySelector('.cover-wrapper');
        if (!cover) return;

        let animId;
        let angle = 0;
        const loop = () => {
            if (!this.enabled) return;
            if (this.audioData.isPlaying) {
                const bass = this.getBassEnergy();
                angle = (angle + 1.2 + bass * 3) % 360;
                cover.style.transform = `rotate(${angle}deg)`;
            }
            animId = requestAnimationFrame(loop);
        };
        loop();

        this.cleanupFn = () => {
            cancelAnimationFrame(animId);
            if (cover) cover.style.transform = 'none';
        };
    }

    // Kinetic Centered Monochrome Engine
    initKinetic() {
        const coverWrapper = document.querySelector('.cover-wrapper');
        const island = document.querySelector('.now-playing-container');
        const playBtn = document.getElementById('play-pause-btn');

        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:95;';
        this.container.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;
        const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
        window.addEventListener('resize', resize);

        const ripples = [];
        const onPointerDown = (e) => {
            if (!this.enabled) return;
            ripples.push({
                x: e.clientX,
                y: e.clientY,
                r: 4,
                maxR: 90,
                alpha: 0.25
            });
        };
        window.addEventListener('pointerdown', onPointerDown);

        let currentScale = 1;
        let animId;

        const loop = () => {
            if (!this.enabled) return;
            ctx.clearRect(0, 0, w, h);

            const bass = this.getBassEnergy();
            const targetScale = this.audioData.isPlaying ? 1 + bass * 0.045 : 1;
            currentScale += (targetScale - currentScale) * 0.14;

            if (coverWrapper) {
                coverWrapper.style.transform = `scale(${currentScale.toFixed(4)})`;
            }

            if (island && this.audioData.isPlaying) {
                const islandScale = 1 + (currentScale - 1) * 0.25;
                island.style.transform = `scale(${islandScale.toFixed(4)})`;
            } else if (island) {
                island.style.transform = 'scale(1)';
            }

            if (playBtn && this.audioData.isPlaying) {
                const btnScale = 1 + (currentScale - 1) * 0.8;
                playBtn.style.transform = `scale(${btnScale.toFixed(4)})`;
            }

            for (let i = ripples.length - 1; i >= 0; i--) {
                const r = ripples[i];
                r.r += (r.maxR - r.r) * 0.12;
                r.alpha *= 0.9;

                ctx.beginPath();
                ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 255, 255, ${r.alpha})`;
                ctx.lineWidth = 1;
                ctx.stroke();

                if (r.alpha < 0.005) ripples.splice(i, 1);
            }

            animId = requestAnimationFrame(loop);
        };
        loop();

        this.cleanupFn = () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', resize);
            window.removeEventListener('pointerdown', onPointerDown);
            canvas.remove();
            if (coverWrapper) coverWrapper.style.transform = 'none';
            if (island) island.style.transform = 'none';
            if (playBtn) playBtn.style.transform = 'none';
        };
    }

    initDreamcore() {
        const eyeWrapper = document.createElement('div');
        eyeWrapper.style.cssText = 'position:fixed;top:10px;right:24px;width:30px;height:30px;pointer-events:none;z-index:100;';

        const eye = document.createElement('div');
        eye.style.cssText = 'width:24px;height:24px;border-radius:50%;background:#ffffff;border:1.5px solid #ffd1dc;box-shadow:0 0 8px #ffd1dc;position:relative;overflow:hidden;';

        const pupil = document.createElement('div');
        pupil.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#140e1c;position:absolute;top:7px;left:7px;';

        eye.appendChild(pupil);
        eyeWrapper.appendChild(eye);
        this.container.appendChild(eyeWrapper);

        const onMouseMove = (e) => {
            if (!this.enabled) return;
            const rect = eye.getBoundingClientRect();
            const ex = rect.left + rect.width / 2;
            const ey = rect.top + rect.height / 2;
            const angle = Math.atan2(e.clientY - ey, e.clientX - ex);
            pupil.style.transform = `translate(${Math.cos(angle) * 4}px, ${Math.sin(angle) * 4}px)`;
        };
        window.addEventListener('mousemove', onMouseMove);

        this.cleanupFn = () => {
            window.removeEventListener('mousemove', onMouseMove);
            eyeWrapper.remove();
        };
    }

    initLofi() {
        const cover = document.querySelector('.cover-wrapper');
        if (!cover) return;

        const tonearm = document.createElement('div');
        tonearm.id = 'lofi-tonearm';
        tonearm.style.cssText = `
            position: absolute; top: -4px; right: -6px; width: 36px; height: 64px;
            pointer-events: none; z-index: 25; transform-origin: 28px 6px;
            transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
            transform: rotate(-35deg);
        `;
        tonearm.innerHTML = `
            <svg width="36" height="64" viewBox="0 0 36 64" fill="none">
                <circle cx="28" cy="6" r="5" fill="#201510" stroke="#c8963e" stroke-width="1.5"/>
                <path d="M28 6 L14 44 L10 58" stroke="#c8963e" stroke-width="2" stroke-linecap="round"/>
                <rect x="6" y="56" width="7" height="5" rx="1" fill="#451a03" stroke="#ffaa40"/>
            </svg>
        `;
        cover.style.position = 'relative';
        cover.appendChild(tonearm);

        const setArmState = (playing) => {
            tonearm.style.transform = playing ? 'rotate(4deg)' : 'rotate(-35deg)';
        };
        setArmState(this.audioData.isPlaying);
        this.onPlaybackChange = setArmState;

        this.cleanupFn = () => {
            tonearm.remove();
        };
    }
}

window.ThemeFX = new ThemeFXEngine();