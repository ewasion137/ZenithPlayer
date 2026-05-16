// communication bridge. don't touch unless you know what's up
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // files & folders
    selectFolder: (scanSubfolders) => ipcRenderer.invoke('dialog:openFolder', scanSubfolders),
    onReceiveTracks: (callback) => ipcRenderer.on('update-track-list', (event, tracks) => callback(tracks)),
    
    // keys
    onGlobalCommand: (callback) => ipcRenderer.on('global-command', (event, cmd) => callback(cmd)),
    
    // sound & art
    getAudioData: (filePath) => ipcRenderer.invoke('get-audio-data', filePath),
    getAlbumArt: (trackPath) => ipcRenderer.invoke('get-album-art', trackPath),
    
    // settings
    getTrackSettings: (trackPath) => ipcRenderer.invoke('get-track-settings', trackPath),
    saveTrackSettings: (data) => ipcRenderer.send('save-track-settings', data),

    // window
    minimize: (type) => ipcRenderer.send('window-minimize', type),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close')
});
