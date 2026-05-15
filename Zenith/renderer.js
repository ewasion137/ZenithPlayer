document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('app-loading');
    setTimeout(() => {
        document.body.classList.remove('app-loading');
    }, 1000);

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

    // 4. Window Controls
    document.getElementById('win-min').addEventListener('click', () => window.electronAPI.minimize());
    document.getElementById('win-max').addEventListener('click', () => window.electronAPI.maximize());
    document.getElementById('win-close').addEventListener('click', () => window.electronAPI.close());


    // --- Audio Functions ---

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
            try { currentSource.stop(); } catch (e) { } // stop() сам выставит naturalEnd = false
            currentSource = null;
        }
        isPlaying = false;
        stopRenderLoop();
    }

    async function loadAndPlayTrack(trackPath, trackElement) {
        // 1. Снимаем подсветку со старого трека
        if (currentPlayingElement) currentPlayingElement.classList.remove('playing');

        stopSource(); // Останавливаем всё, что играло

        // 2. Сразу обновляем состояние (чтобы не было путаницы)
        currentTrackPath = trackPath;
        currentPlayingElement = trackElement;
        currentTrackBuffer = null;
        isPlaying = false;
        timeDisplay.innerHTML = '<span>Loading...</span>';

        // Update labels
        currentTrackNameLabel.textContent = trackElement.querySelector('.track-name').textContent;
        const folderName = trackElement.closest('.folder-group').querySelector('h3').textContent;
        currentTrackFolderLabel.textContent = folderName;

        const savedSettings = await window.electronAPI.getTrackSettings(trackPath);
        applySettings(savedSettings);

        try {
            const rawData = await window.electronAPI.getAudioData(trackPath);

            // ПРОВЕРКА: если пользователь уже выбрал другой трек, пока этот грузился - отменяем
            if (currentTrackPath !== trackPath) return;
            if (!rawData) throw new Error("Failed to get audio data");

            const audioBuffer = await audioContext.decodeAudioData(rawData.buffer);

            // ЕЩЕ ОДНА ПРОВЕРКА: на случай если декодинг был долгим
            if (currentTrackPath !== trackPath) return;

            currentTrackBuffer = audioBuffer;
            setTimeout(() => drawWaveform(audioBuffer), 50);

            // Сбрасываем таймеры
            pauseTimeSec = 0;
            playbackStartSec = 0;
            progressSlider.value = 0;

            // 3. ВОТ КЛЮЧЕВОЙ МОМЕНТ: Подсвечиваем трек только СЕЙЧАС, когда все готово.
            trackElement.classList.add('playing');

            play(0);

        } catch (err) {
            console.error("Error loading track:", err);
            timeDisplay.innerHTML = `<span>Error</span>`;
            // Если была ошибка, убираем подсветку
            if (currentPlayingElement === trackElement) {
                trackElement.classList.remove('playing');
            }
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
        
        const barWidth = (spectrogramCanvas.width / bufferLength) * 1.5;
        let x = 0;
        
        // Mirror effect for "WOW"
        const centerX = spectrogramCanvas.width / 2;
        
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * spectrogramCanvas.height * 0.8;
            const hue = (i / bufferLength * 360) + (Date.now() / 50) % 360;
            
            // Dynamic gradient
            const gradient = spectrogramCtx.createLinearGradient(0, spectrogramCanvas.height, 0, spectrogramCanvas.height - barHeight);
            gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.1)`);
            gradient.addColorStop(0.5, `hsla(${hue}, 100%, 50%, 0.5)`);
            gradient.addColorStop(1, `hsla(${hue + 40}, 100%, 70%, 0.8)`);
            
            spectrogramCtx.fillStyle = gradient;
            
            // Draw symmetric bars
            spectrogramCtx.fillRect(centerX + x, spectrogramCanvas.height - barHeight, barWidth, barHeight);
            spectrogramCtx.fillRect(centerX - x - barWidth, spectrogramCanvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 2;
            if (centerX + x > spectrogramCanvas.width) break;
        }
        
        // Add a subtle glow pulse to the whole window based on bass
        const bass = dataArray.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
        const glowOpacity = (bass / 255) * 0.3;
        document.body.style.boxShadow = `inset 0 0 ${bass / 2}px rgba(255, 0, 122, ${glowOpacity})`;
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
        'main.css'
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

    function drawWaveform(buffer) {
        // 1. Фикс разрешения (HD качество)
        const dpr = window.devicePixelRatio || 1;
        waveformCanvas.width = waveformCanvas.clientWidth * dpr;
        waveformCanvas.height = waveformCanvas.clientHeight * dpr;
        waveformCtx.scale(dpr, dpr);

        const width = waveformCanvas.clientWidth;
        const height = waveformCanvas.clientHeight;
        const data = buffer.getChannelData(0);

        // 2. Настройка стиля (берем акцентный цвет)
        const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8b5cf6';

        waveformCtx.clearRect(0, 0, width, height);

        // Рисуем центральную линию (ось)
        waveformCtx.beginPath();
        waveformCtx.strokeStyle = 'rgba(255,255,255,0.1)';
        waveformCtx.moveTo(0, height / 2);
        waveformCtx.lineTo(width, height / 2);
        waveformCtx.stroke();

        // 3. Рисуем столбики
        const barWidth = 2; // Ширина одного столбика
        const gap = 1;      // Просвет между ними
        const step = Math.ceil(data.length / (width / (barWidth + gap)));
        const amp = height / 2;

        for (let i = 0; i < width; i += (barWidth + gap)) {
            let min = 1.0;
            let max = -1.0;

            for (let j = 0; j < step; j++) {
                const datum = data[Math.floor((i / (barWidth + gap)) * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }

            // Делаем цвет чуть прозрачным, чтобы выглядело мягче
            waveformCtx.fillStyle = accentColor;

            // Рисуем верхнюю и нижнюю части столбика
            // Ограничиваем минимальную высоту в 1px, чтобы не было пустых мест
            const x = i;
            const y = (1 + min) * amp;
            const w = barWidth;
            const h = Math.max(1, (max - min) * amp);

            // Скругленные столбики (опционально)
            waveformCtx.fillRect(x, y, w, h);
        }
    }
    window.electronAPI.onGlobalCommand((cmd) => {
        if (cmd === 'play-pause') {
            if (!currentTrackBuffer) return;
            isPlaying ? pause() : play(pauseTimeSec);
        } else if (cmd === 'next-track') {
            playNextTrack();
        } else if (cmd === 'prev-track') {
            playPrevTrack();
        }
    });
    selectFolderBtn.addEventListener('click', () => window.electronAPI.selectFolder(true));
    window.electronAPI.onReceiveTracks(displayTracks);

    window.addEventListener('resize', () => {
        spectrogramCanvas.width = spectrogramCanvas.parentElement.clientWidth;
        spectrogramCanvas.height = spectrogramCanvas.parentElement.clientHeight;
        if (currentTrackBuffer) drawWaveform(currentTrackBuffer);
    });
    window.dispatchEvent(new Event('resize'));
});
