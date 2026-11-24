package com.icewhale.casaos;

import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 把系统的系统栏 / 刘海内边距交给网页层。
 *
 * ## 为什么需要这个
 *
 * CSS 里的 {@code env(safe-area-inset-*)} 在 Android WebView 里恒为 0
 * （只有 iOS 的 Safari 才会真正提供这些值），所以网页层拿不到状态栏和手势条的高度。
 *
 * Capacitor 自带的 {@code android.adjustMarginsForEdgeToEdge} 只有在
 * Android 15（API 35）以上才会生效，低版本设备上状态栏会压住页面内容。
 *
 * 这里把真实的 inset 值以 CSS 像素返回给网页，由网页按需留白：
 * 背景壁纸仍然可以延伸到状态栏后面（真正的全面屏观感），
 * 但顶栏、底栏这些真正需要点按的区域不会被系统栏盖住。
 */
@CapacitorPlugin(name = "SystemInsets")
public class SystemInsetsPlugin extends Plugin {

	/**
	 * 返回当前系统栏 / 刘海的内边距，单位是 CSS 像素（设备像素 / density）。
	 */
	@PluginMethod
	public void get(PluginCall call) {
		JSObject result = new JSObject();

		float density = 1f;
		if (getContext() != null) {
			density = getContext().getResources().getDisplayMetrics().density;
		}
		if (density <= 0f) {
			density = 1f;
		}

		Insets insets = currentInsets();
		result.put("top", insets.top / density);
		result.put("bottom", insets.bottom / density);
		result.put("left", insets.left / density);
		result.put("right", insets.right / density);
		result.put("density", density);

		call.resolve(result);
	}

	/**
	 * 取窗口根部的 inset：系统栏（状态栏 / 导航条）+ 显示区域挖孔（刘海）。
	 */
	private Insets currentInsets() {
		if (getActivity() == null) {
			return Insets.NONE;
		}
		View decor = getActivity().getWindow().getDecorView();
		WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(decor);
		if (windowInsets == null) {
			return Insets.NONE;
		}
		return windowInsets.getInsets(
				WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
	}
}
