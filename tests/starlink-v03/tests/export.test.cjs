const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSolar } = require('./support/load.cjs');

function download() {
  let blob;
  const anchor = { click() {}, remove() {} };
  const app = loadSolar(['model', 'export'], {
    Blob,
    URL: {
      createObjectURL(value) { blob = value; return 'blob:fixture'; },
      revokeObjectURL() {}
    },
    document: { createElement: () => anchor, body: { append() {} } },
    setTimeout: (callback) => callback()
  });
  return async tasks => {
    app.exportOrbitObservations(tasks);
    if (!blob) return null;
    assert.match(anchor.download, /^Starlink_observations_\d{4}-\d{2}-\d{2}\.csv$/);
    const bytes = Buffer.from(await blob.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    return bytes.subarray(3).toString('utf8');
  };
}

function record(overrides = {}) {
  return {
    id: 'fixture-1', created: '2030-06-10', completed: null, title: 'Sample',
    source: 'real', sector: 'study', observerVersion: '0.3', u: 3, i: 2, b: 1,
    baselineInputs: { u: 1, i: 2, b: 0 }, actualMinutes: 0, manual: null,
    target: 5, timing: 'pre', ...overrides
  };
}

test('demo records alone produce no research download', async () => {
  assert.equal(await download()([record({ source: 'demo' })]), null);
});

test('CSV preserves real rows, missing values, zero minutes and frozen scores', async () => {
  const csv = await download()([
    record({ source: 'demo', id: 'example' }), record(),
    record({ id: 'fixture-2', u: null, i: null, b: null, actualMinutes: null,
      baselineInputs: null, timing: 'none', target: null })
  ]);
  // This fixture uses single-line cells without commas. The escaping case is tested below.
  const [header, ...lines] = csv.trimEnd().split('\r\n');
  const keys = header.split(',');
  assert.equal(lines.length, 2);
  const [complete, pending] = lines.map(line => {
    const values = line.split(',').map(value => value.replace(/^"|"$/g, ''));
    assert.equal(values.length, keys.length);
    return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  });
  assert.equal(complete.task_id, 'fixture-1');
  assert.equal(complete.actual_minutes, '0');
  assert.deepEqual([complete.first_orbit_a, complete.first_orbit_b], ['6', '5']);
  assert.deepEqual([complete.observed_orbit_a, complete.observed_orbit_b], ['1', '2']);
  assert.equal(complete.paired_eligible, '1');
  assert.equal(pending.task_id, 'fixture-2');
  assert.equal(pending.actual_minutes, '');
  assert.equal(pending.first_u, '');
  assert.equal(pending.observed_orbit_a, '');
  assert.equal(pending.paired_eligible, '0');
});

test('formula-like titles remain text and quoted multiline content stays in one cell', async () => {
  const csv = await download()([record({ title: '=sample,"example"\ncontinued' })]);
  assert.ok(csv.includes('\r\n"fixture-1","\'=sample,""example""\ncontinued","2030-06-10",'));
});
