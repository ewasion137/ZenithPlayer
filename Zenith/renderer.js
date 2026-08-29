// if you see this, you're prob the only one
// hi
// fuck you
// lmao
// ai code, i dont even complain
// it works, IT WORKS EVEN ON LINUX!

// Im sorry but id like to interject, but the thing you are refering to as 'Linux' is actually GNU slash Linux...
// ok ill stfu

document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('app-loading');
    setTimeout(() => {
        document.body.classList.remove('app-loading');
    }, 1000);

    // --- Audio Context ---
    const audioContext = new AudioContext();
    const masterGain = audioContext.createGain();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const eqFrequencies = [60, 170, 350, 1000, 3500, 10000, 14000];
    const eqFilters = eqFrequencies.map(freq => {
        const filter = audioContext.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.41;
        filter.gain.value = 0;
        return filter;
    });

    eqFilters.reduce((prev, curr) => (prev.connect(curr), curr), masterGain)
        .connect(analyser)
        .connect(audioContext.destination);

    // --- State ---
    let currentSource = null;
    let currentTrackBuffer = null;
    let currentPlayingElement = null;
    let isPlaying = false;

    let pauseTimeSec = 0;
    let playbackStartSec = 0;
    let playbackStartedAtCtx = 0;
    let animationFrameId = null;
    let isDraggingSlider = false;
    let currentTrackPath = null;
    let isApplyingSettings = false;
    let visualsEnabled = true;
    let currentMetadata = { title: null, artist: null, album: null };
    let waveformPeaks = [];

    // Кэш цветов и размеров для исключения Layout Thrashing
    let cachedAccent = '#8b5cf6';
    let cachedAccentSec = '#0ea5e9';
    let waveCanvasW = 0;
    let waveCanvasH = 0;
    let specCanvasW = 0;
    let specCanvasH = 0;

    // --- DOM Elements ---
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const addUrlBtn = document.getElementById('add-url-btn');
    const urlModal = document.getElementById('url-modal');
    const closeUrlModal = document.getElementById('close-url-modal');
    const webUrlInput = document.getElementById('web-url-input');
    const urlSubmitBtn = document.getElementById('url-submit-btn');
    const urlStatusText = document.getElementById('url-status-text');

    const trackVolumeSlider = document.getElementById('track-volume-slider');
    const trackVolumeValue = document.getElementById('track-volume-value');
    const speedSlider = document.getElementById('speed-slider');
    const trackVolumeInput = document.getElementById('track-volume-input');
    const speedInput = document.getElementById('speed-input');
    const speedValue = document.getElementById('speed-value');
    const progressSlider = document.getElementById('progress-slider');
    const timeDisplay = document.getElementById('time-display');
    const searchInput = document.getElementById('search-input');
    const currentTrackNameLabel = document.getElementById('current-track-name');
    const currentTrackFolderLabel = document.getElementById('current-track-folder');
    const currentTrackArtwork = document.getElementById('current-track-artwork');
    const webTracksSection = document.getElementById('web-tracks-section');
    const localTracksSection = document.getElementById('local-tracks-section');
    const selectFolderBtn = document.getElementById('select-folder-btn');
    const waveformCanvas = document.getElementById('waveform-canvas');
    const waveformCtx = waveformCanvas.getContext('2d');
    const optimizeBtn = document.getElementById('optimize-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const resetSettingsBtn = document.getElementById('reset-settings-btn');

    const spectrogramCanvas = document.getElementById('spectrogram-canvas');
    const spectrogramCtx = spectrogramCanvas.getContext('2d');
    const eqContainer = document.querySelector('.eq-bands');

    function updateThemeCache() {
        const style = getComputedStyle(document.documentElement);
        cachedAccent = style.getPropertyValue('--accent').trim() || '#8b5cf6';
        cachedAccentSec = style.getPropertyValue('--accent-secondary').trim() || '#0ea5e9';
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
        if (spectrogramCanvas) {
            specCanvasW = window.innerWidth;
            specCanvasH = window.innerHeight;
            spectrogramCanvas.width = specCanvasW * dpr;
            spectrogramCanvas.height = specCanvasH * dpr;
        }
    }

    // --- EQ Generation ---
    eqFilters.forEach((filter, i) => {
        const bandEl = document.createElement('div');
        bandEl.className = 'eq-band';
        const label = document.createElement('label');
        const freq = eqFrequencies[i];
        label.textContent = freq >= 1000 ? `${freq / 1000}k` : freq;
        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = -12; slider.max = 12; slider.value = 0; slider.step = 0.1;
        const numInput = document.createElement('input');
        numInput.type = 'number'; numInput.min = -12; numInput.max = 12; numInput.value = 0; numInput.step = 0.1;

        const updateGain = (val) => {
            const num = Number(val);
            filter.gain.setValueAtTime(num, audioContext.currentTime);
            slider.value = num;
            numInput.value = num;
            if (!isApplyingSettings) onSettingsChange();
        };
        slider.addEventListener('input', (e) => updateGain(e.target.value));
        numInput.addEventListener('change', (e) => updateGain(e.target.value));
        bandEl.append(label, slider, numInput);
        eqContainer.appendChild(bandEl);
    });

    // --- Core Logic ---
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;

        if (e.code === 'Space') {
            e.preventDefault();
            if (!currentTrackBuffer) return;
            if (isPlaying) stopWithReturn();
            else play(pauseTimeSec);
        }

        if (e.ctrlKey && e.code === 'KeyT') {
            switchTheme();
        }
    });

    playPauseBtn.addEventListener('click', () => {
        if (!currentTrackBuffer) return;
        if (isPlaying) pause();
        else play(pauseTimeSec);
    });

    prevBtn.addEventListener('click', playPrevTrack);
    nextBtn.addEventListener('click', playNextTrack);

    const minBtn = document.getElementById('win-min');
    minBtn.addEventListener('click', () => window.electronAPI.minimize('taskbar'));
    minBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        window.electronAPI.minimize('tray');
    });

    document.getElementById('win-max').addEventListener('click', () => {
        document.body.classList.add('hypr-pop');
        window.electronAPI.maximize();
        setTimeout(() => document.body.classList.remove('hypr-pop'), 800);
    });
    document.getElementById('win-close').addEventListener('click', () => window.electronAPI.close());

    window.electronAPI.onGlobalCommand((cmd) => {
        if (cmd === 'play-pause') {
            const btn = document.getElementById('play-pause-btn');
            if (btn) btn.click();
        } else if (cmd === 'next') {
            playNextTrack();
        } else if (cmd === 'prev') {
            playPrevTrack();
        }
    });

    function play(offsetSeconds) {
        if (!currentTrackBuffer) return;
        if (currentSource) currentSource.stop();

        playbackStartSec = offsetSeconds;

        currentSource = audioContext.createBufferSource();
        currentSource.buffer = currentTrackBuffer;
        currentSource.playbackRate.value = Number(speedSlider.value) / 100;
        currentSource.connect(masterGain);

        let naturalEnd = true;
        currentSource.stop = ((stop) => function (...args) {
            naturalEnd = false;
            stop.apply(this, args);
        })(currentSource.stop);

        currentSource.start(0, offsetSeconds);

        isPlaying = true;
        playbackStartedAtCtx = audioContext.currentTime - offsetSeconds / currentSource.playbackRate.value;

        currentSource.onended = () => {
            if (naturalEnd && isPlaying) {
                isPlaying = false;
                updateUIState();
                setTimeout(playNextTrack, 100);
            }
        };

        const remainingSec = (currentTrackBuffer.duration - offsetSeconds) / (Number(speedSlider.value) / 100);
        const now = Date.now();
        window.electronAPI.updateDiscordRPC({
            title: currentMetadata.title || currentTrackNameLabel.textContent,
            artist: currentMetadata.artist || '',
            album: currentMetadata.album || '',
            picture: currentMetadata.picture || null,
            status: 'playing',
            startTimestamp: Math.floor(now - (offsetSeconds * 1000)),
            endTimestamp: Math.floor(now + (remainingSec * 1000))
        });

        updateUIState();
        startRenderLoop();
    }

    function pause() {
        if (!currentSource || !isPlaying) return;
        pauseTimeSec = getCurrentTime();
        window.electronAPI.updateDiscordRPC({
            title: currentMetadata.title || currentTrackNameLabel.textContent,
            artist: currentMetadata.artist || '',
            album: currentMetadata.album || '',
            picture: currentMetadata.picture || null,
            status: 'paused'
        });
        stopSource();
        updateUIState();
        updateSimpleUI();
        renderWaveform();
    }

    function stopWithReturn() {
        if (!currentSource || !isPlaying) return;
        stopSource();
        pauseTimeSec = playbackStartSec;

        updateUIState();
        updateSimpleUI();
        renderWaveform();
    }

    function stopSource() {
        if (currentSource) {
            try { currentSource.stop(); } catch (e) { }
            currentSource = null;
        }
        isPlaying = false;
        stopRenderLoop();
    }

    async function loadAndPlayTrack(trackPath, trackElement) {
        if (isPlaying) fadeOutAndStop();
        else stopSource();

        if (currentPlayingElement) currentPlayingElement.classList.remove('playing');

        currentTrackPath = trackPath;
        currentPlayingElement = trackElement;
        currentTrackBuffer = null;
        isPlaying = false;
        timeDisplay.innerHTML = '<span>Loading...</span>';

        const meta = await window.electronAPI.getTrackMetadata(trackPath);
        currentMetadata = meta;

        const rawFileName = trackElement.querySelector('.track-name').textContent;
        currentTrackNameLabel.textContent = meta.title || rawFileName;

        const folderNode = trackElement.closest('.folder-group');
        const folderName = folderNode ? folderNode.querySelector('h3').textContent : 'Unknown';
        if (meta.artist) {
            currentTrackFolderLabel.textContent = meta.album ? `${meta.artist} • ${meta.album}` : meta.artist;
        } else {
            currentTrackFolderLabel.textContent = folderName;
        }

        const glowEl = document.querySelector('.artwork-glow');
        if (meta.picture) {
            if (currentTrackArtwork) currentTrackArtwork.src = meta.picture;
            glowEl.style.backgroundImage = `url("${meta.picture}")`;
            glowEl.style.opacity = '0.4';
        } else {
            if (currentTrackArtwork) currentTrackArtwork.src = 'icon.png';
            glowEl.style.backgroundImage = '';
            glowEl.style.opacity = '0.1';
        }

        const savedSettings = await window.electronAPI.getTrackSettings(trackPath);
        applySettings(savedSettings);

        try {
            const rawData = await window.electronAPI.getAudioData(trackPath);
            if (currentTrackPath !== trackPath) return;
            if (!rawData) throw new Error("Failed to get audio data");

            const audioBuffer = await audioContext.decodeAudioData(rawData.buffer);
            if (currentTrackPath !== trackPath) return;

            currentTrackBuffer = audioBuffer;
            drawWaveform(audioBuffer);

            pauseTimeSec = 0;
            playbackStartSec = 0;
            progressSlider.value = 0;

            trackElement.classList.add('playing');
            play(0);
        } catch (err) {
            console.error("Playback error:", err);
            timeDisplay.innerHTML = '<span>Error</span>';
        }
    }

    function fadeOutAndStop() {
        if (!currentSource) return;
        const oldSource = currentSource;
        const oldGain = audioContext.createGain();
        oldGain.connect(masterGain);
        oldSource.disconnect();
        oldSource.connect(oldGain);
        const fadeTime = 1.0;
        oldGain.gain.setValueAtTime(oldGain.gain.value, audioContext.currentTime);
        oldGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + fadeTime);
        setTimeout(() => {
            try { oldSource.stop(); } catch (e) { }
            oldSource.disconnect();
            oldGain.disconnect();
        }, fadeTime * 1000);
        currentSource = null;
        isPlaying = false;
        stopRenderLoop();
    }

    function getVisibleTracks() {
        return Array.from(document.querySelectorAll('.track-item'))
            .filter(t => t.style.display !== 'none');
    }

    function playNextTrack() {
        const tracks = getVisibleTracks();
        const currentIndex = tracks.findIndex(t => t.dataset.path === currentTrackPath);
        if (currentIndex > -1 && currentIndex < tracks.length - 1) {
            const nextTrackElement = tracks[currentIndex + 1];
            loadAndPlayTrack(nextTrackElement.dataset.path, nextTrackElement);
        }
    }

    function playPrevTrack() {
        if (getCurrentTime() > 3) {
            play(0);
            return;
        }
        const tracks = getVisibleTracks();
        const currentIndex = tracks.findIndex(t => t.dataset.path === currentTrackPath);
        if (currentIndex > 0) {
            const prevTrackElement = tracks[currentIndex - 1];
            loadAndPlayTrack(prevTrackElement.dataset.path, prevTrackElement);
        }
    }

    // --- Slider Events ---
    progressSlider.addEventListener('mousedown', () => isDraggingSlider = true);

    window.addEventListener('mouseup', () => {
        if (isDraggingSlider) {
            isDraggingSlider = false;
            if (currentTrackBuffer) {
                const time = (progressSlider.value / 1000) * currentTrackBuffer.duration;
                pauseTimeSec = time;
                playbackStartSec = time;
                if (isPlaying) play(time);
                else {
                    updateSimpleUI();
                    renderWaveform();
                }
            }
        }
    });

    progressSlider.addEventListener('input', e => {
        if (!currentTrackBuffer) return;
        const time = (e.target.value / 1000) * currentTrackBuffer.duration;
        timeDisplay.innerHTML = `<span>${formatTime(time)}</span><span>${formatTime(currentTrackBuffer.duration)}</span>`;
        progressSlider.style.setProperty('--value', (e.target.value / 10) + '%');
        renderWaveform();
    });

    // --- Settings & UI ---
    function onSettingsChange() {
        if (isApplyingSettings || !currentTrackPath) return;
        const eqValues = [];
        eqContainer.querySelectorAll('input[type="range"]').forEach(sl => eqValues.push(Number(sl.value)));

        window.electronAPI.saveTrackSettings({
            trackPath: currentTrackPath,
            settings: {
                volume: Number(trackVolumeSlider.value),
                speed: Number(speedSlider.value),
                eq: eqValues
            }
        });
    }

    saveSettingsBtn.addEventListener('click', () => {
        if (!currentTrackPath) return;
        onSettingsChange();
        saveSettingsBtn.classList.add('saved');
        saveSettingsBtn.textContent = 'Saved!';
        setTimeout(() => {
            saveSettingsBtn.classList.remove('saved');
            saveSettingsBtn.textContent = 'Save';
        }, 1500);
    });

    resetSettingsBtn.addEventListener('click', () => {
        if (!currentTrackPath) return;
        applySettings(null);
        onSettingsChange();
    });

    function applySettings(settings) {
        isApplyingSettings = true;
        const defaults = { volume: 100, speed: 100, eq: [0, 0, 0, 0, 0, 0, 0] };
        const final = { ...defaults, ...settings };

        trackVolumeSlider.value = final.volume;
        trackVolumeValue.textContent = `${final.volume}%`;
        masterGain.gain.setValueAtTime(final.volume / 100, audioContext.currentTime);

        speedSlider.value = final.speed;
        speedValue.textContent = `${final.speed}%`;
        if (currentSource) currentSource.playbackRate.value = final.speed / 100;

        const eqRanges = eqContainer.querySelectorAll('input[type="range"]');
        const eqNums = eqContainer.querySelectorAll('input[type="number"]');
        eqRanges.forEach((slider, i) => {
            slider.value = final.eq[i];
            eqNums[i].value = final.eq[i];
            eqFilters[i].gain.setValueAtTime(final.eq[i], audioContext.currentTime);
        });
        setTimeout(() => { isApplyingSettings = false; }, 50);
    }

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = searchInput.value.trim();
            if (val.startsWith('http://') || val.startsWith('https://')) {
                webUrlInput.value = val;
                urlSubmitBtn.click();
                searchInput.value = '';
            }
        }
    });

    // --- Web Stream / URL Integration ---
    let savedWebTracks = [];

    async function initWebTracks() {
        savedWebTracks = await window.electronAPI.getSavedWebTracks();
        renderWebTracksGroup();
    }
    initWebTracks();

    addUrlBtn.addEventListener('click', () => {
        urlModal.classList.remove('hidden');
        webUrlInput.focus();
    });

    closeUrlModal.addEventListener('click', () => urlModal.classList.add('hidden'));

    urlSubmitBtn.addEventListener('click', async () => {
        const input = webUrlInput.value.trim();
        if (!input) return;

        urlStatusText.textContent = 'Resolving & downloading stream...';
        urlStatusText.className = 'rpc-status-container status-connecting';

        const result = await window.electronAPI.resolveWebTrack(input);
        if (!result.success) {
            urlStatusText.textContent = 'Error: ' + result.error;
            urlStatusText.className = 'rpc-status-container status-disconnected';
            return;
        }

        const existingIndex = savedWebTracks.findIndex(t => t.url === result.url);
        const trackObj = {
            id: result.trackId,
            url: result.url,
            name: result.title,
            artist: result.artist,
            picture: result.picture
        };

        if (existingIndex > -1) {
            savedWebTracks[existingIndex] = trackObj;
        } else {
            savedWebTracks.unshift(trackObj);
        }
        window.electronAPI.saveWebTracks(savedWebTracks);
        renderWebTracksGroup();

        urlModal.classList.add('hidden');
        webUrlInput.value = '';
        urlStatusText.textContent = '';

        playWebTrackBuffer(result, trackObj);
    });

    function renderWebTracksGroup() {
        if (!webTracksSection) return;
        if (savedWebTracks.length === 0) {
            webTracksSection.innerHTML = '';
            return;
        }

        webTracksSection.innerHTML = `
        <div class="folder-group open" id="web-folder-group">
            <h3>🌐 Online Streams (${savedWebTracks.length})</h3>
            <div class="folder-tracks" style="display: block;">
                <div class="folder-tracks-inner" id="web-tracks-list"></div>
            </div>
        </div>
        `;

        webTracksSection.querySelector('h3').addEventListener('click', () => {
            document.getElementById('web-folder-group').classList.toggle('open');
        });

        const listInner = webTracksSection.querySelector('#web-tracks-list');
        savedWebTracks.forEach(track => {
            const item = document.createElement('div');
            item.className = 'track-item';
            if (currentTrackPath === track.url) item.classList.add('playing');
            item.innerHTML = `<span class="track-name">${track.artist} - ${track.name}</span>`;
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                timeDisplay.innerHTML = '<span>Streaming...</span>';
                const res = await window.electronAPI.resolveWebTrack(track.url);
                if (res.success) playWebTrackBuffer(res, track, item);
            });
            listInner.appendChild(item);
        });
    }

    function displayTracks(folders) {
        const openFolders = new Set();
        document.querySelectorAll('#local-tracks-section .folder-group.open h3').forEach(h3 => openFolders.add(h3.textContent));
        const playingPath = currentTrackPath;

        localTracksSection.innerHTML = '';
        if (!folders || folders.length === 0) return;

        folders.forEach(folderData => {
            const folderGroup = document.createElement('div');
            folderGroup.className = 'folder-group';
            const folderName = folderData.folder.split(/\\|\//).pop();
            const title = document.createElement('h3');
            title.textContent = folderName;
            if (openFolders.has(folderName)) folderGroup.classList.add('open');
            title.addEventListener('click', () => folderGroup.classList.toggle('open'));

            const tracksUl = document.createElement('div');
            tracksUl.className = 'folder-tracks';
            const tracksInner = document.createElement('div');
            tracksInner.className = 'folder-tracks-inner';

            folderData.tracks.forEach((track, index) => {
                const item = document.createElement('div');
                item.className = 'track-item track-appear-effect';

                const delay = Math.min(index * 0.02, 0.4);
                item.style.animationDelay = `${delay}s`;

                if (playingPath === track.path) item.classList.add('playing');

                setTimeout(() => item.classList.remove('track-appear-effect'), 1000);

                item.dataset.path = track.path;
                item.innerHTML = `<span class="track-name">${track.name}</span>`;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    loadAndPlayTrack(track.path, item);
                });
                tracksInner.appendChild(item);
            });

            tracksUl.appendChild(tracksInner);
            folderGroup.append(title, tracksUl);
            localTracksSection.appendChild(folderGroup);
        });

        if (searchInput.value) searchInput.dispatchEvent(new Event('input'));
    }

    async function playWebTrackBuffer(resolvedData, trackObj, elementNode = null) {
        if (isPlaying) fadeOutAndStop();
        else stopSource();

        if (currentPlayingElement) currentPlayingElement.classList.remove('playing');
        if (elementNode) {
            currentPlayingElement = elementNode;
            elementNode.classList.add('playing');
        }

        currentTrackPath = resolvedData.url;
        currentMetadata = {
            title: resolvedData.title,
            artist: resolvedData.artist,
            album: 'Online Stream',
            picture: resolvedData.picture
        };

        currentTrackNameLabel.textContent = resolvedData.title;
        currentTrackFolderLabel.textContent = resolvedData.artist;

        const glowEl = document.querySelector('.artwork-glow');
        if (resolvedData.picture) {
            if (currentTrackArtwork) currentTrackArtwork.src = resolvedData.picture;
            glowEl.style.backgroundImage = `url("${resolvedData.picture}")`;
            glowEl.style.opacity = '0.4';
        } else {
            if (currentTrackArtwork) currentTrackArtwork.src = 'icon.png';
            glowEl.style.backgroundImage = '';
            glowEl.style.opacity = '0.1';
        }

        const savedSettings = await window.electronAPI.getTrackSettings(resolvedData.url);
        applySettings(savedSettings);

        try {
            const audioBuffer = await audioContext.decodeAudioData(resolvedData.audioData.buffer);
            currentTrackBuffer = audioBuffer;
            drawWaveform(audioBuffer);

            pauseTimeSec = 0;
            playbackStartSec = 0;
            progressSlider.value = 0;

            play(0);
        } catch (err) {
            console.error("Web audio decode error:", err);
            timeDisplay.innerHTML = '<span>Decode Error</span>';
        }
    }

    // --- Optimization (GFX ON / OFF) ---
    optimizeBtn.addEventListener('click', () => {
        visualsEnabled = !visualsEnabled;
        if (visualsEnabled) {
            document.body.classList.remove('low-gfx');
            optimizeBtn.textContent = 'GFX: ON';
            optimizeBtn.classList.remove('optimized');
        } else {
            document.body.classList.add('low-gfx');
            optimizeBtn.textContent = 'GFX: OFF';
            optimizeBtn.classList.add('optimized');
            if (spectrogramCanvas) {
                const dpr = window.devicePixelRatio || 1;
                spectrogramCtx.clearRect(0, 0, specCanvasW * dpr, specCanvasH * dpr);
            }
        }
        if (currentTrackBuffer) renderWaveform();
    });

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const tracks = document.querySelectorAll('.track-item');
        tracks.forEach(track => {
            const name = track.querySelector('.track-name').textContent.toLowerCase();
            track.style.display = name.includes(query) ? 'flex' : 'none';
        });
        document.querySelectorAll('.folder-group').forEach(group => {
            const visibleTracks = group.querySelectorAll('.track-item[style="display: flex;"]');
            if (visibleTracks.length > 0 && query.length > 0) group.classList.add('open');
        });
    });

    // --- Rendering Loop (0% GPU Optimized) ---
    function startRenderLoop() {
        if (!animationFrameId) {
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
        if (!spectrogramCanvas || !visualsEnabled || specCanvasW === 0 || specCanvasH === 0) return;

        const dpr = window.devicePixelRatio || 1;
        spectrogramCtx.save();
        spectrogramCtx.scale(dpr, dpr);
        spectrogramCtx.clearRect(0, 0, specCanvasW, specCanvasH);

        if (!isPlaying) {
            spectrogramCtx.restore();
            return;
        }

        analyser.getByteFrequencyData(dataArray);

        const bufferLength = analyser.frequencyBinCount;
        const barWidth = (specCanvasW / bufferLength) * 2.5;
        let x = 0;

        const grad = spectrogramCtx.createLinearGradient(0, specCanvasH, 0, 0);
        grad.addColorStop(0, cachedAccent);
        grad.addColorStop(1, cachedAccentSec);
        spectrogramCtx.fillStyle = grad;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * (specCanvasH * 0.45);
            spectrogramCtx.globalAlpha = (dataArray[i] / 255) * 0.6;
            spectrogramCtx.fillRect(x, specCanvasH - barHeight, barWidth - 1, barHeight);
            x += barWidth;
            if (x > specCanvasW) break;
        }

        spectrogramCtx.restore();
    }

    function render() {
        if (!currentTrackBuffer) return;

        updateSimpleUI();
        renderWaveform();

        if (visualsEnabled) {
            drawSpectrogram();
        }

        if (isPlaying) {
            animationFrameId = requestAnimationFrame(render);
        }
    }

    function updateSimpleUI() {
        const currentTime = getCurrentTime();
        if (!isDraggingSlider && currentTrackBuffer) {
            const progress = (currentTime / currentTrackBuffer.duration) * 1000;
            progressSlider.value = progress;
            progressSlider.style.setProperty('--value', (progress / 10) + '%');
            timeDisplay.innerHTML = `<span>${formatTime(currentTime)}</span><span>${formatTime(currentTrackBuffer.duration)}</span>`;
        }
    }

    function getCurrentTime() {
        if (!currentSource || !isPlaying) return pauseTimeSec;
        const rate = currentSource.playbackRate.value;
        let time = (audioContext.currentTime - playbackStartedAtCtx) * rate;
        if (time > currentTrackBuffer.duration) return currentTrackBuffer.duration;
        return Math.max(0, time);
    }

    function formatTime(sec) {
        const m = Math.floor(sec / 60) || 0;
        const s = Math.floor(sec % 60) || 0;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function updateUIState() {
        playPauseBtn.classList.toggle('is-playing', isPlaying);
    }

    // --- Theme Switcher ---
    const themeSwitcherBtn = document.getElementById('theme-switcher');
    const themeLink = document.getElementById('theme-link');

    const themes = [
        'ultra.css',
        'cosmic.css',
        'frutigeraero.css',
        'terminal.css',
        'winamp.css',
        'macglass.css',
        'main.css',
        'kocmocunleashed.css'
    ];

    function applyTheme(themeName) {
        if (themeName === 'main.css') {
            themeLink.href = `styles/main.css`;
        } else {
            themeLink.href = `styles/themes/${themeName}`;
        }
        setTimeout(() => {
            updateThemeCache();
            if (currentTrackBuffer) renderWaveform();
        }, 80);
    }

    function switchTheme() {
        let currentThemeIndex = Number(localStorage.getItem('themeIndex') || 0);
        currentThemeIndex = (currentThemeIndex + 1) % themes.length;
        applyTheme(themes[currentThemeIndex]);
        localStorage.setItem('themeIndex', currentThemeIndex);
    }

    themeSwitcherBtn.addEventListener('click', switchTheme);

    function loadInitialTheme() {
        const savedThemeIndex = Number(localStorage.getItem('themeIndex') || 0);
        const validIndex = savedThemeIndex < themes.length ? savedThemeIndex : 0;
        applyTheme(themes[validIndex]);
        localStorage.setItem('themeIndex', validIndex);
    }
    loadInitialTheme();

    // Volume & Speed Handlers
    function updateVolume(value) {
        const val = Math.min(200, Math.max(0, Number(value)));
        masterGain.gain.setValueAtTime(val / 100, audioContext.currentTime);
        trackVolumeValue.textContent = `${val}%`;
        trackVolumeSlider.value = val;
        trackVolumeInput.value = val;
        onSettingsChange();
    }
    trackVolumeSlider.addEventListener('input', e => updateVolume(e.target.value));
    trackVolumeInput.addEventListener('change', e => updateVolume(e.target.value));

    function updateSpeed(value) {
        const val = Math.min(200, Math.max(50, Number(value)));
        speedValue.textContent = `${val}%`;
        if (currentSource) {
            currentSource.playbackRate.value = val / 100;
            playbackStartedAtCtx = audioContext.currentTime - getCurrentTime() / (val / 100);
        }
        speedSlider.value = val;
        speedInput.value = val;
        onSettingsChange();
    }
    speedSlider.addEventListener('input', e => updateSpeed(e.target.value));
    speedInput.addEventListener('change', e => updateSpeed(e.target.value));

    // Discord RPC Modal
    const rpcModal = document.getElementById('rpc-modal');
    const rpcBtn = document.getElementById('discord-rpc-btn');
    const closeRpcBtn = document.getElementById('close-rpc-modal');
    const rpcClientIdInput = document.getElementById('rpc-client-id');
    const rpcConnectBtn = document.getElementById('rpc-connect-btn');
    const rpcDisconnectBtn = document.getElementById('rpc-disconnect-btn');
    const rpcStatusText = document.getElementById('rpc-status-text');

    rpcClientIdInput.value = localStorage.getItem('discord_client_id') || '';

    rpcBtn.addEventListener('click', () => rpcModal.classList.remove('hidden'));
    closeRpcBtn.addEventListener('click', () => rpcModal.classList.add('hidden'));

    rpcConnectBtn.addEventListener('click', async () => {
        const clientId = rpcClientIdInput.value.trim();
        if (!clientId) return;
        localStorage.setItem('discord_client_id', clientId);

        rpcStatusText.textContent = 'Connecting...';
        rpcStatusText.className = 'status-connecting';

        const res = await window.electronAPI.initDiscordRPC(clientId);
        if (res.success) {
            rpcStatusText.textContent = 'Connected';
            rpcStatusText.className = 'status-connected';
            rpcBtn.classList.add('saved');
        } else {
            rpcStatusText.textContent = 'Error: ' + (res.error || 'Failed');
            rpcStatusText.className = 'status-disconnected';
        }
    });

    rpcDisconnectBtn.addEventListener('click', () => {
        window.electronAPI.clearDiscordRPC();
        rpcStatusText.textContent = 'Disconnected';
        rpcStatusText.className = 'status-disconnected';
        rpcBtn.classList.remove('saved');
    });

    // Sidebar Resizer
    const resizer = document.getElementById('sidebar-resizer');
    const sidebar = document.getElementById('explorer-sidebar');
    let isResizing = false;

    resizer.addEventListener('mousedown', () => {
        isResizing = true;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = document.body.clientWidth - e.clientX;
        if (newWidth >= 200 && newWidth <= 650) {
            sidebar.style.width = `${newWidth}px`;
            updateCanvasSizeCache();
            if (currentTrackBuffer) renderWaveform();
        }
    });

    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
            updateCanvasSizeCache();
            if (currentTrackBuffer) renderWaveform();
        }
    });

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
        renderWaveform();
    }

    function renderWaveform() {
        if (waveCanvasW === 0 || waveCanvasH === 0) return;

        const dpr = window.devicePixelRatio || 1;
        waveformCtx.save();
        waveformCtx.scale(dpr, dpr);
        waveformCtx.clearRect(0, 0, waveCanvasW, waveCanvasH);

        if (!waveformPeaks || waveformPeaks.length === 0) {
            waveformCtx.restore();
            return;
        }

        const totalBars = waveformPeaks.length;
        const gap = 2;
        const barWidth = (waveCanvasW - (totalBars - 1) * gap) / totalBars;
        const progress = currentTrackBuffer ? (getCurrentTime() / currentTrackBuffer.duration) : 0;
        const progressX = progress * waveCanvasW;

        for (let i = 0; i < totalBars; i++) {
            const x = i * (barWidth + gap);
            const barH = waveformPeaks[i] * (waveCanvasH - 8);
            const y = (waveCanvasH - barH) / 2;

            if (x + barWidth <= progressX) {
                waveformCtx.fillStyle = cachedAccent;
                waveformCtx.globalAlpha = 0.9;
            } else {
                waveformCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                waveformCtx.globalAlpha = 0.5;
            }

            waveformCtx.fillRect(x, y, Math.max(1, barWidth), barH);
        }

        // Белая линия курсора
        if (currentTrackBuffer) {
            waveformCtx.fillStyle = '#ffffff';
            waveformCtx.globalAlpha = 1.0;
            if (visualsEnabled) {
                waveformCtx.shadowColor = cachedAccent;
                waveformCtx.shadowBlur = 8;
            }
            waveformCtx.fillRect(progressX - 1, 0, 2, waveCanvasH);
        }

        waveformCtx.restore();
    }

    (async () => {
        const savedId = localStorage.getItem('discord_client_id');
        if (savedId) {
            const res = await window.electronAPI.initDiscordRPC(savedId);
            if (res.success) {
                rpcStatusText.textContent = 'Connected';
                rpcStatusText.className = 'status-connected';
                rpcBtn.classList.add('saved');
                const quick = document.getElementById('rpc-quick-status');
                if (quick) quick.textContent = 'RPC: ON';
            }
        }
    })();

    selectFolderBtn.addEventListener('click', () => window.electronAPI.selectFolder(true));
    window.electronAPI.onReceiveTracks(displayTracks);

    window.addEventListener('resize', () => {
        updateCanvasSizeCache();
        if (currentTrackBuffer) renderWaveform();
    });

    updateThemeCache();
    updateCanvasSizeCache();
});