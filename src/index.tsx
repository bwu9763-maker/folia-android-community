import { Buffer } from 'buffer';
import { installGlobalVisualizerFrameRateLimiter } from './utils/frameRateLimiter';
import { installConsoleLogCapture } from './utils/consoleLogBuffer';
import { installDebugModule } from './services/debug/debugModule';
import { installMemorySampleFeed } from './services/debug/memorySamples';
// import { installCoverSizeAudit } from './services/debug/coverSizeSamples';
// @ts-ignore
globalThis.Buffer = Buffer;
// First, so the debug overlay's console tab has the startup lines too - they are where a failure
// to reach a library or restore a session shows up.
installConsoleLogCapture();
// Right after it, so the startup lines reach the runtime log file too and not only the in-memory
// buffer. Both no-op off Electron. See services/debug/debugModule.ts.
installDebugModule();
installMemorySampleFeed();
// Cover size audit, left wired but switched off: it answered whether the provider CDNs honour the
// size in a cover URL - they do - and that is not a question worth re-asking every session. The
// collector and its panel are still in the tree, and `?probe=coverSizeAudit` still reaches them.
// To bring the tab back, uncomment this line and the four sites in DevDebugOverlay.tsx. It was dev
// only even then: a packaged build has nothing to do with the answer, so it should not pay the
// observer or the rows it retains.
// if (import.meta.env.DEV) installCoverSizeAudit();
installGlobalVisualizerFrameRateLimiter();

// Android 媒体通知（封面/歌名/歌手/可拖进度条/三按钮）+ 前台服务保活：
// 桥就绪后把播放状态推给原生 FoliaPlaybackService（远端按钮事件也由它派发回前端）。
if (window.Capacitor?.isNativePlatform?.()) {
  void import('./svc/nativePlaybackBridge').then(({ installNativePlaybackBridge }) => {
    const plugin = (window as any).Capacitor?.Plugins?.FoliaNative;
    if (plugin) void installNativePlaybackBridge(plugin);
  }).catch(() => { /* 非原生环境忽略 */ });
}

// Android 媒体通知（封面/歌名/歌手/可拖进度条/三按钮）+ 前台服务保活：
// 桥就绪后把播放状态推给原生 FoliaPlaybackService（远端按钮事件也由它派发回前端）。
if (window.Capacitor?.isNativePlatform?.()) {
  void import('./svc/nativePlaybackBridge').then(({ installNativePlaybackBridge }) => {
    const plugin = (window as any).Capacitor?.Plugins?.FoliaNative;
    if (plugin) void installNativePlaybackBridge(plugin);
  }).catch(() => { /* 非原生环境忽略 */ });
}

void import('./bootstrap');
