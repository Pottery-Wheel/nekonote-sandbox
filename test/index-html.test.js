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

const DESCRIPTION_ORIGINAL = "数値をカンマか空白で区切って入力してください。";
const DESCRIPTION_TEXT = `${DESCRIPTION_ORIGINAL}（例：4 8 15）`;

// 説明文（元の文で始まる文言）を持つ p 要素の文言を集める。
function descriptionTexts(source) {
  return elementTexts(source, "p").filter((text) =>
    text.trim().startsWith(DESCRIPTION_ORIGINAL),
  );
}

function elementTexts(source, tag) {
  const pattern = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  return [...source.matchAll(pattern)].map((match) => match[2]);
}

// h1 要素と title 要素の文言、説明文の p 要素の文言だけを空にする。タグそのものと属性は残す。
function withoutTexts(source) {
  let result = source;
  for (const tag of TAGS) {
    const pattern = new RegExp(`(<${tag}(?:\\s[^>]*)?>)[\\s\\S]*?(</${tag}>)`, "gi");
    result = result.replace(pattern, "$1$2");
  }
  const description = /(<p(?:\s[^>]*)?>)\s*数値をカンマか空白で区切って入力してください。[^<]*(<\/p>)/gi;
  // issue #21 で足す一文の行（属性の無い p 要素）は、この比べ方の外にする（test/index-html-note.test.js で確かめる）。
  const note = "\n    <p>計算結果は、入力した数値から計算した統計値です。</p>";
  // issue #29 で足す一文の行（属性の無い p 要素）も、この比べ方の外にする（test/index-html-privacy-note.test.js で確かめる）。
  const privacyNote = /\n[ \t]*<p>入力した数値は、このページの中だけで計算し、外部には送りません。<\/p>/;
  return result.replace(description, "$1$2").replace(note, "").replace(privacyNote, "");
}

test("index.html の h1 要素はひとつで、文言は「統計値の計算ツール」", () => {
  assert.deepEqual(elementTexts(html, "h1"), [TITLE_TEXT]);
});

test("index.html の title 要素はひとつで、文言は「統計値の計算ツール」", () => {
  assert.deepEqual(elementTexts(html, "title"), [TITLE_TEXT]);
});

test("index.html の説明文は「数値をカンマか空白で区切って入力してください。（例：4 8 15）」", () => {
  assert.deepEqual(descriptionTexts(html), [DESCRIPTION_TEXT]);
});

test("index.html の h1 と title の文言、説明文を除いた内容は、変更前と同じ", () => {
  for (const tag of TAGS) {
    assert.equal(elementTexts(before, tag).length, 1, `変更前の ${tag} はひとつ`);
  }
  assert.deepEqual(descriptionTexts(before), [DESCRIPTION_ORIGINAL], "変更前の説明文はひとつ");
  assert.equal(withoutTexts(html), withoutTexts(before));
});
