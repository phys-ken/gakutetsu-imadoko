# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

### Running locally

```bash
python -m http.server 8765
# → http://localhost:8765
```

HTTP サーバー経由を推奨（`file://` 直接開きは Claude in Chrome などの拡張機能が URL を書き換えることがある）。

No build step, no dependencies, no package manager.

## Architecture

ビルドツールなしのバニラJS SPA。スクリプト間の通信は `window.GakutetsuXxx` グローバルのみ。

```
data.js      → window.GakutetsuData     (駅・踏切・時刻表の生データ)
geometry.js  → window.GakutetsuGeometry (SVG座標変換・描画)
schedule.js  → window.GakutetsuSchedule (列車位置・通過時刻の計算)
app.js       →                          (UIイベント・状態管理。window公開なし)
```

`index.html` が `<script defer>` で上記順に読み込む。各ファイルは IIFE でスコープを閉じている。

### Data flow

1. `data.js`: `STATIONS`・`CROSSINGS`・`RAW_TIMETABLES`・`HOLIDAYS_2026` を定義し `window.GakutetsuData` に登録
2. `geometry.js`: `TRACK_POLYLINE`（緯度経度折れ線）を SVG 座標に変換。`crossingAtGeo` の場合は線路上に投影して km 値を算出
3. `schedule.js`: km 値をキーに、駅間を線形補間して通過時刻を計算
4. `app.js`: `setInterval` で毎秒 `tick()` を呼び出し、列車位置・時刻表示を更新。選択 km は `localStorage` に保存

### Key invariants

- **`STATIONS` 配列の順番を変えない** — 下り（吉原→江尾）の列番号の順番と一致している
- `parseMatrix` の列順は `inbound`（江尾→吉原）と `outbound`（吉原→江尾）で逆になる
- 踏切 ID は `cr01` から連番。新規追加は km 順（吉原側が先）で並べる

## M5Stack 開発ワークフロー

### コード変更後の upload

`m5stack/src/` 配下のファイルを変更したら、**ユーザの承認を待たずに自動で** upload を実行すること。

```powershell
cd m5stack/tools
.\upload.ps1 COM5
```

upload 後にユーザへ「M5Stack をリセットしてください」と伝える。写真が送られてきたら表示を確認してフィードバックする。

upload コマンドは `settings.json` の allowList に登録済みのため自動承認される。

### git commit / push

コード変更後の `git add`・`git commit`・`git push` も**ユーザの承認を待たずに自動で**実行すること。
メッセージは変更内容を簡潔に英語で記述し、末尾に `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` を付ける。

---

## Common maintenance tasks

詳細なテンプレートは `docs/llm-tasks.md` を参照。

### 時刻表の更新（ダイヤ改正）

`src/data.js` の `RAW_TIMETABLES` 内の `parseMatrix(...)` 文字列を差し替える。

### 踏切の追加

`src/data.js` の `CROSSINGS` 配列に追加。緯度経度が分かる場合は `crossingAtGeo`、km値が分かる場合は `crossingAtKm` を使う。

```js
crossingAtGeo("cr05", "○○踏切", 35.1610, 138.7050)
// ↑ 線路上でなくてよい。内部で自動投影される
```

### 祝日の年次更新

`src/data.js` の `HOLIDAYS_2026` 変数名と内容を更新。`app.js` 内の参照箇所も同じ変数名に揃える。
