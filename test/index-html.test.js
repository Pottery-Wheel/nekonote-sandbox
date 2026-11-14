import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const TITLE_TEXT = "統計値の計算ツール";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
// 変更前（issue #13 の作業を始める前）の index.html の写し。
const before = readFileSync(
  new URL("./fixtures/index.before.html", import.meta.url),
  "utf8",
);

const TAGS = ["h1", "title"];

function elementTexts(source, tag) {
  const pattern = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[2]);
}

// h1 要素と title 要素の文言だけを空にする。タグそのものと属性は残す。
function withoutTexts(source) {
  let result = source;
  for (const tag of TAGS) {
    const pattern = new RegExp(`(<${tag}(?:\\s[^>]*)?>)[\\s\\S]*?(</${tag}>)`, "gi");
    result = result.replace(pattern, "$1$2");
  }
  return result;
}

test("index.html の h1 要素はひとつで、文言は「統計値の計算ツール」", () => {
  assert.deepEqual(elementTexts(html, "h1"), [TITLE_TEXT]);
});

test("index.html の title 要素はひとつで、文言は「統計値の計算ツール」", () => {
  assert.deepEqual(elementTexts(html, "title"), [TITLE_TEXT]);
});

test("index.html の h1 と title の文言を除いた内容は、変更前と同じ", () => {
  for (const tag of TAGS) {
    assert.equal(elementTexts(before, tag).length, 1, `変更前の ${tag} はひとつ`);
  }
  assert.equal(withoutTexts(html), withoutTexts(before));
});
