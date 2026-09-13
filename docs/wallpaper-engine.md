# Wallpaper Engine 网页壁纸

壁纸使用当前工作区的 NAGI 画面与生成音乐，全部资源随包提供。运行时不需要联网、Node.js、Steam 创意工坊下载或本地服务器。WebGL 2 与 Web Audio 需要由 Wallpaper Engine 的网页运行环境支持。

## 导入

1. 解压 `NAGI-Wallpaper-Engine.zip`，得到 `NAGI` 文件夹。
2. 推荐将整个 `NAGI` 文件夹复制到 Wallpaper Engine 安装目录下的 `projects/myprojects/`。保留包内的 `project.json`，这样可保留自定义属性。重新打开壁纸选择器后，选择 **NAGI（凪）**。
3. 也可以在 Wallpaper Engine 编辑器的「创建壁纸」入口导入 `NAGI/index.html`。只选择解压后的壁纸目录，避免把整个源码项目导入。编辑器会复制资源；如果重新生成了 `project.json`，关闭编辑器后用包内的同名文件替换副本，再重新打开，以保留自定义属性。

这是网页壁纸，入口是 `index.html`；ZIP 需要先解压。无需转换成视频或 `scene.pkg`。

## 属性

参数栏顶部显示项目 GitHub 与作者 Steam 链接。介绍和控件标签提供英文与简体中文，跟随 Wallpaper Engine 语言设置。

GitHub 链接通过 Steam 官方外链确认页打开，确认目标地址后继续访问仓库。参数栏的域名白名单不支持直接链接 GitHub。

- **播放生成音乐**：默认开启。关闭后仍继续生成音乐状态，以保持 Seed、情绪与画面的演变。
- **音乐音量**：0–100，默认 84；0 为静音，100 对应原项目的安全最大音量。
- **显示 NAGI 与 Seed**：默认开启；关闭后仅显示画面。
- **启用右下角工具栏**：默认开启。与网页版一致，鼠标靠近右下角时显示，离开后淡出；可暂停、静音、随机 Seed 和调节音量。
- **工具栏底部留白**：0–240px，默认 80px，为桌面任务栏预留空间。任务栏较高或显示缩放较大时可增大数值；自动隐藏任务栏时可减小。靠近工具栏所在区域即可显示。
- **初始 Seed**：8 位十六进制，例如 `7F3A91C2`。留空时每次载入随机；播放中输入有效 Seed 会平滑过渡。清空输入不会立即打断当前状态，下一次载入时随机。

壁纸会自动启动。默认帧率为 30 FPS，收到 Wallpaper Engine 的性能设置后跟随其 FPS 上限。Wallpaper Engine 暂停壁纸时，音频淡出并暂停，画面停止更新；恢复时继续。音乐的手动暂停会在宿主暂停与恢复后保留。

普通浏览器直接打开 `index.html` 可预览画面；浏览器可能要求点击画面后才允许声音播放。Wallpaper Engine 的静音、音量及其他应用播放声音时的规则仍可能影响实际输出。

## 重新打包

在源码项目中执行：

```powershell
npm ci
npm run build:wallpaper
```

已安装依赖时只需执行第二条命令。产物位于 `dist/wallpaper-engine/`，包含可直接复制的 `NAGI/`、ZIP 与 SHA-256 校验文件。此命令使用现有 Vite 依赖独立构建，不启动网站服务器、不发布网站，也不修改当前桌面壁纸。

打包使用当前工作区内容。ZIP 中仅包含网页入口、脚本、样式、图标、预览图和 Wallpaper Engine 项目配置，不附带说明文档或构建记录。第三方说明与依赖许可证保留在 `assets/nagi.js` 的注释中；SHA-256 校验文件位于 ZIP 外。

项目采用 MIT License，Copyright © 2026 tadazly。项目许可同样保留在打包脚本注释中。共享组件位于 `components/nagi/`，声音与生成逻辑位于 `lib/nagi/`，宿主桥接与打包入口位于 `wallpaper/`；网页发布由 `app/` 和 `next.config.ts` 负责。

参考：[官方网页壁纸导入说明](https://docs.wallpaperengine.io/en/web/first/gettingstarted.html)、[属性与暂停接口](https://docs.wallpaperengine.io/en/web/api/propertylistener.html)、[帧率限制](https://docs.wallpaperengine.io/en/web/performance/fps.html)。
