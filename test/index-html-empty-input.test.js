import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// issue #60：計算ボタンを押したときに入力欄が空（スペースや改行だけを含む）なら、計算をせずに
// 計算結果の欄（#result）に「数値を入力してください」と表示する。ポップアップのダイアログは使わない。
// 数値を入力して再び計算ボタンを押したときは、メッセージを通常の計算結果に置き換える。
const MESSAGE = "数値を入力してください";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
// 変更前（issue #60 の作業を始める前）の index.html の写し。
const before = readFileSync(
  new URL("./fixtures/index.before-60.html", import.meta.url),
  "utf8",
);

const MODULE_SCRIPT = /(<script type="module">)([\s\S]*?)(<\/script>)/g;
const STATS_URL = new URL("../src/stats.js", import.meta.url).href;

// ---------------------------------------------------------------------------
// ブラウザの代わりに使う、小さな作り物の DOM。ページの script が使いそうな操作だけを用意する。
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

const workDir = mkdtempSync(join(tmpdir(), "nekonote-issue60-"));
process.on("exit", () => rmSync(workDir, { recursive: true, force: true }));

// describe（計算）の呼び出しを数えるための差し替えのモジュール。
const spyPath = join(workDir, "stats-spy.mjs");
writeFileSync(
  spyPath,
  `import { describe as realDescribe } from ${JSON.stringify(STATS_URL)};
export function describe(values) {
  globalThis.__issue60DescribeCalls.push(Array.from(values));
  return realDescribe(values);
}
`,
);

let pageCount = 0;

function moduleScripts(source) {
  return [...source.matchAll(MODULE_SCRIPT)].map((match) => match[2]);
}

function initialTextareaValue(source) {
  const match = /<textarea id="values"[^>]*>([\s\S]*?)<\/textarea>/.exec(source);
  return match ? decode(match[1]) : "";
}

// ページを読み込んだ状態を作る。入力欄・計算ボタン・計算結果の欄を用意し、script を動かす。
async function loadPage() {
  const document = new FakeDocument();
  const values = document.createElement("textarea");
  values.id = "values";
  values.value = initialTextareaValue(html);
  const buttonParagraph = document.createElement("p");
  const calc = document.createElement("button");
  calc.id = "calc";
  calc.setAttribute("type", "button");
  calc.textContent = "計算する";
  buttonParagraph.append(calc);
  const result = document.createElement("div");
  result.id = "result";
  document.body.append(values, buttonParagraph, result);

  const popups = [];
  const describeCalls = [];
  const record = (name) => (...args) => {
    popups.push({ name, args });
    return name === "confirm" ? false : name === "prompt" ? null : undefined;
  };
  const window = {
    document,
    alert: record("alert"),
    confirm: record("confirm"),
    prompt: record("prompt"),
    addEventListener() {},
  };
  window.window = window;
  Object.assign(globalThis, {
    document,
    window,
    alert: window.alert,
    confirm: window.confirm,
    prompt: window.prompt,
    __issue60DescribeCalls: describeCalls,
  });

  const scripts = moduleScripts(html);
  assert.equal(scripts.length, 1, "index.html の script type=module はひとつ");
  const source = scripts[0].replace(
    /(["'])\.\/src\/stats\.js\1/g,
    JSON.stringify(pathToFileURL(spyPath).href),
  );
  pageCount += 1;
  const pagePath = join(workDir, `page-${pageCount}.mjs`);
  writeFileSync(pagePath, source);
  await import(pathToFileURL(pagePath).href);

  const page = {
    document,
    values,
    calc,
    result,
    popups,
    describeCalls,
    async press(text) {
      values.value = text;
      const callsBefore = describeCalls.length;
      calc.click();
      // 非同期の処理を書いた場合にも結果が出るように、少し待つ。
      await new Promise((resolve) => setImmediate(resolve));
      return describeCalls.slice(callsBefore);
    },
    text() {
      return result.textContent.trim();
    },
    tables() {
      return result.querySelectorAll("table");
    },
  };
  return page;
}

// 計算結果の表から「項目名 → 値」を取り出す。
function tableRows(table) {
  return Object.fromEntries(
    table
      .querySelectorAll("tr")
      .map((row) => row.children.map((cell) => cell.textContent.trim())),
  );
}

const BLANK_INPUTS = [
  ["何も入力していない", ""],
  ["半角スペース1つ", " "],
  ["半角スペースだけ", "     "],
  ["改行1つ", "\n"],
  ["改行だけ", "\n\n\n"],
  ["CRLF の改行", "\r\n"],
  ["スペースと改行の組み合わせ", "  \n  \n "],
];

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

for (const [label, input] of BLANK_INPUTS) {
  test(`入力欄が空（${label}）のときに計算ボタンを押すと、計算せずに計算結果の欄へ「${MESSAGE}」と表示する`, async () => {
    const page = await loadPage();
    const calls = await page.press(input);
    assert.deepEqual(calls, [], "計算（describe）を呼ばない（要件1）");
    assert.equal(page.tables().length, 0, "計算結果の表を表示しない（要件1）");
    assert.equal(page.text(), MESSAGE, `計算結果の欄の文言は「${MESSAGE}」だけ（要件2）`);
    assert.deepEqual(page.popups, [], "alert・confirm・prompt を使わない（要件3）");
    assert.deepEqual(page.document.dialogCalls, [], "dialog 要素を開かない（要件3）");
  });
}

test("計算結果の表が出ているときに入力欄を空にして計算ボタンを押すと、表は消えてメッセージだけになる", async () => {
  const page = await loadPage();
  const firstCalls = await page.press("1 2 3");
  assert.deepEqual(firstCalls, [[1, 2, 3]], "数値があれば計算する");
  assert.equal(page.tables().length, 1, "最初は計算結果の表が出ている");

  const calls = await page.press("  \n ");
  assert.deepEqual(calls, [], "空のときは計算しない");
  assert.equal(page.tables().length, 0, "前の計算結果の表は残らない");
  assert.equal(page.text(), MESSAGE);
  assert.deepEqual(page.popups, []);
});

test("空のまま計算ボタンを何度押しても、メッセージはひとつだけ表示する", async () => {
  const page = await loadPage();
  await page.press("");
  await page.press(" ");
  const calls = await page.press("\n");
  assert.deepEqual(calls, []);
  assert.equal(page.text(), MESSAGE, "メッセージが重ねて表示されない");
  assert.deepEqual(page.popups, []);
});

test("メッセージが出た後に数値を入力して計算ボタンを押すと、メッセージは通常の計算結果に置き換わる（要件5）", async () => {
  const page = await loadPage();
  await page.press("");
  assert.equal(page.text(), MESSAGE);

  const calls = await page.press("4 8 15");
  assert.deepEqual(calls, [[4, 8, 15]], "入力した数値で計算する");
  assert.ok(!page.text().includes(MESSAGE), "メッセージは残らない");
  assert.equal(page.tables().length, 1, "計算結果の表がひとつ出る");
  const rows = tableRows(page.tables()[0]);
  assert.equal(rows["件数"], "3");
  assert.equal(rows["合計"], "27");
  assert.equal(rows["最小値"], "4");
  assert.equal(rows["最大値"], "15");
  assert.deepEqual(page.popups, []);
});

test("スペースや改行だけでメッセージが出た後に、前後に空白のある数値を入力して計算ボタンを押すと、通常の計算結果に置き換わる", async () => {
  const page = await loadPage();
  await page.press(" \n \n");
  assert.equal(page.text(), MESSAGE);

  const calls = await page.press("  1, 2\n3  \n");
  assert.deepEqual(calls, [[1, 2, 3]]);
  assert.ok(!page.text().includes(MESSAGE), "メッセージは残らない");
  assert.equal(page.tables().length, 1);
  assert.equal(tableRows(page.tables()[0])["件数"], "3");
});

test("数値を入力したときの計算結果は、これまでどおり表で表示する（空でない入力は今までと変わらない）", async () => {
  const page = await loadPage();
  const calls = await page.press("4 8 15 16 23 42");
  assert.deepEqual(calls, [[4, 8, 15, 16, 23, 42]]);
  assert.ok(!page.text().includes(MESSAGE));
  const rows = tableRows(page.tables()[0]);
  assert.equal(rows["件数"], "6");
  assert.equal(rows["合計"], "108");
  assert.equal(rows["平均値"], "18");
});

test("index.html はポップアップのダイアログ（alert・confirm・prompt・dialog 要素）を使わない（要件3）", () => {
  assert.doesNotMatch(html, /\balert\s*\(/, "alert を呼ばない");
  assert.doesNotMatch(html, /\bconfirm\s*\(/, "confirm を呼ばない");
  assert.doesNotMatch(html, /\bprompt\s*\(/, "prompt を呼ばない");
  assert.doesNotMatch(html, /<dialog[\s>]/i, "dialog 要素を置かない");
  assert.doesNotMatch(html, /\.showModal\s*\(/, "showModal を呼ばない");
});

test("index.html の script（type=module）と style の中を除くと、変更前と同じ（入力欄・計算ボタン・計算結果の欄などは変わらない）", () => {
  const strip = (source) =>
    source.replace(MODULE_SCRIPT, "$1$3").replace(/(<style>)[\s\S]*?(<\/style>)/g, "$1$2");
  assert.equal(moduleScripts(before).length, 1, "変更前の script type=module はひとつ");
  assert.equal(strip(html), strip(before));
});
