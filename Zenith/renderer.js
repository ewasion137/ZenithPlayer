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
    analyser.fftSize = 256; // Меньше бинов = больше FPS
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
    let currentMetadata = { title: null, artist: null, album: null };

    // --- DOM Elements ---
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn'); // New
    const nextBtn = document.getElementById('next-btn'); // New

    const trackVolumeSlider = document.getElementById('track-volume-slider');
    const trackVolumeValue = document.getElementById('track-volume-value');
    const speedSlider = document.getElementById('speed-slider');
    const trackVolumeInput = document.getElementById('track-volume-input');
    const speedInput = document.getElementById('speed-input');
    const speedValue = document.getElementById('speed-value');
    const progressSlider = document.getElementById('progress-slider');
    const timeDisplay = document.getElementById('time-display');
    const trackListContainer = document.getElementById('track-list');
    const searchInput = document.getElementById('search-input');
    const currentTrackNameLabel = document.getElementById('current-track-name');
    const currentTrackFolderLabel = document.getElementById('current-track-folder');

    const selectFolderBtn = document.getElementById('select-folder-btn');
    const waveformCanvas = document.getElementById('waveform-canvas');
    const waveformCtx = waveformCanvas.getContext('2d');
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

        if (e.ctrlKey && e.code === 'KeyT') {
            switchTheme();
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

    // window controls
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

    // global shortcuts from main
    window.electronAPI.onGlobalCommand((cmd) => {
        console.log('[engine] key:', cmd);
        if (cmd === 'play-pause') {
            const btn = document.getElementById('play-pause-btn');
            if (btn) btn.click();
        } else if (cmd === 'next') {
            playNextTrack();
        } else if (cmd === 'prev') {
            playPrevTrack();
        }
    });

    // sound engine stuff
    function play(offsetSeconds) {
        if (!currentTrackBuffer) return;
        if (currentSource) currentSource.stop();

        playbackStartSec = offsetSeconds;

        currentSource = audioContext.createBufferSource();
        currentSource.buffer = currentTrackBuffer;
        currentSource.playbackRate.value = Number(speedSlider.value) / 100;
        currentSource.connect(masterGain);

        // Флаг, который по умолчанию true
        let naturalEnd = true;
        // Переопределяем его на false, когда прерываем трек вручную
        currentSource.stop = ((stop) => function (...args) {
            naturalEnd = false;
            stop.apply(this, args);
        })(currentSource.stop);

        currentSource.start(0, offsetSeconds);

        isPlaying = true;
        playbackStartedAtCtx = audioContext.currentTime - offsetSeconds / currentSource.playbackRate.value;

        currentSource.onended = () => {
            // Если трек доиграл сам (naturalEnd) И это всё ещё тот же самый источник
            if (naturalEnd && isPlaying) {
                isPlaying = false;
                updateUIState();
                // Небольшая задержка перед следующим треком для стабильности
                setTimeout(playNextTrack, 100);
            }
        };
        const remainingSec = (currentTrackBuffer.duration - offsetSeconds) / (Number(speedSlider.value) / 100);
        const now = Date.now();
        window.electronAPI.updateDiscordRPC({
            title: currentMetadata.title || currentTrackNameLabel.textContent,
            artist: currentMetadata.artist || '',
            album: currentMetadata.album || '',
            status: 'playing',
            startTimestamp: Math.floor(now - (offsetSeconds * 1000)),
            endTimestamp: Math.floor(now + (remainingSec * 1000))
        });

        updateUIState();
        startRenderLoop();
    }

    // Обычная пауза (кнопка мыши) - остаемся где были
    function pause() {
        if (!currentSource || !isPlaying) return;
        pauseTimeSec = getCurrentTime(); // Сохраняем текущую позицию
        window.electronAPI.updateDiscordRPC({
            title: currentMetadata.title || currentTrackNameLabel.textContent,
            artist: currentMetadata.artist || '',
            album: currentMetadata.album || '',
            status: 'paused'
        });
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
            try { currentSource.stop(); } catch (e) { } // stop() сам выставит naturalEnd = false
            currentSource = null;
        }
        isPlaying = false;
        stopRenderLoop();
    }

    async function loadAndPlayTrack(trackPath, trackElement) {
        if (isPlaying) {
            fadeOutAndStop();
        } else {
            stopSource();
        }

        if (currentPlayingElement) currentPlayingElement.classList.remove('playing');

        currentTrackPath = trackPath;
        currentPlayingElement = trackElement;
        currentTrackBuffer = null;
        isPlaying = false;
        timeDisplay.innerHTML = '<span>Loading...</span>';

        // Читаем ID3 метаданные напрямую из файла
        const meta = await window.electronAPI.getTrackMetadata(trackPath);
        currentMetadata = meta;

        // Отображаем Название (если нет в тегах — берем имя файла)
        const rawFileName = trackElement.querySelector('.track-name').textContent;
        currentTrackNameLabel.textContent = meta.title || rawFileName;

        // В строке папки пишем Исполнителя / Альбом или имя папки
        const folderNode = trackElement.closest('.folder-group');
        const folderName = folderNode ? folderNode.querySelector('h3').textContent : 'Unknown';
        if (meta.artist) {
            currentTrackFolderLabel.textContent = meta.album ? `${meta.artist} • ${meta.album}` : meta.artist;
        } else {
            currentTrackFolderLabel.textContent = folderName;
        }

        // Обложка из тегов
        const glowEl = document.querySelector('.artwork-glow');
        if (meta.picture) {
            glowEl.style.backgroundImage = `url(${meta.picture})`;
            glowEl.style.opacity = '0.6';
        } else {
            glowEl.style.backgroundImage = '';
            glowEl.style.opacity = '0.2';
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
            setTimeout(() => drawWaveform(audioBuffer), 50);

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

    async function updateAlbumArt(trackPath) {
        const artData = await window.electronAPI.getAlbumArt(trackPath);
        const glowEl = document.querySelector('.artwork-glow');
        if (artData) {
            glowEl.style.backgroundImage = `url(${artData})`;
            glowEl.style.opacity = '0.6';
        } else {
            glowEl.style.backgroundImage = '';
            glowEl.style.opacity = '0.2';
        }
    }

    function getVisibleTracks() {
        return Array.from(document.querySelectorAll('.track-item'))
            .filter(t => t.style.display !== 'none');
    }

    function playNextTrack() {
        const tracks = getVisibleTracks();
        // Ищем индекс по пути текущего трека
        const currentIndex = tracks.findIndex(t => t.dataset.path === currentTrackPath);

        if (currentIndex > -1 && currentIndex < tracks.length - 1) {
            const nextTrackElement = tracks[currentIndex + 1];
            loadAndPlayTrack(nextTrackElement.dataset.path, nextTrackElement);
        } else {
            console.log("Next track not found or end of list");
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

    // Когда отпускаем слайдер - меняем точку старта
    window.addEventListener('mouseup', () => {
        if (isDraggingSlider) {
            isDraggingSlider = false;
            if (currentTrackBuffer) {
                const time = (progressSlider.value / 1000) * currentTrackBuffer.duration;
                pauseTimeSec = time;
                playbackStartSec = time; // Если перемотали рукой - это новая точка старта
                if (isPlaying) play(time);
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

    let lastRenderTime = 0;
    function render(timestamp) {
        if (!currentTrackBuffer || !visualsEnabled) return;

        // Ограничиваем до ~45 FPS для экономии GPU
        if (timestamp - lastRenderTime < 22) {
            animationFrameId = requestAnimationFrame(render);
            return;
        }
        lastRenderTime = timestamp;

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
        analyser.getByteFrequencyData(dataArray);
        const bufferLength = dataArray.length;

        spectrogramCtx.clearRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);

        const barWidth = (spectrogramCanvas.width / bufferLength) * 1.8;
        const centerX = spectrogramCanvas.width / 2;
        const timeFactor = (Date.now() / 50) % 360;

        // Рисуем один раз общим цветом или градиентом, если возможно, 
        // но для "WOW" эффекта оставим цикл, просто оптимизируем его.

        spectrogramCtx.lineCap = 'round';

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * spectrogramCanvas.height * 0.7;
            if (barHeight < 2) continue; // Пропускаем тихие бины

            const hue = (i / bufferLength * 360) + timeFactor;
            spectrogramCtx.fillStyle = `hsla(${hue}, 80%, 60%, 0.6)`;

            // Вместо тяжелых градиентов используем простые Rect
            spectrogramCtx.fillRect(centerX + (i * (barWidth + 2)), spectrogramCanvas.height - barHeight, barWidth, barHeight);
            spectrogramCtx.fillRect(centerX - (i * (barWidth + 2)) - barWidth, spectrogramCanvas.height - barHeight, barWidth, barHeight);
        }

        // Оптимизируем пульсацию: меняем только прозрачность спец-слоя
        const bass = dataArray[0] + dataArray[1] + dataArray[2]; // Быстрый замер баса
        const glowEl = document.querySelector('.artwork-glow');
        if (glowEl) {
            glowEl.style.opacity = (bass / 765) * 0.6;
            glowEl.style.transform = `scale(${1 + (bass / 1500)}) rotate(${timeFactor / 10}deg)`;
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

    const themeSwitcherBtn = document.getElementById('theme-switcher');
    const themeLink = document.getElementById('theme-link');

    // Список твоих тем. Просто добавляй сюда имена новых файлов.
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

    // Функция, которая применяет тему
    function applyTheme(themeName) {
        if (themeName === 'main.css') {
            themeLink.href = `styles/main.css`;
        } else {
            themeLink.href = `styles/themes/${themeName}`;
        }
        console.log(`Theme applied: ${themeName}`);
    }

    // Функция, которая сохраняет и переключает тему
    function switchTheme() {
        // Получаем текущий индекс из памяти (или 0, если его нет)
        let currentThemeIndex = Number(localStorage.getItem('themeIndex') || 0);

        // Вычисляем следующий индекс по кругу
        currentThemeIndex = (currentThemeIndex + 1) % themes.length;

        // Применяем новую тему
        const newTheme = themes[currentThemeIndex];
        applyTheme(newTheme);

        // Перерисовываем вейвформу с новым цветом
        setTimeout(() => {
            if (currentTrackBuffer) drawWaveform(currentTrackBuffer);
        }, 100);

        // Сохраняем новый индекс в память
        localStorage.setItem('themeIndex', currentThemeIndex);
    }

    // Вешаем обработчик на кнопку
    themeSwitcherBtn.addEventListener('click', switchTheme);


    // --- Загрузка темы при старте приложения ---
    function loadInitialTheme() {
        const savedThemeIndex = Number(localStorage.getItem('themeIndex') || 0);
        // Проверка, чтобы индекс не выходил за рамки, если ты удалишь тему
        const validIndex = savedThemeIndex < themes.length ? savedThemeIndex : 0;

        applyTheme(themes[validIndex]);
        localStorage.setItem('themeIndex', validIndex); // Обновляем на случай, если был невалидный
    }

    loadInitialTheme();

    trackVolumeSlider.addEventListener('input', e => {
        const val = e.target.value;
        masterGain.gain.setValueAtTime(val / 100, audioContext.currentTime);
        trackVolumeValue.textContent = `${val}%`;
        onSettingsChange();
    });
    function updateVolume(value) {
        const val = Math.min(200, Math.max(0, Number(value))); // Ограничиваем значение
        masterGain.gain.setValueAtTime(val / 100, audioContext.currentTime);
        trackVolumeValue.textContent = `${val}%`;
        trackVolumeSlider.value = val;
        trackVolumeInput.value = val;
        onSettingsChange();
    }
    trackVolumeSlider.addEventListener('input', e => updateVolume(e.target.value));
    trackVolumeInput.addEventListener('change', e => updateVolume(e.target.value));

    function updateSpeed(value) {
        const val = Math.min(200, Math.max(50, Number(value))); // Ограничиваем значение
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
            const tracksInner = document.createElement('div');
            tracksInner.className = 'folder-tracks-inner';

            folderData.tracks.forEach((track, index) => {
                const item = document.createElement('div');
                item.className = 'track-item track-appear-effect'; // Добавляем спец-класс для анимации

                // УМНЫЙ ЗАМЕР: задержка растет, но не бесконечно. 
                // Максимум 0.4 сек, чтобы не ждать вечность внизу списка.
                const delay = Math.min(index * 0.02, 0.4);
                item.style.animationDelay = `${delay}s`;

                if (playingPath === track.path) item.classList.add('playing');

                // Удаляем класс анимации после того, как она прошла, 
                // чтобы при клике (смене классов) она не запустилась снова
                setTimeout(() => {
                    item.classList.remove('track-appear-effect');
                }, 1000);

                item.dataset.path = track.path;
                item.innerHTML = `<span class="track-name">${track.name}</span>`;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    loadAndPlayTrack(track.path, item);
                });
                tracksInner.appendChild(item);
            })

            tracksUl.appendChild(tracksInner); // А внутренний див в грид-контейнер
            folderGroup.append(title, tracksUl);

            // Style for opening
            const style = document.createElement('style');
            style.textContent = `.folder-group.open .folder-tracks { display: block !important; }`;
            if (!document.getElementById('folder-style')) { style.id = 'folder-style'; document.head.appendChild(style); }

            trackListContainer.appendChild(folderGroup);
        });
        if (searchInput.value) searchInput.dispatchEvent(new Event('input'));
    }

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

    const resizer = document.getElementById('sidebar-resizer');
    const sidebar = document.getElementById('explorer-sidebar');
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        // Вычисляем ширину справа налево
        const newWidth = document.body.clientWidth - e.clientX;
        if (newWidth >= 200 && newWidth <= 650) {
            sidebar.style.width = `${newWidth}px`;
            // Перерисовываем вейвформу, так как ширина левой панели изменилась
            if (currentTrackBuffer) drawWaveform(currentTrackBuffer);
        }
    });

    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
            if (currentTrackBuffer) drawWaveform(currentTrackBuffer);
        }
    });

    // Рисуем сверхлегкую базовую сетку/шкалу таймлайна (вызывается 1 раз при загрузке)
function drawWaveform() {
    const dpr = window.devicePixelRatio || 1;
    waveformCanvas.width = waveformCanvas.clientWidth * dpr;
    waveformCanvas.height = waveformCanvas.clientHeight * dpr;
    waveformCtx.scale(dpr, dpr);

    const w = waveformCanvas.clientWidth;
    const h = waveformCanvas.clientHeight;

    waveformCtx.clearRect(0, 0, w, h);

    // Центральная направляющая линия
    waveformCtx.beginPath();
    waveformCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    waveformCtx.lineWidth = 1;
    waveformCtx.moveTo(0, h / 2);
    waveformCtx.lineTo(w, h / 2);
    waveformCtx.stroke();

    // Засечки делений (каждые 5% ширины)
    waveformCtx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let x = 0; x < w; x += w / 20) {
        waveformCtx.fillRect(x, h / 2 - 4, 1, 8);
    }
}
    selectFolderBtn.addEventListener('click', () => window.electronAPI.selectFolder(true));
    window.electronAPI.onReceiveTracks(displayTracks);

    window.addEventListener('resize', () => {
        if (currentTrackBuffer) drawWaveform(currentTrackBuffer);
    });
    window.dispatchEvent(new Event('resize'));
});
