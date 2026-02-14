document.addEventListener('DOMContentLoaded', () => {
    
    // --- Audio Context ---
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

    eqFilters.reduce((prev, curr) => (prev.connect(curr), curr), masterGain)
        .connect(analyser)
        .connect(audioContext.destination);

    // --- State ---
    let currentSource = null;
    let currentTrackBuffer = null;
    let currentPlayingElement = null;
    let isPlaying = false;
    
    // FL STUDIO LOGIC VARIABLES
    let pauseTimeSec = 0;       // Где сейчас курсор (визуально)
    let playbackStartSec = 0;   // Откуда начали играть (для возврата по пробелу)
    
    let playbackStartedAtCtx = 0; // Системное время запуска
    let animationFrameId = null;
    let isDraggingSlider = false;
    let currentTrackPath = null;
    let isApplyingSettings = false;
    let visualsEnabled = true;
    let optimizeInterval = null;

    // --- DOM Elements ---
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn'); // New
    const nextBtn = document.getElementById('next-btn'); // New
    
    const trackVolumeSlider = document.getElementById('track-volume-slider');
    const trackVolumeValue = document.getElementById('track-volume-value');
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    const progressSlider = document.getElementById('progress-slider');
    const timeDisplay = document.getElementById('time-display');
    const trackListContainer = document.getElementById('track-list');
    const searchInput = document.getElementById('search-input');
    
    const selectFolderBtn = document.getElementById('select-folder-btn');
    const optimizeBtn = document.getElementById('optimize-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const resetSettingsBtn = document.getElementById('reset-settings-btn');

    const spectrogramCanvas = document.getElementById('spectrogram-canvas');
    const spectrogramCtx = spectrogramCanvas.getContext('2d');
    const eqContainer = document.querySelector('.eq-bands');

    // --- EQ Generation ---
    eqFilters.forEach((filter, i) => {
        const bandEl = document.createElement('div');
        bandEl.className = 'eq-band';
        const label = document.createElement('label');
        const freq = eqFrequencies[i];
        label.textContent = freq >= 1000 ? `${freq/1000}k` : freq;
        const slider = document.createElement('input');
        slider.type = 'range'; slider.min = -12; slider.max = 12; slider.value = 0; slider.step = 0.1;
        const numInput = document.createElement('input');
        numInput.type = 'number'; numInput.min = -12; numInput.max = 12; numInput.value = 0; numInput.step = 0.1;

        const updateGain = (val) => {
            const num = Number(val);
            filter.gain.setValueAtTime(num, audioContext.currentTime);
            slider.value = num;
            numInput.value = num;
            if(!isApplyingSettings) onSettingsChange();
        };
        slider.addEventListener('input', (e) => updateGain(e.target.value));
        numInput.addEventListener('change', (e) => updateGain(e.target.value));
        bandEl.append(label, slider, numInput);
        eqContainer.appendChild(bandEl);
    });

    // --- Core Logic ---

    // 1. SPACEBAR LISTENER (FIXED)
    window.addEventListener('keydown', (e) => {
        // Игнорируем пробел, если пишем в поиске или цифрах
        if (e.target.tagName === 'INPUT') return;

        if (e.code === 'Space') {
            e.preventDefault(); // Чтобы страница не скроллилась
            if (!currentTrackBuffer) return;

            if (isPlaying) {
                stopWithReturn(); // FL Logic: Возврат на старт
            } else {
                play(pauseTimeSec);
            }
        }
    });

    // 2. Play/Pause Button Click
    playPauseBtn.addEventListener('click', () => {
        if (!currentTrackBuffer) return;
        if (isPlaying) {
            pause(); // Обычная пауза (остаемся на месте)
        } else {
            play(pauseTimeSec);
        }
    });

    // 3. Prev/Next Buttons
    prevBtn.addEventListener('click', playPrevTrack);
    nextBtn.addEventListener('click', playNextTrack);


    // --- Audio Functions ---

    function play(offsetSeconds) {
        if (!currentTrackBuffer) return;
        if (currentSource) currentSource.stop();

        // Запоминаем, откуда начали играть (для возврата по Space)
        playbackStartSec = offsetSeconds;

        currentSource = audioContext.createBufferSource();
        currentSource.buffer = currentTrackBuffer;
        currentSource.playbackRate.value = Number(speedSlider.value) / 100; 
        currentSource.connect(masterGain);
        currentSource.start(0, offsetSeconds);

        isPlaying = true;
        // Вычисляем время контекста, когда трек был бы на 0:00
        playbackStartedAtCtx = audioContext.currentTime - offsetSeconds / currentSource.playbackRate.value;
        
        currentSource.onended = () => {
            // Если трек доиграл до конца сам
            if ((getCurrentTime() + 0.1) >= currentTrackBuffer.duration) {
                isPlaying = false;
                updateUIState();
                playNextTrack(); 
            }
        };

        updateUIState();
        startRenderLoop();
    }

    // Обычная пауза (кнопка мыши) - остаемся где были
    function pause() {
        if (!currentSource || !isPlaying) return;
        pauseTimeSec = getCurrentTime(); // Сохраняем текущую позицию
        stopSource();
        updateUIState();
        updateSimpleUI(); // Обновить цифры
    }

    // Стоп с возвратом (Пробел) - как в FL Studio
    function stopWithReturn() {
        if (!currentSource || !isPlaying) return;
        stopSource();
        
        // ВОЗВРАТ НА СТАРТ
        pauseTimeSec = playbackStartSec; 
        
        updateUIState();
        updateSimpleUI(); // Обновить слайдер и цифры на позицию старта
    }

    function stopSource() {
        if (currentSource) {
            currentSource.onended = null;
            try { currentSource.stop(); } catch(e) {}
            currentSource = null;
        }
        isPlaying = false;
        stopRenderLoop();
    }

    async function loadAndPlayTrack(trackPath, trackElement) {
        if (currentPlayingElement) currentPlayingElement.classList.remove('playing');
        stopSource();

        currentTrackBuffer = null; 
        currentPlayingElement = trackElement;
        isPlaying = false;
        timeDisplay.innerHTML = '<span>Loading...</span>';
        currentTrackPath = trackPath;
        
        const savedSettings = await window.electronAPI.getTrackSettings(trackPath);
        applySettings(savedSettings);
        
        try {
            const rawData = await window.electronAPI.getAudioData(trackPath);
            if (!rawData) return;
            
            const audioBuffer = await audioContext.decodeAudioData(rawData.buffer);
            if (currentTrackPath !== trackPath) return; 

            currentTrackBuffer = audioBuffer;
            
            // Новый трек всегда с начала
            pauseTimeSec = 0;
            playbackStartSec = 0;
            progressSlider.value = 0;
            
            trackElement.classList.add('playing');
            play(0);

        } catch (err) {
            console.error(err);
            timeDisplay.textContent = "Error loading";
        }
    }

    function playNextTrack() {
    if (!currentPlayingElement) return;
    // Получаем все треки, которые не скрыты поиском
    const tracks = Array.from(document.querySelectorAll('.track-item')).filter(t => t.style.display !== 'none');
    const currentIndex = tracks.indexOf(currentPlayingElement);
    
    if (currentIndex > -1 && currentIndex < tracks.length - 1) {
        const nextTrackElement = tracks[currentIndex + 1];
        loadAndPlayTrack(nextTrackElement.dataset.path, nextTrackElement);
    }
}

    function playPrevTrack() {
    if (!currentPlayingElement) return;

    // Если трек играет дольше 3 секунд, просто возвращаем его в начало
    if (getCurrentTime() > 3) {
        play(0); // Это остановит текущий и запустит новый с 0
        return;
    }

    // Иначе ищем предыдущий трек
    const tracks = Array.from(document.querySelectorAll('.track-item')).filter(t => t.style.display !== 'none');
    const currentIndex = tracks.indexOf(currentPlayingElement);

    if (currentIndex > 0) {
        const prevTrackElement = tracks[currentIndex - 1];
        loadAndPlayTrack(prevTrackElement.dataset.path, prevTrackElement);
    }
}

    // --- Slider Events ---

    progressSlider.addEventListener('mousedown', () => isDraggingSlider = true);
    
    // Когда отпускаем слайдер - меняем точку старта
    window.addEventListener('mouseup', () => {
        if (isDraggingSlider) {
            isDraggingSlider = false;
            if (currentTrackBuffer) {
                const time = (progressSlider.value / 1000) * currentTrackBuffer.duration;
                pauseTimeSec = time;
                playbackStartSec = time; // Если перемотали рукой - это новая точка старта
                if(isPlaying) play(time);
            }
        }
    });

    progressSlider.addEventListener('input', e => {
        if (!currentTrackBuffer) return;
        const time = (e.target.value / 1000) * currentTrackBuffer.duration;
        timeDisplay.innerHTML = `<span>${formatTime(time)}</span><span>${formatTime(currentTrackBuffer.duration)}</span>`;
        progressSlider.style.setProperty('--value', (e.target.value / 10) + '%');
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
        const defaults = { volume: 100, speed: 100, eq: [0,0,0,0,0,0,0] };
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

    // --- Optimization & Search ---

    optimizeBtn.addEventListener('click', () => {
        visualsEnabled = !visualsEnabled;
        if (visualsEnabled) {
            document.body.classList.remove('low-gfx');
            optimizeBtn.textContent = 'GFX: ON';
            optimizeBtn.classList.remove('optimized');
            startRenderLoop(); 
        } else {
            document.body.classList.add('low-gfx');
            optimizeBtn.textContent = 'GFX: OFF';
            optimizeBtn.classList.add('optimized');
            stopRenderLoop();
            if (optimizeInterval) clearInterval(optimizeInterval);
            optimizeInterval = setInterval(() => { if (isPlaying) updateSimpleUI(); }, 500);
        }
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

    // --- Rendering ---
    
    function startRenderLoop() {
        if (!animationFrameId && visualsEnabled) animationFrameId = requestAnimationFrame(render);
    }
    function stopRenderLoop() {
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
    }

    function render() {
        if (!currentTrackBuffer || !visualsEnabled) return;
        updateSimpleUI(); // Двигаем ползунок
        drawSpectrogram();
        if (isPlaying) animationFrameId = requestAnimationFrame(render);
    }

    function updateSimpleUI() {
        const currentTime = getCurrentTime(); // Тут уже учитывается pauseTimeSec
        if (!isDraggingSlider && currentTrackBuffer) {
            const progress = (currentTime / currentTrackBuffer.duration) * 1000;
            progressSlider.value = progress;
            progressSlider.style.setProperty('--value', (progress / 10) + '%');
            timeDisplay.innerHTML = `<span>${formatTime(currentTime)}</span><span>${formatTime(currentTrackBuffer.duration)}</span>`;
        }
    }

    function drawSpectrogram() {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        spectrogramCtx.clearRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
        const barWidth = (spectrogramCanvas.width / bufferLength) * 2.5;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = dataArray[i];
            const hue = i / bufferLength * 360 + 180;
            spectrogramCtx.fillStyle = `hsla(${hue}, 100%, 50%, 0.4)`;
            spectrogramCtx.fillRect(x, spectrogramCanvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    // --- Helpers ---

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
    
    // --- Initial Config ---

    trackVolumeSlider.addEventListener('input', e => {
        const val = e.target.value;
        masterGain.gain.setValueAtTime(val / 100, audioContext.currentTime);
        trackVolumeValue.textContent = `${val}%`;
        onSettingsChange();
    });

    speedSlider.addEventListener('input', e => {
        const val = e.target.value;
        speedValue.textContent = `${val}%`;
        if (currentSource) {
            currentSource.playbackRate.value = val / 100;
            playbackStartedAtCtx = audioContext.currentTime - getCurrentTime() / (val / 100);
        }
        onSettingsChange();
    });

    // Files/Folders Logic (с запоминанием открытых папок)
    function displayTracks(folders) {
        const openFolders = new Set();
        document.querySelectorAll('.folder-group.open h3').forEach(h3 => openFolders.add(h3.textContent));
        const playingPath = currentTrackPath;

        trackListContainer.innerHTML = '';
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

            folderData.tracks.forEach(track => {
                const item = document.createElement('div');
                item.className = 'track-item';
                if (playingPath === track.path) item.classList.add('playing');
                item.dataset.path = track.path;
                item.innerHTML = `<span class="track-name">${track.name}</span>`;
                item.addEventListener('click', (e) => { e.stopPropagation(); loadAndPlayTrack(track.path, item); });
                tracksUl.appendChild(item);
            });

            // Style for opening
            const style = document.createElement('style');
            style.textContent = `.folder-group.open .folder-tracks { display: block !important; }`;
            if (!document.getElementById('folder-style')) { style.id = 'folder-style'; document.head.appendChild(style); }

            folderGroup.append(title, tracksUl);
            trackListContainer.appendChild(folderGroup);
        });
        if(searchInput.value) searchInput.dispatchEvent(new Event('input'));
    }

    selectFolderBtn.addEventListener('click', () => window.electronAPI.selectFolder(true));
    window.electronAPI.onReceiveTracks(displayTracks);

    window.addEventListener('resize', () => {
        spectrogramCanvas.width = spectrogramCanvas.parentElement.clientWidth;
        spectrogramCanvas.height = spectrogramCanvas.parentElement.clientHeight;
    });
    window.dispatchEvent(new Event('resize'));
});
