// warning, this code is ai written
// please, be careful

/* i dont give a f man */


// --- MAIN RUNNING SCRIPT OF ZENITHPLAYER --- //

const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const play = require('play-dl');
const musicMetadata = require('music-metadata');
const ytdl = require('@distube/ytdl-core');
const DiscordRPC = require('discord-rpc');

let rpcClient = null;
let isRpcConnected = false;

const settingsPath = path.join(app.getPath('userData'), 'zenith-settings.json');
let appSettings = {};
let currentWatchers = [];
let mainWindow = null;
let tray = null;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 750,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'form.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    createTray();
    registerShortcuts();
};

app.whenReady().then(() => {
    loadSettings();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

function createTray() {
    // icon path
    const iconPath = path.join(__dirname, '..', 'icon.png');
    let trayIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createFromPath('');

    if (!fs.existsSync(iconPath)) {
        console.log('Tray icon NOT found at:', iconPath);
    }

    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show Zenith', click: () => {
                mainWindow.show();
                mainWindow.focus();
            }
        },
        { type: 'separator' },
        {
            label: 'Play/Pause', click: () => {
                console.log('Tray: Play/Pause');
                mainWindow.webContents.send('global-command', 'play-pause');
            }
        },
        {
            label: 'Next', click: () => {
                console.log('Tray: Next');
                mainWindow.webContents.send('global-command', 'next');
            }
        },
        {
            label: 'Previous', click: () => {
                console.log('Tray: Previous');
                mainWindow.webContents.send('global-command', 'prev');
            }
        },
        { type: 'separator' },
        {
            label: 'Exit', click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Zenith Player');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => mainWindow.show());
}

const YTDlpWrap = require('yt-dlp-wrap').default;
const ytDlpBinaryPath = path.join(app.getPath('userData'), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
let ytDlp = null;

async function getEngine() {
    if (ytDlp && fs.existsSync(ytDlpBinaryPath)) return ytDlp;
    
    if (!fs.existsSync(ytDlpBinaryPath)) {
        console.log('[Zenith] Downloading official yt-dlp engine...');
        await YTDlpWrap.downloadFromGithub(ytDlpBinaryPath);
        console.log('[Zenith] yt-dlp ready!');
    }
    ytDlp = new YTDlpWrap(ytDlpBinaryPath);
    return ytDlp;
}

// Хранилище веб-треков
const webTracksPath = path.join(app.getPath('userData'), 'zenith-web-tracks.json');
function loadWebTracks() {
    try {
        if (fs.existsSync(webTracksPath)) return JSON.parse(fs.readFileSync(webTracksPath, 'utf8'));
    } catch (e) { }
    return [];
}

ipcMain.handle('get-saved-web-tracks', () => loadWebTracks());

ipcMain.on('save-web-tracks', (event, tracks) => {
    try { fs.writeFileSync(webTracksPath, JSON.stringify(tracks, null, 2)); }
    catch (e) { console.error(e); }
});

const { Innertube, UniversalCache } = require('youtubei.js');
let ytClient = null;

async function getYT() {
    if (!ytClient) {
        ytClient = await Innertube.create({
            cache: new UniversalCache(true),
            retrieve_player: true
        });
    }
    return ytClient;
}

const INVIDIOUS_INSTANCES = [
    'https://invidious.privacydev.net',
    'https://inv.nadeko.net',
    'https://vid.puffyan.us',
    'https://invidious.nerdvpn.de',
    'https://yt.drgnz.club'
];

// Надежные парсеры ссылок
function parseYouTubeId(input) {
    if (!input) return null;
    const str = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;

    const match = str.match(/(?:[?&]v=|\/embed\/|\/shorts\/|\/v\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    return match ? match[1] : null;
}

function parseSpotifyId(input) {
    if (!input) return null;
    const match = input.trim().match(/spotify\.com\/track\/([a-zA-Z0-9]+)/i);
    return match ? match[1] : null;
}

// Резолвер треков (1 вызов yt-dlp + нативный fetch потока)
ipcMain.handle('stream:resolve-url', async (event, urlOrQuery) => {
    try {
        const engine = await getEngine();
        const rawInput = urlOrQuery.trim();
        let targetUrl = rawInput;
        let spotifyTitle = null;
        let spotifyArtist = null;
        let spotifyCover = null;

        const ytId = parseYouTubeId(rawInput);
        const spId = parseSpotifyId(rawInput);

        if (spId) {
            // === 1. SPOTIFY URL ===
            try {
                const spRes = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${spId}`);
                if (spRes.ok) {
                    const spData = await spRes.json();
                    spotifyTitle = spData.title;
                    spotifyArtist = spData.author_name;
                    spotifyCover = spData.thumbnail_url;
                }
            } catch (e) { }

            const query = `${spotifyArtist || ''} ${spotifyTitle || ''}`.trim() || spId;
            targetUrl = `ytsearch1:${query}`;
        } else if (ytId) {
            // === 2. YOUTUBE / MUSIC.YOUTUBE ===
            targetUrl = `https://www.youtube.com/watch?v=${ytId}`;
        } else {
            // === 3. ПОИСК ПО ТЕКСТУ ===
            targetUrl = `ytsearch1:${rawInput}`;
        }

        // 1. Получаем полные метаданные и прямой URL потока за 1 запрос
        const jsonDump = await engine.execPromise([
            targetUrl,
            '--dump-json',
            '--no-warnings',
            '--extractor-args', 'youtube:player_client=android,ios',
            '-f', 'ba/b'
        ]);

        const meta = JSON.parse(jsonDump);
        const title = spotifyTitle || (meta.title || 'Unknown Track').replace(/\s*\(Official.*?\)|\[Official.*?\]|\s*\(Lyrics\)|\s*\(Audio\)/gi, '').trim();
        const artist = spotifyArtist || meta.uploader || meta.channel || 'Online Stream';
        const picture = spotifyCover || meta.thumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null);

        if (!meta.url) {
            throw new Error("Direct audio stream URL not found");
        }

        // 2. Скачиваем аудиодорожку напрямую через нативный fetch (быстро и без pipe-ошибок)
        const audioRes = await fetch(meta.url, {
            headers: meta.http_headers || {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36'
            }
        });

        if (!audioRes.ok) {
            throw new Error(`Direct audio stream download failed: ${audioRes.status}`);
        }

        const arrayBuf = await audioRes.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuf);

        return {
            success: true,
            trackId: `web:${meta.id || ytId || Date.now()}`,
            url: rawInput,
            title,
            artist,
            picture,
            audioData: audioBuffer
        };
    } catch (err) {
        console.error("Stream Resolve Error:", err);
        return { success: false, error: err.message || 'Stream download failed' };
    }
});


function registerShortcuts() {
    // keys
    globalShortcut.register('MediaPlayPause', () => {
        console.log('Shortcut: MediaPlayPause');
        mainWindow.webContents.send('global-command', 'play-pause');
    });
    globalShortcut.register('MediaNextTrack', () => {
        console.log('Shortcut: MediaNextTrack');
        mainWindow.webContents.send('global-command', 'next');
    });
    globalShortcut.register('MediaPreviousTrack', () => {
        console.log('Shortcut: MediaPreviousTrack');
        mainWindow.webContents.send('global-command', 'prev');
    });

    // binds
    globalShortcut.register('Alt+P', () => {
        console.log('Shortcut: Alt+P');
        BrowserWindow.getAllWindows().forEach(w => w.webContents.send('global-command', 'play-pause'));
    });
    globalShortcut.register('Alt+Right', () => {
        console.log('Shortcut: Alt+Right');
        BrowserWindow.getAllWindows().forEach(w => w.webContents.send('global-command', 'next'));
    });
    globalShortcut.register('Alt+Left', () => {
        console.log('Shortcut: Alt+Left');
        BrowserWindow.getAllWindows().forEach(w => w.webContents.send('global-command', 'prev'));
    });
}

function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            appSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        }
    } catch (error) { console.error(error); }
}

function saveSettings() {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(appSettings, null, 2));
    } catch (error) { console.error(error); }
}

// fs

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac'];

async function findAudioFilesRecursive(dir, scanSubfolders, folderMap) {
    try {
        const files = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            if (scanSubfolders && file.isDirectory()) {
                await findAudioFilesRecursive(fullPath, scanSubfolders, folderMap);
            } else if (file.isFile() && AUDIO_EXTENSIONS.includes(path.extname(file.name).toLowerCase())) {
                const directory = path.dirname(fullPath);
                if (!folderMap.has(directory)) folderMap.set(directory, []);
                folderMap.get(directory).push({
                    name: path.basename(file.name, path.extname(file.name)),
                    path: fullPath
                });
            }
        }
    } catch (e) { console.error(e); }
}

// keep an eye on files without being annoying
let watchTimeout = null;
function startWatching(target, recursive) {
    currentWatchers.forEach(w => w.close());
    currentWatchers = [];

    try {
        // recursive: true is a windows/mac luxury. linux will just watch top level for now
        const watcher = fs.watch(target, { recursive: recursive && process.platform !== 'linux' }, (event, file) => {
            if (event === 'rename') {
                console.log(`[watch] ${file} changed`);
                clearTimeout(watchTimeout);
                watchTimeout = setTimeout(() => {
                    if (mainWindow) refreshList(target, recursive);
                }, 500);
            }
        });
        currentWatchers.push(watcher);
    } catch (e) {
        console.log("watch error:", e);
    }
}

async function refreshList(target, recursive) {
    const map = new Map();
    await findAudioFilesRecursive(target, recursive, map);
    const result = Array.from(map, ([folder, tracks]) => ({ folder, tracks }));
    if (mainWindow) mainWindow.webContents.send('update-track-list', result);
}

// ipc handlers

ipcMain.handle('dialog:openFolder', async (event, scanSubfolders) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (canceled || filePaths.length === 0) return;

    const folderPath = filePaths[0];

    // fire up the watcher
    startWatching(folderPath, scanSubfolders);

    // initial scan
    await refreshList(folderPath, scanSubfolders);
});

ipcMain.handle('get-audio-data', async (event, filePath) => {
    try { return await fs.promises.readFile(filePath); }
    catch (error) { return null; }
});

ipcMain.handle('get-track-settings', (event, trackPath) => appSettings[trackPath] || {});

ipcMain.handle('get-track-metadata', async (event, trackPath) => {
    try {
        const metadata = await musicMetadata.parseFile(trackPath, { skipCovers: false });
        const common = metadata.common || {};

        let coverBase64 = null;
        if (common.picture && common.picture.length > 0) {
            const pic = common.picture[0];
            coverBase64 = `data:${pic.format};base64,${pic.data.toString('base64')}`;
        } else {
            // Фолбэк: если внутри тегов нет обложки, ищем файл в папке
            const dir = path.dirname(trackPath);
            const files = await fs.promises.readdir(dir);
            const artFile = files.find(f => {
                const name = f.toLowerCase();
                const isImg = /\.(jpg|jpeg|png|webp)$/i.test(name);
                return isImg && (name.includes('cover') || name.includes('folder') || name.includes('album') || name.includes('front') || files.length < 10);
            });
            if (artFile) {
                const buf = await fs.promises.readFile(path.join(dir, artFile));
                coverBase64 = `data:image/${path.extname(artFile).slice(1)};base64,${buf.toString('base64')}`;
            }
        }

        return {
            title: common.title || null,
            artist: common.artist || null,
            album: common.album || null,
            year: common.year || null,
            picture: coverBase64
        };
    } catch (err) {
        console.error('Metadata parse error:', err);
        return { title: null, artist: null, album: null, picture: null };
    }
});

ipcMain.on('window-minimize', (event, type) => {
    if (type === 'tray') mainWindow.hide();
    else mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.on('window-close', () => {
    app.isQuitting = true;
    app.quit();
});

ipcMain.handle('discord-rpc:init', async (event, clientId) => {
    try {
        // Безопасно убиваем старый клиент (глушим баг библиотеки discord-rpc)
        if (rpcClient) {
            try {
                rpcClient.removeAllListeners();
                await rpcClient.destroy();
            } catch (_) {
                // Игнорируем ошибку библиотеки 'reading write' на закрытом сокете
            }
            rpcClient = null;
        }

        isRpcConnected = false;
        DiscordRPC.register(clientId);
        rpcClient = new DiscordRPC.Client({ transport: 'ipc' });

        // Обязательно глушим системные ошибки сокета, чтобы Electron не плевался
        rpcClient.on('error', (err) => {
            console.warn('[Discord RPC Error]:', err.message);
        });

        return new Promise((resolve) => {
            // Таймаут 5 секунд на случай, если Discord завис или закрыт
            const timeout = setTimeout(() => {
                isRpcConnected = false;
                resolve({ success: false, error: 'Timeout. Is Discord app running?' });
            }, 5000);

            rpcClient.once('ready', () => {
                clearTimeout(timeout);
                isRpcConnected = true;
                resolve({ success: true });
            });

            rpcClient.login({ clientId }).catch(err => {
                clearTimeout(timeout);
                isRpcConnected = false;
                resolve({ success: false, error: 'Could not connect (open Discord app)' });
            });
        });
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.on('discord-rpc:update', (event, data) => {
    if (!rpcClient || !isRpcConnected) return;

    try {
        const activity = {
            details: data.title ? (data.artist ? `${data.artist} - ${data.title}` : data.title) : 'Listening to Music',
            state: data.status === 'playing' ? (data.album || 'Playing') : 'Paused',
            instance: false
        };

        // Если это прямая HTTPS-обложка (YouTube / Spotify / Web)
        if (data.picture && typeof data.picture === 'string' && data.picture.startsWith('http')) {
            activity.largeImageKey = data.picture;
            activity.largeImageText = data.album || data.title || 'Zenith Player';
        }

        if (data.status === 'playing' && data.startTimestamp && data.endTimestamp) {
            activity.startTimestamp = data.startTimestamp;
            activity.endTimestamp = data.endTimestamp;
        }

        rpcClient.setActivity(activity).catch(err => console.warn('RPC setActivity error:', err.message));
    } catch (e) {
        console.error('RPC Update error:', e);
    }
});

ipcMain.on('discord-rpc:clear', () => {
    if (rpcClient && isRpcConnected) {
        rpcClient.clearActivity().catch(console.error);
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

let saveTimeout = null;
ipcMain.on('save-track-settings', (event, { trackPath, settings }) => {
    if (trackPath && settings) {
        appSettings[trackPath] = settings;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveSettings, 500);
    }
});
