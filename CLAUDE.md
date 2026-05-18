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

### M5Stack ファイル管理の注意点

- **`m5stack/src/boot.py` は削除・上書きしない。** UIFlow2 の標準 boot.py は NVS キー欠損で
  クラッシュするため、カスタム版を維持する必要がある。
  upload.ps1 が毎回このカスタム版を `/flash/boot.py` に書き込む。

- **`local_config.py` は `.gitignore` 対象。** WiFi の SSID とパスワードが含まれるため
  絶対にコミットしない。テンプレは `local_config.example.py`。

- **`user_prefs.json` はデバイス上にのみ存在する。** ユーザがホーム画面で A/C ボタンで
  変更した TARGET_KM がここに保存される。upload.ps1 は上書きしないため設定は保持される。

- **`boot_time.py` は手動編集不要。** upload.ps1 が PC 現在時刻で自動生成する。

### 画面が真っ暗になったとき（NVS トラブル）

```powershell
# NVS boot_option を確認（0 が正常）
python -m mpremote connect COM5 exec "import esp32; print(esp32.NVS('uiflow').get_u8('boot_option'))"
# 0 でなければ修正
python -m mpremote connect COM5 exec "import esp32; nvs=esp32.NVS('uiflow'); nvs.set_u8('boot_option',0); nvs.commit()"
# upload.ps1 で boot.py を再アップロード後、リセット
```

詳細は `m5stack/README.md` のトラブルシューティング節を参照。

---

## Common maintenance tasks

詳細なテンプレートは `docs/llm-tasks.md` を参照。

### 時刻表の更新（ダイヤ改正）

`src/data.js` の `RAW_TIMETABLES` 内の `parseMatrix(...)` 文字列を差し替える。

### 踏切の追加

**Web 版のみ。M5Stack 版（`m5stack/src/`）に変更不要。**

`src/data.js` の `CROSSINGS` 配列に追加。緯度経度が分かる場合は `crossingAtGeo`、km値が分かる場合は `crossingAtKm` を使う。

```js
crossingAtGeo("cr05", "○○踏切", 35.1610, 138.7050)
// ↑ 線路上でなくてよい。内部で自動投影される
```

追加後は `cr01` から始まる連番を km 順（吉原側が先）に保つこと。踏切の現地名称確認・座標取得は作業者が行う（[`docs/llm-tasks.md`](docs/llm-tasks.md) 作業B 参照）。

### 祝日の年次更新

`src/data.js` の `HOLIDAYS_2026` 変数名と内容を更新。`app.js` 内の参照箇所も同じ変数名に揃える。
