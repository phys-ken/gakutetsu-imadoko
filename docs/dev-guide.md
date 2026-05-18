# 開発者ガイド

## アーキテクチャ概要

ビルドツールなしのバニラJS SPA。全ファイルは `<script defer>` で順番に読み込まれ、
各ファイルは IIFE でスコープを閉じ、`window.GakutetsuXxx` 経由でデータを共有します。

```
data.js  →  window.GakutetsuData    (駅・踏切・時刻表の生データ)
geometry.js → window.GakutetsuGeometry  (SVG座標変換・描画)
schedule.js → window.GakutetsuSchedule  (列車位置・通過時刻の計算)
app.js   →  UIイベント・状態管理 (window への公開なし)
```

---

## src/data.js — データ定義

### STATIONS（駅）

```js
{ id: "GD01", name: "吉原", km: 0.0, lat: 35.14425, lon: 138.70158333, ... }
```

- `id`: `GD01`〜`GD10`（吉原→岳南江尾の順）
- `km`: 吉原からの営業キロ。時刻補間の基準になる
- `lat/lon`: 地図上の実座標（参照・デバッグ用）
- `labelSide / textX / textY` など: SVG上でのラベル描画座標。駅を追加しない限り変更不要

**STATIONS 配列の順番 = 下り（吉原→江尾）の列番号の順番。絶対に変えない。**

---

### CROSSINGS（踏切）

**Web アプリ専用。M5Stack 版は踏切データを読み込まないため、ここの変更は M5Stack に影響しません。**

2種類の定義方法があります：

```js
// 方法A: 吉原からの営業キロで指定（簡単）
crossingAtKm("cr05", "○○踏切", 3.15)

// 方法B: 緯度経度で指定（地図から計測した場合はこちら）
crossingAtGeo("cr05", "○○踏切", 35.1610, 138.6980)
```

`crossingAtGeo` は内部で線路ポリラインに最近傍投影し、自動的に km 値を算出します。
地図で目視した座標はそのまま `crossingAtGeo` に渡してください。

ID は `cr01`〜 の連番。現在は `cr01`〜`cr04` を使用済み。

---

### RAW_TIMETABLES（時刻表）

```js
RAW_TIMETABLES = {
  weekday: {
    inbound:  parseMatrix("..."),  // 上り（江尾→吉原）
    outbound: parseMatrix("...")   // 下り（吉原→江尾）
  },
  holiday: { ... }
}
```

`parseMatrix` は空白区切りの文字列を `string[][]` に変換します。

- **行** = 1本の列車
- **列** = 駅の順番（上りは江尾→吉原、下りは吉原→江尾）

上り列の順番（INBOUND_ORDER）:
```
岳南江尾, 神谷, 須津, 岳南富士岡, 比奈, 岳南原田, 本吉原, 吉原本町, ジヤトコ前, 吉原
```

下り列の順番（OUTBOUND_ORDER）:
```
吉原, ジヤトコ前, 吉原本町, 本吉原, 岳南原田, 比奈, 岳南富士岡, 須津, 神谷, 岳南江尾
```

各セルは `"H:MM"` 形式（例: `"6:07"`）。

---

### HOLIDAYS_2026（祝日セット）

```js
var HOLIDAYS_2026 = new Set(["2026-01-01", "2026-01-12", ...]);
```

起動時に今日の日付と照合し、土日または祝日なら `holiday` ダイヤを自動選択します。
年が変わったら `HOLIDAYS_2026` を `HOLIDAYS_2027` に変更し、内容を更新してください。

---

## src/geometry.js — 座標変換

### 主な責務

- `TRACK_POLYLINE`（緯度経度の折れ線）を SVG 座標に変換
- 列車位置 (km値) を SVG 上の座標と角度に変換
- クリック位置を km 値に逆変換

### 踏切の表示位置

`crossingAtGeo` の場合、`geometry.js` 内の `projectLatLonOntoRoute()` が
緯度経度を線路上に投影して km 値を計算します。
正しく投影されているかは、地図上の踏切アイコン位置を目視で確認してください。

---

## src/schedule.js — 時刻計算

- `getRunningTrains(scheduleType, nowSeconds)`: 現在走行中の列車一覧（km値付き）
- `getPassageEvents(scheduleType, km)`: 指定 km を通過する全列車の時刻一覧
- `computePassageForTrain(train, km)`: 1本の列車の指定地点通過時刻（駅間を線形補間）

---

## src/app.js — UI

### 状態管理

```js
var state = {
  autoScheduleType: "weekday" | "holiday",  // 日付から自動判定
  selectedScheduleType: "weekday" | "holiday",  // 実際に表示中
  selectedPoint: { km: Number } | null,
  showAllPassages: false,    // ドロワーの全時刻表示
  showSidePanelAll: false,   // サイドパネルの全時刻表示
  liveTrains: [],
  now: Date,
  nowSeconds: Number,
  drawerOpen: Boolean
};
```

### 1秒ごとの更新

`setInterval` で毎秒 `tick()` を呼び出し、列車位置と時刻を再計算。
時計表示・列車アイコン位置・通過時刻の「あと○分」表示が自動更新されます。

---

## ローカル開発

```bash
python -m http.server 8765
# → http://localhost:8765
```

`file://` 直接開きは CORS 制限なしで動きますが、
拡張機能（Claude in Chrome など）が URL を書き換えることがあるため
HTTP サーバー経由を推奨します。
