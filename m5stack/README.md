# がくてつ いまどこ？ — M5Stack 版

M5Stack Basic（320×240 / ボタン A/B/C）用 MicroPython スタンドアロンアプリ。  
電源を入れるだけで岳南電車の列車位置と時刻をリアルタイム表示します。

## 画面構成

| 画面 | 内容 |
|---|---|
| **ホーム** | 路線地図 + 列車矢印 + INFO バー（直近2本の通過時刻）|
| **メニュー** | Timetable / Sync Time / WiFi Info / Back |
| **Timetable** | 指定地点の上り・下り全通過時刻一覧（次の列車を赤字） |
| **WiFi Info** | 登録済みネットワーク数と WiFi 設定手順 |

## ボタン操作

| 画面 | A（左）| B（中）| C（右）|
|---|---|---|---|
| **ホーム** | 短: −0.1 km / 長: 連続 − | 短: メニューへ / 長800ms: WiFi 強制同期 | 短: +0.1 km / 長: 連続 + |
| **メニュー** | 短: カーソル↑ | 短: 決定 | 短: カーソル↓ |
| **Timetable** | 短/長: スクロール↑ | 短: メニューへ | 短/長: スクロール↓ |
| **WiFi Info** | — | 短: メニューへ | — |

## セットアップ（初回）

### 1. ツールインストール

```powershell
pip install esptool mpremote
```

### 2. UIFlow2 ファームウェア書き込み

M5Stack 公式サイトから **M5Stack Basic 用 UIFlow2（16MB版）** をダウンロードし、M5Burner で書き込む。  
書き込み時は **「ネットワーク設定なし・run main.py モード」** を選ぶこと（WiFi モードにすると mpremote が繋がらなくなる）。

### 3. 座標ファイル生成

```powershell
cd m5stack\tools
python compute_coords.py
# → src/map_coords.py が生成される
```

### 4. ファイルアップロード

```powershell
cd m5stack\tools
.\upload.ps1 COM5   # COM ポートは環境に合わせて変更
```

M5Stack をリセットすると起動します。

---

## 開発ワークフロー

`m5stack/src/` を変更したら `upload.ps1` を実行するだけです。  
`boot.py` / `main.py` / `wifi_ntp.py` / `data.py` / `schedule.py` / `map_coords.py` / `local_config.py` を一括転送し、RTC も PC 時刻に同期します。

```powershell
cd m5stack\tools
.\upload.ps1 COM5
# 完了後に M5Stack のリセットボタン（左側面の赤ボタン）を押す
```

---

## 設定ファイル

### `src/local_config.py`（**git 管理対象外**）

```python
TARGET_KM = 2.5          # 観測スポット（吉原からの営業キロ）

WIFI_NETWORKS = [
    ("自宅のSSID", "自宅のパスワード"),
    ("テザリングSSID", "テザリングPASS"),  # 複数登録可、上から順に試行
]
```

- テンプレは `src/local_config.example.py` を参照
- WiFi 未設定でも起動・動作する（時刻は USB 転送時の RTC 同期値を使用）

### `user_prefs.json`（デバイス上にのみ存在）

ホーム画面で A/C ボタンで変更した TARGET_KM がここに保存されます。  
`upload.ps1` は上書きしないため、ボタンで微調整した設定は電源を切っても維持されます。

---

## 時刻同期の仕組み

| タイミング | 動作 |
|---|---|
| `upload.ps1` 実行時 | PC 時刻を RTC に書き込み（boot_time.py も自動生成） |
| 起動時（RTC が 2025 年未満） | boot_time.py の書き込み時刻をフォールバックとして使用 |
| B ボタン長押し 800ms | WiFi + NTP で強制同期 |
| メニュー → Sync Time | WiFi + NTP で同期 |
| 毎朝 4:00 | WiFi + NTP で自動同期（1日1回） |

---

## トラブルシューティング

### 画面が真っ暗のとき

1. `upload.ps1` を再実行し、M5Stack をリセットする
2. 改善しない場合、NVS（不揮発ストレージ）の設定を確認：

```powershell
python -m mpremote connect COM5 exec "import esp32; print(esp32.NVS('uiflow').get_u8('boot_option'))"
# → 0 が正常。1 や 2 なら修正が必要
python -m mpremote connect COM5 exec "import esp32; nvs=esp32.NVS('uiflow'); nvs.set_u8('boot_option',0); nvs.commit()"
```

3. `upload.ps1` で `boot.py`（カスタム版）を再アップロード後、リセット

### mpremote が繋がらないとき

- M5Stack が WiFi モードで起動している可能性あり → 上記の NVS boot_option を確認
- M5Burner で「run main.py モード」で再書き込み → `upload.ps1` で再アップロード

### 時刻がずれているとき

- `upload.ps1` を実行すると PC 時刻に同期される（WiFi 不要）
- WiFi 設定済みなら B 長押しで NTP 同期

---

## ファイル構成

```
src/
  boot.py            UIFlow2 起動処理（カスタム版）
  main.py            アプリ本体・状態機械・描画
  wifi_ntp.py        WiFi + NTP 時刻同期
  schedule.py        列車位置・通過時刻計算
  data.py            時刻表データ（分単位整数）
  map_coords.py      320×240 座標（自動生成）
  local_config.py    観測スポット・WiFi 認証情報（git 除外）
  local_config.example.py  設定テンプレ

tools/
  compute_coords.py  map_coords.py 生成スクリプト
  upload.ps1         ファイル一括アップロード + RTC 同期
  flash.ps1          ファームウェア書き込み
```
