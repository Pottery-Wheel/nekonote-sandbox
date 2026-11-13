// 数値の配列の簡単な統計を求める関数
export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
