// warning, this code is ai written
// please, be careful

/* i dont give a f man */


// --- MAIN RUNNING SCRIPT OF ZENITHPLAYER --- //

const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const musicMetadata = require('music-metadata');
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
        if (rpcClient) {
            await rpcClient.destroy();
            rpcClient = null;
        }

        DiscordRPC.register(clientId);
        rpcClient = new DiscordRPC.Client({ transport: 'ipc' });

        return new Promise((resolve) => {
            rpcClient.on('ready', () => {
                isRpcConnected = true;
                resolve({ success: true });
            });

            rpcClient.login({ clientId }).catch(err => {
                isRpcConnected = false;
                resolve({ success: false, error: err.message });
            });
        });
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.on('discord-rpc:update', (event, data) => {
    if (!rpcClient || !isRpcConnected) return;

    const activity = {
        details: data.title ? (data.artist ? `${data.artist} - ${data.title}` : data.title) : 'Listening to Music',
        state: data.status === 'playing' ? (data.album || 'Playing') : 'Paused',
        largeImageKey: 'zenith_logo', // Задай имя ассета в Discord Dev Portal или оставь
        largeImageText: 'Zenith Player',
        instance: false
    };

    if (data.status === 'playing' && data.startTimestamp && data.endTimestamp) {
        activity.startTimestamp = data.startTimestamp;
        activity.endTimestamp = data.endTimestamp;
    }

    rpcClient.setActivity(activity).catch(console.error);
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
