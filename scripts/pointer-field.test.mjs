import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  advancePointer, createPointerField, releasePointer, updatePointerTarget,
} from '../lib/nagi/pointer-field.ts';

function advanceFor(pointer, seconds, fps = 60) {
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
    advancePointer(pointer, 1 / fps);
  }
}

test('快速跨屏移动保留渐变，停止后稳定收敛', () => {
  const pointer = createPointerField();
  updatePointerTarget(pointer, 1, 0, false, 100);
  assert.equal(pointer.x, 0.5);
  advancePointer(pointer, 1 / 60);
  assert(pointer.x > 0.5 && pointer.x < 0.51);
  let lastX = pointer.x;
  for (let frame = 0; frame < 120; frame++) {
    advancePointer(pointer, 1 / 60);
    assert(pointer.x >= lastX && pointer.x <= 1);
    assert(pointer.x - lastX < 0.026);
    assert(pointer.energy >= 0 && pointer.energy < 0.38);
    lastX = pointer.x;
  }
  assert(pointer.x > 0.999 && pointer.y < 0.001);
  assert(pointer.energy < 0.002);
});

test('30、60、144 FPS 下按压、运动和释放的时间感一致', () => {
  const samples = [30, 60, 144].map(fps => {
    const pointer = createPointerField();
    updatePointerTarget(pointer, 0.9, 0.2, true, 100);
    advanceFor(pointer, 0.5, fps);
    const pressed = { ...pointer };
    releasePointer(pointer);
    advanceFor(pointer, 0.5, fps);
    return { pressed, released: pointer };
  });
  for (const sample of samples.slice(1)) {
    for (const phase of ['pressed', 'released']) {
      for (const key of ['x', 'y', 'pressure', 'energy']) {
        assert(Math.abs(sample[phase][key] - samples[0][phase][key]) < 0.008,
          `${phase}.${key} 随刷新率偏移过大`);
      }
    }
  }
});

test('高频重复事件不会叠加视觉力度', () => {
  const sparse = createPointerField();
  const dense = createPointerField();
  updatePointerTarget(sparse, 0.8, 0.4, true, 100);
  for (let frame = 0; frame < 60; frame++) {
    for (let event = 0; event < 16; event++) {
      updatePointerTarget(dense, 0.8, 0.4, true, 100 + frame * 16 + event);
    }
    advancePointer(sparse, 1 / 60);
    advancePointer(dense, 1 / 60);
    for (const key of ['x', 'y', 'energy', 'pressure']) assert.equal(dense[key], sparse[key]);
  }
});

test('连续穿越中心与突然反向不会造成形变跳变', () => {
  const pointer = createPointerField();
  let maxStep = 0;
  let maxEnergyStep = 0;
  for (let frame = 0; frame < 360; frame++) {
    updatePointerTarget(pointer, frame % 12 < 6 ? 0.05 : 0.95, 0.5, false, 100 + frame * 16);
    const previousX = pointer.x;
    const previousEnergy = pointer.energy;
    advancePointer(pointer, 1 / 60);
    maxStep = Math.max(maxStep, Math.abs(pointer.x - previousX));
    maxEnergyStep = Math.max(maxEnergyStep, Math.abs(pointer.energy - previousEnergy));
  }
  assert(maxStep < 0.025);
  assert(maxEnergyStep < 0.025);
  releasePointer(pointer);
  advanceFor(pointer, 2);
  assert(Math.abs(pointer.x - 0.5) < 0.001 && pointer.energy < 0.002);
});

test('按住形成柔和凹陷，离开或取消后完整恢复', () => {
  const pointer = createPointerField();
  updatePointerTarget(pointer, 0.6, 0.4, true, 100);
  advancePointer(pointer, 1 / 60);
  assert(pointer.pressure > 0 && pointer.pressure < 0.01);
  advanceFor(pointer, 1.5);
  assert(pointer.pressure > 0.999 && pointer.pressure <= 1);
  releasePointer(pointer);
  const held = pointer.pressure;
  advancePointer(pointer, 1 / 60);
  assert(pointer.pressure < held && pointer.pressure > 0.98);
  advanceFor(pointer, 1.5);
  assert(pointer.pressure < 0.001);
  assert.equal(pointer.down, 0);
  assert.equal(pointer.lastAt, 0);
});

test('后台长时间暂停后恢复不会一帧跳到终点', () => {
  const pointer = createPointerField();
  updatePointerTarget(pointer, 1, 0, true, 100);
  advancePointer(pointer, 30);
  assert(pointer.x > 0.5 && pointer.x < 0.61);
  assert(pointer.pressure < 0.2);
  const previous = { ...pointer };
  for (const delta of [0, -1, NaN, Infinity]) advancePointer(pointer, delta);
  assert.deepEqual(pointer, previous);
});
