import { test } from "node:test";
import assert from "node:assert/strict";
import * as stats from "../src/stats.js";

const { describe } = stats;

const KEYS = [
  "count",
  "sum",
  "mean",
  "median",
  "mode",
  "min",
  "max",
  "range",
  "variance",
  "stdDev",
  "q1",
  "q3",
].sort();

// 浮動小数点の誤差を許して比べる
function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message ?? ""} actual=${actual} expected=${expected}`,
  );
}

test("describe は関数として公開されている", () => {
  assert.equal(typeof describe, "function");
});

test("sum は残さず describe に置き換えられている", () => {
  assert.equal(stats.sum, undefined);
});

test("describe はすべての統計値を同時に持つオブジェクトを返す", () => {
  const result = describe([1, 2, 3]);
  assert.deepEqual(Object.keys(result).sort(), KEYS);
});

test("describe は代表的な統計値をまとめて正しく計算する", () => {
  const result = describe([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(result.count, 8);
  assert.equal(result.sum, 40);
  assert.equal(result.mean, 5);
  assert.equal(result.median, 4.5);
  assert.deepEqual(result.mode, [4]);
  assert.equal(result.min, 2);
  assert.equal(result.max, 9);
  assert.equal(result.range, 7);
  assertClose(result.variance, 32 / 8, "variance");
  assertClose(result.stdDev, Math.sqrt(32 / 8), "stdDev");
  assertClose(result.q1, 4, "q1");
  assertClose(result.q3, 5.5, "q3");
});

test("describe は並んでいない入力でも同じ結果を返し、入力を書き換えない", () => {
  const input = [9, 2, 5, 4, 7, 4, 5, 4];
  const copy = [...input];
  const result = describe(input);
  assert.deepEqual(input, copy);
  assert.equal(result.count, 8);
  assert.equal(result.sum, 40);
  assert.equal(result.mean, 5);
  assert.equal(result.median, 4.5);
  assert.deepEqual(result.mode, [4]);
  assert.equal(result.min, 2);
  assert.equal(result.max, 9);
  assert.equal(result.range, 7);
  assertClose(result.variance, 32 / 8, "variance");
  assertClose(result.stdDev, Math.sqrt(32 / 8), "stdDev");
  assertClose(result.q1, 4, "q1");
  assertClose(result.q3, 5.5, "q3");
});

test("describe は要素数が奇数のとき中央の値を中央値にする", () => {
  const result = describe([5, 1, 4, 2, 3]);
  assert.equal(result.median, 3);
  assert.equal(result.mean, 3);
  assertClose(result.variance, 10 / 5, "variance");
  assertClose(result.stdDev, Math.sqrt(10 / 5), "stdDev");
  assertClose(result.q1, 2, "q1");
  assertClose(result.q3, 4, "q3");
});

test("describe は四分位数を線形補間（QUARTILE.INC と同じ方式）で求める", () => {
  const result = describe([1, 2, 3, 4]);
  assert.equal(result.median, 2.5);
  assertClose(result.q1, 1.75, "q1");
  assertClose(result.q3, 3.25, "q3");
});

test("describe は四分位数の補間を位置の端数に応じて行う", () => {
  // 位置 q1 = 0.25*(6-1) = 1.25, q3 = 0.75*(6-1) = 3.75
  const result = describe([10, 20, 30, 40, 50, 60]);
  assertClose(result.q1, 22.5, "q1");
  assertClose(result.q3, 47.5, "q3");
  assert.equal(result.median, 35);
});

test("describe は空配列で例外を投げる", () => {
  assert.throws(() => describe([]), RangeError);
});

test("describe は配列でない入力で TypeError を投げる", () => {
  for (const input of [null, undefined, "1,2,3", 3, { 0: 1, length: 1 }, new Set([1, 2])]) {
    assert.throws(() => describe(input), TypeError, `input=${String(input)}`);
  }
});

test("describe は有限の数値でない要素を含むとき TypeError を投げる", () => {
  const inputs = [
    [1, "2", 3],
    [1, NaN, 3],
    [1, Infinity, 3],
    [1, -Infinity, 3],
    [1, null, 3],
    [1, undefined, 3],
    [1, , 3], // 穴のある配列
    new Array(3), // 穴だけの配列
  ];
  for (const [index, input] of inputs.entries()) {
    assert.throws(() => describe(input), TypeError, `inputs[${index}]`);
  }
});

test("describe は要素が1つのとき分散と標準偏差を 0 にする", () => {
  const result = describe([7]);
  assert.equal(result.count, 1);
  assert.equal(result.sum, 7);
  assert.equal(result.mean, 7);
  assert.equal(result.median, 7);
  assert.deepEqual(result.mode, [7]);
  assert.equal(result.min, 7);
  assert.equal(result.max, 7);
  assert.equal(result.range, 0);
  assert.equal(result.variance, 0);
  assert.equal(result.stdDev, 0);
  assert.equal(result.q1, 7);
  assert.equal(result.q3, 7);
});

test("describe は最頻値が複数あるとき全部を昇順の配列で返す", () => {
  const result = describe([3, 1, 2, 3, 1]);
  assert.deepEqual(result.mode, [1, 3]);
});

test("describe はすべての値が1回ずつのとき全部の値を昇順の配列で返す", () => {
  const result = describe([3, 1, 2]);
  assert.deepEqual(result.mode, [1, 2, 3]);
});

test("describe は最頻値が1つでも配列で返す", () => {
  const result = describe([1, 2, 2, 3]);
  assert.ok(Array.isArray(result.mode));
  assert.deepEqual(result.mode, [2]);
});

test("describe は負の数と小数を扱える", () => {
  const result = describe([-1.5, 0, 2.5, -1.5]);
  assert.equal(result.count, 4);
  assertClose(result.sum, -0.5, "sum");
  assertClose(result.mean, -0.125, "mean");
  assertClose(result.median, -0.75, "median");
  assert.deepEqual(result.mode, [-1.5]);
  assert.equal(result.min, -1.5);
  assert.equal(result.max, 2.5);
  assert.equal(result.range, 4);
  // 偏差の2乗の和: 1.890625*2 + 0.015625 + 6.890625 = 10.6875
  assertClose(result.variance, 10.6875 / 4, "variance");
  assertClose(result.stdDev, Math.sqrt(10.6875 / 4), "stdDev");
  // 並べると [-1.5, -1.5, 0, 2.5]。q1 位置 0.75 → -1.5, q3 位置 2.25 → 0.625
  assertClose(result.q1, -1.5, "q1");
  assertClose(result.q3, 0.625, "q3");
});

test("describe はすべて同じ値のとき範囲・分散・標準偏差を 0 にする", () => {
  const result = describe([4, 4, 4]);
  assert.equal(result.range, 0);
  assert.equal(result.variance, 0);
  assert.equal(result.stdDev, 0);
  assert.deepEqual(result.mode, [4]);
  assert.equal(result.q1, 4);
  assert.equal(result.q3, 4);
});
