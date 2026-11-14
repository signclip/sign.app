// ShareTargetsPlugin.java — the apps that take a share, right inside Sign's sharing menu (14.11.), and the share itself.
// list({ mime }) → { targets: [{ label, pkg, cls, icon (PNG Base64, 96 px) }] } · send({ paths, mime, text, pkg, cls })
// paths: files in the app's cache (Filesystem); they leave as content:// through the FileProvider, readable only by
// the chosen app. Without pkg the system chooser opens. iOS has no list: there the system sheet stays.
package org.signclip.signapp;

import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "ShareTargets")
public class ShareTargetsPlugin extends Plugin {
    private static String png(Drawable d) {
        Bitmap bmp = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        d.setBounds(0, 0, 96, 96);
        d.draw(c);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    @PluginMethod
    public void list(PluginCall call) {
        final String mime = call.getString("mime", "*/*");
        new Thread(() -> {
            try {
                PackageManager pm = getContext().getPackageManager();
                List<ResolveInfo> found = pm.queryIntentActivities(new Intent(Intent.ACTION_SEND).setType(mime), 0);
                JSArray targets = new JSArray();
                int n = 0;
                for (ResolveInfo ri : found) {
                    if (ri.activityInfo.packageName.equals(getContext().getPackageName())) continue;
                    JSObject t = new JSObject();
                    t.put("label", String.valueOf(ri.loadLabel(pm)));
                    t.put("pkg", ri.activityInfo.packageName);
                    t.put("cls", ri.activityInfo.name);
                    t.put("icon", png(ri.loadIcon(pm)));
                    targets.put(t);
                    if (++n >= 40) break;
                }
                JSObject out = new JSObject();
                out.put("targets", targets);
                call.resolve(out);
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        }).start();
    }

    @PluginMethod
    public void send(PluginCall call) {
        try {
            JSArray paths = call.getArray("paths", new JSArray());
            String mime = call.getString("mime", "*/*");
            String text = call.getString("text");
            String pkg = call.getString("pkg");
            String cls = call.getString("cls");
            String authority = getContext().getPackageName() + ".fileprovider";
            ArrayList<Uri> uris = new ArrayList<>();
            for (int i = 0; i < paths.length(); i++) uris.add(FileProvider.getUriForFile(getContext(), authority, new File(paths.getString(i))));
            Intent intent = new Intent(uris.size() > 1 ? Intent.ACTION_SEND_MULTIPLE : Intent.ACTION_SEND);
            intent.setType(mime);
            if (text != null && !text.isEmpty()) intent.putExtra(Intent.EXTRA_TEXT, text);
            if (uris.size() == 1) intent.putExtra(Intent.EXTRA_STREAM, uris.get(0));
            if (uris.size() > 1) intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
            if (!uris.isEmpty()) {
                ClipData clip = ClipData.newRawUri("", uris.get(0));
                for (int i = 1; i < uris.size(); i++) clip.addItem(new ClipData.Item(uris.get(i)));
                intent.setClipData(clip);
            }
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (pkg != null && cls != null) {
                intent.setClassName(pkg, cls);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(intent);
            } else {
                getActivity().startActivity(Intent.createChooser(intent, null));
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
