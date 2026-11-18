package com.ewasion.zenith;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZenithPlugin.class);
        super.onCreate(savedInstanceState);
    }
}