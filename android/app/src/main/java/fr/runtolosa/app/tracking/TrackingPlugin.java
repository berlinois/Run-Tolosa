package fr.runtolosa.app.tracking;

import android.Manifest;
import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Pont Angular ↔ enregistrement des marches.
 * checkPermissions / requestPermissions sont fournis par Capacitor
 * à partir des alias déclarés ici.
 */
@CapacitorPlugin(
        name = "Tracking",
        permissions = {
                @Permission(alias = "location", strings = {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                }),
                @Permission(alias = "notifications", strings = {"android.permission.POST_NOTIFICATIONS"})
        })
public class TrackingPlugin extends Plugin {

    private WalkStore store;

    @Override
    public void load() {
        store = new WalkStore(getContext());

        // Marche restée « recording » alors que le service ne tourne plus
        // (téléphone éteint, appli tuée…) : on la clôt, ses points sont conservés.
        if (!TrackingService.isRecording()) {
            String orphan = TrackingService.currentWalkIdFromPrefs(getContext());
            if (orphan != null) TrackingService.finalizeOrphan(getContext(), store, orphan);
        }

        TrackingService.listener = new TrackingService.Listener() {
            @Override
            public void onPoint(JSONObject point, JSONObject meta) {
                JSObject data = new JSObject();
                data.put("point", point);
                data.put("walk", meta);
                notifyListeners("point", data);
            }

            @Override
            public void onStateChanged() {
                notifyListeners("state", status());
            }
        };
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Permission de localisation refusée", "LOCATION_DENIED");
            return;
        }
        Intent intent = new Intent(getContext(), TrackingService.class)
                .setAction(TrackingService.ACTION_START);
        try {
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Démarrage de l'enregistrement impossible : " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (TrackingService.isRecording()) {
            Intent intent = new Intent(getContext(), TrackingService.class)
                    .setAction(TrackingService.ACTION_STOP);
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void listWalks(PluginCall call) {
        JSArray walks = new JSArray();
        for (JSONObject meta : store.listMetas()) walks.put(meta);
        JSObject ret = new JSObject();
        ret.put("walks", walks);
        call.resolve(ret);
    }

    @PluginMethod
    public void getTrack(PluginCall call) {
        String walkId = call.getString("walkId");
        if (walkId == null || !walkId.matches("[0-9T-]+")) {
            call.reject("walkId invalide");
            return;
        }
        new Thread(() -> {
            try {
                JSONArray points = store.readTrack(walkId);
                JSObject ret = new JSObject();
                ret.put("points", points);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Lecture de la trace impossible : " + e.getMessage(), e);
            }
        }, "TrackingRead").start();
    }

    private JSObject status() {
        JSObject ret = new JSObject();
        JSONObject meta = TrackingService.currentMeta();
        ret.put("recording", meta != null);
        ret.put("walk", meta != null ? meta : JSONObject.NULL);
        return ret;
    }
}
