// MainActivity.java — the Sign app's Android entry: Capacitor, plus the app's own plugins DavHttp (WebDAV verbs), ShareTargets (apps in the sharing menu) and SignKeys (keys in the Android Keystore, 22.11.).
package org.signclip.signapp;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DavHttpPlugin.class);
        registerPlugin(ShareTargetsPlugin.class);
        registerPlugin(SignKeysPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
