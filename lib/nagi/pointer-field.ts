export type NagiPointerField = {
  down: number;
  energy: number;
  lastAt: number;
  lastX: number;
  lastY: number;
  pressure: number;
  pressureVelocity: number;
  targetX: number;
  targetY: number;
  velocityX: number;
  velocityY: number;
  x: number;
  y: number;
};

export function createPointerField(): NagiPointerField {
  return {
    down: 0, energy: 0, lastAt: 0, lastX: 0.5, lastY: 0.5,
    pressure: 0, pressureVelocity: 0, targetX: 0.5, targetY: 0.5,
    velocityX: 0, velocityY: 0, x: 0.5, y: 0.5,
  };
}

export function updatePointerTarget(
  pointer: NagiPointerField, x: number, y: number, pressed: boolean, now: number,
) {
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  // 原始速度只供音乐交互使用，视觉形变由阻尼后的运动驱动。
  const speed = pointer.lastAt > 0
    ? Math.min(1, Math.hypot(x - pointer.lastX, y - pointer.lastY) * 580 /
        Math.max(12, now - pointer.lastAt))
    : 0;
  pointer.targetX = pointer.lastX = x;
  pointer.targetY = pointer.lastY = y;
  pointer.down = pressed ? 1 : 0;
  pointer.lastAt = now;
  return speed;
}

export function releasePointer(pointer: NagiPointerField) {
  pointer.targetX = pointer.targetY = 0.5;
  pointer.down = 0;
  pointer.lastAt = 0;
}

function damp(
  pointer: NagiPointerField,
  position: 'x' | 'y' | 'pressure',
  velocity: 'velocityX' | 'velocityY' | 'pressureVelocity',
  target: number, frequency: number, delta: number,
) {
  // 临界阻尼弹簧的解析解：位置和速度连续，不随刷新率反复过冲。
  const offset = pointer[position] - target;
  const impulse = (pointer[velocity] + frequency * offset) * delta;
  const decay = Math.exp(-frequency * delta);
  pointer[position] = target + (offset + impulse) * decay;
  pointer[velocity] = (pointer[velocity] - frequency * impulse) * decay;
}

export function advancePointer(pointer: NagiPointerField, elapsed: number) {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return;
  // 从后台恢复或掉帧时，保留过渡，不把整段停顿压成一帧跳变。
  const delta = Math.min(elapsed, 0.1);
  const oldSpeed = Math.hypot(pointer.velocityX, pointer.velocityY);
  damp(pointer, 'x', 'velocityX', pointer.targetX, 8, delta);
  damp(pointer, 'y', 'velocityY', pointer.targetY, 8, delta);
  damp(pointer, 'pressure', 'pressureVelocity', pointer.down, 8, delta);
  const speed = (oldSpeed + Math.hypot(pointer.velocityX, pointer.velocityY)) * 0.5;
  const energy = 0.38 * (1 - Math.exp(-speed * 2));
  pointer.energy += (energy - pointer.energy) * (1 - Math.exp(-delta * 5));
}
