package fr.runtolosa.app.tracking;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Stockage des marches, dans le stockage privé de l'appli :
 *   files/walks/<id>.json   métadonnées (Walk)
 *   files/walks/<id>.jsonl  points GPS bruts (TrackPoint), une ligne JSON par point,
 *                           jamais modifiés après écriture.
 */
public final class WalkStore {

    public static final String STATUS_RECORDING = "recording";
    public static final String STATUS_FINISHED = "finished";

    private final File dir;

    public WalkStore(Context context) {
        this.dir = new File(context.getFilesDir(), "walks");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
    }

    /** Identifiant lisible et unique : date et heure locales du départ. */
    public static String newWalkId(long startedAt) {
        return new SimpleDateFormat("yyyy-MM-dd'T'HH-mm-ss", Locale.ROOT).format(new Date(startedAt));
    }

    public File trackFile(String walkId) {
        return new File(dir, walkId + ".jsonl");
    }

    private File metaFile(String walkId) {
        return new File(dir, walkId + ".json");
    }

    public static JSONObject newMeta(String walkId, long startedAt) throws JSONException {
        JSONObject meta = new JSONObject();
        meta.put("id", walkId);
        meta.put("startedAt", startedAt);
        meta.put("endedAt", JSONObject.NULL);
        meta.put("status", STATUS_RECORDING);
        meta.put("distanceM", 0);
        meta.put("pointCount", 0);
        meta.put("processedWith", JSONObject.NULL);
        return meta;
    }

    public JSONObject readMeta(String walkId) {
        try {
            return new JSONObject(readText(metaFile(walkId)));
        } catch (IOException | JSONException e) {
            return null;
        }
    }

    /** Écriture atomique (fichier temporaire puis renommage) : jamais de JSON à moitié écrit. */
    public void writeMeta(JSONObject meta) throws IOException, JSONException {
        String walkId = meta.getString("id");
        File tmp = new File(dir, walkId + ".json.tmp");
        try (Writer w = new OutputStreamWriter(new FileOutputStream(tmp), StandardCharsets.UTF_8)) {
            w.write(meta.toString(2));
        }
        if (!tmp.renameTo(metaFile(walkId))) {
            throw new IOException("Impossible d'écrire " + metaFile(walkId));
        }
    }

    /** Suppression définitive d'une marche (métadonnées + points). */
    public boolean delete(String walkId) {
        boolean meta = metaFile(walkId).delete();
        boolean track = !trackFile(walkId).exists() || trackFile(walkId).delete();
        return meta && track;
    }

    /** Toutes les marches, de la plus récente à la plus ancienne. */
    public List<JSONObject> listMetas() {
        List<JSONObject> metas = new ArrayList<>();
        File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
        if (files == null) return metas;
        Arrays.sort(files, (a, b) -> b.getName().compareTo(a.getName()));
        for (File f : files) {
            String id = f.getName().substring(0, f.getName().length() - ".json".length());
            JSONObject meta = readMeta(id);
            if (meta != null) metas.add(meta);
        }
        return metas;
    }

    /** Points bruts d'une marche. Une ligne illisible (coupure en pleine écriture) est ignorée. */
    public JSONArray readTrack(String walkId) throws IOException {
        JSONArray points = new JSONArray();
        File file = trackFile(walkId);
        if (!file.exists()) return points;
        try (BufferedReader r = new BufferedReader(
                new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.isEmpty()) continue;
                try {
                    points.put(new JSONObject(line));
                } catch (JSONException ignored) {
                    // dernière ligne tronquée si le téléphone s'est éteint : on l'ignore
                }
            }
        }
        return points;
    }

    private static String readText(File file) throws IOException {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(
                new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line).append('\n');
        }
        return sb.toString();
    }
}
