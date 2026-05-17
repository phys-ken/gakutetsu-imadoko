#!/usr/bin/env python3
"""
M5Stack 用 map_coords.py の内容を HTML でプレビューするツール。
実機なしで地図が正しく描画されるか確認できる。

Usage:
    cd m5stack/tools
    python validate_map.py
    # → validate_map.html が生成される。ブラウザで開いて確認。
"""
import sys, os, math, datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
import map_coords as mc
import schedule as sch

SCALE = 3          # 320x240 → 960x720 (見やすくするため拡大)
SCREEN_W = 320 * SCALE
SCREEN_H = 240 * SCALE
BAR_Y = 200 * SCALE

def px(x, y):
    return x * SCALE, y * SCALE

def polyline_points(pts):
    return " ".join("{},{}".format(x * SCALE, y * SCALE) for x, y in pts)

def station_circles(station_px):
    result = []
    names = ["吉原", "ジヤトコ前", "吉原本町", "本吉原", "岳南原田",
             "比奈", "岳南富士岡", "須津", "神谷", "岳南江尾"]
    for i, (sx, sy) in enumerate(station_px):
        x, y = sx * SCALE, sy * SCALE
        result.append(f'<circle cx="{x}" cy="{y}" r="12" fill="white" stroke="#888" stroke-width="1"/>')
        result.append(f'<text x="{x}" y="{y - 14}" text-anchor="middle" font-size="11" fill="#ccc">{names[i]}</text>')
    return "\n    ".join(result)

def sample_trains(now_min, sched):
    trains = sch.get_running_trains(sched, now_min)
    result = []
    for tr in trains:
        km = tr['km']
        direction = tr['direction']

        # km → screen
        km_list = mc.STATION_KM
        rd_list = mc.STATION_ROUTE_DIST
        rd = None
        for i in range(len(km_list) - 1):
            k0, k1 = km_list[i], km_list[i + 1]
            if k0 <= km <= k1:
                t = (km - k0) / (k1 - k0)
                rd = rd_list[i] + t * (rd_list[i + 1] - rd_list[i])
                break
        if rd is None:
            continue

        cumlen = mc.TRACK_CUMLEN
        track = mc.TRACK_PX
        seg_j = 0
        tx, ty = track[-1]
        for j in range(len(cumlen) - 1):
            if cumlen[j] <= rd <= cumlen[j + 1]:
                seg = cumlen[j + 1] - cumlen[j]
                tt = (rd - cumlen[j]) / seg if seg > 0 else 0
                tx = track[j][0] + tt * (track[j + 1][0] - track[j][0])
                ty = track[j][1] + tt * (track[j + 1][1] - track[j][1])
                seg_j = j
                break

        # 向き
        j = max(0, min(seg_j, len(track) - 2))
        dx = track[j + 1][0] - track[j][0]
        dy = track[j + 1][1] - track[j][1]
        angle = math.atan2(dy, dx)
        if direction == 'inbound':
            angle += math.pi

        color = "#00ff00" if direction == 'inbound' else "#ff8800"
        # SVG 三角形
        sz = 7
        s, c = math.sin(angle), math.cos(angle)
        tip = (tx + sz * c, ty + sz * s)
        bx = tx - (sz // 2) * c
        by_ = ty - (sz // 2) * s
        perp = angle + math.pi / 2
        sz2 = sz // 2
        l = (bx + sz2 * math.cos(perp), by_ + sz2 * math.sin(perp))
        r = (bx - sz2 * math.cos(perp), by_ - sz2 * math.sin(perp))

        def sp(pt):
            return f"{pt[0]*SCALE:.1f},{pt[1]*SCALE:.1f}"

        result.append(
            f'<polygon points="{sp(tip)} {sp(l)} {sp(r)}" fill="{color}" opacity="0.9"/>'
        )
        # km ラベル
        result.append(
            f'<text x="{tx*SCALE:.0f}" y="{ty*SCALE-10:.0f}" text-anchor="middle" '
            f'font-size="10" fill="{color}">km{km:.2f}</text>'
        )
    return "\n    ".join(result)

def target_marker():
    km = 2.5
    km_list = mc.STATION_KM
    rd_list = mc.STATION_ROUTE_DIST
    for i in range(len(km_list) - 1):
        k0, k1 = km_list[i], km_list[i + 1]
        if k0 <= km <= k1:
            t = (km - k0) / (k1 - k0)
            rd = rd_list[i] + t * (rd_list[i + 1] - rd_list[i])
            cumlen = mc.TRACK_CUMLEN
            track = mc.TRACK_PX
            for j in range(len(cumlen) - 1):
                if cumlen[j] <= rd <= cumlen[j + 1]:
                    seg = cumlen[j + 1] - cumlen[j]
                    tt = (rd - cumlen[j]) / seg if seg > 0 else 0
                    mx = (track[j][0] + tt * (track[j + 1][0] - track[j][0])) * SCALE
                    my = (track[j][1] + tt * (track[j + 1][1] - track[j][1])) * SCALE
                    return (f'<circle cx="{mx:.0f}" cy="{my:.0f}" r="9" '
                            f'fill="none" stroke="cyan" stroke-width="2"/>'
                            f'<text x="{mx:.0f}" y="{my-12:.0f}" text-anchor="middle" '
                            f'font-size="10" fill="cyan">km2.5</text>')
    return ""

def generate_html(out_path):
    now = datetime.datetime.now()
    now_min = now.hour * 60 + now.minute
    sched = 'holiday' if now.weekday() >= 5 else 'weekday'

    hm = "{}:{:02d}".format(now.hour, now.minute)

    events = sch.get_passage_events(sched, 2.5)
    next_in  = next((e for e in events if e['direction']=='inbound'  and e['min']>=now_min), None)
    next_out = next((e for e in events if e['direction']=='outbound' and e['min']>=now_min), None)

    def evt_str(e):
        if e is None:
            return "--:--"
        return "{} ({})".format(sch.fmt_hm(e['min']), sch.fmt_rel(now_min, e['min']))

    bar_text = (
        f"{sched.upper()[:3]} {hm} | "
        f"next km2.5: ^{evt_str(next_in)}  v{evt_str(next_out)}"
    )

    trains_svg = sample_trains(now_min, sched)
    stations_svg = station_circles(mc.STATION_PX)
    tgt_svg = target_marker()

    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>M5Stack Map Preview (320x240 x{SCALE})</title>
<style>
  body {{ background: #222; color: #ccc; font-family: monospace; }}
  .container {{ display: inline-block; border: 2px solid #555; }}
  svg {{ display: block; }}
  .info {{ font-size: 13px; margin: 8px; }}
</style>
</head>
<body>
<h2>M5Stack 地図プレビュー (320×240 を {SCALE}倍拡大)</h2>
<div class="container">
<svg width="{SCREEN_W}" height="{SCREEN_H}" style="background:#000;">
  <!-- 路線折れ線 -->
  <polyline points="{polyline_points(mc.TRACK_PX)}"
            fill="none" stroke="white" stroke-width="2"/>
  <!-- 駅 & ラベル -->
  {stations_svg}
  <!-- km2.5 対象地点 -->
  {tgt_svg}
  <!-- 走行中の列車 -->
  {trains_svg}
  <!-- ステータスバー -->
  <rect x="0" y="{BAR_Y}" width="{SCREEN_W}" height="{40*SCALE}" fill="#1a1a2e"/>
  <text x="6" y="{BAR_Y + 24}" font-size="14" fill="white">{bar_text}</text>
  <text x="6" y="{BAR_Y + 44}" font-size="11" fill="#666">[A]map  [B]next  [C]all</text>
  <!-- 画面枠 -->
  <rect x="0" y="0" width="{SCREEN_W}" height="{SCREEN_H}" fill="none"
        stroke="#555" stroke-width="2"/>
</svg>
</div>
<div class="info">
  現在時刻: {now.strftime('%Y-%m-%d %H:%M')} / {sched} ダイヤ<br>
  走行中列車: {len(sch.get_running_trains(sched, now_min))} 本<br>
  km2.5 通過イベント: {len(events)} 件 (平日 {len(sch.get_passage_events('weekday',2.5))}件 / 土休日 {len(sch.get_passage_events('holiday',2.5))}件)<br>
  駅座標:<br>
  {'<br>'.join("  {}: ({},{}) routeDist={:.0f}".format(
      n, mc.STATION_PX[i][0], mc.STATION_PX[i][1], mc.STATION_ROUTE_DIST[i])
      for i, n in enumerate(["吉原","ジヤトコ前","吉原本町","本吉原","岳南原田","比奈","岳南富士岡","須津","神谷","岳南江尾"]))}
</div>
</body>
</html>"""

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print("Wrote:", out_path)


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(script_dir, "validate_map.html")
    generate_html(out)
