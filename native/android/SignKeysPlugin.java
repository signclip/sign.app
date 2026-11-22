// SignKeysPlugin.java — Sign's private keys in the Android Keystore (22.11.): made inside, used inside, never handed out.
// create({ alias, kind: sign|agree|aes }) → { publicKey (Base64, 65 bytes 04‖x‖y; none for aes), hardware: strongbox|tee|software }
// has({ alias }) → { exists } · sign({ alias, data }) → { signature (Base64, 64 bytes r‖s, as WebCrypto gives and checks) }
// agree({ alias, peer (Base64, 65 bytes) }) → { secret (Base64, 32 bytes) } (Android 12+) · encrypt({ alias, data }) → { iv, data }
// decrypt({ alias, iv, data }) → { data } · remove({ alias })
// P-256 (secp256r1) everywhere: the only curve StrongBox has, and the one iOS's Secure Enclave has. StrongBox is tried
// first, the TEE when the phone has none. The app's side: sign/app/9-ui/native-keys.js.
package org.signclip.signapp;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.math.BigInteger;
import java.security.Key;
import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.ProviderException;
import java.security.PublicKey;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SignKeys")
public class SignKeysPlugin extends Plugin {
    private static final String STORE = "AndroidKeyStore";

    private static KeyStore store() throws Exception {
        KeyStore ks = KeyStore.getInstance(STORE);
        ks.load(null);
        return ks;
    }

    private static String b64(byte[] b) { return Base64.encodeToString(b, Base64.NO_WRAP); }

    private static byte[] unb64(String s) { return Base64.decode(s, Base64.DEFAULT); }

    private static void fail(PluginCall call, Exception e) { call.reject(String.valueOf(e.getMessage()), e); }

    @PluginMethod
    public void create(PluginCall call) {
        String alias = call.getString("alias"), kind = call.getString("kind", "sign");
        try {
            if (alias == null || store().containsAlias(alias)) { call.reject("no alias, or it exists"); return; }
            boolean aes = "aes".equals(kind);
            boolean strong = aes ? makeAes(alias) : makeEc(alias, kind);
            JSObject out = new JSObject();
            if (!aes) out.put("publicKey", b64(raw((ECPublicKey) store().getCertificate(alias).getPublicKey())));
            out.put("hardware", strong ? "strongbox" : level(alias, aes));
            call.resolve(out);
        } catch (Exception e) { fail(call, e); }
    }

    /** An EC key pair inside (StrongBox if there is one). → true when in StrongBox. */
    private static boolean makeEc(String alias, String kind) throws Exception {
        boolean agree = "agree".equals(kind);
        if (agree && Build.VERSION.SDK_INT < 31) throw new UnsupportedOperationException("agree needs Android 12");
        int purpose = agree ? KeyProperties.PURPOSE_AGREE_KEY : (KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY);
        for (boolean strong : new boolean[] { true, false }) {
            if (strong && Build.VERSION.SDK_INT < 28) continue;
            try {
                KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(alias, purpose).setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"));
                if (!agree) b.setDigests(KeyProperties.DIGEST_SHA256);
                if (strong) b.setIsStrongBoxBacked(true);
                KeyPairGenerator g = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, STORE);
                g.initialize(b.build());
                g.generateKeyPair();
                return strong;
            } catch (ProviderException e) { // StrongBoxUnavailableException is one: no StrongBox, or not for this kind → the TEE
                if (!strong) throw e;
            }
        }
        throw new IllegalStateException("no key made");
    }

    /** An AES-256-GCM key inside (StrongBox if there is one). → true when in StrongBox. */
    private static boolean makeAes(String alias) throws Exception {
        for (boolean strong : new boolean[] { true, false }) {
            if (strong && Build.VERSION.SDK_INT < 28) continue;
            try {
                KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256);
                if (strong) b.setIsStrongBoxBacked(true);
                KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, STORE);
                g.init(b.build());
                g.generateKey();
                return strong;
            } catch (ProviderException e) {
                if (!strong) throw e;
            }
        }
        throw new IllegalStateException("no key made");
    }

    /** Where a key outside StrongBox lies: the TEE (secure hardware) or only software. */
    @SuppressWarnings("deprecation")
    private static String level(String alias, boolean aes) {
        try {
            Key k = store().getKey(alias, null);
            KeyInfo info = aes ? (KeyInfo) SecretKeyFactory.getInstance(k.getAlgorithm(), STORE).getKeySpec((SecretKey) k, KeyInfo.class)
                : KeyFactory.getInstance(k.getAlgorithm(), STORE).getKeySpec(k, KeyInfo.class);
            if (Build.VERSION.SDK_INT >= 31) {
                int l = info.getSecurityLevel();
                return l == KeyProperties.SECURITY_LEVEL_STRONGBOX ? "strongbox" : l == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT ? "tee" : "software";
            }
            return info.isInsideSecureHardware() ? "tee" : "software";
        } catch (Exception e) {
            return "unknown";
        }
    }

    @PluginMethod
    public void has(PluginCall call) {
        try {
            JSObject out = new JSObject();
            out.put("exists", store().containsAlias(call.getString("alias")));
            call.resolve(out);
        } catch (Exception e) { fail(call, e); }
    }

    @PluginMethod
    public void sign(PluginCall call) {
        try {
            PrivateKey k = (PrivateKey) store().getKey(call.getString("alias"), null);
            if (k == null) { call.reject("no key"); return; }
            Signature s = Signature.getInstance("SHA256withECDSA");
            s.initSign(k);
            s.update(unb64(call.getString("data")));
            JSObject out = new JSObject();
            out.put("signature", b64(rawSignature(s.sign())));
            call.resolve(out);
        } catch (Exception e) { fail(call, e); }
    }

    @PluginMethod
    public void agree(PluginCall call) {
        try {
            String alias = call.getString("alias");
            PrivateKey k = (PrivateKey) store().getKey(alias, null);
            if (k == null) { call.reject("no key"); return; }
            ECPublicKey mine = (ECPublicKey) store().getCertificate(alias).getPublicKey();
            byte[] p = unb64(call.getString("peer"));
            if (p.length != 65 || p[0] != 4) { call.reject("peer: 65 raw bytes"); return; }
            ECPoint w = new ECPoint(new BigInteger(1, Arrays.copyOfRange(p, 1, 33)), new BigInteger(1, Arrays.copyOfRange(p, 33, 65)));
            PublicKey peer = KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(w, mine.getParams()));
            KeyAgreement a = KeyAgreement.getInstance("ECDH", STORE);
            a.init(k);
            a.doPhase(peer, true);
            JSObject out = new JSObject();
            out.put("secret", b64(a.generateSecret()));
            call.resolve(out);
        } catch (Exception e) { fail(call, e); }
    }

    @PluginMethod
    public void encrypt(PluginCall call) {
        try {
            SecretKey k = (SecretKey) store().getKey(call.getString("alias"), null);
            if (k == null) { call.reject("no key"); return; }
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, k); // the Keystore chooses the IV (12 bytes)
            byte[] data = c.doFinal(unb64(call.getString("data")));
            JSObject out = new JSObject();
            out.put("iv", b64(c.getIV()));
            out.put("data", b64(data));
            call.resolve(out);
        } catch (Exception e) { fail(call, e); }
    }

    @PluginMethod
    public void decrypt(PluginCall call) {
        try {
            SecretKey k = (SecretKey) store().getKey(call.getString("alias"), null);
            if (k == null) { call.reject("no key"); return; }
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, unb64(call.getString("iv"))));
            JSObject out = new JSObject();
            out.put("data", b64(c.doFinal(unb64(call.getString("data")))));
            call.resolve(out);
        } catch (Exception e) { fail(call, e); }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        try {
            store().deleteEntry(call.getString("alias"));
            call.resolve();
        } catch (Exception e) { fail(call, e); }
    }

    /** 65 raw bytes 04‖x‖y, as WebCrypto exports a P-256 public key. */
    private static byte[] raw(ECPublicKey k) {
        byte[] out = new byte[65];
        out[0] = 4;
        System.arraycopy(fixed(k.getW().getAffineX()), 0, out, 1, 32);
        System.arraycopy(fixed(k.getW().getAffineY()), 0, out, 33, 32);
        return out;
    }

    /** A number as exactly 32 bytes (BigInteger may add a leading 0 or be shorter). */
    private static byte[] fixed(BigInteger v) {
        byte[] b = v.toByteArray(), out = new byte[32];
        int n = Math.min(b.length, 32);
        System.arraycopy(b, b.length - n, out, 32 - n, n);
        return out;
    }

    /** DER SEQUENCE { INTEGER r, INTEGER s } → r‖s, 32 bytes each. */
    static byte[] rawSignature(byte[] der) {
        int i = 2;
        if ((der[1] & 0x80) != 0) i += der[1] & 0x7f; // a long length form (never for P-256, read anyway)
        byte[] out = new byte[64];
        for (int part = 0; part < 2; part++) {
            int len = der[i + 1] & 0xff;
            i += 2;
            System.arraycopy(fixed(new BigInteger(1, Arrays.copyOfRange(der, i, i + len))), 0, out, part * 32, 32);
            i += len;
        }
        return out;
    }
}
