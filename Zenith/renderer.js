// --- renderer.js ---
document.addEventListener("DOMContentLoaded", () => {
    const audioContext = new AudioContext({ latencyHint: "playback" });
    const isAndroid = !!window.__ZENITH_ANDROID__;
    const ZenithAudio = window.__ZENITH_PLUGIN__ || null;
    let androidCurrentTime = 0;
    let androidDuration = 0;
    let androidQueueLoaded = false;
    let isPollingAndroid = false;
    const masterGain = audioContext.createGain();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    if (window.ThemeFX) window.ThemeFX.setAudioContext(analyser, dataArray);

    const eqFrequencies = [60, 170, 350, 1000, 3500, 10000, 14000];
    const eqFilters = eqFrequencies.map((freq) => {
        const filter = audioContext.createBiquadFilter();
        filter.type = "peaking";
        filter.frequency.value = freq;
        filter.Q.value = 1.41;
        filter.gain.value = 0;
        return filter;
    });

    const inputBus = audioContext.createGain();
    const distPreGain = audioContext.createGain();
    const distortionNode = audioContext.createWaveShaper();
    const distortionGain = audioContext.createGain();

    const streamAudioEl = new Audio();
    streamAudioEl.crossOrigin = "anonymous";
    const streamSourceNode =
        audioContext.createMediaElementSource(streamAudioEl);
    streamSourceNode.connect(inputBus);

    function makeHardClipCurve() {
        const samples = 4096;
        const curve = new Float32Array(samples);
        const ceiling = 0.85;
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = Math.max(-ceiling, Math.min(ceiling, x * 1.5));
        }
        return curve;
    }

    eqFilters
        .reduce((prev, curr) => (prev.connect(curr), curr), inputBus)
        .connect(distPreGain)
        .connect(distortionNode)
        .connect(distortionGain)
        .connect(masterGain)
        .connect(analyser)
        .connect(audioContext.destination);

    const DEFAULT_PREFS = {
        showEq: true,
        showWave: true,
        showSpec: true,
        showGlow: true,
        showFx: true,
        showSidebar: true,
        sidebarWidth: 280,
        miniOnTop: true,
        fpsMode: "auto",
        specScale: 0.5,
        pauseOnBlur: false,
        lowGfx: false,
        perfGuard: true,
        audioMode: "stream",
        preservePitch: false,
        globalDsp: false,
        fadeMs: 1000,
        visMode: "wave",
        eqEnabled: true,
        eqCollapsed: false,
    };

    let prefs = loadPrefs();

    function loadPrefs() {
        try {
            const raw = localStorage.getItem("zenith_prefs_v2");
            if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
        } catch (e) {}
        return { ...DEFAULT_PREFS };
    }

    function savePrefs() {
        try {
            localStorage.setItem("zenith_prefs_v2", JSON.stringify(prefs));
        } catch (e) {}
    }

    let currentSource = null;
    let currentTrackBuffer = null;
    let currentTrackExt = "";
    let currentStreamUrl = null;
    let currentBlobUrl = null;
    let isStreamActive = false;
    let audioStreamPort = 0;
    window.electronAPI.getAudioStreamPort().then((p) => {
        audioStreamPort = p;
    });

    let currentPlayingElement = null;
    let isPlaying = false;
    let isMuted = false;
    let preMuteVolume = 100;
    let shuffleEnabled = false;
    let repeatMode = "off";
    let isMiniMode = false;

    let pauseTimeSec = 0;
    let playbackStartSec = 0;
    let playbackStartedAtCtx = 0;
    let animationFrameId = null;
    let isDraggingSlider = false;
    let currentTrackPath = null;
    let isApplyingSettings = false;
    let currentMetadata = { title: null, artist: null, album: null };
    let waveformPeaks = [];

    let detectedHz = 60;
    let targetFps = 48;
    let frameIntervalMs = 1000 / 48;
    let lastFrameTime = 0;
    let lastDisplayedSec = -1;
    let lastDurationSec = -1;
    let lastSliderVal = -1;
    let lastWaveProgressX = -1;
    let specCleared = true;
    let cachedWaveBarGrad = null;
    let cachedSpecGrad = null;
    let settingsSaveTimer = null;
    let cachedClipCurve = null;
    let eqSavedValues = [0, 0, 0, 0, 0, 0, 0];

    let cachedAccent = "#8b5cf6";
    let cachedAccentSec = "#0ea5e9";
    let waveCanvasW = 0;
    let waveCanvasH = 0;
    let specCanvasW = 0;
    let specCanvasH = 0;

    const playPauseBtn = document.getElementById("play-pause-btn");
    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");
    const shuffleBtn = document.getElementById("shuffle-btn");
    const repeatBtn = document.getElementById("repeat-btn");
    const volMuteBtn = document.getElementById("vol-mute-btn");
    const miniModeBtn = document.getElementById("mini-mode-btn");
    const visModeBtn = document.getElementById("vis-mode-btn");
    const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
    const dspToggleBtn = document.getElementById("dsp-toggle-btn");

    const addUrlBtn = document.getElementById("add-url-btn");
    const jumpPlayingBtn = document.getElementById("jump-playing-btn");
    const urlModal = document.getElementById("url-modal");
    const closeUrlModal = document.getElementById("close-url-modal");
    const webUrlInput = document.getElementById("web-url-input");
    const urlSubmitBtn = document.getElementById("url-submit-btn");
    const urlStatusText = document.getElementById("url-status-text");

    const trackVolumeSlider = document.getElementById("track-volume-slider");
    const trackVolumeInput = document.getElementById("track-volume-input");
    const speedSlider = document.getElementById("speed-slider");
    const speedInput = document.getElementById("speed-input");
    const distortionSlider = document.getElementById("distortion-slider");
    const distortionInput = document.getElementById("distortion-input");

    const progressSlider = document.getElementById("progress-slider");
    const progressView = document.getElementById("progress-view");
    const timeCurrentEl = document.getElementById("time-current");
    const timeTotalEl = document.getElementById("time-total");

    const searchInput = document.getElementById("search-input");
    const currentTrackNameLabel = document.getElementById("current-track-name");
    const currentTrackFolderLabel = document.getElementById(
        "current-track-folder",
    );
    const currentTrackArtwork = document.getElementById(
        "current-track-artwork",
    );
    const transportArt = document.getElementById("transport-art");
    const transportTitle = document.getElementById("transport-title");
    const transportArtist = document.getElementById("transport-artist");
    const heroDspStatus = document.getElementById("hero-dsp-status");
    const artworkGlowEl = document.querySelector(".artwork-glow");
    const audioFormatTag = document.getElementById("audio-format-tag");

    const webTracksSection = document.getElementById("web-tracks-section");
    const localTracksSection = document.getElementById("local-tracks-section");
    const selectFolderBtn = document.getElementById("select-folder-btn");
    const waveformCanvas = document.getElementById("waveform-canvas");
    const waveformCtx = waveformCanvas.getContext("2d");
    const spectrogramCanvas = document.getElementById("spectrogram-canvas");
    const spectrogramCtx = spectrogramCanvas.getContext("2d");
    const dropOverlay = document.getElementById("drop-overlay");

    const optimizeBtn = document.getElementById("optimize-btn");
    const saveSettingsBtn = document.getElementById("save-settings-btn");
    const resetSettingsBtn = document.getElementById("reset-settings-btn");

    const eqWrapper = document.getElementById("eq-wrapper");
    const eqContainer = document.querySelector(".eq-bands");
    const eqPresetSelect = document.getElementById("eq-preset-select");
    const eqBypassBtn = document.getElementById("eq-bypass-btn");
    const eqCollapseBtn = document.getElementById("eq-collapse-btn");

    const settingsBtn = document.getElementById("settings-btn");
    const settingsModal = document.getElementById("settings-modal");
    const closeSettingsModal = document.getElementById("close-settings-modal");
    const detectedHzBadge = document.getElementById("detected-hz-badge");
    const themePerfGuardEl = document.getElementById("theme-perf-guard");
    const themeGrid = document.getElementById("theme-grid");

    const resizer = document.getElementById("sidebar-resizer");
    const sidebar = document.getElementById("explorer-sidebar");
    const playerStage = document.querySelector(".player-stage");

    function applyFpsLimit() {
        const mode = prefs.fpsMode;
        if (mode === "native") {
            targetFps = detectedHz;
            frameIntervalMs = 0;
        } else if (mode === "auto") {
            const divisor =
                detectedHz >= 100
                    ? Math.max(2, Math.round(detectedHz / 48))
                    : detectedHz >= 75
                      ? 2
                      : 1;
            targetFps = Math.max(24, Math.round(detectedHz / divisor));
            frameIntervalMs = 1000 / targetFps - 1.5;
        } else {
            targetFps = Number(mode) || 48;
            frameIntervalMs = 1000 / targetFps - 1.5;
        }
        window.__zenithFrameInterval = frameIntervalMs;
        if (detectedHzBadge) {
            detectedHzBadge.textContent =
                mode === "native"
                    ? `Monitor: ${detectedHz} Hz (Uncapped)`
                    : `Monitor: ${detectedHz} Hz -> ${targetFps} FPS`;
        }
    }

    function detectMonitorHz() {
        const samples = [];
        let prev = performance.now();

        function step(now) {
            const dt = now - prev;
            prev = now;
            if (dt > 2 && dt < 50) samples.push(dt);
            if (samples.length < 25) {
                requestAnimationFrame(step);
                return;
            }
            samples.sort((a, b) => a - b);
            const medianDt = samples[Math.floor(samples.length / 2)];
            detectedHz = Math.round(1000 / medianDt);
            applyFpsLimit();
        }
        requestAnimationFrame(step);
    }

    function rebuildCanvasGradients() {
        if (waveCanvasW > 0) {
            cachedWaveBarGrad = waveformCtx.createLinearGradient(
                0,
                0,
                waveCanvasW,
                0,
            );
            cachedWaveBarGrad.addColorStop(0, cachedAccent);
            cachedWaveBarGrad.addColorStop(1, cachedAccentSec);
        }
        if (specCanvasH > 0) {
            cachedSpecGrad = spectrogramCtx.createLinearGradient(
                0,
                specCanvasH,
                0,
                0,
            );
            cachedSpecGrad.addColorStop(0, cachedAccent);
            cachedSpecGrad.addColorStop(1, cachedAccentSec);
        }
    }

    function updateThemeCache() {
        const style = getComputedStyle(document.documentElement);
        cachedAccent = style.getPropertyValue("--accent").trim() || "#8b5cf6";
        cachedAccentSec =
            style.getPropertyValue("--accent-secondary").trim() || "#0ea5e9";
        rebuildCanvasGradients();
    }

    function updateCanvasSizeCache() {
        const dpr = window.devicePixelRatio || 1;
        if (waveformCanvas) {
            waveCanvasW = waveformCanvas.clientWidth;
            waveCanvasH = waveformCanvas.clientHeight;
            if (waveCanvasW > 0 && waveCanvasH > 0) {
                waveformCanvas.width = waveCanvasW * dpr;
                waveformCanvas.height = waveCanvasH * dpr;
            }
        }
        if (spectrogramCanvas && playerStage) {
            const scale = Number(prefs.specScale) || 0.5;
            const stageW = playerStage.clientWidth || window.innerWidth;
            const stageH = playerStage.clientHeight || window.innerHeight;
            specCanvasW = Math.floor(stageW * scale);
            specCanvasH = Math.floor(stageH * scale);
            spectrogramCanvas.width = specCanvasW;
            spectrogramCanvas.height = specCanvasH;
            specCleared = true;
        }
        rebuildCanvasGradients();
    }

    if (typeof ResizeObserver !== "undefined") {
        const stageObserver = new ResizeObserver(() => {
            updateCanvasSizeCache();
            if (hasActiveTrack()) renderWaveform(true);
        });
        if (playerStage) stageObserver.observe(playerStage);
        if (waveformCanvas && waveformCanvas.parentElement) {
            stageObserver.observe(waveformCanvas.parentElement);
        }
    }

    function updateHeroDspBadge() {
        if (!heroDspStatus) return;
        const speedStr = (Number(speedSlider.value) / 100).toFixed(2);
        const driveStr = Number(distortionSlider.value) || 0;
        const eqStr = prefs.eqEnabled ? "EQ ON" : "EQ OFF";
        heroDspStatus.textContent = `${speedStr}x • DRIVE ${driveStr}% • ${eqStr}`;
    }

    const EQ_PRESETS = {
        flat: [0, 0, 0, 0, 0, 0, 0],
        bass: [7.5, 5.5, 2.5, 0, 0, 1, 1.5],
        phonk: [8.5, 5, -1.5, -2, 2.5, 4.5, 5],
        vocal: [-2, -1, 1.5, 4.5, 5, 2, 0],
        treble: [0, 0, 0, 1, 3.5, 6, 7.5],
    };

    function syncEqFiltersToDSP() {
        eqFilters.forEach((filter, i) => {
            const gain = prefs.eqEnabled ? eqSavedValues[i] : 0;
            filter.gain.setValueAtTime(gain, audioContext.currentTime);
        });
        if (isAndroid && ZenithAudio) {
            ZenithAudio.setDsp({
                eqEnabled: prefs.eqEnabled,
                eq: eqSavedValues,
            });
        }
        updateHeroDspBadge();
    }

    eqFilters.forEach((filter, i) => {
        const bandEl = document.createElement("div");
        bandEl.className = "eq-band";
        const label = document.createElement("label");
        const freq = eqFrequencies[i];
        label.textContent = freq >= 1000 ? `${freq / 1000}k` : freq;

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = -12;
        slider.max = 12;
        slider.value = 0;
        slider.step = 0.5;
        slider.title = "Double-click to reset";

        const numInput = document.createElement("input");
        numInput.type = "number";
        numInput.min = -12;
        numInput.max = 12;
        numInput.value = 0;
        numInput.step = 0.5;

        const updateGain = (val, fromPreset = false) => {
            const num = Math.min(12, Math.max(-12, Number(val) || 0));
            eqSavedValues[i] = num;
            slider.value = num;
            numInput.value = num;
            if (prefs.eqEnabled)
                filter.gain.setValueAtTime(num, audioContext.currentTime);
            if (!fromPreset && eqPresetSelect) eqPresetSelect.value = "custom";
            if (!isApplyingSettings) onSettingsChange();
        };

        slider.addEventListener("input", (e) => updateGain(e.target.value));
        numInput.addEventListener("change", (e) => updateGain(e.target.value));
        slider.addEventListener("dblclick", () => updateGain(0));
        numInput.addEventListener("dblclick", () => updateGain(0));
        slider.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.5 : -0.5;
                updateGain(Number(slider.value) + delta);
            },
            { passive: false },
        );

        bandEl.append(label, slider, numInput);
        eqContainer.appendChild(bandEl);
    });

    eqPresetSelect.addEventListener("change", (e) => {
        const preset = EQ_PRESETS[e.target.value];
        if (!preset) return;
        const eqRanges = eqContainer.querySelectorAll('input[type="range"]');
        const eqNums = eqContainer.querySelectorAll('input[type="number"]');
        preset.forEach((val, i) => {
            eqSavedValues[i] = val;
            eqRanges[i].value = val;
            eqNums[i].value = val;
        });
        syncEqFiltersToDSP();
        onSettingsChange();
    });

    eqBypassBtn.addEventListener("click", () => {
        prefs.eqEnabled = !prefs.eqEnabled;
        eqBypassBtn.textContent = prefs.eqEnabled ? "EQ ON" : "EQ OFF";
        eqBypassBtn.classList.toggle("active", prefs.eqEnabled);
        syncEqFiltersToDSP();
        savePrefs();
    });

    function toggleDspRack(forceOpen) {
        if (!prefs.showEq) {
            prefs.showEq = true;
            prefs.eqCollapsed = false;
        } else {
            prefs.eqCollapsed =
                typeof forceOpen === "boolean"
                    ? !forceOpen
                    : !prefs.eqCollapsed;
        }
        savePrefs();
        applyPreferencesToUI();
        setTimeout(updateCanvasSizeCache, 20);
    }

    eqCollapseBtn.addEventListener("click", () => toggleDspRack(false));
    if (dspToggleBtn) {
        dspToggleBtn.addEventListener("click", () => toggleDspRack());
    }
    if (heroDspStatus) {
        heroDspStatus.addEventListener("click", () => toggleDspRack(true));
    }

    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener("click", () => {
            prefs.showSidebar = !prefs.showSidebar;
            savePrefs();
            applyPreferencesToUI();
            updateCanvasSizeCache();
            if (hasActiveTrack()) renderWaveform(true);
        });
    }

    function hasActiveTrack() {
        if (isAndroid) return !!currentTrackPath;
        return isStreamActive ? !!currentStreamUrl : !!currentTrackBuffer;
    }

    function getTrackDuration() {
        if (isAndroid) return androidDuration;
        if (isStreamActive) {
            return Number.isFinite(streamAudioEl.duration)
                ? streamAudioEl.duration
                : 0;
        }
        return currentTrackBuffer ? currentTrackBuffer.duration : 0;
    }

    function getCurrentTime() {
        if (isAndroid) return androidCurrentTime;
        if (isStreamActive) {
            return streamAudioEl.currentTime || 0;
        }
        if (!currentSource || !isPlaying) return pauseTimeSec;
        const rate = currentSource.playbackRate.value;
        const time = (audioContext.currentTime - playbackStartedAtCtx) * rate;
        const dur = getTrackDuration();
        if (dur > 0 && time > dur) return dur;
        return Math.max(0, time);
    }

    function generatePseudoPeaks(seedStr) {
        let hash = 2166136261;
        for (let i = 0; i < seedStr.length; i++) {
            hash ^= seedStr.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        const peaks = [];
        for (let i = 0; i < 140; i++) {
            hash ^= hash << 13;
            hash ^= hash >>> 17;
            hash ^= hash << 5;
            const norm = ((hash >>> 0) % 1000) / 1000;
            const waveEnv =
                0.25 + 0.65 * Math.abs(Math.sin(i * 0.14)) * (0.4 + norm * 0.6);
            peaks.push(Math.min(0.95, Math.max(0.12, waveEnv)));
        }
        return peaks;
    }

    function updateFormatTag(srHz, channels, ext) {
        if (!audioFormatTag) return;
        const khz = srHz
            ? `${(srHz / 1000).toFixed(1)}kHz`
            : `${(audioContext.sampleRate / 1000).toFixed(1)}kHz`;
        const ch = channels === 1 ? "MONO" : "STEREO";
        const mode = isStreamActive ? "STREAM" : "RAM";
        const fmt = ext ? ext.toUpperCase() : "AUDIO";
        audioFormatTag.textContent = `${khz} • ${ch} • ${fmt} • ${mode}`;
    }

    function syncTrackDisplay(title, subtitle, artworkSrc) {
        currentTrackNameLabel.textContent = title;
        currentTrackFolderLabel.textContent = subtitle;
        if (transportTitle) transportTitle.textContent = title;
        if (transportArtist) transportArtist.textContent = subtitle;

        const imgSrc = artworkSrc || "icon.png";
        if (currentTrackArtwork) currentTrackArtwork.src = imgSrc;
        if (transportArt) transportArt.src = imgSrc;

        if (artworkSrc) {
            artworkGlowEl.style.backgroundImage = `url("${artworkSrc}")`;
            artworkGlowEl.style.opacity = prefs.showGlow ? "0.35" : "0";
        } else {
            artworkGlowEl.style.backgroundImage = "";
            artworkGlowEl.style.opacity = prefs.showGlow ? "0.08" : "0";
        }
    }

    function handleTrackEnded() {
        if (!isPlaying) return;
        isPlaying = false;
        updateUIState();
        if (window.ThemeFX) window.ThemeFX.setPlayingState(false);

        if (repeatMode === "one") {
            play(0);
            return;
        }
        setTimeout(playNextTrack, 80);
    }

    streamAudioEl.addEventListener("ended", handleTrackEnded);
    streamAudioEl.addEventListener("loadedmetadata", () => {
        if (isStreamActive) {
            updateSimpleUI(true);
            renderWaveform(true);
            updateDiscordPlaying(streamAudioEl.currentTime);
        }
    });

    function updateDiscordPlaying(offsetSeconds) {
        const dur = getTrackDuration();
        const rate = Number(speedSlider.value) / 100;
        if (isAndroid && ZenithAudio) {
            if (offsetSeconds > 0)
                ZenithAudio.seekTo({ seconds: offsetSeconds });
            ZenithAudio.play();
            isPlaying = true;
            if (window.ThemeFX) window.ThemeFX.setPlayingState(true);
            updateUIState();
            startRenderLoop();
            return;
        }
        const remainingSec =
            dur > offsetSeconds ? (dur - offsetSeconds) / rate : 0;
        const now = Date.now();
        window.electronAPI.updateDiscordRPC({
            title: currentMetadata.title || currentTrackNameLabel.textContent,
            artist: currentMetadata.artist || "",
            album: currentMetadata.album || "",
            picture: currentMetadata.picture || null,
            status: "playing",
            startTimestamp: Math.floor(now - offsetSeconds * 1000),
            endTimestamp:
                dur > 0 ? Math.floor(now + remainingSec * 1000) : undefined,
        });
    }

    function play(offsetSeconds) {
        if (!hasActiveTrack()) return;
        if (audioContext.state === "suspended") audioContext.resume();

        playbackStartSec = offsetSeconds;
        const rate = Number(speedSlider.value) / 100;

        if (isStreamActive) {
            if (
                Math.abs(streamAudioEl.currentTime - offsetSeconds) > 0.25 ||
                offsetSeconds === 0
            ) {
                streamAudioEl.currentTime = offsetSeconds;
            }
            streamAudioEl.preservesPitch = !!prefs.preservePitch;
            streamAudioEl.playbackRate = rate;
            streamAudioEl.play().catch((err) => {
                if (err.name !== "AbortError")
                    console.error("Stream play error:", err);
            });
            isPlaying = true;
            if (window.ThemeFX) window.ThemeFX.setPlayingState(true);
            updateDiscordPlaying(offsetSeconds);
            updateUIState();
            startRenderLoop();
            return;
        }

        if (currentSource) currentSource.stop();

        currentSource = audioContext.createBufferSource();
        currentSource.buffer = currentTrackBuffer;
        currentSource.playbackRate.value = rate;
        currentSource.connect(inputBus);

        let naturalEnd = true;
        currentSource.stop = ((stop) =>
            function (...args) {
                naturalEnd = false;
                stop.apply(this, args);
            })(currentSource.stop);

        currentSource.start(0, offsetSeconds);
        isPlaying = true;
        if (window.ThemeFX) window.ThemeFX.setPlayingState(true);
        playbackStartedAtCtx = audioContext.currentTime - offsetSeconds / rate;

        currentSource.onended = () => {
            if (naturalEnd && isPlaying) handleTrackEnded();
        };

        updateDiscordPlaying(offsetSeconds);
        updateUIState();
        startRenderLoop();
    }

    function pause() {
        if (!isPlaying) return;
        pauseTimeSec = getCurrentTime();
        window.electronAPI.updateDiscordRPC({
            title: currentMetadata.title || currentTrackNameLabel.textContent,
            artist: currentMetadata.artist || "",
            album: currentMetadata.album || "",
            picture: currentMetadata.picture || null,
            status: "paused",
        });
        stopSource();
        if (audioContext.state === "running") audioContext.suspend();
        updateUIState();
        updateSimpleUI(true);
        renderWaveform(true);
    }

    function stopWithReturn() {
        if (!isPlaying) return;
        stopSource();
        if (isStreamActive) streamAudioEl.currentTime = playbackStartSec;
        pauseTimeSec = playbackStartSec;
        if (audioContext.state === "running") audioContext.suspend();
        updateUIState();
        updateSimpleUI(true);
        renderWaveform(true);
    }

    function stopSource() {
        if (isAndroid && ZenithAudio) {
            ZenithAudio.pause();
        }
        if (isStreamActive) {
            streamAudioEl.pause();
        }
        if (currentSource) {
            try {
                currentSource.stop();
            } catch (e) {}
            currentSource = null;
        }
        isPlaying = false;
        stopRenderLoop();
        if (window.ThemeFX) window.ThemeFX.setPlayingState(false);
    }

    function fadeOutAndStop() {
        const fadeSec = (Number(prefs.fadeMs) || 0) / 1000;
        if (isStreamActive || !currentSource || fadeSec <= 0) {
            stopSource();
            return;
        }
        const oldSource = currentSource;
        const oldGain = audioContext.createGain();
        oldGain.connect(inputBus);
        oldSource.disconnect();
        oldSource.connect(oldGain);
        oldGain.gain.setValueAtTime(1, audioContext.currentTime);
        oldGain.gain.exponentialRampToValueAtTime(
            0.001,
            audioContext.currentTime + fadeSec,
        );
        setTimeout(() => {
            try {
                oldSource.stop();
            } catch (e) {}
            oldSource.disconnect();
            oldGain.disconnect();
        }, fadeSec * 1000);
        currentSource = null;
        isPlaying = false;
        stopRenderLoop();
    }

    function cleanupBlobUrl() {
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }
    }

    async function loadAndPlayTrack(trackPath, trackElement) {
        if (isPlaying) fadeOutAndStop();
        else stopSource();

        if (currentPlayingElement)
            currentPlayingElement.classList.remove("playing");
        if (trackElement) {
            currentPlayingElement = trackElement;
            trackElement.classList.add("playing");
        }

        currentTrackPath = trackPath;
        currentTrackExt = trackPath.split(".").pop() || "AUDIO";
        currentTrackBuffer = null;
        currentStreamUrl = null;
        cleanupBlobUrl();
        isPlaying = false;
        timeCurrentEl.textContent = "...";
        timeTotalEl.textContent = "--:--";

        const meta = await window.electronAPI.getTrackMetadata(trackPath);
        if (currentTrackPath !== trackPath) return;
        currentMetadata = meta;

        const rawFileName = trackElement
            ? trackElement.querySelector(".track-name").textContent
            : trackPath.split(/\\|\//).pop();
        const displayTitle = meta.title || rawFileName;

        const folderNode = trackElement
            ? trackElement.closest(".folder-group")
            : null;
        const folderName = folderNode
            ? folderNode.querySelector("h3").textContent
            : "Local";
        const displaySub = meta.artist
            ? meta.album
                ? `${meta.artist} • ${meta.album}`
                : meta.artist
            : folderName;

        syncTrackDisplay(displayTitle, displaySub, meta.picture);

        if (!prefs.globalDsp) {
            const savedSettings =
                await window.electronAPI.getTrackSettings(trackPath);
            applySettings(savedSettings);
        }

        if (isAndroid && ZenithAudio) {
            const queue = window.electronAPI.getFlatQueue
                ? window.electronAPI.getFlatQueue()
                : [];
            const idx = queue.findIndex((t) => t.path === trackPath);
            androidCurrentTime = 0;
            androidDuration = meta.duration || 0;
            waveformPeaks = generatePseudoPeaks(trackPath);
            lastWaveProgressX = -1;
            updateFormatTag(44100, 2, meta.ext || "NATIVE");
            if (!androidQueueLoaded && queue.length > 0) {
                androidQueueLoaded = true;
                await ZenithAudio.setQueue({
                    tracks: queue,
                    startIndex: Math.max(0, idx),
                    playWhenReady: true,
                });
            } else if (idx > -1) {
                await ZenithAudio.jumpToIndex({ index: idx });
            }
            isPlaying = true;
            updateUIState();
            renderWaveform(true);
            startRenderLoop();
            return;
        }

        if (prefs.audioMode === "stream") {
            isStreamActive = true;
            if (!audioStreamPort)
                audioStreamPort = await window.electronAPI.getAudioStreamPort();
            currentStreamUrl = `http://127.0.0.1:${audioStreamPort}/audio?path=${encodeURIComponent(trackPath)}`;
            waveformPeaks = generatePseudoPeaks(trackPath);
            lastWaveProgressX = -1;
            pauseTimeSec = 0;
            playbackStartSec = 0;
            progressSlider.value = 0;
            streamAudioEl.src = currentStreamUrl;
            updateFormatTag(audioContext.sampleRate, 2, currentTrackExt);
            renderWaveform(true);
            play(0);
            return;
        }

        isStreamActive = false;
        try {
            const rawData = await window.electronAPI.getAudioData(trackPath);
            if (currentTrackPath !== trackPath) return;
            if (!rawData) throw new Error("Failed to get audio data");

            const audioBuffer = await audioContext.decodeAudioData(
                rawData.buffer,
            );
            if (currentTrackPath !== trackPath) return;

            currentTrackBuffer = audioBuffer;
            updateFormatTag(
                audioBuffer.sampleRate,
                audioBuffer.numberOfChannels,
                currentTrackExt,
            );
            drawWaveform(audioBuffer);

            pauseTimeSec = 0;
            playbackStartSec = 0;
            progressSlider.value = 0;
            play(0);
        } catch (err) {
            console.error("Playback error:", err);
            timeCurrentEl.textContent = "Err";
        }
    }

    async function playWebTrackBuffer(
        resolvedData,
        trackObj,
        elementNode = null,
    ) {
        if (isPlaying) fadeOutAndStop();
        else stopSource();

        if (currentPlayingElement)
            currentPlayingElement.classList.remove("playing");
        if (elementNode) {
            currentPlayingElement = elementNode;
            elementNode.classList.add("playing");
        }

        currentTrackPath = resolvedData.url;
        currentTrackExt = "WEB";
        currentTrackBuffer = null;
        cleanupBlobUrl();

        currentMetadata = {
            title: resolvedData.title,
            artist: resolvedData.artist,
            album: "Online Stream",
            picture: resolvedData.picture,
        };

        syncTrackDisplay(
            resolvedData.title,
            resolvedData.artist,
            resolvedData.picture,
        );

        if (!prefs.globalDsp) {
            const savedSettings = await window.electronAPI.getTrackSettings(
                resolvedData.url,
            );
            applySettings(savedSettings);
        }

        if (prefs.audioMode === "stream") {
            isStreamActive = true;
            currentBlobUrl = URL.createObjectURL(
                new Blob([resolvedData.audioData]),
            );
            currentStreamUrl = currentBlobUrl;
            waveformPeaks = generatePseudoPeaks(resolvedData.url);
            lastWaveProgressX = -1;
            pauseTimeSec = 0;
            playbackStartSec = 0;
            progressSlider.value = 0;
            streamAudioEl.src = currentStreamUrl;
            updateFormatTag(audioContext.sampleRate, 2, "WEB");
            renderWaveform(true);
            play(0);
            return;
        }

        isStreamActive = false;
        try {
            const audioBuffer = await audioContext.decodeAudioData(
                resolvedData.audioData.buffer,
            );
            currentTrackBuffer = audioBuffer;
            updateFormatTag(
                audioBuffer.sampleRate,
                audioBuffer.numberOfChannels,
                "WEB",
            );
            drawWaveform(audioBuffer);
            pauseTimeSec = 0;
            playbackStartSec = 0;
            progressSlider.value = 0;
            play(0);
        } catch (err) {
            console.error("Web audio decode error:", err);
            timeCurrentEl.textContent = "Err";
        }
    }

    function getVisibleTracks() {
        return Array.from(document.querySelectorAll(".track-item")).filter(
            (t) => t.style.display !== "none",
        );
    }

    function triggerTrackElement(el) {
        if (!el) return;
        if (el.dataset.webUrl) {
            el.click();
        } else if (el.dataset.path) {
            loadAndPlayTrack(el.dataset.path, el);
        }
    }

    function playNextTrack() {
        if (isAndroid && ZenithAudio) {
            ZenithAudio.next();
            return;
        }
        const tracks = getVisibleTracks();
        if (tracks.length === 0) return;

        if (shuffleEnabled && tracks.length > 1) {
            const currentIdx = tracks.findIndex(
                (t) =>
                    (t.dataset.path || t.dataset.webUrl) === currentTrackPath,
            );
            let nextIdx = currentIdx;
            while (nextIdx === currentIdx) {
                nextIdx = Math.floor(Math.random() * tracks.length);
            }
            triggerTrackElement(tracks[nextIdx]);
            return;
        }

        const currentIndex = tracks.findIndex(
            (t) => (t.dataset.path || t.dataset.webUrl) === currentTrackPath,
        );
        if (currentIndex > -1 && currentIndex < tracks.length - 1) {
            triggerTrackElement(tracks[currentIndex + 1]);
        } else if (repeatMode === "all") {
            triggerTrackElement(tracks[0]);
        }
    }

    function playPrevTrack() {
        if (getCurrentTime() > 3) {
            play(0);
            return;
        }
        if (isAndroid && ZenithAudio) {
            ZenithAudio.prev();
            return;
        }
        const tracks = getVisibleTracks();
        if (tracks.length === 0) return;
        const currentIndex = tracks.findIndex(
            (t) => (t.dataset.path || t.dataset.webUrl) === currentTrackPath,
        );
        if (currentIndex > 0) {
            triggerTrackElement(tracks[currentIndex - 1]);
        } else if (repeatMode === "all") {
            triggerTrackElement(tracks[tracks.length - 1]);
        }
    }

    shuffleBtn.addEventListener("click", () => {
        shuffleEnabled = !shuffleEnabled;
        shuffleBtn.classList.toggle("active", shuffleEnabled);
        shuffleBtn.title = shuffleEnabled ? "Shuffle: ON" : "Shuffle: OFF";
        if (isAndroid && ZenithAudio)
            ZenithAudio.setShuffle({ enabled: shuffleEnabled });
    });

    repeatBtn.addEventListener("click", () => {
        if (repeatMode === "off") {
            repeatMode = "all";
            repeatBtn.classList.add("active");
            repeatBtn.textContent = "↻";
            repeatBtn.title = "Repeat: Playlist";
        } else if (repeatMode === "all") {
            repeatMode = "one";
            repeatBtn.classList.add("active");
            repeatBtn.textContent = "1";
            repeatBtn.title = "Repeat: Track";
        } else {
            repeatMode = "off";
            repeatBtn.classList.remove("active");
            repeatBtn.textContent = "↻";
            repeatBtn.title = "Repeat: Off";
        }
        if (isAndroid && ZenithAudio && ZenithAudio.setRepeatMode) {
            ZenithAudio.setRepeatMode({ mode: repeatMode });
        }
    });

    window.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.code === "KeyK") {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.code === "KeyE") {
            e.preventDefault();
            toggleDspRack();
            return;
        }
        if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")
            return;
        if (e.code === "Space") {
            e.preventDefault();
            if (!hasActiveTrack()) return;
            if (isPlaying) stopWithReturn();
            else play(pauseTimeSec);
        }
        if (e.ctrlKey && e.code === "KeyT") switchTheme();
    });

    playPauseBtn.addEventListener("click", () => {
        if (!hasActiveTrack()) return;
        if (isPlaying) pause();
        else play(pauseTimeSec);
    });
    prevBtn.addEventListener("click", playPrevTrack);
    nextBtn.addEventListener("click", playNextTrack);

    const minBtn = document.getElementById("win-min");
    minBtn.addEventListener("click", () =>
        window.electronAPI.minimize("taskbar"),
    );
    minBtn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        window.electronAPI.minimize("tray");
    });

    document.getElementById("win-max").addEventListener("click", () => {
        if (isMiniMode) toggleMiniMode(false);
        window.electronAPI.maximize();
    });
    document
        .getElementById("win-close")
        .addEventListener("click", () => window.electronAPI.close());

    window.electronAPI.onGlobalCommand((cmd) => {
        if (cmd === "play-pause") playPauseBtn.click();
        else if (cmd === "next") playNextTrack();
        else if (cmd === "prev") playPrevTrack();
    });

    function toggleMiniMode(forceState) {
        isMiniMode = typeof forceState === "boolean" ? forceState : !isMiniMode;
        document.body.classList.toggle("mini-mode", isMiniMode);
        miniModeBtn.classList.toggle("active", isMiniMode);
        window.electronAPI.setMiniMode(isMiniMode, prefs.miniOnTop);
        setTimeout(() => {
            updateCanvasSizeCache();
            if (hasActiveTrack()) renderWaveform(true);
        }, 60);
    }
    miniModeBtn.addEventListener("click", () => toggleMiniMode());

    progressSlider.addEventListener(
        "mousedown",
        () => (isDraggingSlider = true),
    );

    window.addEventListener("mouseup", () => {
        if (isDraggingSlider) {
            isDraggingSlider = false;
            const dur = getTrackDuration();
            if (dur > 0) {
                const time = (progressSlider.value / 1000) * dur;
                pauseTimeSec = time;
                playbackStartSec = time;
                if (isPlaying) play(time);
                else {
                    if (isStreamActive) streamAudioEl.currentTime = time;
                    if (isAndroid && ZenithAudio)
                        ZenithAudio.seekTo({ seconds: time });
                    updateSimpleUI(true);
                    renderWaveform(true);
                }
            }
        }
    });

    progressSlider.addEventListener("input", (e) => {
        const dur = getTrackDuration();
        if (dur <= 0) return;
        const time = (e.target.value / 1000) * dur;
        timeCurrentEl.textContent = formatTime(time);
        timeTotalEl.textContent = formatTime(dur);
        if (isStreamActive && !isPlaying) streamAudioEl.currentTime = time;
        renderWaveform(true);
    });

    const VIS_MODES = ["wave", "spec", "dual"];
    visModeBtn.textContent = prefs.visMode.toUpperCase();
    visModeBtn.addEventListener("click", () => {
        const idx = (VIS_MODES.indexOf(prefs.visMode) + 1) % VIS_MODES.length;
        prefs.visMode = VIS_MODES[idx];
        visModeBtn.textContent = prefs.visMode.toUpperCase();
        savePrefs();
        renderWaveform(true);
    });

    function onSettingsChange() {
        updateHeroDspBadge();
        if (isApplyingSettings || !currentTrackPath) return;
        clearTimeout(settingsSaveTimer);
        settingsSaveTimer = setTimeout(() => {
            window.electronAPI.saveTrackSettings({
                trackPath: currentTrackPath,
                settings: {
                    volume: Number(trackVolumeSlider.value),
                    speed: Number(speedSlider.value),
                    distortion: Number(distortionSlider.value),
                    eq: [...eqSavedValues],
                },
            });
        }, 300);
    }

    saveSettingsBtn.addEventListener("click", () => {
        if (!currentTrackPath) return;
        onSettingsChange();
        saveSettingsBtn.textContent = "Saved!";
        setTimeout(() => (saveSettingsBtn.textContent = "Save"), 1500);
    });

    resetSettingsBtn.addEventListener("click", () => {
        if (!currentTrackPath) return;
        applySettings(null);
        onSettingsChange();
    });

    function applySettings(settings) {
        isApplyingSettings = true;
        const defaults = {
            volume: 100,
            speed: 100,
            distortion: 0,
            eq: [0, 0, 0, 0, 0, 0, 0],
        };
        const final = { ...defaults, ...settings };

        isMuted = false;
        volMuteBtn.classList.remove("muted");
        trackVolumeSlider.value = final.volume;
        trackVolumeInput.value = final.volume;
        masterGain.gain.setValueAtTime(
            final.volume / 100,
            audioContext.currentTime,
        );

        speedSlider.value = final.speed;
        speedInput.value = final.speed;
        if (isStreamActive) streamAudioEl.playbackRate = final.speed / 100;
        if (currentSource) currentSource.playbackRate.value = final.speed / 100;

        const eqRanges = eqContainer.querySelectorAll('input[type="range"]');
        const eqNums = eqContainer.querySelectorAll('input[type="number"]');
        eqRanges.forEach((slider, i) => {
            const val = final.eq[i] || 0;
            eqSavedValues[i] = val;
            slider.value = val;
            eqNums[i].value = val;
        });
        syncEqFiltersToDSP();
        if (eqPresetSelect) eqPresetSelect.value = "custom";

        applyDistortionDSP(final.distortion);
        distortionSlider.value = final.distortion;
        distortionInput.value = final.distortion;

        if (isAndroid && ZenithAudio) {
            ZenithAudio.setDsp({
                volume: final.volume / 100,
                distortion: final.distortion,
            });
            ZenithAudio.setPlaybackParams({
                speed: final.speed / 100,
                preservePitch: !!prefs.preservePitch,
            });
        }

        updateHeroDspBadge();
        setTimeout(() => {
            isApplyingSettings = false;
        }, 50);
    }

    function updateVolume(value) {
        const val = Math.min(200, Math.max(0, Number(value) || 0));
        isMuted = val === 0;
        volMuteBtn.classList.toggle("muted", isMuted);
        masterGain.gain.setValueAtTime(val / 100, audioContext.currentTime);
        trackVolumeSlider.value = val;
        trackVolumeInput.value = val;
        onSettingsChange();
        if (isAndroid && ZenithAudio) ZenithAudio.setDsp({ volume: val / 100 });
    }

    volMuteBtn.addEventListener("click", () => {
        if (!isMuted) {
            preMuteVolume = Number(trackVolumeSlider.value) || 100;
            updateVolume(0);
        } else {
            updateVolume(preMuteVolume);
        }
    });

    function updateSpeed(value) {
        const val = Math.min(200, Math.max(50, Number(value) || 100));
        const rate = val / 100;
        if (isStreamActive) {
            streamAudioEl.playbackRate = rate;
        } else if (currentSource) {
            const currentPos = getCurrentTime();
            currentSource.playbackRate.value = rate;
            playbackStartedAtCtx = audioContext.currentTime - currentPos / rate;
        } else if (isAndroid && ZenithAudio)
            ZenithAudio.setPlaybackParams({
                speed: rate,
                preservePitch: !!prefs.preservePitch,
            });
        speedSlider.value = val;
        speedInput.value = val;
        onSettingsChange();
    }

    function applyDistortionDSP(val) {
        if (isAndroid && ZenithAudio) {
            ZenithAudio.setDsp({ distortion: val });
            return;
        }
        if (val <= 0) {
            distPreGain.gain.setValueAtTime(1, audioContext.currentTime);
            distortionNode.curve = null;
            distortionNode.oversample = "none";
            distortionGain.gain.setValueAtTime(1, audioContext.currentTime);
        } else {
            if (!cachedClipCurve) cachedClipCurve = makeHardClipCurve();
            const drive = 1 + Math.pow(val / 100, 1.3) * 24;
            const comp = 1 / (1 + Math.pow(val / 100, 0.8) * 1.1);
            distPreGain.gain.setValueAtTime(drive, audioContext.currentTime);
            distortionNode.curve = cachedClipCurve;
            distortionNode.oversample = "2x";
            distortionGain.gain.setValueAtTime(comp, audioContext.currentTime);
        }
    }

    function updateDistortion(value) {
        const val = Math.min(100, Math.max(0, Number(value) || 0));
        applyDistortionDSP(val);
        distortionSlider.value = val;
        distortionInput.value = val;
        onSettingsChange();
    }

    function bindControlPair(slider, input, defaultVal, handler) {
        slider.addEventListener("input", (e) => handler(e.target.value));
        input.addEventListener("change", (e) => handler(e.target.value));
        slider.addEventListener("dblclick", () => handler(defaultVal));
        input.addEventListener("dblclick", () => handler(defaultVal));
        slider.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();
                const step = e.shiftKey ? 5 : 1;
                const delta = e.deltaY < 0 ? step : -step;
                handler(Number(slider.value) + delta);
            },
            { passive: false },
        );
    }

    bindControlPair(trackVolumeSlider, trackVolumeInput, 100, updateVolume);
    bindControlPair(speedSlider, speedInput, 100, updateSpeed);
    bindControlPair(distortionSlider, distortionInput, 0, updateDistortion);

    let savedWebTracks = [];

    async function initWebTracks() {
        savedWebTracks = await window.electronAPI.getSavedWebTracks();
        renderWebTracksGroup();
    }
    initWebTracks();

    addUrlBtn.addEventListener("click", () => {
        urlModal.classList.remove("hidden");
        webUrlInput.focus();
    });
    closeUrlModal.addEventListener("click", () =>
        urlModal.classList.add("hidden"),
    );

    urlSubmitBtn.addEventListener("click", async () => {
        const input = webUrlInput.value.trim();
        if (!input) return;

        urlStatusText.textContent = "Resolving & downloading stream...";
        urlStatusText.className = "rpc-status-container status-connecting";

        const result = await window.electronAPI.resolveWebTrack(input);
        if (!result.success) {
            urlStatusText.textContent = "Error: " + result.error;
            urlStatusText.className =
                "rpc-status-container status-disconnected";
            return;
        }

        const existingIndex = savedWebTracks.findIndex(
            (t) => t.url === result.url,
        );
        const trackObj = {
            id: result.trackId,
            url: result.url,
            name: result.title,
            artist: result.artist,
            picture: result.picture,
        };

        if (existingIndex > -1) savedWebTracks[existingIndex] = trackObj;
        else savedWebTracks.unshift(trackObj);

        window.electronAPI.saveWebTracks(savedWebTracks);
        renderWebTracksGroup();

        urlModal.classList.add("hidden");
        webUrlInput.value = "";
        urlStatusText.textContent = "";

        playWebTrackBuffer(result, trackObj);
    });

    function renderWebTracksGroup() {
        if (!webTracksSection) return;
        if (savedWebTracks.length === 0) {
            webTracksSection.innerHTML = "";
            return;
        }

        webTracksSection.innerHTML = `
        <div class="folder-group open" id="web-folder-group">
            <h3>Online Streams (${savedWebTracks.length})</h3>
            <div class="folder-tracks">
                <div class="folder-tracks-inner" id="web-tracks-list"></div>
            </div>
        </div>
        `;

        webTracksSection.querySelector("h3").addEventListener("click", () => {
            document
                .getElementById("web-folder-group")
                .classList.toggle("open");
        });

        const listInner = webTracksSection.querySelector("#web-tracks-list");
        savedWebTracks.forEach((track, idx) => {
            const item = document.createElement("div");
            item.className = "track-item";
            item.dataset.webUrl = track.url;
            if (currentTrackPath === track.url) item.classList.add("playing");

            const nameSpan = document.createElement("span");
            nameSpan.className = "track-name";
            nameSpan.textContent = `${track.artist} - ${track.name}`;

            const delBtn = document.createElement("button");
            delBtn.className = "track-remove-btn";
            delBtn.textContent = "×";
            delBtn.title = "Remove";
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                savedWebTracks.splice(idx, 1);
                window.electronAPI.saveWebTracks(savedWebTracks);
                renderWebTracksGroup();
            });

            item.append(nameSpan, delBtn);
            item.addEventListener("click", async (e) => {
                e.stopPropagation();
                timeCurrentEl.textContent = "...";
                const res = await window.electronAPI.resolveWebTrack(track.url);
                if (res.success) playWebTrackBuffer(res, track, item);
            });
            listInner.appendChild(item);
        });
    }

    function displayTracks(folders) {
        androidQueueLoaded = false;
        const openFolders = new Set();
        document
            .querySelectorAll("#local-tracks-section .folder-group.open h3")
            .forEach((h3) => openFolders.add(h3.textContent));
        const playingPath = currentTrackPath;

        localTracksSection.innerHTML = "";
        if (!folders || folders.length === 0) return;

        folders.forEach((folderData) => {
            const folderGroup = document.createElement("div");
            folderGroup.className = "folder-group";
            const folderName = folderData.folder.split(/\\|\//).pop();
            const title = document.createElement("h3");
            title.textContent = `${folderName} (${folderData.tracks.length})`;
            if (openFolders.has(title.textContent))
                folderGroup.classList.add("open");
            title.addEventListener("click", () =>
                folderGroup.classList.toggle("open"),
            );

            const tracksUl = document.createElement("div");
            tracksUl.className = "folder-tracks";
            const tracksInner = document.createElement("div");
            tracksInner.className = "folder-tracks-inner";

            folderData.tracks.forEach((track) => {
                const item = document.createElement("div");
                item.className = "track-item";
                if (playingPath === track.path) item.classList.add("playing");

                item.dataset.path = track.path;
                const span = document.createElement("span");
                span.className = "track-name";
                span.textContent = track.name;
                item.appendChild(span);

                item.addEventListener("click", (e) => {
                    e.stopPropagation();
                    loadAndPlayTrack(track.path, item);
                });
                tracksInner.appendChild(item);
            });

            tracksUl.appendChild(tracksInner);
            folderGroup.append(title, tracksUl);
            localTracksSection.appendChild(folderGroup);
        });

        if (searchInput.value) searchInput.dispatchEvent(new Event("input"));
    }

    jumpPlayingBtn.addEventListener("click", () => {
        const active = document.querySelector(".track-item.playing");
        if (!active) return;
        const group = active.closest(".folder-group");
        if (group) group.classList.add("open");
        active.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll(".track-item").forEach((track) => {
            const name = track
                .querySelector(".track-name")
                .textContent.toLowerCase();
            track.style.display = name.includes(query) ? "flex" : "none";
        });
        document.querySelectorAll(".folder-group").forEach((group) => {
            const visible = group.querySelectorAll(
                '.track-item[style="display: flex;"]',
            );
            if (visible.length > 0 && query.length > 0)
                group.classList.add("open");
        });
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const val = searchInput.value.trim();
            if (val.startsWith("http://") || val.startsWith("https://")) {
                webUrlInput.value = val;
                urlSubmitBtn.click();
                searchInput.value = "";
            }
        }
    });

    let dragCounter = 0;
    window.addEventListener("dragenter", (e) => {
        e.preventDefault();
        dragCounter++;
        dropOverlay.classList.remove("hidden");
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("dragleave", () => {
        dragCounter = Math.max(0, dragCounter - 1);
        if (dragCounter === 0) dropOverlay.classList.add("hidden");
    });
    window.addEventListener("drop", (e) => {
        e.preventDefault();
        dragCounter = 0;
        dropOverlay.classList.add("hidden");
        const files = Array.from(e.dataTransfer.files || []);
        const paths = files
            .map((f) => window.electronAPI.getPathForFile(f))
            .filter(Boolean);
        if (paths.length > 0) window.electronAPI.scanDroppedPaths(paths);
    });

    function shouldRenderNow() {
        if (!isPlaying || !hasActiveTrack() || document.hidden) return false;
        if (prefs.pauseOnBlur && !document.hasFocus()) return false;
        return true;
    }

    function resumeRenderIfReady() {
        if (shouldRenderNow()) {
            lastFrameTime = 0;
            updateSimpleUI(true);
            renderWaveform(true);
            startRenderLoop();
        }
    }

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopRenderLoop();
        else resumeRenderIfReady();
    });

    window.addEventListener("blur", () => {
        if (prefs.pauseOnBlur) stopRenderLoop();
    });
    window.addEventListener("focus", resumeRenderIfReady);

    function startRenderLoop() {
        if (!animationFrameId && shouldRenderNow()) {
            lastFrameTime = 0;
            animationFrameId = requestAnimationFrame(render);
        }
    }

    function stopRenderLoop() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    function drawSpectrogram() {
        if (
            !spectrogramCanvas ||
            prefs.lowGfx ||
            !prefs.showSpec ||
            specCanvasW === 0 ||
            specCanvasH === 0
        )
            return;

        if (!isPlaying) {
            if (!specCleared) {
                spectrogramCtx.clearRect(0, 0, specCanvasW, specCanvasH);
                specCleared = true;
            }
            return;
        }

        analyser.getByteFrequencyData(dataArray);
        const bufferLength = analyser.frequencyBinCount;
        let hasSignal = false;
        for (let i = 0; i < bufferLength; i++) {
            if (dataArray[i] > 2) {
                hasSignal = true;
                break;
            }
        }

        if (!hasSignal) {
            if (!specCleared) {
                spectrogramCtx.clearRect(0, 0, specCanvasW, specCanvasH);
                specCleared = true;
            }
            return;
        }

        specCleared = false;
        spectrogramCtx.clearRect(0, 0, specCanvasW, specCanvasH);
        if (!cachedSpecGrad) rebuildCanvasGradients();
        spectrogramCtx.fillStyle = cachedSpecGrad;

        const barWidth = (specCanvasW / bufferLength) * 2.5;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
            const val = dataArray[i];
            if (val > 2) {
                const norm = val / 255;
                const barHeight = norm * (specCanvasH * 0.45);
                spectrogramCtx.globalAlpha = norm * 0.6;
                spectrogramCtx.fillRect(
                    x,
                    specCanvasH - barHeight,
                    barWidth - 1,
                    barHeight,
                );
            }
            x += barWidth;
            if (x > specCanvasW) break;
        }
        spectrogramCtx.globalAlpha = 1.0;
    }

    function render(now) {
        if (!shouldRenderNow()) {
            animationFrameId = null;
            return;
        }

        animationFrameId = requestAnimationFrame(render);

        if (frameIntervalMs > 0 && now - lastFrameTime < frameIntervalMs)
            return;
        lastFrameTime = now;
        if (isAndroid && ZenithAudio && !isPollingAndroid) {
            isPollingAndroid = true;
            const needsSpec =
                (prefs.showSpec && !prefs.lowGfx) ||
                (prefs.showWave && prefs.visMode !== "wave");
            ZenithAudio.getPlaybackState({ withSpectrum: needsSpec })
                .then((st) => {
                    if (st) {
                        androidCurrentTime = st.currentTime || 0;
                        if (st.duration > 0) androidDuration = st.duration;
                        if (st.spectrum && Array.isArray(st.spectrum)) {
                            for (
                                let i = 0;
                                i < Math.min(48, st.spectrum.length);
                                i++
                            ) {
                                dataArray[i] = st.spectrum[i];
                            }
                        }
                    }
                })
                .finally(() => {
                    isPollingAndroid = false;
                });
        }

        updateSimpleUI(false);
        if (prefs.showWave) {
            renderWaveform(prefs.visMode !== "wave");
        }
        if (!prefs.lowGfx && prefs.showSpec) {
            drawSpectrogram();
        }
    }

    function updateSimpleUI(force = false) {
        if (isDraggingSlider || !hasActiveTrack()) return;

        const dur = getTrackDuration();
        const currentTime = getCurrentTime();
        const sec = Math.floor(currentTime);
        const durSec = Math.floor(dur);

        if (force || sec !== lastDisplayedSec || durSec !== lastDurationSec) {
            lastDisplayedSec = sec;
            lastDurationSec = durSec;
            timeCurrentEl.textContent = formatTime(currentTime);
            timeTotalEl.textContent = dur > 0 ? formatTime(dur) : "--:--";
        }

        if (dur > 0) {
            const progress = Math.round((currentTime / dur) * 1000);
            if (force || progress !== lastSliderVal) {
                lastSliderVal = progress;
                progressSlider.value = progress;
            }
        }
    }

    function formatTime(sec) {
        const m = Math.floor(sec / 60) || 0;
        const s = Math.floor(sec % 60) || 0;
        return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    function updateUIState() {
        playPauseBtn.classList.toggle("is-playing", isPlaying);
        document.body.classList.toggle("is-playing", isPlaying);
    }

    function generateWaveformPeaks(buffer) {
        if (!buffer) return [];
        const channelData = buffer.getChannelData(0);
        const totalBars = 140;
        const step = Math.floor(channelData.length / totalBars);
        const peaks = [];
        for (let i = 0; i < totalBars; i++) {
            let max = 0;
            const start = i * step;
            for (let j = 0; j < step; j += 10) {
                const val = Math.abs(channelData[start + j] || 0);
                if (val > max) max = val;
            }
            peaks.push(Math.max(0.08, max));
        }
        return peaks;
    }

    function drawWaveform(buffer) {
        if (!buffer) return;
        waveformPeaks = generateWaveformPeaks(buffer);
        lastWaveProgressX = -1;
        renderWaveform(true);
    }

    function renderWaveform(force = false) {
        if (waveCanvasW === 0 || waveCanvasH === 0 || !prefs.showWave) return;

        const dur = getTrackDuration();
        const progress = dur > 0 ? getCurrentTime() / dur : 0;
        const progressX = progress * waveCanvasW;

        if (
            !force &&
            prefs.visMode === "wave" &&
            Math.abs(progressX - lastWaveProgressX) < 0.5
        )
            return;
        lastWaveProgressX = progressX;

        const dpr = window.devicePixelRatio || 1;
        waveformCtx.save();
        waveformCtx.scale(dpr, dpr);
        waveformCtx.clearRect(0, 0, waveCanvasW, waveCanvasH);

        if (!cachedWaveBarGrad) rebuildCanvasGradients();

        if (
            prefs.visMode !== "spec" &&
            waveformPeaks &&
            waveformPeaks.length > 0
        ) {
            const totalBars = waveformPeaks.length;
            const gap = 2;
            const barWidth = Math.max(
                1,
                (waveCanvasW - (totalBars - 1) * gap) / totalBars,
            );
            const dimFactor = prefs.visMode === "dual" ? 0.45 : 1;

            for (let i = 0; i < totalBars; i++) {
                const x = i * (barWidth + gap);
                const barH = waveformPeaks[i] * (waveCanvasH - 6);
                const y = (waveCanvasH - barH) / 2;

                if (x + barWidth <= progressX) {
                    waveformCtx.fillStyle = cachedWaveBarGrad;
                    waveformCtx.globalAlpha = 0.9 * dimFactor;
                    waveformCtx.fillRect(x, y, barWidth, barH);
                } else if (x < progressX) {
                    const playedPart = progressX - x;
                    waveformCtx.fillStyle = cachedWaveBarGrad;
                    waveformCtx.globalAlpha = 0.9 * dimFactor;
                    waveformCtx.fillRect(x, y, playedPart, barH);

                    waveformCtx.fillStyle = "rgba(255, 255, 255, 0.2)";
                    waveformCtx.globalAlpha = 0.4 * dimFactor;
                    waveformCtx.fillRect(
                        progressX,
                        y,
                        barWidth - playedPart,
                        barH,
                    );
                } else {
                    waveformCtx.fillStyle = "rgba(255, 255, 255, 0.2)";
                    waveformCtx.globalAlpha = 0.35 * dimFactor;
                    waveformCtx.fillRect(x, y, barWidth, barH);
                }
            }
        }

        if (prefs.visMode !== "wave" && isPlaying) {
            analyser.getByteFrequencyData(dataArray);
            const bins = 48;
            const stepW = waveCanvasW / bins;
            waveformCtx.fillStyle = cachedWaveBarGrad;
            for (let i = 0; i < bins; i++) {
                const norm = dataArray[i] / 255;
                if (norm > 0.02) {
                    const h = norm * (waveCanvasH - 2);
                    waveformCtx.globalAlpha = 0.35 + norm * 0.6;
                    waveformCtx.fillRect(
                        i * stepW,
                        waveCanvasH - h,
                        Math.max(1, stepW - 2),
                        h,
                    );
                }
            }
        }

        if (dur > 0 && progressX > 0) {
            if (!prefs.lowGfx) {
                waveformCtx.fillStyle = cachedAccentSec;
                waveformCtx.globalAlpha = 0.35;
                waveformCtx.fillRect(progressX - 3, 0, 6, waveCanvasH);
            }
            waveformCtx.fillStyle = "#ffffff";
            waveformCtx.globalAlpha = 1.0;
            waveformCtx.fillRect(progressX - 1, 0, 2, waveCanvasH);

            waveformCtx.fillStyle = cachedAccent;
            waveformCtx.fillRect(progressX - 2, (waveCanvasH - 12) / 2, 4, 12);
        }

        waveformCtx.restore();
    }

    const themes = [
        "main.css",
        "studio-pro.css",
        "terminal.css",
        "hyprland.css",
        "winamp.css",
        "winxp.css",
        "frutigeraero.css",
        "y2k-futurism.css",
        "braun.css",
        "lofi.css",
    ];

    const themeNames = {
        "main.css": "Default",
        "studio-pro.css": "Studio Pro",
        "terminal.css": "Terminal",
        "hyprland.css": "Hyprland",
        "winamp.css": "Winamp",
        "winxp.css": "Windows XP",
        "frutigeraero.css": "Frutiger Aero",
        "y2k-futurism.css": "Y2K Chrome",
        "braun.css": "Braun OP-1",
        "lofi.css": "Analog Lofi",
    };

    const themeLink = document.getElementById("theme-link");
    const themeSwitcherBtn = document.getElementById("theme-switcher");

    function formatThemeName(file) {
        return themeNames[file] || file.replace(".css", "").replace(/-/g, " ");
    }

    function renderThemeGrid(activeIndex) {
        if (!themeGrid) return;
        themeGrid.innerHTML = "";
        themes.forEach((t, idx) => {
            const btn = document.createElement("button");
            btn.className =
                "theme-chip" + (idx === activeIndex ? " active" : "");
            btn.textContent = formatThemeName(t);
            btn.addEventListener("click", () => {
                localStorage.setItem("themeIndex", idx);
                applyTheme(t);
                renderThemeGrid(idx);
            });
            themeGrid.appendChild(btn);
        });
    }

    function applyTheme(themeName) {
        if (themeName === "main.css") {
            themeLink.removeAttribute("href");
        } else {
            themeLink.setAttribute("href", `styles/themes/${themeName}`);
        }
        if (window.ThemeFX) window.ThemeFX.applyThemeFX(themeName);
        setTimeout(() => {
            updateThemeCache();
            if (hasActiveTrack()) renderWaveform(true);
        }, 80);
    }

    function switchTheme() {
        let idx = Number(localStorage.getItem("themeIndex") || 0);
        idx = (idx + 1) % themes.length;
        localStorage.setItem("themeIndex", idx);
        applyTheme(themes[idx]);
        renderThemeGrid(idx);
    }

    const savedThemeIndex = Number(localStorage.getItem("themeIndex") || 0);
    const validThemeIndex =
        savedThemeIndex >= 0 && savedThemeIndex < themes.length
            ? savedThemeIndex
            : 0;
    applyTheme(themes[validThemeIndex]);
    renderThemeGrid(validThemeIndex);

    function openSettingsTab(tabId) {
        document.querySelectorAll(".settings-tab").forEach((t) => {
            t.classList.toggle("active", t.dataset.tab === tabId);
        });
        document.querySelectorAll(".settings-panel").forEach((p) => {
            p.classList.toggle("active", p.id === tabId);
        });
        settingsModal.classList.remove("hidden");
    }

    settingsBtn.addEventListener("click", () =>
        openSettingsTab("tab-components"),
    );
    closeSettingsModal.addEventListener("click", () =>
        settingsModal.classList.add("hidden"),
    );
    themeSwitcherBtn.addEventListener("click", () =>
        openSettingsTab("tab-themes"),
    );
    themeSwitcherBtn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        switchTheme();
    });

    document.querySelectorAll(".settings-tab").forEach((tab) => {
        tab.addEventListener("click", () => openSettingsTab(tab.dataset.tab));
    });

    function applyPreferencesToUI() {
        eqWrapper.classList.toggle("component-hidden", !prefs.showEq);
        eqWrapper.classList.toggle("collapsed", prefs.eqCollapsed);
        if (dspToggleBtn) {
            dspToggleBtn.classList.toggle(
                "active",
                prefs.showEq && !prefs.eqCollapsed,
            );
            dspToggleBtn.classList.toggle("component-hidden", !prefs.showEq);
        }
        eqBypassBtn.textContent = prefs.eqEnabled ? "EQ ON" : "EQ OFF";
        eqBypassBtn.classList.toggle("active", prefs.eqEnabled);

        progressView.classList.toggle("component-hidden", !prefs.showWave);
        spectrogramCanvas.classList.toggle("component-hidden", !prefs.showSpec);
        artworkGlowEl.classList.toggle("component-hidden", !prefs.showGlow);
        sidebar.classList.toggle("component-hidden", !prefs.showSidebar);
        resizer.classList.toggle("component-hidden", !prefs.showSidebar);
        if (sidebarToggleBtn) {
            sidebarToggleBtn.classList.toggle("active", prefs.showSidebar);
        }
        if (prefs.sidebarWidth >= 220 && prefs.sidebarWidth <= 540) {
            sidebar.style.width = `${prefs.sidebarWidth}px`;
        }

        document.body.classList.toggle("low-gfx", prefs.lowGfx);
        optimizeBtn.textContent = prefs.lowGfx ? "GFX: OFF" : "GFX: ON";
        optimizeBtn.classList.toggle("optimized", prefs.lowGfx);

        if (themePerfGuardEl) themePerfGuardEl.disabled = !prefs.perfGuard;
        if (window.ThemeFX)
            window.ThemeFX.setEnabled(!prefs.lowGfx && prefs.showFx);

        if (prefs.lowGfx || !prefs.showSpec) {
            spectrogramCtx.clearRect(0, 0, specCanvasW, specCanvasH);
            specCleared = true;
        }

        document.getElementById("set-show-eq").checked = prefs.showEq;
        document.getElementById("set-show-wave").checked = prefs.showWave;
        document.getElementById("set-show-spec").checked = prefs.showSpec;
        document.getElementById("set-show-glow").checked = prefs.showGlow;
        document.getElementById("set-show-fx").checked = prefs.showFx;
        document.getElementById("set-show-sidebar").checked = prefs.showSidebar;
        document.getElementById("set-mini-ontop").checked = prefs.miniOnTop;
        document.getElementById("set-fps-mode").value = prefs.fpsMode;
        document.getElementById("set-spec-scale").value = String(
            prefs.specScale,
        );
        document.getElementById("set-pause-blur").checked = prefs.pauseOnBlur;
        document.getElementById("set-low-gfx").checked = prefs.lowGfx;
        document.getElementById("set-perf-guard").checked = prefs.perfGuard;
        document.getElementById("set-audio-mode").value = prefs.audioMode;
        document.getElementById("set-preserve-pitch").checked =
            prefs.preservePitch;
        document.getElementById("set-global-dsp").checked = prefs.globalDsp;
        document.getElementById("set-fade-ms").value = String(prefs.fadeMs);

        streamAudioEl.preservesPitch = !!prefs.preservePitch;
        applyFpsLimit();
        updateHeroDspBadge();
    }

    function bindPrefCheckbox(id, key, afterFn) {
        document.getElementById(id).addEventListener("change", (e) => {
            prefs[key] = e.target.checked;
            savePrefs();
            applyPreferencesToUI();
            if (afterFn) afterFn();
        });
    }

    function bindPrefSelect(id, key, isNum, afterFn) {
        document.getElementById(id).addEventListener("change", (e) => {
            prefs[key] = isNum ? Number(e.target.value) : e.target.value;
            savePrefs();
            applyPreferencesToUI();
            if (afterFn) afterFn();
        });
    }

    bindPrefCheckbox("set-show-eq", "showEq");
    bindPrefCheckbox("set-show-wave", "showWave", () => {
        updateCanvasSizeCache();
        if (hasActiveTrack()) renderWaveform(true);
    });
    bindPrefCheckbox("set-show-spec", "showSpec");
    bindPrefCheckbox("set-show-glow", "showGlow");
    bindPrefCheckbox("set-show-fx", "showFx");
    bindPrefCheckbox("set-show-sidebar", "showSidebar", () => {
        updateCanvasSizeCache();
        if (hasActiveTrack()) renderWaveform(true);
    });
    bindPrefCheckbox("set-mini-ontop", "miniOnTop", () => {
        if (isMiniMode) window.electronAPI.setMiniMode(true, prefs.miniOnTop);
    });

    bindPrefSelect("set-fps-mode", "fpsMode", false);
    bindPrefSelect("set-spec-scale", "specScale", true, updateCanvasSizeCache);
    bindPrefCheckbox("set-pause-blur", "pauseOnBlur");
    bindPrefCheckbox("set-low-gfx", "lowGfx", () => {
        if (hasActiveTrack()) renderWaveform(true);
    });
    bindPrefCheckbox("set-perf-guard", "perfGuard");
    bindPrefSelect("set-audio-mode", "audioMode", false);
    bindPrefCheckbox("set-preserve-pitch", "preservePitch", () => {
        if (isAndroid && ZenithAudio) {
            ZenithAudio.setPlaybackParams({
                speed: Number(speedSlider.value) / 100,
                preservePitch: !!prefs.preservePitch,
            });
        }
    });
    bindPrefCheckbox("set-global-dsp", "globalDsp");
    bindPrefSelect("set-fade-ms", "fadeMs", true);

    optimizeBtn.addEventListener("click", () => {
        prefs.lowGfx = !prefs.lowGfx;
        savePrefs();
        applyPreferencesToUI();
        if (hasActiveTrack()) renderWaveform(true);
    });

    const rpcModal = document.getElementById("rpc-modal");
    const rpcBtn = document.getElementById("discord-rpc-btn");
    const closeRpcBtn = document.getElementById("close-rpc-modal");
    const rpcClientIdInput = document.getElementById("rpc-client-id");
    const rpcConnectBtn = document.getElementById("rpc-connect-btn");
    const rpcDisconnectBtn = document.getElementById("rpc-disconnect-btn");
    const rpcStatusText = document.getElementById("rpc-status-text");

    rpcClientIdInput.value = localStorage.getItem("discord_client_id") || "";
    rpcBtn.addEventListener("click", () => rpcModal.classList.remove("hidden"));
    closeRpcBtn.addEventListener("click", () =>
        rpcModal.classList.add("hidden"),
    );

    rpcConnectBtn.addEventListener("click", async () => {
        const clientId = rpcClientIdInput.value.trim();
        if (!clientId) return;
        localStorage.setItem("discord_client_id", clientId);
        rpcStatusText.textContent = "Connecting...";
        rpcStatusText.className = "status-connecting";

        const res = await window.electronAPI.initDiscordRPC(clientId);
        if (res.success) {
            rpcStatusText.textContent = "Connected";
            rpcStatusText.className = "status-connected";
            rpcBtn.classList.add("saved");
        } else {
            rpcStatusText.textContent = "Error: " + (res.error || "Failed");
            rpcStatusText.className = "status-disconnected";
        }
    });

    rpcDisconnectBtn.addEventListener("click", () => {
        window.electronAPI.clearDiscordRPC();
        rpcStatusText.textContent = "Disconnected";
        rpcStatusText.className = "status-disconnected";
        rpcBtn.classList.remove("saved");
    });

    let isResizing = false;
    resizer.addEventListener("mousedown", () => {
        isResizing = true;
        resizer.classList.add("resizing");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    });
    window.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth >= 220 && newWidth <= 540) {
            sidebar.style.width = `${newWidth}px`;
            prefs.sidebarWidth = newWidth;
            updateCanvasSizeCache();
            if (hasActiveTrack()) renderWaveform(true);
        }
    });
    window.addEventListener("mouseup", () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove("resizing");
            document.body.style.cursor = "default";
            document.body.style.userSelect = "auto";
            savePrefs();
            updateCanvasSizeCache();
            if (hasActiveTrack()) renderWaveform(true);
        }
    });

    (async () => {
        const savedId = localStorage.getItem("discord_client_id");
        if (savedId) {
            const res = await window.electronAPI.initDiscordRPC(savedId);
            if (res.success) {
                rpcStatusText.textContent = "Connected";
                rpcStatusText.className = "status-connected";
                rpcBtn.classList.add("saved");
                const quick = document.getElementById("rpc-quick-status");
                if (quick) quick.textContent = "RPC: ON";
            }
        }
    })();

    selectFolderBtn.addEventListener("click", () =>
        window.electronAPI.selectFolder(true),
    );
    window.electronAPI.onReceiveTracks(displayTracks);

    window.addEventListener("resize", () => {
        updateCanvasSizeCache();
        if (hasActiveTrack()) renderWaveform(true);
    });

    if (isAndroid && ZenithAudio) {
        selectFolderBtn.textContent = "Scan";
        if (miniModeBtn) miniModeBtn.style.display = "none";
        document.getElementById("win-min").style.display = "none";
        document.getElementById("win-max").style.display = "none";
        document.getElementById("win-close").style.display = "none";

        ZenithAudio.addListener("trackChanged", async ({ uri }) => {
            if (!uri || uri === currentTrackPath) return;
            currentTrackPath = uri;
            if (currentPlayingElement)
                currentPlayingElement.classList.remove("playing");
            const el = Array.from(
                document.querySelectorAll(".track-item"),
            ).find((t) => t.dataset.path === uri);
            if (el) {
                currentPlayingElement = el;
                el.classList.add("playing");
            }
            const meta = await window.electronAPI.getTrackMetadata(uri);
            currentMetadata = meta;
            androidDuration = meta.duration || 0;
            androidCurrentTime = 0;
            waveformPeaks = generatePseudoPeaks(uri);
            lastWaveProgressX = -1;
            syncTrackDisplay(
                meta.title || "Zenith Track",
                meta.artist || "Android Library",
                meta.picture,
            );
            if (!prefs.globalDsp) {
                const s = await window.electronAPI.getTrackSettings(uri);
                applySettings(s);
            }
            updateSimpleUI(true);
            renderWaveform(true);
        });

        ZenithAudio.addListener(
            "playbackStateChanged",
            ({ isPlaying: playing }) => {
                isPlaying = !!playing;
                if (window.ThemeFX) window.ThemeFX.setPlayingState(isPlaying);
                updateUIState();
                if (isPlaying) startRenderLoop();
                else {
                    stopRenderLoop();
                    updateSimpleUI(true);
                    renderWaveform(true);
                }
            },
        );
    }

    applyPreferencesToUI();
    updateThemeCache();
    updateCanvasSizeCache();
    detectMonitorHz();
});
