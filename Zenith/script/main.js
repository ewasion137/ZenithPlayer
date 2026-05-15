const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

const settingsPath = path.join(app.getPath('userData'), 'zenith-settings.json');
let appSettings = {};
let currentWatchers = []; // Храним активные вотчеры
let mainWindow = null;

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
};

app.whenReady().then(() => {
    loadSettings();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    globalShortcut.register('MediaPlayPause', () => {
        mainWindow.webContents.send('global-command', 'play-pause');
    });
    globalShortcut.register('MediaNextTrack', () => {
        mainWindow.webContents.send('global-command', 'next-track');
    });
    globalShortcut.register('MediaPreviousTrack', () => {
        mainWindow.webContents.send('global-command', 'prev-track');
    });

    // Дополнительно: Alt + P для паузы (если нет медиа-клавиш)
    globalShortcut.register('Alt+P', () => {
        mainWindow.webContents.send('global-command', 'play-pause');
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

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

// --- FILE SYSTEM ---

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

// --- WATCHER FUNCTION (Пункт 7) ---
function startWatching(folderPath, scanSubfolders) {
    // Очищаем старые вотчеры
    currentWatchers.forEach(w => w.close());
    currentWatchers = [];

    try {
        // Следим за главной папкой (recursive: true работает на Windows/macOS)
        const watcher = fs.watch(folderPath, { recursive: scanSubfolders }, (eventType, filename) => {
            console.log(`File changed: ${filename}`);
            // Пересканируем с небольшой задержкой (debounce), чтобы не спамить
            if (mainWindow) {
                refreshTrackList(folderPath, scanSubfolders);
            }
        });
        currentWatchers.push(watcher);
    } catch (e) {
        console.log("Watch failed (might be unsupported on this OS logic):", e);
    }
}

async function refreshTrackList(folderPath, scanSubfolders) {
    const folderMap = new Map();
    await findAudioFilesRecursive(folderPath, scanSubfolders, folderMap);
    const result = Array.from(folderMap, ([folder, tracks]) => ({ folder, tracks }));
    if (mainWindow) mainWindow.webContents.send('update-track-list', result);
}

// --- IPC HANDLERS ---

ipcMain.handle('dialog:openFolder', async (event, scanSubfolders) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (canceled || filePaths.length === 0) return;

    const folderPath = filePaths[0];

    // Запускаем слежение
    startWatching(folderPath, scanSubfolders);

    // Первичное сканирование
    await refreshTrackList(folderPath, scanSubfolders);
});

ipcMain.handle('get-audio-data', async (event, filePath) => {
    try { return await fs.promises.readFile(filePath); }
    catch (error) { return null; }
});

ipcMain.handle('get-track-settings', (event, trackPath) => appSettings[trackPath] || {});

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());

let saveTimeout = null;
ipcMain.on('save-track-settings', (event, { trackPath, settings }) => {
    if (trackPath && settings) {
        appSettings[trackPath] = settings;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveSettings, 500);
    }
});
