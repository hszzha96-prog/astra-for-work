'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const signatures = {
  scene: /\bwindow\.createOrbitScene\s*=/,
  model: /\bwindow\.OrbitModel\s*=/,
  import: /\bwindow\.readOrbitWorkbook\s*=/,
  export: /\bwindow\.exportOrbitObservations\s*=/,
  controller: /function\s+saveObservation\s*\(/
};
let cachedHtml;
let cachedPath;

function scriptFor(target, name) {
  if (!Object.hasOwn(signatures, name)) throw new Error('Unknown component: ' + name);
  if (fs.statSync(target).isDirectory()) return fs.readFileSync(path.join(target, name + '.js'), 'utf8');
  if (cachedPath !== target) {
    const html = fs.readFileSync(target, 'utf8');
    cachedHtml = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
      .filter(([, attributes]) => !/\bsrc\s*=|application\/json/i.test(attributes))
      .map(([, , code]) => code);
    cachedPath = target;
  }
  const candidates = cachedHtml.filter(code => signatures[name].test(code));
  if (candidates.length !== 1) throw new Error('Expected one v0.3 ' + name + ' module in ' + target);
  return candidates[0];
}

// Execute modules from the build being evaluated. Each test can supply browser events
// and a fixed clock without modifying the application or its saved tasks.
function loadSolar(names, globals = {}) {
  const target = process.env.STARLINK_TARGET;
  if (!target) throw new Error('Pass the local v0.3 HTML file or solar source directory to node run.cjs.');
  const scope = {Blob, TextDecoder, TextEncoder, Response, DecompressionStream, URL, setTimeout, clearTimeout, console, ...globals};
  scope.window = scope;
  const context = vm.createContext(scope);
  for (const name of names) vm.runInContext(scriptFor(target, name), context, {filename:name + '.js'});
  return scope;
}

function loadModel() {
  return loadSolar(['model']).OrbitModel;
}

module.exports = {loadSolar, loadModel};
