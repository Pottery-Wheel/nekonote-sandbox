import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// issue #21：計算ボタンの下、計算結果の表の上に、計算結果の見方を説明する一文を足す。
const NOTE_TEXT = "計算結果は、入力した数値から計算した統計値です。";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
// 変更前（issue #21 の作業を始める前）の index.html の写し。
const before = readFileSync(
  new URL("./fixtures/index.before-21.html", import.meta.url),
  "utf8",
);

const BUTTON_END = "</button>";
const RESULT_START = '<div id="result"';

// 足す一文の行そのもの（属性の無い p 要素）。行頭の改行と字下げも含める。
// hidden や style などの属性を付けたり、ほかの要素に変えたりすると、この行と一致しなくなる。
const NOTE_LINE = `\n    <p>${NOTE_TEXT}</p>`;

// issue #29 で足す一文の行（属性の無い p 要素）は、この比べ方の外にする（test/index-html-privacy-note.test.js で確かめる）。
const PRIVACY_NOTE_LINE = /\n[ \t]*<p>入力した数値は、このページの中だけで計算し、外部には送りません。<\/p>/;

function count(source, text) {
  return source.split(text).length - 1;
}

test("index.html に「計算結果は、入力した数値から計算した統計値です。」という一文がひとつある", () => {
  assert.equal(count(html, NOTE_TEXT), 1);
  assert.equal(count(html, NOTE_LINE), 1, "一文は属性の無い p 要素として1行でひとつ");
});

test("一文は計算ボタンの下、計算結果の表（#result）の上にある", () => {
  assert.equal(count(html, BUTTON_END), 1, "計算ボタンはひとつ");
  assert.equal(count(html, RESULT_START), 1, "計算結果の表を入れる #result はひとつ");
  const note = html.indexOf(NOTE_TEXT);
  const buttonEnd = html.indexOf(BUTTON_END);
  const resultStart = html.indexOf(RESULT_START);
  assert.ok(buttonEnd < note, "一文は計算ボタンより後ろ（下）にある");
  assert.ok(note < resultStart, "一文は #result より前（上）にあり、#result の中には無い");
});

test("変更前の index.html には一文が無い", () => {
  assert.equal(count(before, NOTE_TEXT), 0);
});

test("index.html から一文の行を除くと、変更前と同じ（入力欄・計算ボタン・計算結果の表などは変わらない）", () => {
  assert.equal(count(html, NOTE_LINE), 1, "一文の行はちょうど1回");
  assert.equal(html.replace(PRIVACY_NOTE_LINE, "").replace(NOTE_LINE, ""), before);
});
