package fr.runtolosa.app.export;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Export de toutes les marches (traces brutes + métadonnées) dans un zip :
 *  - par défaut dans Téléchargements (MediaStore, aucune permission nécessaire),
 *  - ou à l'emplacement choisi par l'utilisateur (sélecteur de fichiers Android).
 */
@CapacitorPlugin(name = "Export")
public class ExportPlugin extends Plugin {

    private static final String MIME_ZIP = "application/zip";

    /** Nom du zip, pour l'afficher dans la confirmation. */
    @PluginMethod
    public void suggestedFileName(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("fileName", fileName());
        call.resolve(ret);
    }

    @PluginMethod
    public void exportToDownloads(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Android trop ancien pour Téléchargements : choisis un emplacement", "UNSUPPORTED");
            return;
        }
        String name = fileName();
        new Thread(() -> {
            ContentResolver resolver = getContext().getContentResolver();
            Uri uri = null;
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                values.put(MediaStore.Downloads.MIME_TYPE, MIME_ZIP);
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IOException("Téléchargements indisponible");

                int walks;
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new IOException("Écriture impossible");
                    walks = writeZip(out);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(uri, values, null, null);
                call.resolve(result(name, "Téléchargements", walks));
            } catch (Exception e) {
                if (uri != null) resolver.delete(uri, null, null);
                call.reject("Export impossible : " + e.getMessage(), e);
            }
        }, "Export").start();
    }

    @PluginMethod
    public void exportToPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(MIME_ZIP)
                .putExtra(Intent.EXTRA_TITLE, fileName());
        startActivityForResult(call, intent, "onPickerResult");
    }

    @ActivityCallback
    private void onPickerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("Export annulé", "CANCELLED");
            return;
        }
        Uri uri = data.getData();
        new Thread(() -> {
            try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IOException("Écriture impossible");
                int walks = writeZip(out);
                String name = displayName(uri);
                call.resolve(result(name, "l'emplacement choisi", walks));
            } catch (Exception e) {
                call.reject("Export impossible : " + e.getMessage(), e);
            }
        }, "Export").start();
    }

    /** Zippe files/walks/ + un export-info.json. Renvoie le nombre de marches. */
    private int writeZip(OutputStream out) throws Exception {
        File walksDir = new File(getContext().getFilesDir(), "walks");
        File[] files = walksDir.listFiles((d, n) -> n.endsWith(".json") || n.endsWith(".jsonl"));
        if (files == null) files = new File[0];
        Arrays.sort(files);

        int walks = 0;
        byte[] buf = new byte[64 * 1024];
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            for (File f : files) {
                if (f.getName().endsWith(".json")) walks++;
                zip.putNextEntry(new ZipEntry("walks/" + f.getName()));
                try (InputStream in = new FileInputStream(f)) {
                    int n;
                    while ((n = in.read(buf)) != -1) zip.write(buf, 0, n);
                }
                zip.closeEntry();
            }
            JSONObject info = new JSONObject();
            info.put("exportedAt", System.currentTimeMillis());
            info.put("appVersion", appVersion());
            info.put("walkCount", walks);
            info.put("format", "walks/<id>.json = Walk, walks/<id>.jsonl = TrackPoint par ligne (voir docs/ARCHITECTURE.md)");
            zip.putNextEntry(new ZipEntry("export-info.json"));
            zip.write(info.toString(2).getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        return walks;
    }

    /** Nom réel du fichier choisi (l'utilisateur a pu le renommer). */
    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver()
                .query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
        }
        return fileName();
    }

    private String appVersion() {
        try {
            return getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    private static String fileName() {
        return "run-tolosa-marches-"
                + new SimpleDateFormat("yyyy-MM-dd_HH-mm", Locale.ROOT).format(new Date()) + ".zip";
    }

    private static JSObject result(String fileName, String location, int walks) {
        JSObject ret = new JSObject();
        ret.put("fileName", fileName);
        ret.put("location", location);
        ret.put("walkCount", walks);
        return ret;
    }
}
