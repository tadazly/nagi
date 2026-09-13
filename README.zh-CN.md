# NAGI（凪）

[在浏览器中打开](https://nagi.luyilabs.com/) · [English](README.md) · [GitHub](https://github.com/tadazly/nagi)

> 一个一直存在、缓慢变化的声音与光的空间。

“凪”指风停之后，海面安静下来的时刻。

它并非绝对静止，而是一种仍有潮汐、呼吸与细微流动的平衡。NAGI 希望把这种状态变成一个可以长时间停留的数字空间：没有曲目列表，没有等待下一首，也没有必须完成的事情。

## 不是播放，而是持续存在

NAGI 不是传统播放器，也不是把随机音符不断拼接起来的音乐工具。

音乐会持续生长。和声、旋律、音色、疏密与空间感在不同的时间尺度上缓慢漂移，如同光线、云层与天气的自然变化。它没有明确的开头、高潮和结尾，也尽量不暴露段落边界。

偶然出现的声音不是主角，而是远处的回声、风中的微光，或水面上短暂扩散的涟漪。它们与音乐共同构成一个完整而克制的世界。

## 同一个世界，不同的天气

每一个 Seed 都代表 NAGI 当前的气候与倾向。

它可能让空间更温暖或更清冷，让和声更明亮或更朦胧，让声音更稀疏或更丰盈。但 Seed 不是曲目编号，也不会把音乐突然切换成另一首歌。

当 Seed 改变，旧的状态不会消失。新的色彩会在很长的时间里逐渐渗入，像天气转向、潮水更替，直到回望时才发现空间已经悄然不同。

## 声音与光属于同一次呼吸

画面不是附着在音乐表面的频谱展示，也不是为了炫耀反应速度的视觉效果。

声音与光共享同一种情绪：低频牵动大尺度的明暗呼吸，高频唤起细小的闪烁与质感，和声改变空间的色彩，音乐的密度影响世界的深度与活跃程度。

它们彼此回应，却不机械同步。听见的变化与看见的变化来自同一片天气。

## 触碰这片平静

点击或触摸任意位置，NAGI 才会苏醒。

此后，鼠标与手指不是控制面板上的旋钮，而更像掠过水面的风。移动、停留与触碰会轻轻扰动声音和光，让空间感知到人的存在，同时保持整体的平静与连续。

交互不会要求注意力，也不会把体验变成演奏。你可以靠近它，也可以什么都不做。

网页和壁纸的工具栏都位于右下角，鼠标靠近时显示，离开后淡出；触屏设备可轻触该区域。工具栏提供暂停、静音、随机 Seed 和音量调节。

## NAGI 坚持的原则

- 安静，但不空洞。
- 丰富，但不过度表达。
- 随机，但始终悦耳且属于同一个世界。
- 变化，但不制造切换感。
- 沉浸，但不索取持续操作。
- 让连续性先于新奇，让氛围先于功能。

NAGI 最理想的状态，是在打开一段时间后逐渐被忘记，却仍然温柔地改变着房间。

## Wallpaper Engine

执行 `npm run build:wallpaper` 可生成离线网页壁纸与 ZIP，输出到 `dist/wallpaper-engine/`。导入方式和自定义属性见 [Wallpaper Engine 使用说明](docs/wallpaper-engine.md)。

壁纸与网页共用声音、画面和交互组件，项目以网页开发和发布为主。壁纸包仅包含 7 个运行文件，MIT 许可与第三方版权声明嵌入脚本注释，不附带文档、源码映射或开发文件。

壁纸工具栏默认预留 80px 底部空间，可在参数栏调节「工具栏底部留白」，避免被任务栏遮挡。GitHub 链接通过 Steam 官方外链确认页打开。

## 本地开发与构建

需要 Node.js 22.13 或更新版本及 npm。

```sh
npm ci
npm run dev
```

打开终端输出的本地地址。浏览器需要支持 WebGL 2 与 Web Audio，点击页面后开始播放。可通过 `?seed=7F3A91C2` 指定初始 Seed。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Next.js 网页开发服务器 |
| `npm run build` | 生成网站生产构建至 `.next/` |
| `npm run start` | 运行 Next.js 生产构建 |
| `npm run build:static` | 使用 Next.js 导出静态网站至 `out/` |
| `npm run build:wallpaper` | 独立打包 Wallpaper Engine 网页壁纸 |
| `npm run lint` | 检查代码风格与常见问题 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test:pointer` | 检查指针阻尼、按压释放与不同帧率下的连续性 |
| `npm run test:soak` | 生成算法与视觉回归审计，模拟 24 小时 |

Node.js 部署依次执行 `npm run build` 和 `npm run start`；静态托管执行 `npm run build:static` 后部署 `out/` 的内容。执行独立构建或类型检查前，请停止开发服务器，避免框架生成文件相互覆盖。

## 代码结构与二次开发

- `app/`：网页路由、布局、元信息和样式入口。
- `components/nagi/experience.tsx`：共享播放控件、指针交互与 Seed 界面。
- `components/nagi/scene.tsx`：Three.js 场景、镜头、后处理与帧率控制。
- `lib/nagi/audio-engine.ts`：Web Audio 合成、调度、混音与诊断。
- `lib/nagi/pointer-field.ts`：指针阻尼、柔和按压与释放回弹。
- `lib/nagi/generative.ts`、`composition.ts`、`performance.ts`：Seed、情绪、和声、旋律、配器与演奏表达。
- `lib/nagi/shaders.ts`、`visual-presets.ts`：GLSL Shader、情绪配色与视觉模板。
- `lib/nagi/classical-*.ts`、`classical-model.json`：主题素材与语料统计先验。
- `styles/nagi.css`：网页和壁纸共享的视觉样式。
- `wallpaper/`：壁纸入口、宿主事件桥接、参数栏配置与专用样式。
- `scripts/`：构建、打包、模型训练与回归审计。

网页直接渲染共享体验；壁纸入口通过宿主桥接读取设置，再传给同一个组件。音频和生成模块不依赖部署环境。

欢迎 Fork、改进并提交 Issue 或 Pull Request。修改共享功能后，请检查网页与壁纸两个入口。保持平滑过渡、独立随机域与克制的前景运动；算法模拟不能代替实际浏览器交互或听音验收。详细设计见 [架构说明](docs/generative-architecture.md)。

## 致谢

NAGI 使用了以下开源项目，感谢原作者和贡献者：

- **网页：** [React](https://github.com/facebook/react)、[Next.js](https://github.com/vercel/next.js)。
- **画面：** [Three.js](https://github.com/mrdoob/three.js)、[React Three Fiber](https://github.com/pmndrs/react-three-fiber)、[Drei](https://github.com/pmndrs/drei)、[React Postprocessing](https://github.com/pmndrs/react-postprocessing)、[Postprocessing](https://github.com/pmndrs/postprocessing)。
- **音乐语料：** [OpenScore Lieder Corpus](https://github.com/OpenScore/Lieder)，用于训练 NAGI 的古典旋律先验。

完整依赖见 [package.json](package.json)，来源与许可详情见 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 开源许可与作者

NAGI 原创代码采用 [MIT License](LICENSE)，Copyright © 2026 [tadazly](https://github.com/tadazly)。欢迎在遵守许可的前提下使用、修改、再发布和二次开发。第三方组件保留各自的许可和版权声明。

[浏览器体验](https://nagi.luyilabs.com/) · [项目仓库](https://github.com/tadazly/nagi) · [作者 Steam](https://steamcommunity.com/id/tadazly/)
