'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeUI } = require('./support/ui.cjs');

const TODAY = '2030-04-11';
const sample = { title: '制作样张海报', deliverable: '制作一张海报', target: '6', timing: 'pre' };
const evidence = {
  deadlineState: 'date', dueDate: '2030-04-14',
  goal: '为虚构展览准备素材', impact: '1', dependencyState: 'none'
};

function enter(ui, details) {
  ui.open();
  assert.equal(ui.form().dataset.stage, 'input');
  assert.equal(ui.form().elements.sector, undefined);
  ui.fill(details);
  ui.submit();
  assert.equal(ui.form().dataset.stage, 'scores');
  assert.equal(ui.form().elements.target, undefined);
}

test('an unresolved task counts and can be completed before it has coordinates', () => {
  const ui = makeUI();
  enter(ui, { title: '事项样本甲', target: '4', timing: 'pre' });
  assert.equal(ui.get('date-input').value, TODAY);
  assert.equal(ui.form().elements.sector.value, 'unclear');
  ui.submit();
  assert.deepEqual(ui.counts(), [0, 1, 0]);
  assert.equal(ui.get('journal-source').textContent, '真实记录');
  assert.equal(ui.points().length, 0);
  assert.deepEqual(ui.records()[0].baselineInputs, { u: null, i: null, b: null });

  ui.button('task-detail', 'action', 'complete');
  assert.deepEqual(ui.counts(), [1, 0, 1]);
  assert.equal(ui.points().length, 0);
  ui.button('task-detail', 'action', 'review');
  ui.fill({ deliverable: '修复演示脚本的导入报错' });
  ui.button('form-dialog', 'reclassify');
  ui.fill({ deadlineState: 'none', impact: '0', dependencyState: 'none', actualMinutes: '0' });
  ui.submit();
  const [task] = ui.records();
  assert.equal(task.completed, TODAY);
  assert.equal(task.actualMinutes, 0);
  assert.equal(task.firstSuggestedSector, 'unclear');
  assert.equal(task.sector, 'tools');
  assert.equal(ui.app.OrbitModel.eligible(task), false);
  const [point] = ui.points();
  assert.equal(point.id, task.id);
  assert.equal(point.angle, 225);
  assert.equal(point.lit, true);
  assert.deepEqual(ui.counts(), [1, 0, 1]);

  const reopened = makeUI(ui.storage);
  assert.deepEqual(reopened.counts(), [1, 0, 1]);
  reopened.button('task-detail', 'action', 'complete');
  assert.equal(reopened.points()[0].lit, false);
  assert.deepEqual(reopened.counts(), [0, 1, 0]);
});

test('as-of orbits move with the calendar while paired research uses the first observation', () => {
  const ui = makeUI();
  enter(ui, sample);
  ui.fill(evidence);
  ui.submit();
  assert.deepEqual(ui.records()[0].baselineInputs, { u: 1, i: 1, b: 0 });
  const expected = [
    [TODAY, 6, 6], ['2030-04-12', 4, 5], ['2030-04-14', 2, 4],
    ['2030-04-15', 2, 4], [TODAY, 6, 6]
  ];
  for (const [date, orbitA, orbitB] of expected) {
    ui.change('date-input', date);
    ui.change('mode-select', 'A');
    assert.equal(ui.points()[0].orbit, orbitA, 'A at ' + date);
    ui.change('mode-select', 'B');
    assert.equal(ui.points()[0].orbit, orbitB, 'B at ' + date);
  }
  ui.button('task-detail', 'action', 'review');
  ui.fill({ goal: '展览开场准备', impact: '3', actualMinutes: '37' });
  ui.submit();
  const [task] = ui.records();
  assert.equal(task.i, 3);
  assert.equal(task.actualMinutes, 37);
  assert.deepEqual(task.baselineInputs, { u: 1, i: 1, b: 0 });
  const stats = ui.app.OrbitModel.stats(ui.records());
  assert.deepEqual([stats.n, stats.a, stats.b], [1, 0, 0]);
  assert.equal(ui.points()[0].orbit, 4);
});

test('backfilled entries and same-day duplicate observations stay out of the paired cohort', () => {
  const ui = makeUI();
  ui.change('date-input', '2030-04-10');
  enter(ui, sample);
  ui.fill(evidence);
  ui.submit();
  ui.change('date-input', TODAY);
  for (let n = 0; n < 2; n++) {
    enter(ui, sample);
    ui.fill(evidence);
    ui.submit();
  }
  const [backfill, live, duplicate] = ui.records();
  assert.equal(backfill.observationKind, 'backfill');
  assert.equal(backfill.baselineInputs, null);
  assert.equal(live.timing, 'pre');
  assert.equal(duplicate.timing, 'post');
  assert.equal(ui.app.OrbitModel.stats(ui.records()).n, 1);
  assert.deepEqual(ui.counts(), [0, 3, 0]);
});
