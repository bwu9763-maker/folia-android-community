package top.izuna.foliamajor;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * Folia Android 全屏沉浸容器：
 * - 真全屏（状态栏/导航栏全隐藏，IMMERSIVE_STICKY + WindowInsetsController 双通道）；
 * - 刘海屏 / 挖孔屏适配（API 30+ ALWAYS，低版本 SHORT_EDGES）；
 * - WebView：混合内容放行 + 75% 等比缩放（wideViewPort + overviewMode + initialScale）；
 * - 注册 FoliaBridge（网络层扩展）与 FoliaNative（本地音乐 MediaStore/SAF + LocalAudioServer）。
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FoliaBridgePlugin.class);
        registerPlugin(FoliaCorePlugin.class);
        super.onCreate(savedInstanceState);
        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            WebSettings ws = bridge.getWebView().getSettings();
            ws.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
            ws.setUseWideViewPort(true);
            ws.setLoadWithOverviewMode(true);
            ws.setSupportZoom(false);
            ws.setBuiltInZoomControls(false);
            bridge.getWebView().setInitialScale(75);
        }
        installRenderCrashRecovery(bridge);
        applyFullscreen();
        applyCutoutMode();
        getWindow().getDecorView().postDelayed(this::applyFullscreen, 500);
        getWindow().getDecorView().postDelayed(this::applyCutoutMode, 500);
        getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(visibility -> {
            if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) applyFullscreen();
        });
    }

    /**
     * WebView 渲染进程死亡保险丝（修「歌词播放闪退」的兜底层）。
     *
     * 歌词页的 WebGL 重特效（花火/随机样式等 v0.7.22 实验性视觉）在部分设备的
     * WebView 里会把渲染进程的 GPU/内存顶爆，系统直接击杀渲染进程；安卓默认
     * 行为是 App 整个跟着死（表现为闪退）。这里接住它：记进崩溃日志后自动重建
     * 界面，音乐由 FoliaPlaybackService 前台服务继续播不中断。
     * 15 秒内只救一次：连续快速复发说明是某个特效必杀，不再无限重启打转。
     */
    private void installRenderCrashRecovery(Bridge bridge) {
        if (bridge == null) return;
        bridge.addWebViewListener(new WebViewListener() {
            private volatile long lastRecreateAtMs = 0L;

            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                CrashDiagnostics.recordText(
                    MainActivity.this,
                    "webview-renderer",
                    Thread.currentThread().getName(),
                    "RenderProcessGone",
                    "renderer crashed during playback",
                    "");
                long now = SystemClock.elapsedRealtime();
                if (now - lastRecreateAtMs > 15_000L) {
                    lastRecreateAtMs = now;
                    new Handler(Looper.getMainLooper()).post(() -> {
                        try {
                            webView.destroy();
                        } catch (Throwable ignored) {
                        }
                        MainActivity.this.recreate();
                    });
                }
                // true = 本次死亡已接住，App 进程不陪葬
                return true;
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyFullscreen();
            applyCutoutMode();
        }
    }

    private void applyFullscreen() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            android.view.WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(android.view.WindowInsets.Type.statusBars() | android.view.WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        }
    }

    private void applyCutoutMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                attributes.layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            } else {
                attributes.layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            }
            getWindow().setAttributes(attributes);
        }
    }
}
