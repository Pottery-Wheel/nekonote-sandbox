import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe } from "../src/stats.js";

// issue #75：計算結果を、表ではなく統計値ごとのカード（見出しと大きな数字）を並べた形で表示する。
// - 要件1・5：#result の中に表（table）を出さず、カードを並べる。
// - 要件2：各カードに統計値の見出しと値を出し、値は大きな数字にする。
// - 要件3・4：変更前の表に出ていた統計値を、同じ並び順で1枚ずつカードにする（見出しと値の文字も表と同じ）。
// - 要件6：カードの並びは、幅に合わせて1行の枚数が変わり、入らないカードは次の行に折り返す。
// カードの作りは、デザイン案 design/issue-75.html に合わせる：
//   <dl class="cards"><div class="card"><dt>見出し</dt><dd>値</dd></div>…</dl>

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
// 変更前（issue #75 の作業を始める前）の index.html の写し。今の表の中身を作るのに使う。
const before = readFileSync(
  new URL("./fixtures/index.before-75.html", import.meta.url),
  "utf8",
);

const MODULE_SCRIPT = /(<script type="module">)([\s\S]*?)(<\/script>)/g;
const STATS_URL = new URL("../src/stats.js", import.meta.url).href;

// ---------------------------------------------------------------------------
// ブラウザの代わりに使う、小さな作り物の DOM（test/index-html-empty-input.test.js と同じもの）。
// ---------------------------------------------------------------------------

class FakeText {
  constructor(text) {
    this.nodeType = 3;
    this.data = String(text);
    this.parentNode = null;
  }
  get textContent() {
    return this.data;
  }
  set textContent(value) {
    this.data = String(value);
  }
}

class FakeElement {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.hidden = false;
    this.value = "";
    this.id = "";
    this.className = "";
    const element = this;
    this.classList = {
      add: (...names) => {
        const set = new Set(element.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => set.add(name));
        element.className = [...set].join(" ");
      },
      remove: (...names) => {
        element.className = element.className
          .split(/\s+/)
          .filter((name) => name && !names.includes(name))
          .join(" ");
      },
      contains: (name) => element.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const has = element.classList.contains(name);
        const want = force ?? !has;
        if (want) element.classList.add(name);
        else element.classList.remove(name);
        return want;
      },
    };
  }

  // --- 子の操作 ---
  #adopt(node) {
    const child = typeof node === "string" ? new FakeText(node) : node;
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    return child;
  }
  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1);
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  appendChild(node) {
    this.childNodes.push(this.#adopt(node));
    return node;
  }
  append(...nodes) {
    for (const node of nodes) this.childNodes.push(this.#adopt(node));
  }
  prepend(...nodes) {
    this.childNodes.unshift(...nodes.map((node) => this.#adopt(node)));
  }
  insertBefore(node, reference) {
    const child = this.#adopt(node);
    const index = reference ? this.childNodes.indexOf(reference) : -1;
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    return node;
  }
  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }
  replaceChildren(...nodes) {
    for (const node of this.childNodes) node.parentNode = null;
    this.childNodes = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  // --- 文言 ---
  get textContent() {
    return this.childNodes.map((node) => node.textContent).join("");
  }
  set textContent(value) {
    this.replaceChildren();
    const text = String(value ?? "");
    if (text !== "") this.append(text);
  }
  get innerText() {
    return this.textContent;
  }
  set innerText(value) {
    this.textContent = value;
  }
  // innerHTML は、タグを要素に、文字をテキストに置き換える簡単な解析で扱う。
  set innerHTML(value) {
    this.replaceChildren();
    const stack = [this];
    const pattern = /<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
    for (const match of String(value ?? "").matchAll(pattern)) {
      const top = stack[stack.length - 1];
      if (match[3] !== undefined) {
        top.append(decode(match[3]));
      } else if (match[0].startsWith("</")) {
        if (stack.length > 1) stack.pop();
      } else {
        const element = this.ownerDocument.createElement(match[1]);
        const classMatch = /class\s*=\s*["']([^"']*)["']/.exec(match[2]);
        if (classMatch) element.className = classMatch[1];
        top.append(element);
        if (!match[0].endsWith("/>") && !VOID_TAGS.has(element.tagName)) stack.push(element);
      }
    }
  }
  get innerHTML() {
    return this.childNodes
      .map((node) =>
        node.nodeType === 3
          ? node.data
          : `<${node.tagName.toLowerCase()}>${node.innerHTML}</${node.tagName.toLowerCase()}>`,
      )
      .join("");
  }

  // --- 属性 ---
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "class") this.className = String(value);
    if (name === "id") this.id = String(value);
    if (name === "hidden") this.hidden = true;
  }
  getAttribute(name) {
    if (name === "class") return this.className || null;
    return this.attributes[name] ?? null;
  }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name === "class") this.className = "";
    if (name === "hidden") this.hidden = false;
  }
  hasAttribute(name) {
    return name in this.attributes;
  }

  // --- 探す ---
  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
  querySelectorAll(selector) {
    return this.descendants().filter((element) => matches(element, selector));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  getElementsByTagName(tag) {
    return this.querySelectorAll(tag);
  }

  // --- 表 ---
  insertRow() {
    const row = this.ownerDocument.createElement("tr");
    this.append(row);
    return row;
  }
  insertCell() {
    const cell = this.ownerDocument.createElement("td");
    this.append(cell);
    return cell;
  }
  createTBody() {
    const body = this.ownerDocument.createElement("tbody");
    this.append(body);
    return body;
  }

  // --- イベント ---
  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((item) => item !== listener);
  }
  dispatchEvent(event) {
    event.target ??= this;
    event.currentTarget = this;
    for (const listener of this.listeners[event.type] ?? []) {
      if (typeof listener === "function") listener.call(this, event);
      else listener.handleEvent(event);
    }
    const handler = this[`on${event.type}`];
    if (typeof handler === "function") handler.call(this, event);
    return true;
  }
  async click() {
    this.dispatchEvent(makeEvent("click"));
  }
  focus() {}
  blur() {}
  select() {}
  // ポップアップのダイアログ（dialog 要素）の表示を記録する。
  show() {
    this.ownerDocument.dialogCalls.push("dialog.show");
  }
  showModal() {
    this.ownerDocument.dialogCalls.push("dialog.showModal");
  }
}

const VOID_TAGS = new Set(["BR", "HR", "IMG", "INPUT", "META", "LINK"]);

function decode(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// "table"、"#id"、".class"、"p.error" の形だけを扱う。
function matches(element, selector) {
  return selector.split(",").some((part) => {
    const match = /^\s*([a-zA-Z][\w-]*)?(?:#([\w-]+))?(?:\.([\w-]+))?\s*$/.exec(part);
    if (!match) throw new Error(`作り物の DOM では扱えないセレクタ：${selector}`);
    const [, tag, id, className] = match;
    if (tag && element.tagName !== tag.toUpperCase()) return false;
    if (id && element.id !== id) return false;
    if (className && !element.classList.contains(className)) return false;
    return true;
  });
}

function makeEvent(type) {
  return {
    type,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
  };
}

class FakeDocument {
  constructor() {
    this.dialogCalls = [];
    this.body = new FakeElement(this, "body");
  }
  createElement(tag) {
    return new FakeElement(this, tag);
  }
  createTextNode(text) {
    return new FakeText(text);
  }
  createDocumentFragment() {
    return new FakeElement(this, "#fragment");
  }
  getElementById(id) {
    return this.body.descendants().find((element) => element.id === id) ?? null;
  }
  querySelector(selector) {
    return this.body.querySelector(selector);
  }
  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
  addEventListener() {}
}


// ---------------------------------------------------------------------------
// index.html の script を、作り物の DOM の上で動かす。
// ---------------------------------------------------------------------------

const workDir = mkdtempSync(join(tmpdir(), "nekonote-issue75-"));
process.on("exit", () => rmSync(workDir, { recursive: true, force: true }));

let pageCount = 0;

function moduleScripts(source) {
  return [...source.matchAll(MODULE_SCRIPT)].map((match) => match[2]);
}

function initialTextareaValue(source) {
  const match = /<textarea id="values"[^>]*>([\s\S]*?)<\/textarea>/.exec(source);
  return match ? decode(match[1]) : "";
}

// source（index.html の中身）のページを読み込んだ状態を作る。
async function loadPage(source) {
  const document = new FakeDocument();
  const values = document.createElement("textarea");
  values.id = "values";
  values.value = initialTextareaValue(source);
  const buttonParagraph = document.createElement("p");
  const calc = document.createElement("button");
  calc.id = "calc";
  calc.setAttribute("type", "button");
  calc.textContent = "計算する";
  buttonParagraph.append(calc);
  const result = document.createElement("div");
  result.id = "result";
  document.body.append(values, buttonParagraph, result);

  const window = { document, addEventListener() {} };
  window.window = window;
  Object.assign(globalThis, { document, window });

  const scripts = moduleScripts(source);
  assert.equal(scripts.length, 1, "index.html の script type=module はひとつ");
  const code = scripts[0].replace(/(["'])\.\/src\/stats\.js\1/g, JSON.stringify(STATS_URL));
  pageCount += 1;
  const pagePath = join(workDir, `page-${pageCount}.mjs`);
  writeFileSync(pagePath, code);
  await import(pathToFileURL(pagePath).href);

  return {
    result,
    async press(text) {
      values.value = text;
      calc.click();
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

// 変更前のページの表から [見出し, 値] の並びを取り出す。
function tableEntries(result) {
  const tables = result.querySelectorAll("table");
  assert.equal(tables.length, 1, "変更前のページは表をひとつ出す");
  return tables[0]
    .querySelectorAll("tr")
    .map((row) => row.children.map((cell) => cell.textContent.trim()));
}

// 計算結果の欄のカード（class="card" の要素）を取り出す。
function cards(result) {
  return result.querySelectorAll(".card");
}

// カードから [見出し, 値] の並びを取り出す。見出しは dt、値は dd。
function cardEntries(result) {
  return cards(result).map((card) => {
    const headings = card.querySelectorAll("dt");
    const values = card.querySelectorAll("dd");
    assert.equal(headings.length, 1, "カードには見出し（dt）がひとつ");
    assert.equal(values.length, 1, "カードには値（dd）がひとつ");
    return [headings[0].textContent.trim(), values[0].textContent.trim()];
  });
}

// 変更前のページで同じ入力を計算したときの表の中身。
async function beforeEntries(input) {
  const page = await loadPage(before);
  await page.press(input);
  return tableEntries(page.result);
}

const INPUTS = [
  ["初めから入っている数値", "4 8 15 16 23 42"],
  ["最頻値が複数で、値が長い", "1 2 2 3 3"],
  ["数値が1つ（分散・標準偏差が NaN）", "7"],
  ["カンマ区切り・小数・負の数", "-1.5, 0, 2.25, 2.25"],
];

// ---------------------------------------------------------------------------
// style の中の CSS を読む（カードの大きさと折り返しを確かめるため）。
// ---------------------------------------------------------------------------

function styleRules(source) {
  const css = [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1])
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /@media/, "メディアクエリの中の規則は、この読み方では扱わない");
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1].split(",").map((part) => part.trim()),
    declarations: Object.fromEntries(
      match[2]
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const index = item.indexOf(":");
          return [item.slice(0, index).trim().toLowerCase(), item.slice(index + 1).trim()];
        }),
    ),
  }));
}

// セレクタの最後の部分（"dl.cards > .card dd" なら "dd"）が要素に当てはまるか。
function lastCompoundMatches(element, selector) {
  const last = selector.split(/[\s>+~]+/).filter(Boolean).pop();
  const match = /^([a-zA-Z][\w-]*|\*)?((?:[#.][\w-]+)*)$/.exec(last ?? "");
  if (!match) return false;
  const [, tag, rest] = match;
  if (tag && tag !== "*" && element.tagName !== tag.toUpperCase()) return false;
  for (const [, kind, name] of rest.matchAll(/([#.])([\w-]+)/g)) {
    if (kind === "#" && element.id !== name) return false;
    if (kind === "." && !element.classList.contains(name)) return false;
  }
  return true;
}

// 要素に当てはまる規則の宣言を、書かれた順に重ねたもの。
function declarationsFor(rules, element) {
  const result = {};
  for (const rule of rules) {
    if (rule.selectors.some((selector) => lastCompoundMatches(element, selector))) {
      Object.assign(result, rule.declarations);
    }
  }
  return result;
}

const ROOT_PX = 16;

// 長さを px にする。扱えない書き方なら NaN。
function toPx(value, base = ROOT_PX) {
  const match = /^(-?[\d.]+)(px|rem|em|%)?$/.exec(String(value ?? "").trim());
  if (!match) return NaN;
  const number = Number(match[1]);
  switch (match[2]) {
    case "rem":
      return number * ROOT_PX;
    case "em":
      return number * base;
    case "%":
      return (number / 100) * base;
    case "px":
      return number;
    default:
      return number === 0 ? 0 : NaN;
  }
}

const FONT_SIZE_KEYWORDS = {
  "xx-small": 9, "x-small": 10, small: 13, medium: 16, large: 18, "x-large": 24, "xx-large": 32, "xxx-large": 48,
};

function fontSizePx(declarations) {
  const value = declarations["font-size"];
  if (value === undefined) return ROOT_PX;
  if (value in FONT_SIZE_KEYWORDS) return FONT_SIZE_KEYWORDS[value];
  const clamp = /^clamp\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(value);
  if (clamp) return toPx(clamp[1].trim());
  return toPx(value);
}

// 列の間の幅（gap / column-gap）。
function columnGapPx(declarations) {
  const gap = declarations["column-gap"] ?? declarations.gap?.split(/\s+/).pop() ?? "0";
  return toPx(gap);
}

// カードの並びの幅が width px のとき、1行に並ぶカードの枚数。
// grid の repeat(auto-fill / auto-fit, …) か、flex-wrap: wrap とカードの幅から求める。
function cardsPerRow(container, card, width) {
  const gap = columnGapPx(container);
  assert.ok(Number.isFinite(gap), `列の間の幅を読めない：${container.gap ?? container["column-gap"]}`);
  let cardWidth;
  if (container.display === "grid") {
    const columns = container["grid-template-columns"] ?? "";
    const repeat = /repeat\(\s*(auto-fill|auto-fit)\s*,\s*(minmax\(\s*([^,]+?)\s*,[^)]*\)|[^)]+?)\s*\)/.exec(columns);
    assert.ok(
      repeat,
      `カードの並びの grid-template-columns は repeat(auto-fill / auto-fit, …) にして、幅に合わせて列の数が変わるようにする：${columns}`,
    );
    cardWidth = toPx(repeat[3] ?? repeat[2]);
  } else if (container.display === "flex") {
    assert.match(
      container["flex-wrap"] ?? container["flex-flow"] ?? "",
      /\bwrap(-reverse)?\b/,
      "カードの並びは flex-wrap: wrap にして、入らないカードを次の行に折り返す",
    );
    const flexBasis = card["flex-basis"] ?? card.flex?.split(/\s+/)[2];
    cardWidth = [flexBasis, card["min-width"], card.width]
      .map((value) => toPx(value, width))
      .find((value) => Number.isFinite(value) && value > 0);
  } else {
    assert.fail(`カードの並びは grid か flex で並べる：display: ${container.display}`);
  }
  assert.ok(Number.isFinite(cardWidth) && cardWidth > 0, `カードの幅を読めない：${cardWidth}`);
  return Math.max(1, Math.floor((width + gap) / (cardWidth + gap)));
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

for (const [label, input] of INPUTS) {
  test(`計算結果は表ではなくカードで出し、変更前の表と同じ統計値を同じ順に1枚ずつ、同じ見出しと値で出す（${label}）（要件1〜5）`, async () => {
    const expected = await beforeEntries(input);
    assert.equal(expected.length, Object.keys(describe(input.split(/[\s,]+/).map(Number))).length);

    const page = await loadPage(html);
    await page.press(input);
    assert.equal(page.result.querySelectorAll("table").length, 0, "計算結果の欄に表（table）を出さない（要件5）");
    assert.equal(page.result.querySelectorAll("tr").length, 0, "表の行（tr）も出さない（要件5）");
    assert.equal(cards(page.result).length, expected.length, "統計値1つにつきカード1枚（要件3）");
    assert.deepEqual(cardEntries(page.result), expected, "見出しと値、並び順が変更前の表と同じ（要件2〜4）");
  });
}

test("初めから入っている数値のカードの見出しと値（要件2〜4）", async () => {
  const page = await loadPage(html);
  await page.press("4 8 15 16 23 42");
  assert.deepEqual(cardEntries(page.result), [
    ["件数", "6"],
    ["合計", "108"],
    ["平均値", "18"],
    ["中央値", "15.5"],
    ["最頻値", "4, 8, 15, 16, 23, 42"],
    ["最小値", "4"],
    ["最大値", "42"],
    ["範囲", "38"],
    ["分散", "182"],
    ["標準偏差", "13.490737563232042"],
    ["第1四分位数", "9.75"],
    ["第3四分位数", "21.25"],
  ]);
});

test("ページを開いたとき（計算ボタンを押す前）も、初めから入っている数値の計算結果をカードで出す", async () => {
  const page = await loadPage(html);
  assert.equal(page.result.querySelectorAll("table").length, 0);
  assert.equal(cards(page.result).length, 12);
  assert.deepEqual(cardEntries(page.result)[0], ["件数", "6"]);
});

test("カードは計算結果の欄の中で、ひとつの並び（class=\"cards\" の dl）に1枚ずつ入れる", async () => {
  const page = await loadPage(html);
  await page.press("1 2 3");
  const containers = page.result.querySelectorAll(".cards");
  assert.equal(containers.length, 1, "カードの並びはひとつ");
  assert.equal(containers[0].tagName, "DL", "カードの並びは dl 要素");
  assert.deepEqual(
    containers[0].children,
    cards(page.result),
    "カードの並びの直接の子が、すべてのカード",
  );
});

test("計算し直すと、前のカードは残らず、新しい計算結果のカードだけになる", async () => {
  const page = await loadPage(html);
  await page.press("4 8 15 16 23 42");
  await page.press("1 2 3");
  assert.equal(cards(page.result).length, 12, "カードが重ねて増えない");
  assert.equal(page.result.querySelectorAll(".cards").length, 1);
  assert.deepEqual(cardEntries(page.result).slice(0, 2), [["件数", "3"], ["合計", "6"]]);
});

test("入力欄が空のときと計算できない入力のときは、カードを出さず、今と同じエラーの文言だけを出す", async () => {
  const page = await loadPage(html);
  await page.press("4 8 15");
  assert.equal(cards(page.result).length, 12);

  await page.press("  ");
  assert.equal(cards(page.result).length, 0, "空のときはカードを出さない");
  assert.equal(page.result.querySelectorAll("table").length, 0);
  assert.equal(page.result.textContent.trim(), "数値を入力してください");

  await page.press("4 abc");
  assert.equal(cards(page.result).length, 0, "計算できないときはカードを出さない");
  assert.equal(page.result.querySelectorAll("table").length, 0);
  assert.equal(page.result.querySelectorAll("p.error").length, 1);
  assert.equal(page.result.textContent.trim(), "values には有限の数値だけを入れてください");
});

test("index.html は表（table）を作らない（要件5）", () => {
  assert.doesNotMatch(html, /<table[\s>]/i, "table 要素を置かない");
  assert.doesNotMatch(html, /createElement\(\s*["']table["']\s*\)/, "table 要素を作らない");
  assert.doesNotMatch(html, /\.insertRow\s*\(/, "表の行を作らない");
});

test("カードの値は、見出しより大きな文字で出す（大きな数字）（要件2）", async () => {
  const page = await loadPage(html);
  await page.press("1 2 3");
  const rules = styleRules(html);
  const card = cards(page.result)[0];
  const heading = card.querySelector("dt");
  const value = card.querySelector("dd");
  const headingSize = fontSizePx(declarationsFor(rules, heading));
  const valueSize = fontSizePx(declarationsFor(rules, value));
  assert.ok(Number.isFinite(valueSize), "値の文字の大きさを読める");
  assert.ok(valueSize > ROOT_PX, `値の文字は本文（${ROOT_PX}px）より大きい：${valueSize}px`);
  assert.ok(valueSize > headingSize, `値の文字（${valueSize}px）は見出し（${headingSize}px）より大きい`);
});

test("1行に並ぶカードの枚数は幅に合わせて変わり、入らないカードは次の行に折り返す（要件6）", async () => {
  const page = await loadPage(html);
  await page.press("4 8 15 16 23 42");
  const rules = styleRules(html);
  const container = declarationsFor(rules, page.result.querySelector(".cards"));
  const card = declarationsFor(rules, cards(page.result)[0]);

  // 本文の幅：幅 1280px の画面で 640px（max-width: 40rem）、幅 375px で 343px、幅 320px で 288px。
  const wide = cardsPerRow(container, card, 640);
  const phone = cardsPerRow(container, card, 343);
  const narrow = cardsPerRow(container, card, 288);
  assert.ok(wide > narrow, `広い画面（${wide}枚）のほうが狭い画面（${narrow}枚）より1行に多く並ぶ`);
  assert.ok(wide < 12, `広い画面でも12枚は1行に収まらず、次の行に折り返す（1行に${wide}枚）`);
  assert.ok(narrow >= 1 && phone >= narrow, "狭い画面でも1行に1枚以上並ぶ");
  // デザイン案 design/issue-75.html の見え方：幅 1280px で1行に4枚、幅 375px と 320px で2枚。
  assert.equal(wide, 4, "幅 1280px の画面で1行に4枚");
  assert.equal(phone, 2, "幅 375px の画面で1行に2枚");
  assert.equal(narrow, 2, "幅 320px の画面で1行に2枚");
});
