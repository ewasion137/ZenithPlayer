package com.ewasion.zenith;

import android.Manifest;
import android.content.ComponentName;
import android.content.ContentUris;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.LruCache;
import androidx.core.content.ContextCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@UnstableApi
@CapacitorPlugin(
    name = "ZenithAudio",
    permissions = {
        @Permission(alias = "audioLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "audioModern", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class ZenithPlugin extends Plugin {
    private MediaController controller = null;
    private ListenableFuture<MediaController> controllerFuture = null;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService bgExecutor = Executors.newSingleThreadExecutor();
    private final LruCache<String, String> artCache = new LruCache<>(40);

    @Override
    public void load() {
        ensureController(null);
    }

    private void ensureController(Runnable onReady) {
        mainHandler.post(() -> {
            if (controller != null && controller.isConnected()) {
                if (onReady != null) onReady.run();
                return;
            }
            if (controllerFuture == null) {
                SessionToken token = new SessionToken(
                        getContext(),
                        new ComponentName(getContext(), ZenithPlaybackService.class)
                );
                controllerFuture = new MediaController.Builder(getContext(), token).buildAsync();
                controllerFuture.addListener(() -> {
                    try {
                        controller = controllerFuture.get();
                        attachListener(controller);
                        if (onReady != null) onReady.run();
                    } catch (Exception e) {
                        controllerFuture = null;
                    }
                }, ContextCompat.getMainExecutor(getContext()));
            } else if (onReady != null) {
                controllerFuture.addListener(onReady, ContextCompat.getMainExecutor(getContext()));
            }
        });
    }

    private void attachListener(MediaController mc) {
        mc.addListener(new Player.Listener() {
            @Override
            public void onMediaItemTransition(MediaItem mediaItem, int reason) {
                JSObject data = new JSObject();
                data.put("index", mc.getCurrentMediaItemIndex());
                data.put("uri", mediaItem != null ? mediaItem.mediaId : "");
                notifyListeners("trackChanged", data);
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                JSObject data = new JSObject();
                data.put("isPlaying", isPlaying);
                notifyListeners("playbackStateChanged", data);
            }
        });
    }

    @PluginMethod
    public void requestPermissionsAndScan(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (getPermissionState("audioModern") != PermissionState.GRANTED) {
                requestPermissionForAliases(new String[]{"audioModern", "notifications"}, call, "onPermsResult");
                return;
            }
            if (getPermissionState("notifications") != PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "onNotifResult");
                return;
            }
        } else {
            if (getPermissionState("audioLegacy") != PermissionState.GRANTED) {
                requestPermissionForAlias("audioLegacy", call, "onPermsResult");
                return;
            }
        }
        scanLibraryInternal(call);
    }

    @PermissionCallback
    private void onPermsResult(PluginCall call) {
        boolean ok = Build.VERSION.SDK_INT >= 33
                ? getPermissionState("audioModern") == PermissionState.GRANTED
                : getPermissionState("audioLegacy") == PermissionState.GRANTED;
        if (!ok) {
            call.reject("Audio storage permission denied");
            return;
        }
        scanLibraryInternal(call);
    }

    @PermissionCallback
    private void onNotifResult(PluginCall call) {
        scanLibraryInternal(call);
    }

    private void scanLibraryInternal(PluginCall call) {
        bgExecutor.execute(() -> {
            Map<String, JSArray> folderMap = new LinkedHashMap<>();
            Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            String[] projection = {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.ALBUM_ID,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.DATA
            };
            String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0 OR "
                    + MediaStore.Audio.Media.DURATION + " > 5000";
            String sortOrder = MediaStore.Audio.Media.TITLE + " ASC";

            try (Cursor cursor = getContext().getContentResolver().query(
                    collection, projection, selection, null, sortOrder)) {
                if (cursor != null) {
                    int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                    int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                    int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                    int albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                    int albumIdCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);
                    int durCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                    int dataCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);

                    while (cursor.moveToNext()) {
                        long id = cursor.getLong(idCol);
                        long albumId = cursor.getLong(albumIdCol);
                        String title = cursor.getString(titleCol);
                        String artist = cursor.getString(artistCol);
                        String album = cursor.getString(albumCol);
                        long durMs = cursor.getLong(durCol);
                        String filePath = cursor.getString(dataCol);

                        String folder = "Music";
                        if (filePath != null && filePath.contains("/")) {
                            int lastSlash = filePath.lastIndexOf('/');
                            String parent = filePath.substring(0, lastSlash);
                            int prevSlash = parent.lastIndexOf('/');
                            folder = prevSlash >= 0 ? parent.substring(prevSlash + 1) : parent;
                        }

                        Uri contentUri = ContentUris.withAppendedId(collection, id);
                        JSObject track = new JSObject();
                        track.put("name", title != null ? title : "Track");
                        track.put("path", contentUri.toString());
                        track.put("artist", artist != null ? artist : "");
                        track.put("album", album != null ? album : "");
                        track.put("albumId", String.valueOf(albumId));
                        track.put("duration", durMs / 1000.0);
                        track.put("ext", filePath != null && filePath.contains(".")
                                ? filePath.substring(filePath.lastIndexOf('.') + 1).toUpperCase()
                                : "AUDIO");

                        JSArray list = folderMap.get(folder);
                        if (list == null) {
                            list = new JSArray();
                            folderMap.put(folder, list);
                        }
                        list.put(track);
                    }
                }
            } catch (Exception e) {
                call.reject("Scan error: " + e.getMessage());
                return;
            }

            JSArray folders = new JSArray();
            for (Map.Entry<String, JSArray> entry : folderMap.entrySet()) {
                JSObject f = new JSObject();
                f.put("folder", entry.getKey());
                f.put("tracks", entry.getValue());
                folders.put(f);
            }
            JSObject ret = new JSObject();
            ret.put("folders", folders);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getTrackArtwork(PluginCall call) {
        String albumIdStr = call.getString("albumId", "");
        if (albumIdStr == null || albumIdStr.isEmpty()) {
            call.resolve(new JSObject());
            return;
        }
        String cached = artCache.get(albumIdStr);
        if (cached != null) {
            JSObject res = new JSObject();
            res.put("picture", cached);
            call.resolve(res);
            return;
        }

        bgExecutor.execute(() -> {
            JSObject res = new JSObject();
            try {
                long albumId = Long.parseLong(albumIdStr);
                Uri artUri = ContentUris.withAppendedId(
                        Uri.parse("content://media/external/audio/albumart"), albumId);
                try (InputStream is = getContext().getContentResolver().openInputStream(artUri)) {
                    if (is != null) {
                        Bitmap bmp = BitmapFactory.decodeStream(is);
                        if (bmp != null) {
                            Bitmap scaled = Bitmap.createScaledBitmap(bmp, 256, 256, true);
                            ByteArrayOutputStream baos = new ByteArrayOutputStream();
                            scaled.compress(Bitmap.CompressFormat.JPEG, 82, baos);
                            String b64 = "data:image/jpeg;base64,"
                                    + Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
                            artCache.put(albumIdStr, b64);
                            res.put("picture", b64);
                        }
                    }
                }
            } catch (Exception ignored) {}
            call.resolve(res);
        });
    }

    @PluginMethod
    public void setQueue(PluginCall call) {
        JSArray tracksArr = call.getArray("tracks");
        int startIndex = call.getInt("startIndex", 0);
        boolean autoPlay = call.getBoolean("playWhenReady", true);
        if (tracksArr == null) {
            call.resolve();
            return;
        }

        List<MediaItem> items = new ArrayList<>();
        try {
            for (int i = 0; i < tracksArr.length(); i++) {
                org.json.JSONObject obj = tracksArr.getJSONObject(i);
                String uriStr = obj.optString("path", "");
                if (uriStr.isEmpty()) continue;

                String title = obj.optString("name", "Zenith Track");
                String artist = obj.optString("artist", "");
                String album = obj.optString("album", "");
                String albumId = obj.optString("albumId", "");
                String picUrl = obj.optString("picture", "");

                MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                        .setTitle(title)
                        .setArtist(artist)
                        .setAlbumTitle(album);

                if (!albumId.isEmpty()) {
                    Uri artUri = ContentUris.withAppendedId(
                            Uri.parse("content://media/external/audio/albumart"),
                            Long.parseLong(albumId)
                    );
                    metaBuilder.setArtworkUri(artUri);
                } else if (!picUrl.isEmpty() && picUrl.startsWith("http")) {
                    metaBuilder.setArtworkUri(Uri.parse(picUrl));
                }

                items.add(new MediaItem.Builder()
                        .setMediaId(uriStr)
                        .setUri(uriStr)
                        .setMediaMetadata(metaBuilder.build())
                        .build());
            }
        } catch (Exception e) {
            call.reject(e.getMessage());
            return;
        }

        ensureController(() -> {
            if (controller == null || items.isEmpty()) {
                call.resolve();
                return;
            }
            int idx = Math.max(0, Math.min(startIndex, items.size() - 1));
            controller.setMediaItems(items, idx, 0L);
            controller.prepare();
            controller.setPlayWhenReady(autoPlay);
            call.resolve();
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        ensureController(() -> {
            if (controller != null) controller.play();
            call.resolve();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        ensureController(() -> {
            if (controller != null) controller.pause();
            call.resolve();
        });
    }

    @PluginMethod
    public void next(PluginCall call) {
        ensureController(() -> {
            if (controller != null && controller.hasNextMediaItem()) controller.seekToNextMediaItem();
            call.resolve();
        });
    }

    @PluginMethod
    public void prev(PluginCall call) {
        ensureController(() -> {
            if (controller != null) controller.seekToPrevious();
            call.resolve();
        });
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        double sec = call.getDouble("seconds", 0.0);
        ensureController(() -> {
            if (controller != null) controller.seekTo((long) (sec * 1000.0));
            call.resolve();
        });
    }

    @PluginMethod
    public void jumpToIndex(PluginCall call) {
        int index = call.getInt("index", 0);
        ensureController(() -> {
            if (controller != null && index >= 0 && index < controller.getMediaItemCount()) {
                controller.seekTo(index, 0L);
                controller.play();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setPlaybackParams(PluginCall call) {
        float speed = call.getFloat("speed", 1.0f);
        boolean preservePitch = call.getBoolean("preservePitch", false);
        ensureController(() -> {
            if (controller != null) {
                float pitch = preservePitch ? 1.0f : speed;
                controller.setPlaybackParameters(new PlaybackParameters(speed, pitch));
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setShuffle(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        ensureController(() -> {
            if (controller != null) controller.setShuffleModeEnabled(enabled);
            call.resolve();
        });
    }

    @PluginMethod
    public void setRepeat(PluginCall call) {
        String mode = call.getString("mode", "off");
        ensureController(() -> {
            if (controller != null) {
                int rMode = Player.REPEAT_MODE_OFF;
                if ("all".equals(mode)) rMode = Player.REPEAT_MODE_ALL;
                else if ("one".equals(mode)) rMode = Player.REPEAT_MODE_ONE;
                controller.setRepeatMode(rMode);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setDsp(PluginCall call) {
        Double vol = call.getDouble("volume");
        Double dist = call.getDouble("distortion");
        Boolean eqEnabled = call.getBoolean("eqEnabled");
        JSArray eqArr = call.getArray("eq");

        if (vol != null) ZenithDspState.volume = vol.floatValue();
        if (dist != null) ZenithDspState.distortion = dist.floatValue();

        if (eqEnabled != null || eqArr != null) {
            boolean en = eqEnabled != null ? eqEnabled : ZenithDspState.eqEnabled;
            float[] gains = null;
            if (eqArr != null) {
                gains = new float[7];
                for (int i = 0; i < Math.min(7, eqArr.length()); i++) {
                    gains[i] = (float) eqArr.optDouble(i, 0.0);
                }
            }
            ZenithDspState.setEq(en, gains);
        }
        call.resolve();
    }

    @PluginMethod
    public void getPlaybackState(PluginCall call) {
        boolean includeSpec = call.getBoolean("withSpectrum", false);
        mainHandler.post(() -> {
            JSObject ret = new JSObject();
            if (controller != null) {
                ret.put("isPlaying", controller.isPlaying());
                ret.put("currentTime", controller.getCurrentPosition() / 1000.0);
                long dur = controller.getDuration();
                ret.put("duration", dur > 0 ? dur / 1000.0 : 0.0);
                ret.put("currentIndex", controller.getCurrentMediaItemIndex());
                MediaItem cur = controller.getCurrentMediaItem();
                ret.put("currentPath", cur != null ? cur.mediaId : "");
            } else {
                ret.put("isPlaying", false);
                ret.put("currentTime", 0.0);
                ret.put("duration", 0.0);
                ret.put("currentIndex", -1);
                ret.put("currentPath", "");
            }
            if (includeSpec) {
                int[] spec = ZenithDspState.computeSpectrum48();
                JSArray arr = new JSArray();
                for (int v : spec) arr.put(v);
                ret.put("spectrum", arr);
            }
            call.resolve(ret);
        });
    }
}