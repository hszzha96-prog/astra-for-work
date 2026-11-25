'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSolar } = require('./support/load.cjs');
const { DOMParser, workbook } = require('./support/xlsx.cjs');

const headings = [
  '固定编号','待办','建档日期','理想轨道','标注时机','预期交付物','确认类别','截止状态','截止日期',
  '服务目标','目标影响 I','依赖状态','受阻的下一步','实际用时（分钟）','手动轨道','完成日期','观测日期','评分记录','样本来源'
];
const headers = Object.fromEntries(headings.map((value, index) => [String.fromCharCode(65 + index), value]));
const solar = loadSolar(['model', 'import'], { DOMParser, Blob, TextDecoder, DecompressionStream });
const model = solar.OrbitModel;
const created = '2030-05-06';

function entry(id, values = {}) {
  return {A: id, B: '打印测试图案', C: created, S: '真实', ...values};
}

function readV3(rows, compressed = true) {
  return solar.readOrbitWorkbook(workbook({'观测录入': [headers, ...rows]}, compressed));
}

test('v0.3 preserves unknowns, explicit zeros, minutes and independent labels', async () => {
  const {tasks, skipped} = await readV3([
    entry('pending'),
    entry('no-deadline', {D: 8, E: '预测前', G: '创意', H: '无截止', K: 0, L: '无依赖', N: 0, R: '首次原始记录'}),
    entry('tool-repair', {D: 3, E: '预测前', F: '修复测试插件', G: '工具与工作流',
      H: '有截止', I: '2030-05-07', J: '发布测试版本', K: 2, L: '有依赖', M: '验收员运行测试', N: 35, R: '首次原始记录'})
  ]);
  assert.equal(skipped, 0);
  assert.equal(tasks.length, 3);
  const [pending, zero, tool] = tasks;
  assert.deepEqual([pending.sector, pending.u, pending.i, pending.b, pending.actualMinutes], ['unclear', null, null, null, null]);
  assert.equal(model.orbits(pending).effective, null);
  assert.deepEqual([zero.u, zero.i, zero.b, zero.actualMinutes, model.orbits(zero).effective], [0, 0, 0, 0, 8]);
  assert.deepEqual([tool.sector, tool.u, tool.i, tool.b, tool.actualMinutes, model.orbits(tool).B], ['tools', 2, 2, 1, 35, 3]);
  assert.equal(model.stats(tasks).n, 2);
});

test('v0.3 keeps completed and backfilled rows while excluding unqualified pairs', async () => {
  const scoring = {D: 8, E: '预测前', G: '学习', H: '无截止', K: 0, L: '无依赖', P: created, R: '首次原始记录'};
  const {tasks, skipped} = await readV3([
    entry('first', {...scoring, Q: created}),
    entry('after-completion', {...scoring, Q: '2030-05-07', N: 65}),
    entry('reconstructed', {...scoring, R: '补录或不明'}),
    entry('saw-prediction', {...scoring, E: '看过预测后'})
  ], false);
  assert.equal(skipped, 0);
  const [first, late, reconstructed, seen] = tasks;
  assert.ok(model.eligible(first));
  assert.deepEqual([late.completed, late.asOf, late.actualMinutes, late.timing, late.baselineInputs],
    [created, '2030-05-07', 65, 'pre', null]);
  for (const task of [late, reconstructed, seen]) assert.equal(model.eligible(task), false);
  assert.equal(model.stats(tasks).n, 1);
});

test('v0.3 skips both duplicates and invalid rows, and omits demonstration samples', async () => {
  const {tasks, skipped} = await readV3([
    entry('duplicate'), entry('duplicate'), entry('invalid-date', {C: '2030-02-30'}),
    entry('no-downstream', {L: '有依赖'}), entry('no-goal', {K: 3}), entry('bad-minutes', {N: -1}),
    entry('demo', {S: '演示'}), entry('ok')
  ]);
  assert.equal(skipped, 6);
  assert.deepEqual(Array.from(tasks, task => task.id), ['ok']);
});

test('v0.2 retains legacy scoring, completion, and validation cutoff', async () => {
  const ledgerHeader = {A: '固定编号', B: '待办', R: '样本来源', S: '独立目标轨道', T: '标注时机'};
  const row = {A: 'legacy', B: '绘制三角形', C: '创意', D: created, E: 1, F: 2, G: 0,
    I: '完成', J: '2030-05-08', R: '真实', S: 5, T: '预测前'};
  const {tasks, skipped, splitDate} = await solar.readOrbitWorkbook(workbook({
    '待办试算': [ledgerHeader, row, {...row, A: 'incomplete-completion', J: null}],
    '科研基线': [{}, {}, {}, {}, {}, {B: '2030-05-15'}]
  }));
  assert.equal(skipped, 1);
  assert.equal(tasks.length, 1);
  const [legacy] = tasks;
  assert.deepEqual([legacy.id, legacy.completed, model.orbits(legacy).A, model.orbits(legacy).B], ['legacy', '2030-05-08', 6, 5]);
  assert.equal(model.stats(tasks).n, 1);
  assert.equal(splitDate, '2030-05-15');
});

test('invalid workbooks fail with actionable input errors', async () => {
  await assert.rejects(solar.readOrbitWorkbook(new Blob(['bad'])), /xlsx/);
  await assert.rejects(solar.readOrbitWorkbook(workbook({'观测录入': [{A: 'wrong header'}]})), /表头/);
});
