# Folia 安卓定制版

> 基于 [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) 官方源码的安卓 WebView 移植版。
> 官方只发桌面端（Electron）与 Web 版，本仓库把它包成原生 APK 在手机上跑。

**当前基线：官方 v0.7.24 ｜ 定制补丁模式：官方源 + 增量改动，随官方升级平滑迁移**

---

## 这是什么

Folia 官方版是一个以全屏沉浸式歌词为核心的播放器（网易云/酷狗/QQ/波点/汽水 + 本地曲库）。
安卓定制版在官方 Web 源码之外加了一层**原生桥（native bridge）**，把 WebView 跑不起来的
东西全部下沉到 Java 侧：

| 官方 Web 版做不到 | 定制版的做法 |
|---|---|
| WebView 没有 File System Access API，本地曲库打不开 | 原生扫 MediaStore + SAF 挑文件 |
| `content://` 和私有目录 WebView 播不了 | 本地回环 HTTP 服务（LocalAudioServer）喂音频 |
| 大文件解析元数据 → WebView OOM 闪退 | Java 侧 MediaMetadataRetriever，全程原生内存 |
| 跨域接口（网易/酷狗/QQ登录）被 CORS 拦 | 原生 OkHttp 桥发请求，Cookie 由系统统一管 |
| 退出/后台/媒体键 | 原生播放服务 + 安卓返回键接管 |

## 功能速览

- **本地音乐**：扫描设备音乐库（引用式，不复制）/ 文件导入（复制进私有目录，播放最稳）
- **内嵌元数据**：标题/歌手/专辑/时长/封面原生提取；内嵌歌词（USLT）文件头 1MB 切片解析
- **在线登录**：网易云扫码、酷狗、QQ、波点、汽水全部可用（见下方构建要点）
- **性能护栏**：封面压缩 512px、大文件闪退根治、可视化性能模式开关
- **原生体验**：媒体会话/通知栏控制、返回键导航、横竖屏自适应

## 构建

### 环境

- Node ≥ 24（vite 8 / rolldown）
- JDK 21（Temurin）+ Android SDK（platform 34）
- 内存 ≥ 4GB 的机器就能编（参数见下）

### 步骤

```bash
npm install                          # 装依赖
# .env 必须包含（仓库已带，丢了扫码登录全废）：
#   VITE_NETEASE_API_BASE=extension
#   VITE_KUGOU_API_BASE=extension
#   VITE_QQ_API_BASE=extension
NODE_OPTIONS="--max-old-space-size=1800" npm run build   # 前端产物 → dist/
npx cap sync android                 # 同步进安卓工程
cd android && JAVA_HOME=<jdk路径> ./gradlew assembleDebug \
  -Dorg.gradle.jvmargs="-Xmx900m" -Dorg.gradle.workers.max=1
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

> ⚠️ 低内存机器：长命令务必后台跑（nohup + 轮询日志），前台等会话超时会把进程带走。
> ⚠️ `VITE_*_API_BASE=extension` 是登录的命门：缺了它们，网易云二维码永远加载不出来，
> 酷狗/QQ 整行置灰。这是 v0.7.24 前所有版本都踩过的坑，详见 CHANGELOG.md。

## 目录导览（定制部分）

```
android/app/src/main/java/top/izuna/foliamajor/
  FoliaCorePlugin.java    # 原生桥主插件：扫码/导入/元数据提取/封面/回环服务器
  LocalAudioServer.java   # 127.0.0.1 音频回环服务（MediaStore + 私有副本，支持 Range）
src/audioNative/          # WebView 侧扩展协议：网易/酷狗/QQ/波点的上游直调实现
src/services/nativeLocalMusic.ts       # 扫库/导入编排、内嵌歌词头切片提取
src/services/localMusicService.ts      # 官方本地库服务 + 安卓封面/歌词按需补齐钩子
```

## 常见问题

**App 怎么 1 个多 GB？**
APK 本体只有 17MB，大头是数据：「文件导入」会把每个文件复制进私有目录（绕开
content:// 的设计取舍）。大曲库请用「扫描设备音乐库」——只引用不复制。

**内嵌的封面/歌词显示不出来？**
v0.7.24 已修：扫库封面走 MediaStore URI 提取；内嵌歌词取文件头 1MB 解析。
注意文件本身得真的有——用 mp3tag 之类工具确认 APIC（封面）/ USLT（歌词）帧存在。
ID3v1 尾部歌词帧不支持。

**网易云二维码转圈？**
确认构建时带了 `.env` 三个 extension 键；扫码被风控拦属网易上游策略。

## 版本与更新

- 更新日志：[CHANGELOG.md](./CHANGELOG.md)
- 升级流程：拉官方新源码 → `diff` 出官方改动 → 应用本仓库定制补丁 → 带 `.env` 重构建
- 签名固定（debug 证书），新版本覆盖安装即可，无需卸载

## 许可与致谢

- 上游项目：[folia-major](https://github.com/chthollyphile/folia-major) 及其全体贡献者
- 许可证随上游（见 [LICENSE](./LICENSE)）
- 本定制层仅用于个人使用与学习交流

