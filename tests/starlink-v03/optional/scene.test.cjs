'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const { loadSolar } = require('../tests/support/load.cjs');

function eventSurface(properties = {}) {
  const target = new EventTarget();
  return Object.assign(properties, {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target)
  });
}

test('native canvas hit testing follows orbital coordinates, overlap, and invalid input', t => {
  const width = 940, height = 550;
  const canvas = eventSurface(createCanvas(width, height));
  Object.assign(canvas, {
    style: {},
    hasAttribute: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height })
  });

  let frameId = 0, clock = 0;
  const frames = new Map();
  const app = loadSolar(['model', 'scene'], eventSurface({
    devicePixelRatio: 1,
    document: eventSurface({ hidden: false, createElement: () => createCanvas(1, 1) }),
    matchMedia: () => eventSurface({ matches: true }),
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id)
  }));
  function paint() {
    const jobs = Array.from(frames.values());
    frames.clear();
    clock += 1000 / 60;
    for (const draw of jobs) draw(clock);
  }
  const picked = [];
  const scene = app.createOrbitScene(canvas, { onPick: id => picked.push(id) });
  t.after(() => scene.destroy());
  scene.setView('top');

  function point(id, orbit, angle) { return { id, orbit, angle, title: id, lit: false }; }
  const points = [
    point('alpha', 1, 0), point('beta', 1, 0), point('movable', 4, 90), point('tools', 5, 225),
    point('both-unknown', null, null), point('angle-unknown', 7, null), point('orbit-unknown', null, 70)
  ];
  scene.update({ points });
  paint();
  assert.equal(frames.size, 0, 'prefers-reduced-motion leaves the scene at rest');

  function pick(orbit, degrees) {
    const radius = orbit * (height * 0.4 / 8);
    const radians = degrees * Math.PI / 180;
    const pointer = {
      clientX: width / 2 + radius * Math.cos(radians), clientY: height / 2 - radius * Math.sin(radians),
      pointerId: 1, pointerType: 'mouse', button: 0
    };
    for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(Object.assign(new Event(type), pointer));
    }
  }

  pick(0, 0); // Invalid coordinates would be selectable here if null were coerced to zero.
  pick(7, 0);
  assert.deepEqual(picked, []);
  pick(1, 0);
  pick(1, 0);
  pick(1, 0);
  assert.deepEqual(picked, ['alpha', 'beta', 'alpha']);
  pick(5, 225);
  pick(4, 90);
  assert.deepEqual(picked.slice(-2), ['tools', 'movable']);

  const before = picked.length;
  scene.update({ points: points.map(p => p.id === 'movable' ? { ...p, orbit: 6 } : p) });
  paint();
  pick(4, 90);
  assert.equal(picked.length, before);
  pick(6, 90);
  assert.equal(picked.length, before + 1);
  assert.equal(picked.at(-1), 'movable');

  scene.update({ points: [point('tools', null, 225)] });
  paint();
  pick(5, 225);
  pick(0, 0);
  assert.equal(picked.length, before + 1, 'losing a coordinate removes a previously pickable star');
});
