# がくてつ いまどこ？ — M5Stack 版

M5Stack Basic（320×240 / ボタン A/B/C）用 MicroPython アプリ。

## 機能

| ボタン | 表示内容 |
|---|---|
| A（左） | 路線地図 + 列車リアルタイム位置 |
| B（中） | km 2.5 地点（吉原本町〜ジャトコ前 中間）の次の通過電車 |
| C（右） | km 2.5 地点の全通過時刻一覧 |

## セットアップ（初回のみ）

### 1. ツールインストール

```powershell
pip install esptool mpremote
```

### 2. UIFlow2 ファームウェア入手

M5Stack 公式から M5Stack Basic 向け UIFlow2 ファームウェアをダウンロードする。

### 3. ファームウェア書き込み

```powershell
cd m5stack\tools
.\flash.ps1 COM3 uiflow2_basic_vX.X.X.bin
```

### 4. 座標ファイル生成（地図データ）

```powershell
cd m5stack\tools
python compute_coords.py
```

`src/map_coords.py` が生成される。

### 5. ファイルアップロード

```powershell
cd m5stack\tools
.\upload.ps1 COM3
```

M5Stack をリセットすると起動する。

## 開発ワークフロー（mpremote mount）

```powershell
# M5Stack 側に .py を転送せず、PC のディレクトリをマウントして実行
# 保存するだけで次の run で即反映される
mpremote connect COM3 mount m5stack\src run main.py
```

シリアル出力（`print()`）がターミナルに表示される。

## PC 上でのロジックテスト

```powershell
cd m5stack\src
python schedule.py   # 時刻計算ロジックを PC 上で確認
```

## ファイル構成

```
src/
  main.py          UIステートマシン・描画ロジック
  data.py          時刻表データ（分単位整数）
  schedule.py      列車位置・通過時刻計算
  map_coords.py    320×240 座標（自動生成）
tools/
  compute_coords.py  map_coords.py 生成スクリプト
  flash.ps1          ファームウェア書き込み
  upload.ps1         ファイル一括アップロード
```

## 時刻について

WiFi 未実装のため、RTC の精度は起動後の手動設定に依存する。  
`main.py` の以下の行で起動時刻を設定できる（WiFi NTP 実装まで）：

```python
rtc.datetime((2026, 5, 17, 6, 14, 0, 0, 0))
# (year, month, day, weekday, hour, min, sec, subsec)
# weekday: 0=Mon … 6=Sun
```

## 将来の拡張

- WiFi + NTP で自動時刻同期
- km 値をボタンで微調整（表示地点の変更）
- スクロールによる全時刻の表示
