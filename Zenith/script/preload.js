// communication bridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // files & folders
    selectFolder: (scanSubfolders) => ipcRenderer.invoke('dialog:openFolder', scanSubfolders),
    onReceiveTracks: (callback) => ipcRenderer.on('update-track-list', (event, tracks) => callback(tracks)),
    
    // keys
    onGlobalCommand: (callback) => ipcRenderer.on('global-command', (event, cmd) => callback(cmd)),
    
    // sound, art & metadata
    getAudioData: (filePath) => ipcRenderer.invoke('get-audio-data', filePath),
    getTrackMetadata: (filePath) => ipcRenderer.invoke('get-track-metadata', filePath),
    getAlbumArt: (trackPath) => ipcRenderer.invoke('get-album-art', trackPath),
    
    // discord rpc
    updateDiscordRPC: (data) => ipcRenderer.send('update-discord-rpc', data),
    clearDiscordRPC: () => ipcRenderer.send('clear-discord-rpc'),

    // settings
    getTrackSettings: (trackPath) => ipcRenderer.invoke('get-track-settings', trackPath),
    saveTrackSettings: (data) => ipcRenderer.send('save-track-settings', data),

    // window
    minimize: (type) => ipcRenderer.send('window-minimize', type),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close')
});