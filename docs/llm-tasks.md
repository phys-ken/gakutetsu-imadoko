# LLMへの作業依頼テンプレート

このファイルは、将来の定期メンテナンスを LLM に依頼するための作業依頼文のテンプレートです。  
依頼時は該当セクションをコピーし、`【】` 内の箇所を実際の値に書き換えてから貼り付けてください。

---

## 作業A：ダイヤ改正（時刻表の更新）

### 依頼文テンプレート

```
「がくてつ いまどこ？」というウェブアプリの時刻表データを更新してください。
更新対象ファイルは `src/data.js` です。

## データ形式の説明

RAW_TIMETABLES は以下の構造です：

```js
RAW_TIMETABLES = {
  weekday: {
    inbound:  parseMatrix("..."),  // 上り（岳南江尾→吉原）
    outbound: parseMatrix("...")   // 下り（吉原→岳南江尾）
  },
  holiday: {
    inbound:  parseMatrix("..."),
    outbound: parseMatrix("...")
  }
}
```

parseMatrix に渡す文字列のルール：
- 1行 = 1本の列車
- 各行は空白区切りの時刻（例: `6:07 6:09 6:11 ...`）
- 列の順番は固定（変えないこと）

上り（inbound）の列順（左→右）:
  岳南江尾, 神谷, 須津, 岳南富士岡, 比奈, 岳南原田, 本吉原, 吉原本町, ジヤトコ前, 吉原

下り（outbound）の列順（左→右）:
  吉原, ジヤトコ前, 吉原本町, 本吉原, 岳南原田, 比奈, 岳南富士岡, 須津, 神谷, 岳南江尾

時刻は `H:MM` 形式（0埋めなし）。例：6:07, 10:20, 22:31

## 更新内容

【以下を実際のダイヤ情報に書き換える】

- 対象ダイヤ種別：weekday / holiday / 両方
- 対象方向：上り / 下り / 両方
- 変更内容：（例）「平日下りの全時刻を以下に差し替える」

新しい時刻表データ：
【ここに時刻表を貼り付ける。形式は「駅名 時刻」形式や PDF のコピーなど何でも可。
  LLM に parseMatrix 用の文字列形式に変換してもらう。】

また、`HOLIDAYS_2026` のセットに含まれる年が変わる場合は、
変数名を `HOLIDAYS_20XX` に変更したうえで、新しい祝日一覧も更新してください。
```

---

## 作業B：踏切の追加

> **M5Stack への反映は不要です。** 踏切データは Web アプリ（`src/data.js`）のみで使用します。

### 事前準備（作業者が行う）

1. **現地を歩いて** 踏切の正式名称を確認する（標識・看板）
2. **スマホの地図アプリ**（Google マップ・地理院地図等）で踏切中心の緯度・経度を取得する（小数点以下4桁以上）
3. 踏切に名称標識がない場合は位置から仮称をつける（例: 「須津第三踏切」）
4. 既存の踏切ID（`cr01`〜`cr04`）の次の番号を確認する

### 依頼文テンプレート

```
「がくてつ いまどこ？」というウェブアプリに踏切を追加してください。
更新対象ファイルは `src/data.js` の `CROSSINGS` 配列です。

## CROSSINGS の現在の内容（参考）

```js
var CROSSINGS = [
  crossingAtKm("cr01", "国道139号踏切", 1.90, { note: "..." }),
  crossingAtKm("cr02", "吉原商店街前踏切", 2.65, { note: "..." }),
  crossingAtKm("cr03", "富士岡電鈴踏切", 6.40, { note: "..." }),
  crossingAtKm("cr04", "江尾電鈴踏切", 8.86, { note: "..." }),
];
```

## 関数の使い方

緯度経度がわかっている場合（地図で計測した座標）は必ず `crossingAtGeo` を使うこと：

```js
crossingAtGeo("cr05", "踏切の名前", 緯度, 経度)
// 例: crossingAtGeo("cr05", "○○踏切", 35.1610, 138.7050)
```

`crossingAtGeo` は内部で線路上に自動投影するので、座標は線路上でなくてよい。

## 追加する踏切の情報

【以下を実際の情報に書き換える】

| 項目 | 値 |
|------|-----|
| 踏切の名前 | 【例：須津○○踏切】 |
| 緯度 | 【例：35.1600】 |
| 経度 | 【例：138.7380】 |
| 追加するID | 【例：cr05（既存の最大番号の次）】 |
| 備考・特記事項 | 【任意】 |

CROSSINGS 配列への追加は、線路に沿った位置順（吉原側が先）に並べてください。
追加後に既存の踏切の位置が前後しないか確認をお願いします。
```

---

## 作業C：祝日カレンダーの年次更新

年が替わったタイミングで実施します。

### 依頼文テンプレート

```
「がくてつ いまどこ？」の `src/data.js` にある祝日データを更新してください。

現在の変数名：`HOLIDAYS_2026`
更新後の変数名：`HOLIDAYS_【新しい年】`

【新しい年】の国民の祝日・振替休日の一覧（YYYY-MM-DD 形式）：

【ここに祝日リストを貼り付ける】

変数名の変更は、宣言箇所（`var HOLIDAYS_2026 = ...`）と
`window.GakutetsuData` への登録箇所（`HOLIDAYS_2026: HOLIDAYS_2026`）の
両方を変更してください。

app.js 内で `HOLIDAYS_2026` を参照している箇所も同様に更新してください。
```

---

## 作業D：ダイヤ改正の M5Stack 版への反映

### 概要

Web 版（`src/data.js`）のダイヤ改正と別に、M5Stack 版（`m5stack/src/data.py`）も更新が必要。
`schedule.py` や `main.py` は変更不要。

### 依頼文テンプレート

```
「がくてつ いまどこ？」M5Stack 版の時刻表データを更新してください。
更新対象ファイルは `m5stack/src/data.py` です。

構造は `src/data.js` の Python 移植版です。変数名の対応：
- js: WEEKDAY_INBOUND  → py: WEEKDAY_INBOUND  (list of list of int, 分単位)
- js: WEEKDAY_OUTBOUND → py: WEEKDAY_OUTBOUND
- js: HOLIDAY_INBOUND  → py: HOLIDAY_INBOUND
- js: HOLIDAY_OUTBOUND → py: HOLIDAY_OUTBOUND

各列車は駅ごとの「午前0時からの分数（整数）」のリストです。
例: 6:07 → 367, 10:20 → 620

## 更新内容

【以下を実際のダイヤ情報に書き換える】

更新後は upload.ps1 で M5Stack に転送してください：
  cd m5stack\tools
  .\upload.ps1 COM5
転送後 M5Stack をリセットして動作確認してください。
```

---

## 作業E：祝日の M5Stack 版への反映

### 依頼文テンプレート

```
「がくてつ いまどこ？」M5Stack 版の祝日データを更新してください。
更新対象ファイルは `m5stack/src/data.py` です。

現在の変数名：`HOLIDAYS_2026`（set 型）
更新後の変数名：`HOLIDAYS_【新しい年】`

【新しい年】の祝日一覧（YYYY-MM-DD 形式）：
【ここに祝日リストを貼り付ける】

変数名の変更は宣言箇所と `schedule.py` 内の参照箇所（`_d.HOLIDAYS_2026`）の
両方を変更してください。
```

---

## 作業F：WiFi 認証情報の追加

WiFi 認証情報は `.gitignore` 対象の `m5stack/src/local_config.py` に記載します（GitHub に公開されません）。

### 手順

1. `m5stack/src/local_config.py` を開き、`WIFI_NETWORKS` リストを編集：

```python
WIFI_NETWORKS = [
    ("自宅のSSID", "自宅のパスワード"),          # 優先度1
    ("スマホテザリングのSSID", "テザリングPASS"), # 優先度2（フォールバック）
]
```

2. `upload.ps1 COM5` を実行して M5Stack に転送
3. リセット後、ホーム画面で B ボタン長押し（800ms）または メニュー → Sync Time で NTP 同期確認

注意：
- 複数ネットワークを登録すると上から順に試行し、最初に接続できたもので NTP 同期する
- WiFi なしでも起動・動作する（RTC は upload 時の PC 時刻を使用）
- `local_config.py` は絶対に `git add` しないこと

---

## 作業G：M5Stack 画面真っ暗のトラブルシュート

起動後に画面が真っ暗な場合、以下の手順で診断・復旧します。

### 診断手順

```powershell
# ステップ1: mpremote でファイル一覧確認
python -m mpremote connect COM5 ls
# → main.py, boot.py, data.py 等が見えれば接続は正常

# ステップ2: NVS の boot_option 確認
python -m mpremote connect COM5 exec "import esp32; print(esp32.NVS('uiflow').get_u8('boot_option'))"
# → 0 が正常。0 以外なら次のステップへ

# ステップ3: boot_option を 0 に修正
python -m mpremote connect COM5 exec "import esp32; nvs=esp32.NVS('uiflow'); nvs.set_u8('boot_option',0); nvs.commit(); print('done')"

# ステップ4: upload.ps1 で boot.py（カスタム版）を再転送
cd m5stack\tools
.\upload.ps1 COM5
# → リセット後に起動確認
```

### それでも直らない場合

boot.py の startup() が NVS エラーで落ちているか確認：

```powershell
python -m mpremote connect COM5 exec "
import startup
startup.startup(0, 5)
print('startup ok')
"
# → OSError: ESP_ERR_NVS_NOT_FOUND が出る場合は NVS を再生成する
```

NVS 再生成（リポジトリルートの `nvs_config.csv` を使用）：

```powershell
python -m esp_idf_nvs_partition_gen generate nvs_config.csv nvs_runmainpy.bin 0x6000
esptool --port COM5 --baud 921600 write_flash 0x9000 nvs_runmainpy.bin
# → その後 upload.ps1 で boot.py を再転送し、リセット
```
