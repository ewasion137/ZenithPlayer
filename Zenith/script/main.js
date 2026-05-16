// warning, this code is ai written
// please, be careful

/* i dont give a f man */

// --- MAIN RUNNING SCRIPT OF ZENITHPLAYER --- //

const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

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

ipcMain.handle('get-album-art', async (event, trackPath) => {
    try {
        const dir = path.dirname(trackPath);
        const files = await fs.promises.readdir(dir);

        // album
        const artFile = files.find(f => {
            const name = f.toLowerCase();
            const isImg = /\.(jpg|jpeg|png|webp|gif)$/i.test(name);
            if (!isImg) return false;

            // Сначала ищем явные обложки
            return name.includes('cover') ||
                name.includes('folder') ||
                name.includes('album') ||
                name.includes('front') ||
                name.includes('artwork') ||
                files.length < 20;
        });

        if (artFile) {
            const artPath = path.join(dir, artFile);
            const buffer = await fs.promises.readFile(artPath);
            return `data:image/${path.extname(artFile).slice(1)};base64,${buffer.toString('base64')}`;
        }
    } catch (e) {
        console.error('Art search error:', e);
    }
    return null;
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
