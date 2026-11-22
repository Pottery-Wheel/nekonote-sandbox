import { test } from "node:test";
import assert from "node:assert/strict";
import { describe } from "../src/stats.js";

// 浮動小数点の誤差を許して比べる
function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message ?? ""} actual=${actual} expected=${expected}`,
  );
}

// 確かめる入力と、手で求めた四分位範囲の値
const CASES = [
  { name: "要素数が偶数", input: [2, 4, 4, 4, 5, 5, 7, 9], expected: 1.5 }, // q1=4, q3=5.5
  { name: "要素数が奇数", input: [5, 1, 4, 2, 3], expected: 2 }, // q1=2, q3=4
  { name: "補間が要る偶数の配列", input: [1, 2, 3, 4], expected: 1.5 }, // q1=1.75, q3=3.25
  { name: "端数のある補間", input: [10, 20, 30, 40, 50, 60], expected: 25 }, // q1=22.5, q3=47.5
  { name: "負の数と小数", input: [-1.5, 0, 2.5, -1.5], expected: 2.125 }, // q1=-1.5, q3=0.625
  { name: "要素が1つ", input: [7], expected: 0 }, // q1=q3=7
  { name: "要素が2つ", input: [3, 1], expected: 1 }, // q1=1.5, q3=2.5
  { name: "すべて同じ値", input: [4, 4, 4], expected: 0 },
];

test("describe の返り値に iqr が含まれる", () => {
  const result = describe([1, 2, 3]);
  assert.ok(Object.hasOwn(result, "iqr"), "iqr のキーがある");
  assert.equal(typeof result.iqr, "number");
});

for (const { name, input, expected } of CASES) {
  test(`describe の iqr は q3 - q1 と等しい（${name}）`, () => {
    const result = describe(input);
    assert.equal(result.iqr, result.q3 - result.q1, `q1=${result.q1} q3=${result.q3}`);
    assertClose(result.iqr, expected, "iqr");
  });
}

test("describe の iqr は入力の並びによらず同じ値になる", () => {
  const result = describe([9, 2, 5, 4, 7, 4, 5, 4]);
  assert.equal(result.iqr, result.q3 - result.q1);
  assertClose(result.iqr, 1.5, "iqr");
});

test("describe は空の配列で RangeError を投げ、iqr も返さない", () => {
  let returned;
  assert.throws(() => {
    returned = describe([]);
  }, RangeError);
  assert.equal(returned, undefined);
});
