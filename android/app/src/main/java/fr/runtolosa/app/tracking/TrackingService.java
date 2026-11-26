package fr.runtolosa.app.tracking;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.io.BufferedWriter;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import fr.runtolosa.app.MainActivity;

/**
 * Foreground service d'enregistrement d'une marche.
 * Il tourne écran éteint, indépendamment de la WebView, et écrit chaque point
 * GPS dans walks/<id>.jsonl dès sa réception (flush à chaque point).
 */
public class TrackingService extends Service {

    private static final String TAG = "RunTolosaTracking";
    public static final String ACTION_START = "fr.runtolosa.app.tracking.START";
    public static final String ACTION_STOP = "fr.runtolosa.app.tracking.STOP";

    private static final String CHANNEL_ID = "tracking";
    private static final int NOTIFICATION_ID = 42;
    private static final String PREFS = "tracking";
    private static final String PREF_CURRENT_WALK = "currentWalkId";

    /** Points moins précis que ça : écrits (donnée brute) mais exclus du calcul de distance. */
    private static final float MAX_ACCURACY_FOR_DISTANCE_M = 25f;
    private static final long INTERVAL_MS = 2000;
    private static final int META_SAVE_EVERY_N_POINTS = 30;

    /** Écouteur branché par TrackingPlugin quand l'appli est ouverte (peut être null). */
    public interface Listener {
        void onPoint(JSONObject point, JSONObject meta);
        void onStateChanged();
    }

    public static volatile Listener listener;
    private static volatile TrackingService running;

    private WalkStore store;
    private FusedLocationProviderClient locationClient;
    private LocationCallback callback;
    private BufferedWriter writer;
    private JSONObject meta;
    private Location lastAccepted;

    public static boolean isRecording() {
        TrackingService s = running;
        return s != null && s.meta != null;
    }

    /** Copie des métadonnées de la marche en cours, ou null. */
    public static JSONObject currentMeta() {
        TrackingService s = running;
        if (s == null || s.meta == null) return null;
        synchronized (s) {
            try {
                return new JSONObject(s.meta.toString());
            } catch (Exception e) {
                return null;
            }
        }
    }

    public static String currentWalkIdFromPrefs(Context context) {
        return context.getSharedPreferences(PREFS, MODE_PRIVATE).getString(PREF_CURRENT_WALK, null);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        store = new WalkStore(this);
        locationClient = LocationServices.getFusedLocationProviderClient(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            stopWalk();
            return START_NOT_STICKY;
        }
        if (meta != null) {
            return START_STICKY; // déjà en cours
        }

        // ACTION_START, ou redémarrage par le système (intent null) : on reprend la marche en cours.
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String walkId = prefs.getString(PREF_CURRENT_WALK, null);
        if (walkId == null && !ACTION_START.equals(action)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        try {
            startForegroundCompat();
        } catch (Exception e) {
            // Android 12+ peut refuser un démarrage depuis l'arrière-plan.
            Log.e(TAG, "Démarrage du foreground service refusé", e);
            if (walkId != null) finalizeOrphan(walkId);
            stopSelf();
            return START_NOT_STICKY;
        }

        try {
            synchronized (this) {
                JSONObject existing = walkId != null ? store.readMeta(walkId) : null;
                if (existing != null && WalkStore.STATUS_RECORDING.equals(existing.optString("status"))) {
                    meta = existing; // reprise après redémarrage du service
                } else {
                    long now = System.currentTimeMillis();
                    walkId = WalkStore.newWalkId(now);
                    meta = WalkStore.newMeta(walkId, now);
                    store.writeMeta(meta);
                    prefs.edit().putString(PREF_CURRENT_WALK, walkId).apply();
                }
                writer = new BufferedWriter(new OutputStreamWriter(
                        new FileOutputStream(store.trackFile(walkId), true), StandardCharsets.UTF_8));
            }
            requestLocationUpdates();
        } catch (Exception e) {
            Log.e(TAG, "Impossible de démarrer la marche", e);
            stopWalk();
            return START_NOT_STICKY;
        }

        running = this;
        updateNotification();
        notifyState();
        return START_STICKY;
    }

    private void requestLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED
                && ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            throw new SecurityException("Permission de localisation manquante");
        }
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, INTERVAL_MS)
                .setMinUpdateIntervalMillis(INTERVAL_MS / 2)
                .setWaitForAccurateLocation(false)
                .build();
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                for (Location location : result.getLocations()) onLocation(location);
            }
        };
        locationClient.requestLocationUpdates(request, callback, Looper.getMainLooper());
    }

    private void onLocation(Location location) {
        JSONObject point = new JSONObject();
        JSONObject metaCopy;
        synchronized (this) {
            if (meta == null || writer == null) return;
            try {
                point.put("t", location.getTime());
                point.put("lat", round(location.getLatitude(), 7));
                point.put("lon", round(location.getLongitude(), 7));
                point.put("acc", round(location.getAccuracy(), 1));
                if (location.hasAltitude()) point.put("alt", round(location.getAltitude(), 1));
                if (location.hasSpeed()) point.put("spd", round(location.getSpeed(), 2));

                writer.write(point.toString());
                writer.newLine();
                writer.flush(); // chaque point est sur disque immédiatement

                int count = meta.getInt("pointCount") + 1;
                meta.put("pointCount", count);
                if (location.getAccuracy() <= MAX_ACCURACY_FOR_DISTANCE_M) {
                    if (lastAccepted != null) {
                        meta.put("distanceM", round(meta.getDouble("distanceM") + lastAccepted.distanceTo(location), 1));
                    }
                    lastAccepted = location;
                }
                if (count % META_SAVE_EVERY_N_POINTS == 0) store.writeMeta(meta);
                metaCopy = new JSONObject(meta.toString());
            } catch (Exception e) {
                Log.e(TAG, "Écriture du point impossible", e);
                return;
            }
        }
        updateNotification();
        Listener l = listener;
        if (l != null) l.onPoint(point, metaCopy);
    }

    private void stopWalk() {
        if (callback != null) {
            locationClient.removeLocationUpdates(callback);
            callback = null;
        }
        synchronized (this) {
            try {
                if (writer != null) writer.close();
            } catch (Exception ignored) {
            }
            writer = null;
            if (meta != null) {
                try {
                    meta.put("status", WalkStore.STATUS_FINISHED);
                    meta.put("endedAt", System.currentTimeMillis());
                    store.writeMeta(meta);
                } catch (Exception e) {
                    Log.e(TAG, "Finalisation de la marche impossible", e);
                }
            }
            meta = null;
            lastAccepted = null;
        }
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(PREF_CURRENT_WALK).apply();
        running = null;
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
        notifyState();
    }

    /** Marche restée « recording » alors que plus rien ne l'enregistre : on la clôt. */
    void finalizeOrphan(String walkId) {
        finalizeOrphan(this, store, walkId);
    }

    static void finalizeOrphan(Context context, WalkStore store, String walkId) {
        JSONObject orphan = store.readMeta(walkId);
        if (orphan != null && WalkStore.STATUS_RECORDING.equals(orphan.optString("status"))) {
            try {
                orphan.put("status", WalkStore.STATUS_FINISHED);
                orphan.put("endedAt", System.currentTimeMillis());
                orphan.put("interrupted", true);
                store.writeMeta(orphan);
            } catch (Exception e) {
                Log.e(TAG, "Clôture de la marche interrompue impossible", e);
            }
        }
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(PREF_CURRENT_WALK).apply();
    }

    private void startForegroundCompat() {
        createChannel();
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Enregistrement des marches", NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent stop = new Intent(this, TrackingService.class).setAction(ACTION_STOP);
        PendingIntent stopIntent = PendingIntent.getService(this, 1, stop,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String text = "Démarrage…";
        JSONObject m = meta;
        if (m != null) {
            text = String.format(Locale.FRANCE, "%.2f km · %d points",
                    m.optDouble("distanceM", 0) / 1000.0, m.optInt("pointCount", 0));
        }
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("Run Tolosa enregistre ta marche")
                .setContentText(text)
                .setContentIntent(contentIntent)
                .addAction(0, "Arrêter", stopIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }

    private void updateNotification() {
        if (meta == null) return;
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this,
                Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification());
    }

    private void notifyState() {
        Listener l = listener;
        if (l != null) l.onStateChanged();
    }

    private static double round(double value, int decimals) {
        double f = Math.pow(10, decimals);
        return Math.round(value * f) / f;
    }

    @Override
    public void onDestroy() {
        if (callback != null) {
            locationClient.removeLocationUpdates(callback);
            callback = null;
        }
        synchronized (this) {
            try {
                if (writer != null) writer.close();
            } catch (Exception ignored) {
            }
            writer = null;
            if (meta != null) {
                try {
                    store.writeMeta(meta); // reste « recording » : reprise possible au redémarrage
                } catch (Exception ignored) {
                }
            }
        }
        if (running == this) running = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
