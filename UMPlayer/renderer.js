document.addEventListener('DOMContentLoaded', () => {
    
    // --- Audio Context & Processing Chain ---
    const audioContext = new AudioContext();
    const masterGain = audioContext.createGain();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;

    const eqFrequencies = [60, 170, 350, 1000, 3500, 10000, 14000];
    const eqFilters = eqFrequencies.map(freq => {
        const filter = audioContext.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.41;
        filter.gain.value = 0;
        return filter;
    });

    // Routing: Source -> Master Gain -> EQ Chain -> Analyser -> Destination
    eqFilters.reduce((prev, curr) => (prev.connect(curr), curr), masterGain)
        .connect(analyser)
        .connect(audioContext.destination);

    // --- Player State ---
    let currentSource = null;
    let currentTrackBuffer = null;
    let currentPlayingElement = null;
    let isPlaying = false;
    let startPointSec = 0;      // FL Studio style marker
    let pauseTimeSec = 0;
    let playbackStartedAt = 0;
    let animationFrameId = null;
    let testSoundBuffer = null;
    let currentTestSource = null;
    let isDraggingSlider = false;
    let currentTrackPath = null;
    let isApplyingSettings = false;
    let visualsEnabled = true;
    let optimizeInterval = null;

    // --- DOM Elements ---
    const settingsView = document.getElementById('settings-view');
    const playerView = document.getElementById('player-view');
    const goToPlayerBtn = document.getElementById('go-to-player-btn');
    const testSoundBtn = document.getElementById('test-sound-btn');
    const scanSubfoldersCheckbox = document.getElementById('scan-subfolders-checkbox');
    const globalVolumeSlider = document.getElementById('global-volume-slider');
    const volumeValueSpan = document.getElementById('volume-value');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const optimizeBtn = document.getElementById('optimize-btn');
    const resetSettingsBtn = document.getElementById('reset-settings-btn');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const trackVolumeSlider = document.getElementById('track-volume-slider');
    const trackVolumeValue = document.getElementById('track-volume-value');
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    const eqContainer = document.querySelector('.eq-bands');
    
    const waveformCanvas = document.getElementById('waveform-canvas');
    const progressSlider = document.getElementById('progress-slider');
    const timeDisplay = document.getElementById('time-display');

    const toggleViewBtn = document.getElementById('toggle-view-btn');
    const waveformContainer = document.getElementById('waveform-container');
    const sliderContainer = document.getElementById('round-slider-container'); 
    
    const selectFolderBtn = document.getElementById('select-folder-btn');
    const trackListContainer = document.getElementById('track-list');
    const spectrogramCanvas = document.getElementById('spectrogram-canvas');
    const spectrogramCtx = spectrogramCanvas.getContext('2d');

    // --- Logic ---

    resetSettingsBtn.addEventListener('click', () => {
        if (!currentTrackPath) return;
        applySettings(null);
        onSettingsChange();
    });

    function onSettingsChange() {
        if (isApplyingSettings || !currentTrackPath) return;

        const currentSettings = {
            volume: Number(trackVolumeSlider.value),
            speed: Number(speedSlider.value),
            eq: eqFilters.map(filter => filter.gain.value)
        };

        window.electronAPI.saveTrackSettings({
            trackPath: currentTrackPath,
            settings: currentSettings
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

    optimizeBtn.addEventListener('click', () => {
        visualsEnabled = !visualsEnabled;
        
        if (visualsEnabled) {
            document.body.classList.remove('low-gfx');
            startRenderLoop(); 
        } else {
            document.body.classList.add('low-gfx');
            stopRenderLoop();
            
            if (optimizeInterval) clearInterval(optimizeInterval);
            optimizeInterval = setInterval(() => {
                if (isPlaying) updateSimpleUI();
            }, 200);
        }
    });

    function applySettings(settings) {
        isApplyingSettings = true;

        const defaults = {
            volume: 100,
            speed: 100,
            eq: [0, 0, 0, 0, 0, 0, 0]
        };

        const finalSettings = { ...defaults, ...settings };

        trackVolumeSlider.value = finalSettings.volume;
        trackVolumeValue.textContent = `${finalSettings.volume}%`;
        speedSlider.value = finalSettings.speed;
        speedValue.textContent = `${finalSettings.speed}%`;

        const eqSliders = eqContainer.querySelectorAll('input[type="range"]');
        eqSliders.forEach((slider, i) => {
            slider.value = finalSettings.eq[i];
        });

        masterGain.gain.setValueAtTime(finalSettings.volume / 100, audioContext.currentTime);
        eqFilters.forEach((filter, i) => {
            filter.gain.setValueAtTime(finalSettings.eq[i], audioContext.currentTime);
        });
        
        setTimeout(() => { isApplyingSettings = false; }, 50);
    }

    async function loadTestSound() {
        try {
            const response = await fetch('./assets/test-sound.wav');
            const arrayBuffer = await response.arrayBuffer();
            testSoundBuffer = await audioContext.decodeAudioData(arrayBuffer);
        } catch (error) {
            if (testSoundBtn) testSoundBtn.textContent = 'Error';
        }
    }
    loadTestSound();

    if (testSoundBtn) {
        testSoundBtn.addEventListener('click', () => {
            if (!testSoundBuffer) return;
            if (currentTestSource) currentTestSource.stop();
            
            const testGain = audioContext.createGain();
            testGain.connect(audioContext.destination);
            testGain.gain.value = Number(globalVolumeSlider.value) / 100;
            
            currentTestSource = audioContext.createBufferSource();
            currentTestSource.buffer = testSoundBuffer;
            currentTestSource.connect(testGain);
            currentTestSource.start(0);
        });
    }

    if (globalVolumeSlider) {
        globalVolumeSlider.addEventListener('input', (e) => {
            if (volumeValueSpan) volumeValueSpan.textContent = e.target.value;
        });
    }

    function play(offsetSeconds) {
        if (!currentTrackBuffer) return;

        if (currentSource) {
            currentSource.onended = null;
            currentSource.stop();
        }

        currentSource = audioContext.createBufferSource();
        currentSource.buffer = currentTrackBuffer;
        currentSource.playbackRate.value = Number(speedSlider.value) / 100; 
        currentSource.connect(masterGain);
        currentSource.start(0, offsetSeconds);

        isPlaying = true;
        playbackStartedAt = audioContext.currentTime - offsetSeconds / currentSource.playbackRate.value;
        
        currentSource.onended = () => {
            if ((getCurrentTime() + 0.1) >= currentTrackBuffer.duration) {
                isPlaying = false;
                updateUIState();
                playNextTrack();
            }
        };

        updateUIState();
        startRenderLoop();
    }

    function pause() {
        if (!currentSource || !isPlaying) return;
        
        pauseTimeSec = getCurrentTime();
        currentSource.onended = null;
        currentSource.stop();
        currentSource = null;
        isPlaying = false;
        
        updateUIState();
        stopRenderLoop();
    }
    
    async function loadAndPlayTrack(trackPath, trackElement) {
        if (currentPlayingElement) currentPlayingElement.classList.remove('playing');
        stopRenderLoop();
        
        if (currentSource) {
            currentSource.onended = null;
            try { currentSource.stop(); } catch(e) {}
            try { currentSource.disconnect(); } catch(e) {}
            currentSource = null;
        }

        currentTrackBuffer = null; 
        currentPlayingElement = trackElement;
        isPlaying = false;
        timeDisplay.textContent = 'Loading...';
        currentTrackPath = trackPath;
        
        const savedSettings = await window.electronAPI.getTrackSettings(trackPath);
        applySettings(savedSettings);
        
        try {
            const rawData = await window.electronAPI.getAudioData(trackPath);
            if (!rawData) return;
            
            const audioBuffer = await audioContext.decodeAudioData(rawData.buffer);
            
            if (currentTrackPath !== trackPath) return; 

            currentTrackBuffer = audioBuffer;
            startPointSec = 0;
            pauseTimeSec = 0;
            progressSlider.value = 0;
            play(0);

        } catch (err) {
            timeDisplay.textContent = "Error";
        }
    }

    // --- Interaction ---

    playPauseBtn.addEventListener('click', () => {
        if (!currentTrackBuffer) return;
        isPlaying ? pause() : play(pauseTimeSec);
    });

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !playerView.classList.contains('hidden')) {
            e.preventDefault();
            if (!currentTrackBuffer) return;

            if (isPlaying) {
                pause();
                pauseTimeSec = startPointSec; // Reset to marker
            } else {
                play(startPointSec);
            }
        }
    });

    trackVolumeSlider.addEventListener('input', e => {
        const value = e.target.value;
        masterGain.gain.setValueAtTime(value / 100, audioContext.currentTime);
        trackVolumeValue.textContent = `${value}%`;
        onSettingsChange();
    });

    speedSlider.addEventListener('input', e => {
        const rate = Number(e.target.value) / 100;
        if (currentSource) {
            currentSource.playbackRate.value = rate;
            playbackStartedAt = audioContext.currentTime - getCurrentTime() / rate;
        }
        speedValue.textContent = `${e.target.value}%`;
    });

    progressSlider.addEventListener('mousedown', () => {
        isDraggingSlider = true;
    });

    window.addEventListener('mouseup', () => {
        if (isDraggingSlider) {
            isDraggingSlider = false;
            progressSlider.dispatchEvent(new Event('change'));
        }
    });

    progressSlider.addEventListener('change', e => {
        if (!currentTrackBuffer) return;
        
        const time = (e.target.value / 1000) * currentTrackBuffer.duration;
        startPointSec = time;
        pauseTimeSec = time;

        if (isPlaying) {
            play(time);
        } else {
            timeDisplay.textContent = `${formatTime(time)} / ${formatTime(currentTrackBuffer.duration)}`;
        }
    });

    progressSlider.addEventListener('input', e => {
        if (!currentTrackBuffer) return;
        const time = (e.target.value / 1000) * currentTrackBuffer.duration;
        timeDisplay.textContent = `${formatTime(time)} / ${formatTime(currentTrackBuffer.duration)}`;
    });

    // --- Rendering ---

    function startRenderLoop() {
        if (!animationFrameId) animationFrameId = requestAnimationFrame(render);
    }

    function stopRenderLoop() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }
    
    function render() {
        if (!currentTrackBuffer || !visualsEnabled) {
            stopRenderLoop();
            return;
        }

        const currentTime = getCurrentTime();

        if (!isDraggingSlider && currentTrackBuffer) {
            const progress = (currentTime / currentTrackBuffer.duration) * 1000;
            progressSlider.value = progress;
            progressSlider.style.setProperty('--value', (progress / 10) + '%');
            timeDisplay.innerHTML = `<span>${formatTime(currentTime)}</span><span>${formatTime(currentTrackBuffer.duration)}</span>`;
        }

        if (visualsEnabled && isPlaying && currentTime <= currentTrackBuffer.duration) {
            drawSpectrogram();
        }

        if (isPlaying && visualsEnabled) {
            animationFrameId = requestAnimationFrame(render);
        } else {
            stopRenderLoop();
        }
    }

    function drawSpectrogram() {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        spectrogramCtx.fillStyle = 'rgb(25, 25, 25)';
        spectrogramCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
        
        const barWidth = (spectrogramCanvas.width / bufferLength) * 2.5;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = dataArray[i];
            const hue = i / bufferLength * 360;
            spectrogramCtx.fillStyle = `hsla(${hue}, 100%, 50%, 0.5)`;
            spectrogramCtx.fillRect(x, spectrogramCanvas.height - barHeight / 2, barWidth, barHeight / 2);
            x += barWidth + 1;
        }
    }
    
    // --- UI Helpers ---
    
    function updateUIState() {
        playPauseBtn.classList.toggle('is-playing', isPlaying);
        document.querySelectorAll('.track-item').forEach(el => el.classList.remove('playing'));
        if (currentPlayingElement) {
            currentPlayingElement.classList.toggle('playing', isPlaying);
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
        return (audioContext.currentTime - playbackStartedAt) * rate;
    }

    function formatTime(sec) {
        const m = Math.floor(sec / 60) || 0;
        const s = Math.floor(sec % 60) || 0;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function playNextTrack() {
        if (!currentPlayingElement) return;
        const allTracks = Array.from(document.querySelectorAll('.track-item'));
        const currentIndex = allTracks.indexOf(currentPlayingElement);
        if (currentIndex > -1 && currentIndex < allTracks.length - 1) {
            const nextTrackElement = allTracks[currentIndex + 1];
            loadAndPlayTrack(nextTrackElement.dataset.path, nextTrackElement);
        }
    }

    function displayTracks(folders) {
        trackListContainer.innerHTML = '';
        if (!folders || folders.length === 0) return;

        folders.forEach(folderData => {
            const folderGroup = document.createElement('div');
            folderGroup.className = 'folder-group';

            const title = document.createElement('h3');
            title.textContent = folderData.folder.split(/\\|\//).pop();
            
            title.addEventListener('click', () => {
                folderGroup.classList.toggle('open');
            });

            const tracksUl = document.createElement('ul');
            tracksUl.className = 'folder-tracks';

            folderData.tracks.forEach(track => {
                const li = document.createElement('li');
                li.className = 'track-item';
                li.dataset.path = track.path;
                li.innerHTML = `<div class="play-icon"></div><span class="track-name">${track.name}</span>`;
                li.addEventListener('click', (e) => {
                    e.stopPropagation();
                    loadAndPlayTrack(track.path, li);
                });
                tracksUl.appendChild(li);
            });

            folderGroup.appendChild(title);
            folderGroup.appendChild(tracksUl);
            trackListContainer.appendChild(folderGroup);
        });
    }

    selectFolderBtn.addEventListener('click', () => window.electronAPI.selectFolder(true));
    window.electronAPI.onReceiveTracks(displayTracks);

    eqFilters.forEach((filter, i) => {
        const bandEl = document.createElement('div');
        bandEl.className = 'eq-band';
        const label = document.createElement('label');
        const freq = eqFrequencies[i];
        label.textContent = freq >= 1000 ? `${freq/1000}k` : freq;
        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = -12; slider.max = 12; slider.value = 0; slider.step = 0.1;
        slider.addEventListener('input', (e) => filter.gain.setValueAtTime(Number(e.target.value), audioContext.currentTime));
        bandEl.append(label, slider);
        eqContainer.appendChild(bandEl);
    });

    window.dispatchEvent(new Event('resize'));
});

window.addEventListener('resize', () => {
    const spectrogramCanvas = document.getElementById('spectrogram-canvas');
    if (spectrogramCanvas) {
        spectrogramCanvas.width = spectrogramCanvas.clientWidth;
        spectrogramCanvas.height = spectrogramCanvas.clientHeight;
    }
});