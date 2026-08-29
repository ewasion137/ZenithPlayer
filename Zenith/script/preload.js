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

    // web stream integration (YouTube / Spotify)
    resolveWebTrack: (url) => ipcRenderer.invoke('stream:resolve-url', url),
    getStreamBuffer: (streamUrl) => ipcRenderer.invoke('stream:get-buffer', streamUrl),

    // settings & playlists
    getTrackSettings: (trackPath) => ipcRenderer.invoke('get-track-settings', trackPath),
    saveTrackSettings: (data) => ipcRenderer.send('save-track-settings', data),
    getSavedWebTracks: () => ipcRenderer.invoke('get-saved-web-tracks'),
    saveWebTracks: (tracks) => ipcRenderer.send('save-web-tracks', tracks),

    // discord rpc
    initDiscordRPC: (clientId) => ipcRenderer.invoke('discord-rpc:init', clientId),
    updateDiscordRPC: (data) => ipcRenderer.send('discord-rpc:update', data),
    clearDiscordRPC: () => ipcRenderer.send('discord-rpc:clear'),

    // window controls
    minimize: (type) => ipcRenderer.send('window-minimize', type),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close')
});