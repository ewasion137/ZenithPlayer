package com.ewasion.zenith;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.BaseAudioProcessor;
import androidx.media3.common.util.UnstableApi;
import java.nio.ByteBuffer;

@UnstableApi
public final class ZenithDspProcessor extends BaseAudioProcessor {
    private int sampleRate = 44100;
    private int channelCount = 2;
    private int lastEqVersion = -1;

    private final float[][] b0 = new float[7][2];
    private final float[][] b1 = new float[7][2];
    private final float[][] b2 = new float[7][2];
    private final float[][] a1 = new float[7][2];
    private final float[][] a2 = new float[7][2];
    private final float[][] x1 = new float[7][2];
    private final float[][] x2 = new float[7][2];
    private final float[][] y1 = new float[7][2];
    private final float[][] y2 = new float[7][2];
    private final boolean[] bandActive = new boolean[7];
    private final float[] snapTemp = new float[128];

    @Override
    protected AudioFormat onConfigure(AudioFormat inputAudioFormat) throws UnhandledAudioFormatException {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) {
            throw new UnhandledAudioFormatException(inputAudioFormat);
        }
        sampleRate = inputAudioFormat.sampleRate;
        channelCount = Math.max(1, Math.min(2, inputAudioFormat.channelCount));
        lastEqVersion = -1;
        return inputAudioFormat;
    }

    private void updateCoefficientsIfNeeded() {
        int ver = ZenithDspState.eqVersion;
        if (ver == lastEqVersion) return;
        lastEqVersion = ver;

        boolean enabled = ZenithDspState.eqEnabled;
        for (int i = 0; i < 7; i++) {
            float db = enabled ? ZenithDspState.eqGains[i] : 0f;
            float freq = ZenithDspState.EQ_FREQS[i];
            if (Math.abs(db) < 0.05f || freq >= sampleRate * 0.45f) {
                bandActive[i] = false;
                continue;
            }
            bandActive[i] = true;
            double amp = Math.pow(10.0, db / 40.0);
            double w0 = 2.0 * Math.PI * freq / sampleRate;
            double sinW0 = Math.sin(w0);
            double cosW0 = Math.cos(w0);
            double alpha = sinW0 / (2.0 * 1.41);
            double a0 = 1.0 + alpha / amp;
            float cb0 = (float) ((1.0 + alpha * amp) / a0);
            float cb1 = (float) ((-2.0 * cosW0) / a0);
            float cb2 = (float) ((1.0 - alpha * amp) / a0);
            float ca1 = cb1;
            float ca2 = (float) ((1.0 - alpha / amp) / a0);

            for (int ch = 0; ch < 2; ch++) {
                b0[i][ch] = cb0;
                b1[i][ch] = cb1;
                b2[i][ch] = cb2;
                a1[i][ch] = ca1;
                a2[i][ch] = ca2;
            }
        }
    }

    @Override
    public void queueInput(ByteBuffer inputBuffer) {
        int remaining = inputBuffer.remaining();
        if (remaining <= 0) return;

        updateCoefficientsIfNeeded();
        float vol = ZenithDspState.volume;
        float dist = ZenithDspState.distortion;
        float drive = dist > 0f ? (float) (1.0 + Math.pow(dist / 100.0, 1.3) * 24.0) : 1.0f;
        float comp = dist > 0f ? (float) (1.0 / (1.0 + Math.pow(dist / 100.0, 0.8) * 1.1)) : 1.0f;

        ByteBuffer out = replaceOutputBuffer(remaining);
        int snapIdx = 0;
        int ch = 0;

        while (inputBuffer.remaining() >= 2) {
            float s = inputBuffer.getShort() / 32768.0f;

            for (int i = 0; i < 7; i++) {
                if (!bandActive[i]) continue;
                float y = b0[i][ch] * s + b1[i][ch] * x1[i][ch] + b2[i][ch] * x2[i][ch]
                        - a1[i][ch] * y1[i][ch] - a2[i][ch] * y2[i][ch];
                x2[i][ch] = x1[i][ch];
                x1[i][ch] = s;
                y2[i][ch] = y1[i][ch];
                y1[i][ch] = y;
                s = y;
            }

            if (dist > 0f) {
                s *= drive;
                if (s > 0.85f) s = 0.85f;
                else if (s < -0.85f) s = -0.85f;
                s *= comp;
            }

            s *= vol;
            if (s > 1.0f) s = 1.0f;
            else if (s < -1.0f) s = -1.0f;

            if (ch == 0 && snapIdx < 128) {
                snapTemp[snapIdx++] = s;
            }

            out.putShort((short) (s * 32767.0f));
            ch = (ch + 1) % channelCount;
        }

        if (snapIdx > 0) {
            ZenithDspState.pushSnapshot(snapTemp, snapIdx);
        }
        out.flip();
    }

    @Override
    protected void onFlush() {
        for (int i = 0; i < 7; i++) {
            for (int ch = 0; ch < 2; ch++) {
                x1[i][ch] = 0f;
                x2[i][ch] = 0f;
                y1[i][ch] = 0f;
                y2[i][ch] = 0f;
            }
        }
    }

    @Override
    protected void onReset() {
        onFlush();
    }
}