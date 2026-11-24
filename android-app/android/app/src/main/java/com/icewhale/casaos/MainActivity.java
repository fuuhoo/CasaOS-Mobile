package com.icewhale.casaos;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.res.AssetManager;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * CasaOS 移动端入口。
 *
 * <p>CasaOS 的 Web UI 通过同源相对路径调用后端 API（例如 axios 的 baseURL 为空串），
 * 所以 App 必须直接加载 NAS 上的页面，而不是打包进 APK 的本地资源，
 * 否则 API 请求会打到手机自己身上。</p>
 *
 * <p>因此这里允许在运行时设置服务器地址：</p>
 * <ul>
 *   <li>首次启动弹窗让用户填写 CasaOS 地址；</li>
 *   <li>之后每次启动做一次可达性探测，地址失效（例如 NAS 换了 IP）时重新弹窗；</li>
 *   <li>随时可以通过桌面图标的「设置服务器地址」快捷方式重新设置；</li>
 *   <li>网页界面里也有入口（ServerAddress 插件），两条路都能用；</li>
 *   <li>地址保存在 SharedPreferences，构建时写入的占位 server.url 不再重要。</li>
 * </ul>
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "CasaOS";

    /** 桌面快捷方式用的 action：直接打开「设置服务器地址」 */
    public static final String ACTION_SERVER_ADDRESS = "com.icewhale.casaos.action.SERVER_ADDRESS";
    /** 快捷方式传递的 extra */
    public static final String EXTRA_SERVER_ADDRESS = "casaos_open_address";

    private static final String PREFS = "casaos_prefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String ASSET_CONFIG = "capacitor.config.json";
    private static final int PROBE_TIMEOUT_MS = 4000;

    /**
     * 返回键回调在系统 OnBackInvokedDispatcher 里的优先级。
     *
     * <p>系统的输入法（IME）会注册一个自己的返回回调，优先级是 PRIORITY_DEFAULT(0)。
     * 只要页面上有输入框获得了焦点，那个回调就会先被调用，返回键被用来收起软键盘，
     * App 自己的处理根本轮不到。</p>
     *
     * <p>系统的规则是「优先级大的先调用」，所以这里给一个明显更高的优先级，
     * 让 App 的返回处理始终优先于输入法 —— 这样在弹窗里按返回键会直接关掉弹窗，
     * 而不是先收一次键盘。</p>
     */
    private static final int BACK_CALLBACK_PRIORITY = 100;

    private AlertDialog addressDialog;
    private EditText addressInput;
    private TextView addressStatus;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // BridgeActivity.onCreate 内部会调用 load()，此时已应用下面保存的服务器地址。

        setupBackKeyHandling();

        if (isServerAddressShortcut(getIntent())) {
            // 从桌面快捷方式进来的：直接打开设置界面
            showServerAddressDialog(getServerUrl());
            return;
        }

        String saved = getServerUrl();
        if (saved == null) {
            showServerAddressDialog(null);
        } else {
            probeServer(saved, true);
        }
    }

    /**
     * 在原生层接管返回键 / 返回手势。
     *
     * <p><b>为什么不直接用 Capacitor 自带的机制</b></p>
     *
     * <p>Capacitor 7 的 App 插件（{@code AppPlugin.java}）是这样处理返回键的：</p>
     *
     * <pre>
     * if (!hasListeners(EVENT_BACK_BUTTON)) {
     *     // 没有监听器 -> 执行默认行为（WebView.goBack()）
     * } else {
     *     notifyListeners(EVENT_BACK_BUTTON, data, true);
     *     bridge.triggerJSEvent("backbutton", "document");
     * }
     * </pre>
     *
     * <p>也就是说<strong>只有当 App 插件确实注册了 'backButton' 监听器时，
     * 返回键才会被转成 JS 事件</strong>。而从 JS 侧注册这个监听器并不可靠：
     * Capacitor 的 JS 代理在插件尚未就绪时会静默失败（返回 rejected Promise），
     * 实测出现过「注册调用没报错，但原生侧 hasListeners 一直是 false」，
     * 结果返回键完全收不到 JS 事件。</p>
     *
     * <p>所以这里在原生层直接接管：自己注册一个 {@link OnBackPressedCallback}，
     * 无条件把返回键派发成 document 上的 'backbutton' 事件。
     * OnBackPressedDispatcher 是后进先出的，我们后注册，
     * 所以会先于 App 插件的回调执行，事件被我们消费掉，
     * App 插件的默认行为（goBack / 退出）也就不会发生。</p>
     *
     * <p>JS 侧（UI/src/plugins/native.js）监听 document 的 'backbutton'，
     * 按「文件管理器 -> 弹窗 -> 抽屉 -> 路由 -> 退出确认」的顺序逐级处理。</p>
     */
    private void setupBackKeyHandling() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                /*
                 * 直接注册到系统的 OnBackInvokedDispatcher。
                 *
                 * 为什么不用 getOnBackPressedDispatcher().addCallback()：
                 * androidx.activity 1.8.x 的 OnBackPressedDispatcher 把输入法（IME）
                 * 的返回回调**硬编码为最高优先级** —— 只要页面上有输入框获得焦点，
                 * 返回键就会被输入法消费（收起软键盘），App 自己的回调根本不会被调用。
                 * 打开 App Store 时 CasaOS 会自动聚焦搜索框，于是「按返回关掉 App Store」
                 * 就变成了「按返回收起键盘」。
                 *
                 * 系统的 OnBackInvokedDispatcher 是**后注册先执行**，
                 * 我们在 super.onCreate() 之后注册，比 IME 的注册晚，所以优先级更高。
                 */
                getOnBackInvokedDispatcher()
                        .registerOnBackInvokedCallback(
                                BACK_CALLBACK_PRIORITY,
                                new android.window.OnBackInvokedCallback() {
                                    @Override
                                    public void onBackInvoked() {
                                        dispatchBackToJs();
                                    }
                                });
            } else {
                // Android 13 以下没有系统的 OnBackInvokedDispatcher
                getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        dispatchBackToJs();
                    }
                });
            }
            Log.i(TAG, "Back key handling registered");
        } catch (Exception e) {
            Log.w(TAG, "failed to register back key handler", e);
        }
    }

    /**
     * 把返回键派发成 document 上的 'backbutton' 事件，交给网页层处理。
     */
    private void dispatchBackToJs() {
        Log.i(TAG, "back key pressed, dispatching 'backbutton' to JS");
        if (bridge != null) {
            bridge.triggerJSEvent("backbutton", "document");
            Log.i(TAG, "backbutton dispatched");
        } else {
            // Bridge 还没建好，先放行默认行为
            Log.w(TAG, "bridge is null, falling through");
            finish();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (isServerAddressShortcut(intent)) {
            showServerAddressDialog(getServerUrl());
        }
    }

    private boolean isServerAddressShortcut(Intent intent) {
        return intent != null
                && intent.getBooleanExtra(EXTRA_SERVER_ADDRESS, false);
    }

    /**
     * 读取已保存的服务器地址。
     *
     * <p>会做一次规范化：早期版本存进去的地址可能没有 http:// 前缀
     * （例如 "192.168.1.10:80"），而 Capacitor 解析这种地址会直接抛异常导致 App 崩溃，
     * 所以这里统一补全。</p>
     */
    public String getServerUrl() {
        String saved = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_SERVER_URL, null);
        return normalizeUrl(saved);
    }

    /**
     * 规范化地址：补上协议头、去掉结尾的斜杠。
     *
     * @return 规范化后的地址；输入为空时返回 null
     */
    private static String normalizeUrl(String raw) {
        if (raw == null) {
            return null;
        }
        String value = raw.trim();
        if (value.isEmpty()) {
            return null;
        }
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            value = "http://" + value;
        }
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    /**
     * 用用户保存的地址覆盖打包进 assets 的 server.url。
     */
    @Override
    protected void load() {
        // 注册自定义插件：
        //  - ServerAddress：网页界面里的「服务器地址」入口
        //  - SystemInsets：把系统栏 / 刘海的内边距交给网页层做全面屏适配
        initialPlugins.add(ServerAddressPlugin.class);
        initialPlugins.add(SystemInsetsPlugin.class);

        String saved = getServerUrl();
        if (saved != null) {
            applyServerUrl(saved);
        }
        super.load();

        /*
         * 关掉 WebView 的 HTTP 缓存。
         *
         * 背景：CasaOS 的静态文件服务没有给 index.html 发 Cache-Control，
         * 浏览器就会按「基于 Last-Modified 的启发式缓存」把 index.html 留在本地
         * （大约是最后修改时间之后的 10%）。而 index.html 里引用的是
         * app.<hash>.js 这样带 hash 的文件，一旦 index.html 命中了旧缓存，
         * 页面就会去加载一个已经被删除的旧 hash 文件，
         * 表现就是「部署了新 UI，但手机上怎么刷新都是旧的」。
         *
         * 关掉 HTTP 缓存不影响 PWA 的离线能力：
         * Service Worker 用的是 Cache API（独立于 HTTP 缓存），
         * 带 hash 的静态资源仍然可以离线加载。
         */
        if (bridge != null && bridge.getWebView() != null) {
            WebSettings settings = bridge.getWebView().getSettings();
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
            Log.i(TAG, "WebView HTTP cache disabled");
        }


    private void applyServerUrl(String url) {
        try {
            String normalized = normalizeUrl(url);
            if (normalized == null) {
                return;
            }
            // 先校验一次：Capacitor 在解析非法地址时会提前 return，
            // 导致 appUrl 保持为 null，WebView 加载时直接 NPE 崩溃。
            try {
                new URL(normalized);
            } catch (Exception e) {
                Log.w(TAG, "invalid server url, keeping bundled config: " + normalized);
                return;
            }

            AssetManager assets = getAssets();
            JSONObject json = new JSONObject(readAsset(assets, ASSET_CONFIG));
            JSONObject server = json.optJSONObject("server");
            if (server == null) {
                server = new JSONObject();
                json.put("server", server);
            }
            server.put("url", normalized);

            // CapConfig 的这个构造函数没有 Context，默认值会退化成 false，
            // 导致 debug 包也开不了 WebView 调试。这里按应用是否可调试补回去。
            boolean debuggable =
                    (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            JSONObject android = json.optJSONObject("android");
            if (android == null) {
                android = new JSONObject();
                json.put("android", android);
            }
            android.put("webContentsDebuggingEnabled", debuggable);

            this.config = new CapConfig(assets, json);
            Log.i(TAG, "server url overridden to " + normalized);
        } catch (Exception e) {
            Log.w(TAG, "applyServerUrl failed, falling back to bundled config", e);
        }
    }

    /**
     * 探测服务器是否可达。
     *
     * @param url        要探测的地址
     * @param promptOnFail 探测失败时是否弹出地址设置框
     * @param onResult   探测结果回调（后台线程）
     */
    private void probeServer(final String url, final boolean promptOnFail) {
        new Thread(() -> {
            final boolean reachable = isReachable(url);
            if (!reachable && promptOnFail) {
                runOnUiThread(() -> showServerAddressDialog(url));
            }
        }, "casaos-probe").start();
    }

    /**
     * 探测地址是否可达。
     */
    private boolean isReachable(String url) {
        HttpURLConnection conn = null;
        try {
            String base = normalizeUrl(url);
            if (base == null) {
                return false;
            }
            conn = (HttpURLConnection) new URL(base + "/v1/sys/version/current").openConnection();
            conn.setConnectTimeout(PROBE_TIMEOUT_MS);
            conn.setReadTimeout(PROBE_TIMEOUT_MS);
            conn.setRequestMethod("GET");
            // CasaOS 的这个接口不需要鉴权，能返回 200 就说明地址对了
            int code = conn.getResponseCode();
            return code == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    /**
     * 打开「设置服务器地址」对话框。
     *
     * <p>保存前会先探测一次地址：通了才保存并刷新，不通就把错误显示在框里，
     * 不会「保存了一个坏地址然后反复弹窗」。</p>
     *
     * @param current 当前地址（可为空）
     */
    public void showServerAddressDialog(String current) {
        if (isFinishing() || isDestroyed()) {
            return;
        }
        if (addressDialog != null && addressDialog.isShowing()) {
            return;
        }

        addressInput = new EditText(this);
        addressInput.setHint("http://192.168.1.10");
        addressInput.setSingleLine(true);
        addressInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        if (current != null) {
            addressInput.setText(current);
            addressInput.setSelection(current.length());
        }

        addressStatus = new TextView(this);
        addressStatus.setVisibility(TextView.GONE);
        addressStatus.setPadding(0, 12, 0, 0);

        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        container.setPadding(pad, pad / 2, pad, 0);
        container.addView(
                addressInput,
                new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        container.addView(
                addressStatus,
                new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        addressDialog = new AlertDialog.Builder(this)
                .setTitle("CasaOS 服务器地址")
                .setMessage("请填写 CasaOS 的访问地址，例如 http://192.168.1.10 。\n"
                        + "地址保存在本机，可以随时重新设置。")
                .setView(container)
                .setCancelable(false)
                .setPositiveButton("保存", null)
                .setNegativeButton("取消", null)
                .create();

        // 用 setPositiveButton(null) 建好之后再自己接管按钮，
        // 这样保存失败时可以保持对话框打开并显示错误。
        addressDialog.setOnShowListener(dialog -> {
            addressDialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> onSaveAddress());
            addressDialog.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener(v -> addressDialog.dismiss());
        });
        addressDialog.show();
    }

    /**
     * 「保存」按钮：先探测地址，通了才保存并刷新。
     */
    private void onSaveAddress() {
        final String value = addressInput.getText().toString().trim();
        if (value.isEmpty()) {
            showAddressError("请输入地址");
            return;
        }
        final String normalized = normalizeUrl(value);
        if (normalized == null) {
            showAddressError("地址格式不正确");
            return;
        }

        setAddressBusy(true, "正在连接 " + normalized + " …");
        final String target = normalized;

        new Thread(() -> {
            final boolean ok = isReachable(target);
            runOnUiThread(() -> {
                if (ok) {
                    getSharedPreferences(PREFS, MODE_PRIVATE)
                            .edit()
                            .putString(KEY_SERVER_URL, target)
                            .apply();
                    Log.i(TAG, "server url saved: " + target);
                    if (addressDialog != null) {
                        addressDialog.dismiss();
                    }
                    // 重新创建 Activity，让 WebView 用新地址重新加载
                    recreate();
                } else {
                    setAddressBusy(false, null);
                    showAddressError("连不上 " + target + "\n请检查地址是否正确、手机是否与服务器在同一网络。");
                }
            });
        }, "casaos-probe-save").start();
    }

    private void setAddressBusy(boolean busy, String message) {
        if (addressDialog == null || !addressDialog.isShowing()) {
            return;
        }
        AlertDialog dialog = addressDialog;
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(!busy);
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(!busy);
        addressInput.setEnabled(!busy);
        if (busy) {
            addressStatus.setVisibility(TextView.VISIBLE);
            addressStatus.setText(message == null ? "" : message);
        }
    }

    private void showAddressError(String message) {
        if (addressStatus == null) {
            return;
        }
        addressStatus.setVisibility(TextView.VISIBLE);
        addressStatus.setText(message);
    }

    private static String readAsset(AssetManager assets, String name) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(assets.open(name)))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append('\n');
            }
        }
        return sb.toString();
    }
}
