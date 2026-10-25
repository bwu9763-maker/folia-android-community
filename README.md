# Folia for Android（安卓移植版）

Folia 音乐播放器的 **Android 原生移植版**，基于上游桌面版工程完整移植，包名 `ti.folia.ming`，当前版本 **v0.7.21**（versionCode 721）。

> 本仓库是完整可构建的工程：React/Vite 前端 + Capacitor Android 容器 + 原生 Java 插件，不依赖任何外部服务即可构建。

## 功能总览

### 在线音乐
- 多平台账号登录：QQ 音乐 / 网易云 / 酷狗
- 歌单、收藏、每日推荐、私人 FM、歌手页 / 专辑页 / 排行榜 / 电台 / 新歌速递 / 探索页
- 音质可选：标准 / 高清 / 无损
- 中英双语滚动歌词、逐字歌词

### 本地音乐
- MediaStore 设备音乐库扫描
- SAF 文件管理器选文件 / 整个文件夹导入
- 内嵌专辑封面提取（FLAC/MP3 内嵌图）
- 本地回环 HTTP 音频流（LocalAudioServer）

### 播放体验
- **媒体通知**：封面 / 歌名 / 歌手 / 可拖动进度条 / 三按钮直接控制
- **前台服务保活**：退桌面、锁屏播放不中断
- **歌曲永不让位**：开游戏、其他 App 放音频都不打断本 App 播放（音频焦点 no-op + 每秒自动续播护栏）
- Lattice 拼图墙 + 性能优先模式（默认开：关噪点/暗角/大阴影模糊，封面档位钳制）
- 音效链（均衡器 / 混响 / 比特粉碎）

### 界面
- 真全屏（状态栏/导航栏全隐藏，IMMERSIVE_STICKY + WindowInsetsController 双通道）
- 界面整体 75% 等比缩放（横竖屏生效）
- 自适应布局 / 刘海屏 / 挖孔屏适配

## 构建环境

- Node.js 22+
- JDK 21（Capacitor 8 要求 source/target 21）
- Android SDK 34+
- Android Studio（可选）

## 构建步骤

```bash
# 1. 安装依赖
npm install

# 2. 构建网页产物
set FOLIA_DISABLE_PWA=1
npx vite build

# 3. 同步到 Android 工程
npx cap sync android

# 4. 生成调试 APK
cd android
gradlew.bat assembleDebug
```

APK 输出：`android/app/build/outputs/apk/debug/app-debug.apk`

- 包名：`ti.folia.ming`
- versionName：`0.7.21` / versionCode：`721`
- 调试签名：`android/app/folia-debug.keystore`（alias `folia-debug`，密码 `folia2026`）——固定密钥，覆盖安装不会报签名冲突

## 工程结构

```text
src/                        React/Vite 前端
  audioNative/              原生桥网络层（QQ/网易云/酷狗适配）
  services/onlineMusic/qq/  QQ 音乐 provider
  services/localMusicService.ts  本地音乐
  components/app/lattice/   Lattice 拼图墙
  library/suites/bravais/   Bravais 界面套件
android/                    Capacitor Android 容器
  app/src/main/java/top/izuna/foliamajor/
    FoliaCorePlugin.java    原生插件（网络/本地音乐/媒体通知/布局）
    FoliaPlaybackService.java  前台播放服务（MediaSession 媒体通知）
    LocalAudioServer.java   本地音频回环流
    FoliaBridgePlugin.java  CookieManager 网络兼容层
```

## 上游

本工程基于上游桌面版移植，来源：[chthollyphile/folia-major](https://github.com/chthollyphile/folia-major)

## 许可

遵循上游 [LICENSE](LICENSE)。
