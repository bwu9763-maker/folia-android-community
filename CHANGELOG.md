# Folia 安卓定制版 更新日志

## v0.7.24-android-v3（2026-10-31）

基线：官方 v0.7.24（chthollyphile/folia-major main 分支，commit 快照）
前一版：v0.7.22-android-v4

---

### 一、官方上游更新（0.7.22 → 0.7.24）

官方两个版本共改动 375 个文件、新增 127 个，主要新特性：

**HiFi 播放通道（桌面）**
- 新增 mpv 引擎播放路线：Web 引擎让位逻辑、信号通路面板（HifiSignalPathPanel）、播放路由摘要、系统报告
- 设置页新增 HiFi 分区（src/components/modal/settings/pages/hifi）
- 注：mpv 路线为桌面端能力，安卓 WebView 上该路线不可用，但 Web 引擎的让位判定与界面徽标已随源码带入

**歌词过滤规则引擎**
- 旧的单一正则开关（lyricFilterPattern）升级为规则列表引擎（lyricLineRules）
- 新增歌词库扫描 worker（lyricLibraryScan.worker）与手写规则校验（useWrittenRuleCheck）

**远程播放队列（RemoteQueue）**
- 新增远程播放队列组件与样式（src/components/remote/RemoteQueue.tsx）

**正在播放卡片定位**
- 正在播放提示卡片支持自定义位置（NowPlayingCardPositioner、useNowPlayingCardPosition）

**可视化（Visualizer）**
- 40 个文件改动，为本版本改动最集中的模块（含性能与渲染调整）
- 进度条填充步进重构（progressFillStep）

**本地曲库封面**
- 新增本地合集封面模块（local-collection-cover）与封面扫描 worker

**国际化与打包**
- 新增繁体中文（zh-TW）、印尼语（id）、越南语（vi）
- Electron 打包语言白名单扩充，新增 rpm 打包配置
- 移除 i18next-browser-languagedetector 依赖

---

### 二、安卓定制侧修复（本版重点）

**1. 扫库歌曲封面修复**
- 症状：通过「扫描设备音乐库」导入的歌，封面永远空白
- 根因：按需封面提取（getImportedAudioCover）只认「文件导入」的 imported-* 副本路径，MediaStore 扫描的歌 ref 是纯数字 id，解析直接返回空
- 修复：Java 侧新增 extractMediaStoreMetadata，数字 ref 按 MediaStore content URI 走同一套 MediaMetadataRetriever 提取（FoliaCorePlugin.java）

**2. 内嵌歌词支持（安卓此前完全读不到）**
- 症状：文件里内嵌了 USLT 歌词帧，APP 里不显示
- 根因：安卓导入用原生 MediaMetadataRetriever，天生拿不到歌词帧；桌面那套 JS 完整解析在安卓只在罕见的回退分支才跑
- 修复：新增 extractAndroidEmbeddedLyricsFromHead——经本地回环服务用 HTTP Range 只取文件头 1MB（ID3v2/Vorbis 标签所在），交 metadataParser worker 解析。50MB 的 FLAC 也只搬 1MB，不碰 OOM 红线。已用「坂本龍一 - Merry Christmas Mr. Lawrence」注入 USLT 实测：标题/专辑/歌词全部可读
- 覆盖两条路径：文件导入时即时提取入库；扫库歌曲首次歌词匹配时懒加载并写回

**3. 扫码登录修复（从初版就存在的老 bug）**
- 症状：登录界面网易云二维码永远加载不出来；酷狗/QQ 整行置灰点不动
- 根因：网易云/酷狗/QQ 三家在安卓走扩展桥协议（WebView → 原生 HTTP → 上游），需要构建时烘焙 VITE_NETEASE_API_BASE=extension 等三个环境变量，此前从未注入——网易云传输层直接抛"API 基址未配置"，酷狗/QQ 自判不可用置灰
- 修复：工程根目录 .env 写入三个 extension 键并重新构建，已在产物中验证烘焙生效。波点（原生桥直连）与汽水（直连 fetch）不受影响，本来就能用

**4. 存储说明（非缺陷）**
- 「文件导入」会把选中文件复制进 App 私有目录（绕开 content:// 播放限制的设计取舍），50MB×N 的曲库会让 App 数据到 GB 级
- 建议：大曲库用「扫描设备音乐库」导入（仅引用不复制，App 体积几乎不变）；本版封面修复后扫库路径已无短板

---

### 三、构建信息

- versionCode 726 / versionName 0.7.24，签名与历代一致（SHA-256: 2b260c3d…），覆盖安装无需卸载
- 构建环境：Node 24 + vite 8.3.1（rolldown）+ Capacitor 8 + Gradle 8.14.3 + JDK 21（Temurin）
- 构建要点（已固化在工程内，升级官方版本时务必带上）：
  - `.env` 的三个 `VITE_*_API_BASE=extension` 缺一不可
  - 低内存机器：`NODE_OPTIONS=--max-old-space-size=1800`、gradle `-Xmx900m -Dorg.gradle.workers.max=1`
  - 长命令后台跑（nohup），前台会被会话超时带走

### 四、遗留事项

- 内嵌歌词依赖标签位于文件头部；ID3v1 尾部歌词帧不支持（罕见格式）
- 本版文件头解析上限 1MB，标签超长（巨型内嵌封面挤占）时歌词解析会放弃
- 网易云扫码若遇风控拦截（非官方客户端登录被风控），属上游策略，需要时抓日志具体分析
