// DavHttpPlugin.java — WebDAV verbs for the Sign app on Android (14.11.).
// Android's HttpURLConnection (used by CapacitorHttp) refuses PROPFIND, MKCOL, MOVE, COPY …; OkHttp sends any verb.
// JS: app/2-storage/dav-fetch.js calls request({ url, method, headers, data }) → { status, headers, data } (Base64).
// Only the WebDAV verbs come here; files (GET/PUT) stay with CapacitorHttp.
package org.signclip.signapp;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Iterator;
import java.util.concurrent.TimeUnit;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

@CapacitorPlugin(name = "DavHttp")
public class DavHttpPlugin extends Plugin {
    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build();

    @PluginMethod
    public void request(PluginCall call) {
        final String url = call.getString("url");
        // only over TLS (27.11., audit N3): a login never leaves in the clear; http stays for a server on this very device
        if (url == null || !url.matches("(?i)^(https://.+|http://(localhost|127\\.0\\.0\\.1)(:\\d+)?(/.*)?)$")) { call.reject("https only"); return; }
        final String method = call.getString("method", "GET");
        final JSObject headers = call.getObject("headers", new JSObject());
        final String data = call.getString("data");
        new Thread(() -> {
            try {
                Request.Builder b = new Request.Builder().url(url);
                String type = null;
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    String v = headers.getString(k);
                    if (v == null) continue;
                    b.header(k, v);
                    if (k.equalsIgnoreCase("Content-Type")) type = v;
                }
                RequestBody body = null;
                MediaType media = type == null ? null : MediaType.parse(type);
                if (data != null) body = RequestBody.create(Base64.decode(data, Base64.NO_WRAP), media);
                else if (method.equals("PROPPATCH") || method.equals("REPORT")) body = RequestBody.create(new byte[0], media);
                b.method(method, body);
                try (Response r = client.newCall(b.build()).execute()) {
                    JSObject out = new JSObject();
                    out.put("status", r.code());
                    JSObject h = new JSObject();
                    for (String n : r.headers().names()) h.put(n, r.header(n));
                    out.put("headers", h);
                    byte[] bytes = r.body() != null ? r.body().bytes() : new byte[0];
                    out.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
                    call.resolve(out);
                }
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        }).start();
    }
}
