/**
 * ZENITH PLAYER — THEME EFFECTS & INTERACTIVE WIDGETS ENGINE (theme-fx.js)
 * High-performance engine with TRUE 0% GPU freeze on GFX: OFF / low-gfx mode.
 */

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
        // Создаем корневой слой эффектов
        this.container = document.createElement('div');
        this.container.id = 'theme-fx-layer';
        this.container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:90;overflow:hidden;';
        document.body.appendChild(this.container);

        // 1. Слушаем смену темы в <link id="theme-link">
        const themeLink = document.getElementById('theme-link');
        if (themeLink) {
            const themeObserver = new MutationObserver(() => this.detectTheme());
            themeObserver.observe(themeLink, { attributes: true, attributeFilter: ['href'] });
        }

        // 2. АВТО-ДЕТЕКЦИЯ РЕЖИМА LOW-GFX (GFX: OFF)
        const gfxObserver = new MutationObserver(() => {
            const isLowGfx = document.body.classList.contains('low-gfx');
            this.setEnabled(!isLowGfx);
        });
        gfxObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

        // 3. Засыпание при сворачивании окна (экономия батареи и GPU)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseLoops();
            } else if (this.enabled) {
                this.resumeLoops();
            }
        });

        // Проверяем начальное состояние
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
            // Мгновенный сброс: вырубаем всё
            this.pauseLoops();
            this.container.style.display = 'none';
            this.container.innerHTML = '';
        } else {
            // Включаем обратно
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

        if (!this.enabled) return; // При GFX: OFF ничего не инициализируем

        switch (themeName) {
            case 'frutigeraero.css':
                this.initFrutigerAero();
                break;
            case 'kocmocunleashed.css':
                this.initKocmocUnleashed();
                break;
            case 'aqua-osx.css':
                this.initAquaOSX();
                break;
            case 'hyprland.css':
                this.initHyprland();
                break;
            case 'dreamcore.css':
                this.initDreamcore();
                break;
            case 'fogcore.css':
                this.initFogcore();
                break;
            case 'lofi.css':
                this.initLofi();
                break;
            case 'bioluminescence.css':
                this.initBioluminescence();
                break;
            default:
                break;
        }
    }

    // =========================================================================
    // 1. FRUTIGER AERO
    // =========================================================================
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
        for (let i = 0; i < 26; i++) {
            bubbles.push({
                x: Math.random() * w,
                y: h + Math.random() * h,
                r: 10 + Math.random() * 26,
                vy: 0.6 + Math.random() * 1.4,
                wobble: Math.random() * Math.PI * 2,
                wobbleSpeed: 0.02 + Math.random() * 0.03
            });
        }

        let mouse = { x: -1000, y: -1000 };
        const onMouseMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
        const onClick = (e) => {
            for (let i = 0; i < bubbles.length; i++) {
                const b = bubbles[i];
                const dx = e.clientX - b.x;
                const dy = e.clientY - b.y;
                if (Math.sqrt(dx * dx + dy * dy) < b.r + 10) {
                    b.y = h + 20;
                    b.x = Math.random() * w;
                    break;
                }
            }
        };
        window.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('click', onClick);

        let animId;
        const loop = () => {
            if (!this.enabled) return;
            ctx.clearRect(0, 0, w, h);
            const bass = this.getBassEnergy();

            for (const b of bubbles) {
                b.y -= b.vy * (1 + bass * 1.8);
                b.wobble += b.wobbleSpeed;
                b.x += Math.sin(b.wobble) * 0.8;

                const dx = b.x - mouse.x;
                const dy = b.y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 80) {
                    const force = (80 - dist) / 80;
                    b.x += (dx / dist) * force * 5;
                    b.y += (dy / dist) * force * 5;
                }

                if (b.y + b.r < 0) {
                    b.y = h + b.r + Math.random() * 100;
                    b.x = Math.random() * w;
                }

                ctx.save();
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);

                const grad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
                grad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
                grad.addColorStop(0.4, 'rgba(0, 210, 255, 0.25)');
                grad.addColorStop(0.8, 'rgba(56, 239, 125, 0.2)');
                grad.addColorStop(1, 'rgba(0, 114, 255, 0.45)');
                ctx.fillStyle = grad;
                ctx.fill();

                ctx.lineWidth = 1.5;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
                ctx.stroke();

                ctx.beginPath();
                ctx.ellipse(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.35, b.r * 0.2, -Math.PI / 4, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.fill();
                ctx.restore();
            }
            animId = requestAnimationFrame(loop);
        };
        loop();

        this.cleanupFn = () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('click', onClick);
            canvas.remove();
        };
    }

    // =========================================================================
    // 2. KOCMOC UNLEASHED
    // =========================================================================
    initKocmocUnleashed() {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
        this.container.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;
        const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
        window.addEventListener('resize', resize);

        const getHoleCenter = () => {
            const cover = document.querySelector('.cover-wrapper');
            if (cover) {
                const rect = cover.getBoundingClientRect();
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            }
            return { x: w * 0.25, y: h * 0.25 };
        };

        const particles = [];
        for (let i = 0; i < 80; i++) {
            particles.push({
                angle: Math.random() * Math.PI * 2,
                dist: 60 + Math.random() * 320,
                speed: 0.015 + Math.random() * 0.03,
                size: 1 + Math.random() * 2.5
            });
        }

        let animId;
        const loop = () => {
            if (!this.enabled) return;
            ctx.clearRect(0, 0, w, h);
            const center = getHoleCenter();
            const bass = this.getBassEnergy();

            if (bass > 0.6) {
                ctx.beginPath();
                ctx.arc(center.x, center.y, 45 + bass * 55, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 255, 255, ${bass * 0.5})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            for (const p of particles) {
                p.angle += p.speed * (1 + bass * 2.5);
                p.dist -= 0.45 * (1 + bass);

                if (p.dist < 28) {
                    p.dist = 220 + Math.random() * 150;
                    p.angle = Math.random() * Math.PI * 2;
                }

                const px = center.x + Math.cos(p.angle) * p.dist;
                const py = center.y + Math.sin(p.angle) * (p.dist * 0.5);

                const alpha = Math.min(1, (p.dist - 28) / 80);
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fillRect(px, py, p.size, p.size);
            }
            animId = requestAnimationFrame(loop);
        };
        loop();

        this.cleanupFn = () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', resize);
            canvas.remove();
        };
    }

    // =========================================================================
    // 3. AQUA OS X
    // =========================================================================
    initAquaOSX() {
        const controls = document.getElementById('top-controls');
        if (!controls) return;

        const qtDisplay = document.createElement('div');
        qtDisplay.id = 'qt7-hud-display';
        qtDisplay.style.cssText = `
            display: flex; align-items: center; justify-content: space-between;
            background: #000; border: 1px solid #5a5d66; border-radius: 4px;
            padding: 3px 10px; margin-top: 6px; font-family: 'JetBrains Mono', monospace;
            font-size: 10px; color: #4da2ff; box-shadow: inset 0 1px 4px #000;
        `;
        qtDisplay.innerHTML = `
            <span>QT7 // PRO</span>
            <span id="qt7-level-bar" style="letter-spacing: 2px; color: #2779f5;">[■■■■■□□□□□]</span>
            <span id="qt7-fps">44.1 kHz • STEREO</span>
        `;
        controls.appendChild(qtDisplay);

        let animId;
        const levelBar = document.getElementById('qt7-level-bar');
        const loop = () => {
            if (!this.enabled) return;
            if (levelBar) {
                const bass = this.getBassEnergy();
                const total = 10;
                const filled = Math.min(total, Math.round(bass * 14));
                levelBar.textContent = '[' + '■'.repeat(filled) + '□'.repeat(total - filled) + ']';
                levelBar.style.color = filled > 7 ? '#ff3b30' : (filled > 4 ? '#ffd666' : '#2779f5');
            }
            animId = requestAnimationFrame(loop);
        };
        loop();

        this.cleanupFn = () => {
            cancelAnimationFrame(animId);
            if (qtDisplay.parentNode) qtDisplay.remove();
        };
    }

    // =========================================================================
    // 4. HYPRLAND
    // =========================================================================
    initHyprland() {
        const titleText = document.querySelector('.title-text');
        if (!titleText) return;

        const cavaSpan = document.createElement('span');
        cavaSpan.id = 'hypr-cava';
        cavaSpan.style.cssText = 'color: #cba6f7; margin-left: 14px; font-family: monospace; font-size: 12px;';
        titleText.appendChild(cavaSpan);

        const bars = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
        let animId;

        const loop = () => {
            if (!this.enabled) return;
            if (this.audioData.analyser && this.audioData.dataArray) {
                this.audioData.analyser.getByteFrequencyData(this.audioData.dataArray);
                let out = '';
                for (let i = 0; i < 12; i++) {
                    const idx = Math.floor(i * (this.audioData.analyser.frequencyBinCount / 16));
                    const val = (this.audioData.dataArray[idx] || 0) / 255;
                    const bIdx = Math.min(7, Math.floor(val * 8));
                    out += bars[bIdx];
                }
                cavaSpan.textContent = `| ${out} |`;
            } else {
                cavaSpan.textContent = '|            |';
            }
            animId = requestAnimationFrame(loop);
        };
        loop();

        this.cleanupFn = () => {
            cancelAnimationFrame(animId);
            cavaSpan.remove();
        };
    }

    // =========================================================================
    // 5. DREAMCORE
    // =========================================================================
    initDreamcore() {
        const eyeWrapper = document.createElement('div');
        eyeWrapper.style.cssText = `
            position: absolute; top: 12px; right: 28px; width: 64px; height: 32px;
            display: flex; gap: 8px; pointer-events: none; z-index: 1000;
        `;

        const createEye = () => {
            const eye = document.createElement('div');
            eye.style.cssText = `
                width: 26px; height: 26px; border-radius: 50%; background: #ffffff;
                border: 2px solid #ffd1dc; box-shadow: 0 0 10px #ffd1dc; position: relative;
                overflow: hidden; display: flex; align-items: center; justify-content: center;
            `;
            const pupil = document.createElement('div');
            pupil.style.cssText = `
                width: 10px; height: 10px; border-radius: 50%; background: #1a1622;
                box-shadow: 0 0 6px #ffd1dc; position: absolute;
            `;
            eye.appendChild(pupil);
            return { eye, pupil };
        };

        const eye1 = createEye();
        const eye2 = createEye();
        eyeWrapper.append(eye1.eye, eye2.eye);
        this.container.appendChild(eyeWrapper);

        const onMouseMove = (e) => {
            if (!this.enabled) return;
            [eye1, eye2].forEach(item => {
                const rect = item.eye.getBoundingClientRect();
                const ex = rect.left + rect.width / 2;
                const ey = rect.top + rect.height / 2;
                const angle = Math.atan2(e.clientY - ey, e.clientX - ex);
                item.pupil.style.transform = `translate(${Math.cos(angle) * 5}px, ${Math.sin(angle) * 5}px)`;
            });
        };
        window.addEventListener('mousemove', onMouseMove);

        let blinkInterval = setInterval(() => {
            if (!this.enabled) return;
            eye1.eye.style.transform = 'scaleY(0.1)';
            eye2.eye.style.transform = 'scaleY(0.1)';
            setTimeout(() => {
                eye1.eye.style.transform = 'scaleY(1)';
                eye2.eye.style.transform = 'scaleY(1)';
            }, 140);
        }, 4200);

        this.cleanupFn = () => {
            clearInterval(blinkInterval);
            window.removeEventListener('mousemove', onMouseMove);
            eyeWrapper.remove();
        };
    }

    // =========================================================================
    // 6. FOGCORE
    // =========================================================================
    initFogcore() {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: auto; z-index: 80; opacity: 0.88;
        `;
        this.container.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;
        const resize = () => {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
            fillFog();
        };

        const fillFog = () => {
            ctx.fillStyle = 'rgba(16, 22, 21, 0.9)';
            ctx.fillRect(0, 0, w, h);
        };
        fillFog();
        window.addEventListener('resize', resize);

        const wipe = (x, y) => {
            if (!this.enabled) return;
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            const grad = ctx.createRadialGradient(x, y, 10, x, y, 48);
            grad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, 48, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };

        const onMouseMove = (e) => wipe(e.clientX, e.clientY);
        canvas.addEventListener('mousemove', onMouseMove);

        let refogInterval = setInterval(() => {
            if (!this.enabled) return;
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = 'rgba(16, 22, 21, 0.025)';
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }, 120);

        this.cleanupFn = () => {
            clearInterval(refogInterval);
            window.removeEventListener('resize', resize);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.remove();
        };
    }

    // =========================================================================
    // 7. RAINY LO-FI
    // =========================================================================
    initLofi() {
        const cover = document.querySelector('.cover-wrapper');
        if (!cover) return;

        const tonearm = document.createElement('div');
        tonearm.id = 'lofi-tonearm';
        tonearm.style.cssText = `
            position: absolute; top: -6px; right: -8px; width: 44px; height: 75px;
            pointer-events: none; z-index: 25; transform-origin: 36px 8px;
            transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
            transform: rotate(-35deg);
        `;
        tonearm.innerHTML = `
            <svg width="44" height="75" viewBox="0 0 44 75" fill="none">
                <circle cx="36" cy="8" r="7" fill="#2d1d16" stroke="#c8963e" stroke-width="2"/>
                <circle cx="36" cy="8" r="3" fill="#ffaa40"/>
                <path d="M36 8 L18 52 L12 68" stroke="#c8963e" stroke-width="2.5" stroke-linecap="round"/>
                <rect x="8" y="66" width="8" height="6" rx="1" fill="#451a03" stroke="#ffaa40"/>
            </svg>
        `;
        cover.style.position = 'relative';
        cover.appendChild(tonearm);

        const setArmState = (playing) => {
            tonearm.style.transform = playing ? 'rotate(5deg)' : 'rotate(-35deg)';
        };
        setArmState(this.audioData.isPlaying);
        this.onPlaybackChange = setArmState;

        this.cleanupFn = () => {
            tonearm.remove();
        };
    }

    // =========================================================================
    // 8. BIOLUMINESCENCE
    // =========================================================================
    initBioluminescence() {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
        this.container.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;
        const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
        window.addEventListener('resize', resize);

        const jellies = [
            { x: w * 0.15, y: h * 0.7, r: 24, vy: 0.5, phase: 0 },
            { x: w * 0.82, y: h * 0.5, r: 34, vy: 0.35, phase: 2 }
        ];

        let animId;
        const loop = () => {
            if (!this.enabled) return;
            ctx.clearRect(0, 0, w, h);
            const bass = this.getBassEnergy();

            for (const j of jellies) {
                j.phase += 0.03 + bass * 0.05;
                j.y -= j.vy * (1 + bass * 2);
                if (j.y + j.r * 2 < 0) j.y = h + 100;

                const squish = Math.sin(j.phase) * 0.2;

                ctx.save();
                ctx.translate(j.x, j.y);
                ctx.scale(1 + squish, 1 - squish);

                ctx.beginPath();
                ctx.arc(0, 0, j.r, Math.PI, 0, false);
                ctx.quadraticCurveTo(0, j.r * 0.4, -j.r, 0);

                const grad = ctx.createRadialGradient(0, -j.r * 0.3, 2, 0, 0, j.r);
                grad.addColorStop(0, 'rgba(0, 240, 255, 0.75)');
                grad.addColorStop(0.6, 'rgba(139, 92, 246, 0.35)');
                grad.addColorStop(1, 'rgba(0, 240, 255, 0.05)');
                ctx.fillStyle = grad;
                ctx.fill();

                ctx.strokeStyle = `rgba(0, 240, 255, ${0.4 + bass * 0.5})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                for (let t = -2; t <= 2; t++) {
                    ctx.beginPath();
                    const tx = (t / 2.5) * (j.r * 0.7);
                    ctx.moveTo(tx, 0);
                    ctx.quadraticCurveTo(
                        tx + Math.sin(j.phase + t) * 8, 
                        j.r * 0.8, 
                        tx + Math.sin(j.phase + t * 0.5) * 12, 
                        j.r * 1.6
                    );
                    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }

                ctx.restore();
            }
            animId = requestAnimationFrame(loop);
        };
        loop();

        this.cleanupFn = () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', resize);
            canvas.remove();
        };
    }
}

window.ThemeFX = new ThemeFXEngine();