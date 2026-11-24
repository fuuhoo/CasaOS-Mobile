package com.icewhale.casaos;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 让网页界面也能打开「设置服务器地址」对话框。
 *
 * <p>入口在 CasaOS-UI 的用户菜单里（见 UI/src/components/TopBar.vue）。
 * 网页里调用方式：</p>
 * <pre>
 * const { ServerAddress } = window.Capacitor.Plugins;
 * await ServerAddress.open();
 * </pre>
 */
@CapacitorPlugin(name = "ServerAddress")
public class ServerAddressPlugin extends Plugin {

    /**
     * 打开服务器地址设置框。
     */
    @PluginMethod
    public void open(PluginCall call) {
        MainActivity activity = (MainActivity) getActivity();
        if (activity == null) {
            call.reject("activity not available");
            return;
        }
        activity.runOnUiThread(() -> activity.showServerAddressDialog(activity.getServerUrl()));
        call.resolve();
    }

    /**
     * 读取当前保存的服务器地址。
     */
    @PluginMethod
    public void get(PluginCall call) {
        MainActivity activity = (MainActivity) getActivity();
        JSObject ret = new JSObject();
        ret.put("url", activity == null ? "" : activity.getServerUrl());
        call.resolve(ret);
    }
}
