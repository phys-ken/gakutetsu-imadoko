# がくてつ いまどこ？

**公開サイト → https://phys-ken.github.io/gakutetsu-imadoko/**

岳南電車（吉原〜岳南江尾）のリアルタイム列車位置マップです。  

## 機能

- 地図上の好きな場所をタップすると、その地点を通過する次の列車の時刻を表示
- 平日／土休日ダイヤの自動切り替え（日付から判定）
- 踏切・駅の位置を地図上に表示
- 全通過時刻の一覧表示（「全時刻を見る」ボタン）
- 時刻は駅間を等速として補間計算

## 使い方（ローカル）

```bash
cd 20260516_gakutetsu_DB
python -m http.server 8765
```

ブラウザで `http://localhost:8765` を開く。

## ファイル構成

```
index.html          メインHTML
styles/main.css     スタイル（レイアウト・カラー・アニメーション）
src/
  data.js           駅・踏切の位置情報、時刻表データ
  geometry.js       SVGへの座標変換・描画ロジック
  schedule.js       列車位置・通過時刻の計算ロジック
  app.js            UIインタラクション・状態管理
docs/
  dev-guide.md      開発者向けガイド
  llm-tasks.md      LLMへの作業依頼テンプレート
```

## 定期メンテナンス

詳細な作業テンプレートは [`docs/llm-tasks.md`](docs/llm-tasks.md) を参照してください。

### ダイヤ改正（時刻表の更新）

**Web 版と M5Stack 版の両方** を更新する必要があります。

| 更新対象 | ファイル |
|---|---|
| Web 版 | `src/data.js` — `RAW_TIMETABLES` の `parseMatrix(...)` 文字列を差し替え |
| M5Stack 版 | `m5stack/src/data.py` — 同じ時刻を分単位整数で記述 |
| 祝日 | `src/data.js` の `HOLIDAYS_2026`（年が変わるとき）と `app.js` 内の参照箇所 |

### 踏切の追加（Web 版のみ・M5Stack は不要）

踏切データは `src/data.js` の `CROSSINGS` 配列にのみ登録します。M5Stack 版には反映しません。

**フィールドサーベイの手順：**

1. 現地を歩いて踏切の正式名称を確認する（標識・看板）
2. スマホの地図アプリや地理院地図で踏切中心の緯度経度を取得する
3. 既存の踏切 ID（現在 `cr01`〜`cr04`）の次の番号を確認する
4. 以下をこのチャットに投げる：

```
踏切の名前: ○○踏切
緯度: 35.XXXX
経度: 138.XXXX
追加するID: cr05（既存の最大番号の次）
```

`crossingAtGeo` は自動的に線路上に投影するため、座標は線路上でなくてよいです。

## 技術スタック

ビルドツールなし。HTML + CSS + バニラJavaScriptのみ。外部ライブラリ・APIキー不要。  
GitHub Pagesにそのまま公開できます。

## M5Stack 版（実機スタンドアロンアプリ）

`m5stack/` サブフォルダに、M5Stack Basic 用の MicroPython アプリが含まれています。

| 機能 | 内容 |
|---|---|
| ホーム画面 | 路線地図 + 列車リアルタイム位置（矢印）+ INFO バー |
| INFO バー | 直近2本の通過時刻を `Xmin(H:MM)` 形式で表示、右端に日付・現在時刻 |
| 時刻表画面 | 上り・下り全通過時刻、次の列車を赤字でハイライト |
| km 微調整 | ホーム画面の A/C ボタンで観測スポットを ±0.1km 調整、デバイスに永続保存 |
| WiFi NTP | 設定済みなら B 長押し / メニューから時刻自動同期。WiFi 未設定でも動作 |

**必要なもの:** M5Stack Basic、USB-C ケーブル、UIFlow2 ファームウェア

```powershell
# ファイルをM5Stackに転送してRTCを同期
cd m5stack\tools
.\upload.ps1 COM5   # COMポートは環境に合わせて変更
```

詳しいセットアップ手順・ボタン操作・トラブルシューティングは [`m5stack/README.md`](m5stack/README.md) を参照してください。

## ライセンス

時刻表データは岳南電車の公開情報をもとに作成しています。  
ソースコードはMITライセンスで公開します。
