// communication bridge. don't touch unless you know what's up
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // files & folders
    selectFolder: (scanSubfolders) => ipcRenderer.invoke('dialog:openFolder', scanSubfolders),
    onReceiveTracks: (callback) => ipcRenderer.on('update-track-list', (event, tracks) => callback(tracks)),

    // keys & shortcuts
    onGlobalCommand: (callback) => ipcRenderer.on('global-command', (event, cmd) => callback(cmd)),

    // sound & metadata
    getAudioData: (filePath) => ipcRenderer.invoke('get-audio-data', filePath),
    getTrackMetadata: (trackPath) => ipcRenderer.invoke('get-track-metadata', trackPath),

    // settings
    getTrackSettings: (trackPath) => ipcRenderer.invoke('get-track-settings', trackPath),
    saveTrackSettings: (data) => ipcRenderer.send('save-track-settings', data),

    // discord rpc
    initDiscordRPC: (clientId) => ipcRenderer.invoke('discord-rpc:init', clientId),
    updateDiscordRPC: (data) => ipcRenderer.send('discord-rpc:update', data),
    clearDiscordRPC: () => ipcRenderer.send('discord-rpc:clear'),

    // window
    minimize: (type) => ipcRenderer.send('window-minimize', type),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close')
});