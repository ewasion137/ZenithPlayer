(function () {
    const cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;

    const ZenithAudio = cap.Plugins.ZenithAudio;
    window.__ZENITH_ANDROID__ = true;
    window.__ZENITH_PLUGIN__ = ZenithAudio;

    let tracksCallback = null;
    const cachedMeta = new Map();
    let cachedFlatQueue = [];

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    window.electronAPI = {
        selectFolder: async () => {
            if (!ZenithAudio) return;
            try {
                const res = await ZenithAudio.requestPermissionsAndScan();
                const folders = res && res.folders ? res.folders : [];
                cachedMeta.clear();
                cachedFlatQueue = [];
                folders.forEach((f) => {
                    (f.tracks || []).forEach((t) => {
                        cachedMeta.set(t.path, {
                            title: t.name,
                            artist: t.artist || "",
                            album: t.album || f.folder,
                            albumId: t.albumId || "",
                            duration: t.duration || 0,
                            ext: t.ext || "AUDIO",
                            picture: null,
                        });
                        cachedFlatQueue.push(t);
                    });
                });
                if (tracksCallback) tracksCallback(folders);
            } catch (e) {
                console.error("Android scan error:", e);
            }
        },
        scanDroppedPaths: async () => {},
        getPathForFile: () => "",
        onReceiveTracks: (cb) => {
            tracksCallback = cb;
        },
        onGlobalCommand: () => {},
        getAudioData: async () => null,
        getAudioStreamPort: async () => 0,
        getTrackMetadata: async (trackPath) => {
            const meta = cachedMeta.get(trackPath) || {
                title: null,
                artist: null,
                album: null,
                picture: null,
            };
            if (!meta.picture && meta.albumId && ZenithAudio) {
                try {
                    const art = await ZenithAudio.getTrackArtwork({ albumId: meta.albumId });
                    if (art && art.picture) meta.picture = art.picture;
                } catch (e) {}
            }
            return meta;
        },
        resolveWebTrack: async () => ({
            success: false,
            error: "Online stream resolver is desktop-only right now",
        }),
        getStreamBuffer: async () => null,
        getTrackSettings: async (trackPath) => {
            const all = readJson("zenith_track_settings_v1", {});
            return all[trackPath] || {};
        },
        saveTrackSettings: ({ trackPath, settings }) => {
            if (!trackPath || !settings) return;
            const all = readJson("zenith_track_settings_v1", {});
            all[trackPath] = settings;
            localStorage.setItem("zenith_track_settings_v1", JSON.stringify(all));
        },
        getSavedWebTracks: async () => readJson("zenith_web_tracks_v1", []),
        saveWebTracks: (tracks) => {
            localStorage.setItem("zenith_web_tracks_v1", JSON.stringify(tracks || []));
        },
        initDiscordRPC: async () => ({ success: false, error: "Desktop only" }),
        updateDiscordRPC: () => {},
        clearDiscordRPC: () => {},
        minimize: () => {},
        maximize: () => {},
        close: () => {},
        setMiniMode: () => {},
        getFlatQueue: () => cachedFlatQueue,
    };
})();