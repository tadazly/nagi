# NAGI

NAGI 是一个面向长时间聆听的生成式放松音乐站。它不再尝试模拟完整管弦乐队，而是用开放三音和声、稀疏单线旋律、低亮度音色和明确休止，持续生成缓慢但不机械的声音空间。

## 现在的声音原则

- 速度限定在 `54–63 BPM`，不做突然变速。
- 同时只有 `pad`、`breath`、`bell` 三类温和音色；旋律音源不会互相堆叠。
- 和声固定为低声部至少相隔纯五度的开放三音，不使用密集管弦配器。
- 每个八小节乐句的最后一小节停止产生新材料，让尾音自然退入安静。
- 旋律约每秒 `0.20` 个音符，限定在窄音域与五声音阶，最大跳进七个半音。
- 指针交互只改变空气层与频谱开合，不向乐曲追加随机音符。
- 每个八位十六进制 seed 都可复现；`new tide` 会通过近静音换景，不硬切调性。

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

打开终端显示的本地地址，点击 `enter the quiet` 后浏览器才会创建 `AudioContext` 并开始播放。

## 验证

```bash
npm run lint
npm run test:music
npm run build
npm run build:static
```

`test:music` 分为两层：

- 音色审计：限制谐波数量、频谱重心、滤波范围、单音增益、包络和混响发送量。
- 乐谱审计：遍历 4,096 个 seed、每个 seed 四个完整周期，检查速度、粗糙度、低音间距、旋律跳进、事件密度、休止、确定性和视觉运动上限。

当前审计相当于约 600 小时生成音乐，核心实现见：

- `lib/nagi/ambient-score.ts`：四个聆听世界、确定性乐谱与音色预算。
- `lib/nagi/audio-engine.ts`：Web Audio 调度、合成、混响、换景与运行时诊断。
- `scripts/music-audit.mjs`：以放松感约束为目标的长时审计。
- `app/nagi-scene.tsx`：从同一 transport 读取低强度视觉呼吸状态。

详细设计与研究依据见 [`docs/generative-architecture.md`](docs/generative-architecture.md)。
