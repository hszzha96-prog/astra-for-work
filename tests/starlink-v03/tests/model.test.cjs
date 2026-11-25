'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadModel } = require('./support/load.cjs');

const model = loadModel();

function observation(id, changes = {}) {
  return {
    id,
    title: '检验样品编号规则',
    sector: 'tools',
    created: '2031-03-03',
    completed: null,
    source: 'real',
    observerVersion: '0.3',
    timing: 'pre',
    target: 4,
    manual: null,
    u: 1,
    i: 3,
    b: 0,
    baselineInputs: { u: 1, i: 3, b: 0 },
    ...changes
  };
}

test('deliverable selects the sector, and ambiguous tasks keep a pending position', () => {
  const cases = [
    ['复习天文课讲义', '修复月历工具的导入故障', 'tools'],
    ['维护展品登记程序', '制作星云海报', 'creative'],
    ['校对项目', '整理天文课堂笔记', 'study'],
    ['更新申请资料', '提交岗位申请', 'job'],
    ['补充材料', '提取岗位说明中的资格要求', 'jd'],
    ['准备下次讨论', '校对个人简历中的实验经历', 'evidence'],
    ['安排本周生活事务', '预约理发', 'life'],
    ['没有上下文的事项', '', 'unclear'],
    ['修复实验插件，同时绘制星云海报', '', 'unclear'],
    ['Resume the lecture on lunar cycles', '', 'study']
  ];
  for (const [title, deliverable, expected] of cases) {
    assert.equal(model.suggest(title, deliverable).sector, expected, title);
  }
  const angles = Object.fromEntries(model.sectors.map(sector => [sector.key, sector.angle]));
  assert.equal(angles.tools, 225);
  assert.equal(angles.unclear, null);
});

test('title-only duration and urgency words do not silently fill numeric scores', () => {
  const result = model.suggest('昨晚花了90分钟整理，今天继续处理');
  assert.deepEqual([result.u, result.i, result.b], [null, null, null]);
});

test('calendar urgency distinguishes unknown, no deadline, two days and the rest of this week', () => {
  const monday = '2031-03-03';
  const cases = [
    ['unknown', null, monday, null],
    ['none', null, monday, 0],
    ['date', '2031-03-02', monday, 3],
    ['date', monday, monday, 3],
    ['date', '2031-03-04', monday, 2],
    ['date', '2031-03-05', monday, 2],
    ['date', '2031-03-06', monday, 1],
    ['date', '2031-03-09', monday, 1],
    ['date', '2031-03-10', monday, 0],
    ['date', '2031-03-10', '2031-03-09', 2],
    ['date', '2031-02-30', monday, null],
    ['date', monday, null, null]
  ];
  for (const [state, due, asOf, expected] of cases) {
    assert.equal(model.urgencyForDeadline(state, due, asOf), expected, [state, due, asOf].join(' / '));
  }
});

test('Singapore day changes at 16:00 UTC', () => {
  assert.equal(model.toDateSG(new Date('2031-03-03T15:59:59Z')), '2031-03-03');
  assert.equal(model.toDateSG(new Date('2031-03-03T16:00:00Z')), '2031-03-04');
});

test('both baselines cover all 32 legal U/I/B combinations and manual choice only changes execution', () => {
  for (const u of [0, 1, 2, 3]) {
    for (const i of [0, 1, 2, 3]) {
      for (const b of [0, 1]) {
        const A = 8 - (2 * u + b);
        const B = 8 - (u + i + b);
        const automatic = model.orbits({ u, i, b, manual: null });
        const manual = model.orbits({ u, i, b, manual: 7 });
        assert.deepEqual({ ...automatic }, { A, B, effective: B });
        assert.deepEqual({ ...manual }, { A, B, effective: 7 });
      }
    }
  }
});

test('missing impact leaves only A available, missing urgency or dependency leaves both pending', () => {
  const partial = { u: 2, i: null, b: 0, manual: null };
  assert.deepEqual({ ...model.orbits(partial) }, { A: 4, B: null, effective: null });
  for (const missing of ['u', 'b']) {
    const input = { u: 0, i: 0, b: 0, manual: null, [missing]: null };
    assert.deepEqual({ ...model.orbits(input) }, { A: null, B: null, effective: null });
  }
  assert.deepEqual({ ...model.orbits({ u: null, i: null, b: null, manual: 2 }) }, { A: null, B: null, effective: 2 });
});

test('paired error uses first observation even after revisions, completion and actual minutes', () => {
  const first = observation('fixture-a');
  const second = observation('fixture-b', { target: 8, baselineInputs: { u: 0, i: 1, b: 0 } });
  const revised = { ...first, u: 3, i: 0, b: 1, manual: 8, actualMinutes: 140, completed: '2031-03-05' };
  const expected = { n: 2, a: 1, b: 0.5, delta: -0.5 };
  assert.equal(model.validTask(first), true);
  assert.deepEqual({ ...model.stats([first, second]) }, expected);
  assert.deepEqual({ ...model.stats([revised, second]) }, expected);
});

test('duplicate IDs, demo rows, post-hoc labels and missing first scores do not enter paired error', () => {
  const first = observation('fixture-valid');
  const duplicate = observation('fixture-duplicate');
  const invalid = [
    observation('fixture-demo', { source: 'demo' }),
    observation('fixture-post', { timing: 'post' }),
    observation('fixture-no-label', { target: null }),
    observation('fixture-backfill', { baselineInputs: null }),
    observation('fixture-incomplete', { baselineInputs: { u: null, i: 3, b: 0 } })
  ];
  for (const task of invalid) assert.equal(model.eligible(task), false, task.id);
  const duplicates = [duplicate, { ...duplicate, id: ' ' + duplicate.id + ' ' }];
  assert.deepEqual({ ...model.stats([...invalid, ...duplicates]) }, { n: 0, a: null, b: null, delta: null });
  assert.deepEqual({ ...model.stats([first, ...invalid, ...duplicates]) }, { n: 1, a: 2, b: 0, delta: -2 });
});

test('daily counts include an unplaced completion, carry-over and undo without counting future rows', () => {
  const yesterday = '2031-03-02';
  const today = '2031-03-03';
  const tomorrow = '2031-03-04';
  const pending = observation('fixture-pending', {
    sector: 'unclear', u: null, i: null, b: null, baselineInputs: null, completed: today
  });
  const rows = [
    observation('fixture-carry', { created: yesterday, completed: today }),
    observation('fixture-earlier', { created: yesterday, completed: yesterday }),
    pending,
    observation('fixture-open', { completed: tomorrow }),
    observation('fixture-future', { created: tomorrow })
  ];
  assert.deepEqual({ ...model.daySummary(rows, today) }, { newDone: 2, carryDone: 1, newTasks: 2, open: 1, total: 3 });
  const undone = rows.map(task => task.id === pending.id ? { ...task, completed: null } : task);
  assert.deepEqual({ ...model.daySummary(undone, today) }, { newDone: 1, carryDone: 1, newTasks: 2, open: 2, total: 2 });
});
