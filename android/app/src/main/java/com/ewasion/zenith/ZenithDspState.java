package com.ewasion.zenith;

public final class ZenithDspState {
    public static final int[] EQ_FREQS = {60, 170, 350, 1000, 3500, 10000, 14000};
    public static volatile float volume = 1.0f;
    public static volatile float distortion = 0.0f;
    public static volatile boolean eqEnabled = true;
    public static final float[] eqGains = new float[7];
    public static volatile int eqVersion = 0;

    private static final float[] pcmSnapshot = new float[128];
    private static final Object snapLock = new Object();

    public static void setEq(boolean enabled, float[] gains) {
        eqEnabled = enabled;
        if (gains != null) {
            int len = Math.min(7, gains.length);
            for (int i = 0; i < len; i++) {
                eqGains[i] = gains[i];
            }
        }
        eqVersion++;
    }

    public static void pushSnapshot(float[] samples, int count) {
        int n = Math.min(128, count);
        synchronized (snapLock) {
            System.arraycopy(samples, 0, pcmSnapshot, 0, n);
        }
    }

    public static int[] computeSpectrum48() {
        float[] copy = new float[128];
        synchronized (snapLock) {
            System.arraycopy(pcmSnapshot, 0, copy, 0, 128);
        }
        int[] out = new int[48];
        for (int k = 1; k <= 48; k++) {
            float re = 0f;
            float im = 0f;
            float step = (float) (2.0 * Math.PI * k / 128.0);
            for (int n = 0; n < 128; n++) {
                float angle = step * n;
                re += copy[n] * (float) Math.cos(angle);
                im -= copy[n] * (float) Math.sin(angle);
            }
            float mag = (float) Math.sqrt(re * re + im * im) / 32.0f;
            int val = Math.min(255, Math.max(0, (int) (mag * 255.0f)));
            out[k - 1] = val;
        }
        return out;
    }
}