import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// issue #29：ページの一番下（計算結果の表より下）に、入力した数値の扱いを説明する一文を足す。
const NOTE_TEXT = "入力した数値は、このページの中だけで計算し、外部には送りません。";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
// 変更前（issue #29 の作業を始める前）の index.html の写し。
const before = readFileSync(
  new URL("./fixtures/index.before-29.html", import.meta.url),
  "utf8",
);

const RESULT_DIV = '<div id="result"></div>';
const BODY_END = "</body>";

// 足す一文の行そのもの（属性の無い p 要素）。行頭の改行と字下げも含める。
// 文言は句読点を含めて完全に一致しなければならない。
const NOTE_LINE = new RegExp(`\\n[ \\t]*<p>${NOTE_TEXT}</p>`, "g");

function count(source, text) {
  return source.split(text).length - 1;
}

test("index.html に「入力した数値は、このページの中だけで計算し、外部には送りません。」という一文がひとつある", () => {
  assert.equal(count(html, NOTE_TEXT), 1);
  assert.equal(
    [...html.matchAll(NOTE_LINE)].length,
    1,
    "一文は属性の無い p 要素として1行でひとつ（文言は句読点を含めて完全に一致）",
  );
});

test("一文は計算結果の表（#result）より下、body の終わりより前にある", () => {
  assert.equal(count(html, RESULT_DIV), 1, "計算結果の表を入れる #result はひとつで、中身は空のまま");
  const note = html.indexOf(`<p>${NOTE_TEXT}</p>`);
  const resultEnd = html.indexOf(RESULT_DIV) + RESULT_DIV.length;
  const bodyEnd = html.indexOf(BODY_END);
  assert.ok(note >= 0, "一文の p 要素がある");
  assert.ok(resultEnd <= note, "一文は #result より後ろ（下）にあり、#result の中には無い");
  assert.ok(note < bodyEnd, "一文は body の中にある");
});

test("一文はページの一番下にあり、その後ろには画面に出る要素が無い（script だけ）", () => {
  const noteEnd = html.indexOf(`<p>${NOTE_TEXT}</p>`) + `<p>${NOTE_TEXT}</p>`.length;
  const rest = html.slice(noteEnd, html.indexOf(BODY_END));
  const withoutScripts = rest.replace(/<script(\s[^>]*)?>[\s\S]*?<\/script>/gi, "");
  assert.equal(withoutScripts.trim(), "", "一文の後ろには script 要素のほかに何も無い");
});

test("変更前の index.html には一文が無い", () => {
  assert.equal(count(before, NOTE_TEXT), 0);
});

test("index.html から一文の行を除くと、変更前と同じ（計算結果の表など、ほかの部分は変わらない）", () => {
  assert.equal([...html.matchAll(NOTE_LINE)].length, 1, "一文の行はちょうど1回");
  assert.equal(html.replace(NOTE_LINE, ""), before);
});
