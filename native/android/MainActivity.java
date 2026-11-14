// MainActivity.java — the Sign app's Android entry: Capacitor, plus the app's own plugin DavHttp (WebDAV verbs).
package org.signclip.signapp;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DavHttpPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
