const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs'); 

const settingsPath = path.join(app.getPath('userData'), 'umplayer-settings.json');
let appSettings = {}; 

/**
 * Initialize main application window
 */
const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  win.loadFile('form.html');
};

app.whenReady().then(() => {
  loadSettings(); 
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Load persistent track settings from local JSON
 */
function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) { 
            const data = fs.readFileSync(settingsPath, 'utf8'); 
            appSettings = JSON.parse(data);
            console.log("Settings loaded successfully.");
        } else {
            appSettings = {}; 
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
        appSettings = {}; 
    }
}

/**
 * Save current settings object to disk
 */
function saveSettings() {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(appSettings, null, 2));
        console.log("Settings saved to disk.");
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
}

// --- FILE SYSTEM OPERATIONS ---

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac'];

/**
 * Recursively scan directories for supported audio files
 */
async function findAudioFilesRecursive(dir, scanSubfolders, folderMap) {
    const files = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        
        if (scanSubfolders && file.isDirectory()) {
            await findAudioFilesRecursive(fullPath, scanSubfolders, folderMap);
        } else if (file.isFile() && AUDIO_EXTENSIONS.includes(path.extname(file.name).toLowerCase())) {
            const directory = path.dirname(fullPath);
            
            if (!folderMap.has(directory)) {
                folderMap.set(directory, []);
            }
            
            folderMap.get(directory).push({
                name: path.basename(file.name, path.extname(file.name)),
                path: fullPath
            });
        }
    }
}

// --- IPC HANDLERS ---

/**
 * Handle folder selection and file scanning
 */
ipcMain.handle('dialog:openFolder', async (event, scanSubfolders) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (canceled || filePaths.length === 0) return;
    
    const folderPath = filePaths[0];
    const folderMap = new Map();
    
    try {
        await findAudioFilesRecursive(folderPath, scanSubfolders, folderMap);
    } catch (e) {
        console.error("Error during folder scan:", e);
    }

    const result = Array.from(folderMap, ([folder, tracks]) => ({ folder, tracks }));
    event.sender.send('update-track-list', result);
});

/**
 * Retrieve raw audio buffer for the player
 */
ipcMain.handle('get-audio-data', async (event, filePath) => {
    try {
        const audioBuffer = await fs.promises.readFile(filePath);
        return audioBuffer;
    } catch (error) {
        console.error('Error reading audio file:', filePath, error);
        return null;
    }
});

/**
 * Fetch specific settings for a given track
 */
ipcMain.handle('get-track-settings', (event, trackPath) => {
    return appSettings[trackPath] || {}; 
});

/**
 * Store track settings with a 500ms debounce to limit disk I/O
 */
let saveTimeout = null;
ipcMain.on('save-track-settings', (event, { trackPath, settings }) => {
    if (trackPath && settings) {
        appSettings[trackPath] = settings;
        
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveSettings();
        }, 500);
    }
});