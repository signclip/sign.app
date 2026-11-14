// MainActivity.java — the Sign app's Android entry: Capacitor, plus the app's own plugins DavHttp (WebDAV verbs) and ShareTargets (apps in the sharing menu).
package org.signclip.signapp;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DavHttpPlugin.class);
        registerPlugin(ShareTargetsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
