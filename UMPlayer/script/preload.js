const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // imgay
    selectFolder: (scanSubfolders) => ipcRenderer.invoke('dialog:openFolder', scanSubfolders),
    onReceiveTracks: (callback) => ipcRenderer.on('update-track-list', (event, tracks) => callback(tracks)),
    
    // audio
    getAudioData: (filePath) => ipcRenderer.invoke('get-audio-data', filePath),
    
    // settings
    getTrackSettings: (trackPath) => ipcRenderer.invoke('get-track-settings', trackPath),
    saveTrackSettings: (data) => ipcRenderer.send('save-track-settings', data),
});