package fr.runtolosa.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import fr.runtolosa.app.tracking.TrackingPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins maison (non publiés sur npm) : à enregistrer avant super.onCreate
        registerPlugin(TrackingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
