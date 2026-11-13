// 数値の配列から代表的な統計値をまとめて求める関数

// 並べ済みの配列から、位置 p (0〜1) の分位数を線形補間で求める（QUARTILE.INC と同じ方式）
function quantile(sorted, p) {
  const position = p * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

// 最も多く現れる値を、昇順の配列ですべて返す
function modes(sorted) {
  const counts = new Map();
  for (const value of sorted) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let maxCount = 0;
  for (const count of counts.values()) {
    if (count > maxCount) maxCount = count;
  }
  // sorted を順にたどって Map に入れたので、キーの並びは昇順になっている
  return [...counts.entries()]
    .filter(([, count]) => count === maxCount)
    .map(([value]) => value);
}

/**
 * 数値の配列の統計値をまとめて返す。入力の配列は書き換えない。
 * @param {number[]} values 1つ以上の有限の数値
 * @returns {{count:number,sum:number,mean:number,median:number,mode:number[],
 *   min:number,max:number,range:number,variance:number,stdDev:number,q1:number,q3:number}}
 */
export function describe(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("values は配列で渡してください");
  }
  if (values.length === 0) {
    throw new RangeError("values が空です");
  }
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new TypeError("values には有限の数値だけを入れてください");
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mean = sum / count;
  const min = sorted[0];
  const max = sorted[count - 1];
  // 標本分散（n-1 で割る）。要素が1つのときは NaN
  const variance =
    count > 1
      ? sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / (count - 1)
      : NaN;

  return {
    count,
    sum,
    mean,
    median: quantile(sorted, 0.5),
    mode: modes(sorted),
    min,
    max,
    range: max - min,
    variance,
    stdDev: Math.sqrt(variance),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
  };
}
