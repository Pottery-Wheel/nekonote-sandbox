import { test } from "node:test";
import assert from "node:assert/strict";
import { sum } from "../src/stats.js";

test("sum は配列の合計を返す", () => {
  assert.equal(sum([1, 2, 3]), 6);
});

test("sum は空の配列で 0 を返す", () => {
  assert.equal(sum([]), 0);
});
