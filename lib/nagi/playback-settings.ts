// 可选的外部播放设置。网页不传入此配置，维持点击启动的交互。
export type PlaybackSettings = Readonly<{
  fps: number;
  paused: boolean;
  seed: string;
  showcontrols: boolean;
  showtitle: boolean;
  sound: boolean;
  toolbarbottom: number;
  volume: number;
}>;
