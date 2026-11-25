/* One model unit is one world unit. The camera is the only moving coordinate system. */
(() => {
  'use strict';
  const canvas = document.getElementById('sky');
  const errorBox = document.getElementById('error');

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function readModel(data) {
    if (data.schema_version !== '1.0' || !Array.isArray(data.nodes) || !data.nodes.length ||
        !Array.isArray(data.edges)) throw new Error('Unsupported network model');
    const byId = new Map();
    for (const node of data.nodes) {
      if (typeof node.id !== 'string' || byId.has(node.id) ||
          !['root','group','work'].includes(node.kind) || !/^#[0-9a-f]{6}$/i.test(node.color) ||
          !node.position || !['x','y','z'].every(key => Number.isFinite(node.position[key]))) {
        throw new Error('Invalid node');
      }
      byId.set(node.id, node);
    }
    const edges = data.edges.map(edge => {
      if (!byId.has(edge.source) || !byId.has(edge.target) ||
          !['category', 'membership', 'workflow'].includes(edge.kind)) throw new Error('Invalid edge');
      return { from: byId.get(edge.source), to: byId.get(edge.target), kind: edge.kind };
    });
    return { nodes: [...byId.values()], edges };
  }

  function mount(model) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const center = {};
    for (const k of ['x', 'y', 'z']) {
      const values = model.nodes.map(node => node.position[k]);
      center[k] = (Math.min(...values) + Math.max(...values)) / 2;
    }
    const radius = Math.max(1, ...model.nodes.map(({position: p}) =>
      Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z)));
    const camera = { yaw: -.10, pitch: .10, zoom: 1 };
    const pointers = new Map();
    let width, height, ratio, focal, cameraDistance, pending = false;

    // Background dust is decorative and never enters the node or edge arrays.
    let seed = 733;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    const dust = Array.from({length: 450}, () => ({
      x: random(), y: random(), depth: random(), light: .16 + .52 * random(), size: .3 + .7 * random()
    }));

    function resize() {
      const box = canvas.getBoundingClientRect();
      width = Math.max(1, box.width);
      height = Math.max(1, box.height);
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      focal = Math.min(width, height) * 1.2;
      // Fit the original camera pose with a margin; rotation leaves the zoom under user control.
      const distances = model.nodes.map(node => {
        const {x, y, z} = rotate(node.position, -.10, .10);
        return focal * Math.max(Math.abs(x) / (.40 * width), Math.abs(y) / (.37 * height)) + z;
      });
      cameraDistance = Math.max(radius * 1.6, ...distances);
      queueDraw();
    }

    function rotate(position, yaw, pitch) {
      const dx = position.x - center.x, dy = position.y - center.y, dz = position.z - center.z;
      const s = Math.sin(yaw), c = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
      const z = dx * s + dz * c;
      return {x: dx * c - dz * s, y: dy * cp - z * sp, z: dy * sp + z * cp};
    }

    function draw() {
      pending = false;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      for (const star of dust) {
        const parallax = 6 + star.depth * 13;
        const x = (star.x * width + Math.sin(camera.yaw) * parallax + width) % width;
        const y = (star.y * height + Math.sin(camera.pitch) * parallax + height) % height;
        ctx.globalAlpha = star.light;
        ctx.fillStyle = '#a2adb9';
        ctx.fillRect(x, y, star.size, star.size);
      }
      ctx.globalAlpha = 1;
      const projected = new Map();
      for (const node of model.nodes) {
        const p = rotate(node.position, camera.yaw, camera.pitch);
        const scale = focal * camera.zoom / (cameraDistance - p.z);
        projected.set(node.id, {node, x: width * .5 + p.x * scale, y: height * .53 - p.y * scale, z: p.z, scale});
      }
      ctx.lineCap = 'round';
      for (const edge of model.edges) {
        const a = projected.get(edge.from.id), b = projected.get(edge.to.id);
        const cross = edge.kind === 'workflow';
        ctx.setLineDash(cross ? [2.5, 5] : []);
        ctx.strokeStyle = cross ? '#b6bec934' :
          (edge.kind === 'category' ? edge.to.color + '95' : edge.from.color + '59');
        ctx.lineWidth = edge.kind === 'category' ? 1.15 : .85;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const p of [...projected.values()].sort((a,b) => a.z-b.z)) {
        const {node, x, y, scale} = p;
        const hub = node.kind !== 'work';
        const r = (hub ? 5.6 : 3.25) * clamp(Math.sqrt(scale), .72, 2.2);
        const spread = r * (hub ? 8 : 5);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, spread);
        glow.addColorStop(0, node.color + 'a0');
        glow.addColorStop(.21, node.color + '47');
        glow.addColorStop(1, node.color + '00');
        ctx.fillStyle = glow;
        ctx.fillRect(x-spread, y-spread, 2*spread, 2*spread);
        ctx.beginPath(); ctx.arc(x, y, r, 0, 2*Math.PI); ctx.fillStyle = node.color; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, r*.47, 0, 2*Math.PI); ctx.fillStyle = '#fff6dc'; ctx.fill();
        if (hub) {
          ctx.beginPath(); ctx.arc(x, y, r*2.7, 0, 2*Math.PI);
          ctx.strokeStyle = node.color + '50'; ctx.lineWidth = .75; ctx.stroke();
        }
      }
    }
    function queueDraw() {
      if (!pending) { pending = true; requestAnimationFrame(draw); }
    }
    function zoomBy(factor) {
      camera.zoom = clamp(camera.zoom * factor, .35, 5);
      queueDraw();
    }
    function separation() {
      const [a,b] = pointers.values();
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    }

    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || pointers.size >= 2) return;
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    });
    canvas.addEventListener('pointermove', e => {
      const old = pointers.get(e.pointerId);
      if (!old) return;
      const before = separation();
      pointers.set(e.pointerId, {x:e.clientX,y:e.clientY});
      if (pointers.size === 2) {
        const after = separation();
        if (before > 0 && after > 0) zoomBy(after / before);
      } else {
        camera.yaw += (e.clientX - old.x) * .006;
        camera.pitch = clamp(camera.pitch + (e.clientY - old.y) * .006, -1.45, 1.45);
        queueDraw();
      }
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(event, e => pointers.delete(e.pointerId));
    }
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      zoomBy(Math.exp(-clamp(e.deltaY, -200, 200) * .002));
    }, {passive:false});
    canvas.addEventListener('keydown', e => {
      switch (e.key) {
        case 'ArrowLeft': camera.yaw -= .1; break;
        case 'ArrowRight': camera.yaw += .1; break;
        case 'ArrowUp': camera.pitch = clamp(camera.pitch-.1,-1.45,1.45); break;
        case 'ArrowDown': camera.pitch = clamp(camera.pitch+.1,-1.45,1.45); break;
        case '+': case '=': zoomBy(1.2); break;
        case '-': zoomBy(1/1.2); break;
        case 'Home': Object.assign(camera,{yaw:-.10,pitch:.10,zoom:1}); break;
        default: return;
      }
      e.preventDefault(); queueDraw();
    });
    window.addEventListener('resize', resize);
    resize();
  }

  async function start() {
    if (location.protocol === 'file:') {
      showError('此视图需要从网页地址读取模型。请在仓库根目录运行下面的命令，然后打开 http://127.0.0.1:8000/design/\npython3 -m http.server 8000 --bind 127.0.0.1');
      return;
    }
    try {
      const response = await fetch('../model/network.json');
      if (!response.ok) throw new Error('Failed to fetch network');
      mount(readModel(await response.json()));
    } catch (error) {
      console.error(error);
      showError('无法载入星图。请从仓库根目录启动 HTTP 服务，并确认 ../model/network.json 可访问、格式正确及浏览器支持 Canvas。');
    }
  }
  start();
})();
