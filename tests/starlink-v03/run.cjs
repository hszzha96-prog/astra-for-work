'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const args = process.argv.slice(2);
if (args.includes('--help') || args.length !== 1) {
  console.log('Usage: node run.cjs <Starlink_Orbit_3D.html or solar directory>');
  console.log('For the standalone anomaly tests: python3 -m unittest discover -s nab');
  process.exit(args.includes('--help') ? 0 : 2);
}
const target = path.resolve(args[0]);
if (!fs.existsSync(target)) {
  console.error('Starlink v0.3 build not found:', target);
  process.exit(2);
}
const env = {...process.env, STARLINK_TARGET: target, PYTHONDONTWRITEBYTECODE:'1'};
const tests = fs.readdirSync(path.join(__dirname, 'tests'))
  .filter(file => file.endsWith('.test.cjs')).sort().map(file => path.join('tests', file));
function run(command, argv) {
  const result = spawnSync(command, argv, {cwd:__dirname, env, stdio:'inherit'});
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}
const nodeResult = run(process.execPath, ['--test', ...tests]);
const discovery = ['-m','unittest','discover','-s','nab','-p','test_*.py'];
let python = process.env.PYTHON || 'python3';
if (!process.env.PYTHON && process.platform === 'win32' && spawnSync(python, ['--version']).error?.code === 'ENOENT') {
  python = 'py';
  discovery.unshift('-3');
}
const pythonResult = run(python, discovery);
process.exitCode = nodeResult || pythonResult;
