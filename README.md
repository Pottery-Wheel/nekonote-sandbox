# nekonote-sandbox

nekonote（開発者ボット）の動作を確かめるための、試し用のリポジトリ。

- テスト：`npm test`（Node.js の組み込みのテストの仕組みを使う）
- 開発用のブランチは `develop`。PRは `develop` へ向けて作る。
- Web ページ：`index.html`（`src/stats.js` の describe で計算する）。ビルドは無く、Vercel で静的なページとして公開する。
  手元では `npx serve .` などで開く（ES モジュールを読むため、ファイルを直接開くのではなく HTTP で配信する）。
