import math
import time
import machine

import M5
from M5 import *  # Lcd, BtnA, BtnB, BtnC など UIFlow2 公式推奨インポート

import schedule as _s
import map_coords as _mc

# ===== 定数 =====
BLACK  = 0x0000
WHITE  = 0xFFFF
GRAY   = 0x4208   # 暗いグレー（過去の列車）
GREEN  = 0x07E0   # 上り（inbound）
ORANGE = 0xFB60   # 下り（outbound）
CYAN   = 0x07FF   # 今いる地点マーカー
YELLOW = 0xFFE0

TARGET_KM = 2.5   # 吉原本町〜ジャトコ前 中間

# 画面下部のステータスバー領域
BAR_Y = 200
BAR_H = 40

# ===== 座標変換 =====

def _km_to_screen(km):
    """km → (x, y, segment_index)。マップ上のスクリーン座標と路線の向き用インデックスを返す。"""
    km_list = _mc.STATION_KM
    rd_list = _mc.STATION_ROUTE_DIST
    # 駅区間を探す
    for i in range(len(km_list) - 1):
        k0, k1 = km_list[i], km_list[i + 1]
        if k0 <= km <= k1:
            t = (km - k0) / (k1 - k0)
            rd = rd_list[i] + t * (rd_list[i + 1] - rd_list[i])
            return _route_dist_to_screen(rd)
    # 範囲外はクランプ
    if km <= km_list[0]:
        return _mc.TRACK_PX[0][0], _mc.TRACK_PX[0][1], 0
    return _mc.TRACK_PX[-1][0], _mc.TRACK_PX[-1][1], len(_mc.TRACK_PX) - 2


def _route_dist_to_screen(rd):
    """route distance → (x, y, segment_index)"""
    cumlen = _mc.TRACK_CUMLEN
    track = _mc.TRACK_PX
    for j in range(len(cumlen) - 1):
        if cumlen[j] <= rd <= cumlen[j + 1]:
            seg = cumlen[j + 1] - cumlen[j]
            t = (rd - cumlen[j]) / seg if seg > 0 else 0
            x = track[j][0] + t * (track[j + 1][0] - track[j][0])
            y = track[j][1] + t * (track[j + 1][1] - track[j][1])
            return round(x), round(y), j
    # 末端
    return track[-1][0], track[-1][1], len(track) - 2


def _tangent_angle(seg_idx, direction):
    """seg_idx 番の線分の向き（ラジアン）。inbound は逆向き。"""
    t = _mc.TRACK_PX
    j = max(0, min(seg_idx, len(t) - 2))
    dx = t[j + 1][0] - t[j][0]
    dy = t[j + 1][1] - t[j][1]
    angle = math.atan2(dy, dx)
    if direction == 'inbound':
        angle += math.pi
    return angle


# ===== 描画ヘルパー =====

def _draw_train_arrow(x, y, angle, color):
    """向き付き三角矢印を描く（サイズ 7px）"""
    s, c = math.sin(angle), math.cos(angle)
    sz = 7
    tip_x = round(x + sz * c)
    tip_y = round(y + sz * s)
    bx = round(x - (sz // 2) * c)
    by = round(y - (sz // 2) * s)
    perp = angle + math.pi / 2
    sz2 = sz // 2
    l_x = round(bx + sz2 * math.cos(perp))
    l_y = round(by + sz2 * math.sin(perp))
    r_x = round(bx - sz2 * math.cos(perp))
    r_y = round(by - sz2 * math.sin(perp))
    Lcd.fillTriangle(tip_x, tip_y, l_x, l_y, r_x, r_y, color)


def _draw_map_base():
    """路線と駅をスクリーンに描く（フレームごとに再描画）"""
    # 路線折れ線
    t = _mc.TRACK_PX
    for i in range(len(t) - 1):
        Lcd.drawLine(t[i][0], t[i][1], t[i + 1][0], t[i + 1][1], WHITE)
    # 駅（白丸）
    for sx, sy in _mc.STATION_PX:
        Lcd.fillCircle(sx, sy, 4, WHITE)
    # 対象地点マーカー（シアン丸）
    mx, my, _ = _km_to_screen(TARGET_KM)
    Lcd.fillCircle(mx, my, 3, CYAN)


def _draw_status_bar(sched, now_min, n_in, n_out):
    """画面下部のステータスバーを描く"""
    Lcd.fillRect(0, BAR_Y, 320, BAR_H, 0x1082)  # 暗いグレー帯
    hh = now_min // 60
    mm = now_min % 60
    time_str = "{:d}:{:02d}".format(hh, mm)
    label = "HLD" if sched == 'holiday' else "WKD"
    Lcd.setTextColor(WHITE, 0x1082)
    Lcd.setTextSize(1)
    Lcd.drawString("{} {}".format(label, time_str), 4, BAR_Y + 4)
    Lcd.setTextColor(GREEN, 0x1082)
    Lcd.drawString("^{:d}".format(n_in), 100, BAR_Y + 4)
    Lcd.setTextColor(ORANGE, 0x1082)
    Lcd.drawString("v{:d}".format(n_out), 130, BAR_Y + 4)
    Lcd.setTextColor(GRAY, 0x1082)
    Lcd.drawString("[A]map [B]next [C]all", 4, BAR_Y + 20)


# ===== ビュー描画 =====

def draw_map(sched, now_min):
    Lcd.fillScreen(BLACK)
    _draw_map_base()

    trains = _s.get_running_trains(sched, now_min)
    n_in = n_out = 0
    for tr in trains:
        x, y, seg = _km_to_screen(tr['km'])
        angle = _tangent_angle(seg, tr['direction'])
        color = GREEN if tr['direction'] == 'inbound' else ORANGE
        _draw_train_arrow(x, y, angle, color)
        if tr['direction'] == 'inbound':
            n_in += 1
        else:
            n_out += 1

    _draw_status_bar(sched, now_min, n_in, n_out)


def draw_next(sched, now_min):
    Lcd.fillScreen(BLACK)
    events = _s.get_passage_events(sched, TARGET_KM)
    # 現在時刻以降の最初の上り・下りを探す
    next_in = next_out = None
    for e in events:
        if e['min'] >= now_min:
            if next_in is None and e['direction'] == 'inbound':
                next_in = e
            if next_out is None and e['direction'] == 'outbound':
                next_out = e
        if next_in and next_out:
            break

    Lcd.setTextColor(WHITE, BLACK)
    Lcd.setTextSize(2)
    Lcd.drawString("km {:.1f}".format(TARGET_KM), 8, 8)
    Lcd.setTextSize(1)
    Lcd.drawString("next train", 8, 36)

    y = 60
    for direction, ev, color in [("inbound  ^", next_in, GREEN),
                                   ("outbound v", next_out, ORANGE)]:
        Lcd.setTextColor(color, BLACK)
        if ev:
            hm = _s.fmt_hm(ev['min'])
            rel = _s.fmt_rel(now_min, ev['min'])
            Lcd.drawString("{}: {} ({})".format(direction, hm, rel), 8, y)
        else:
            Lcd.drawString("{}: --:--".format(direction), 8, y)
        y += 24

    _draw_status_bar(sched, now_min, 0, 0)


def _windowed(evs, now_min, past=2, total=10):
    """現在時刻前後の window を返す: 過去 past 件 + 未来 (total-past) 件。"""
    future_idx = next((i for i, e in enumerate(evs) if e['min'] >= now_min), len(evs))
    start = max(0, future_idx - past)
    return evs[start:start + total]


def draw_all(sched, now_min):
    Lcd.fillScreen(BLACK)
    events = _s.get_passage_events(sched, TARGET_KM)

    Lcd.setTextColor(WHITE, BLACK)
    Lcd.setTextSize(2)
    Lcd.drawString("km {:.1f}".format(TARGET_KM), 8, 4)
    Lcd.setTextSize(1)

    # 2列レイアウト: 左=上り、右=下り
    in_events  = sorted([e for e in events if e['direction'] == 'inbound'],  key=lambda e: e['min'])
    out_events = sorted([e for e in events if e['direction'] == 'outbound'], key=lambda e: e['min'])

    col_x      = [4,   164]
    col_events = [_windowed(in_events, now_min), _windowed(out_events, now_min)]
    col_colors = [GREEN, ORANGE]
    col_labels = ["^ up", "v down"]

    for evs, cx, color, lbl in zip(col_events, col_x, col_colors, col_labels):
        Lcd.setTextColor(color, BLACK)
        Lcd.drawString(lbl, cx, 28)
        y = 44
        for e in evs:
            fg = GRAY if e['min'] < now_min else color
            Lcd.setTextColor(fg, BLACK)
            Lcd.drawString(_s.fmt_hm(e['min']), cx, y)
            y += 14

    _draw_status_bar(sched, now_min, 0, 0)


# ===== メインループ =====

def run():
    M5.begin()
    Lcd.fillScreen(BLACK)

    rtc = machine.RTC()

    # RTC が初期化されていない場合は暫定値を設定（WiFi同期実装まで）
    dt = rtc.datetime()
    if dt[0] < 2020:
        # (year, month, day, weekday, hour, min, sec, subsec)
        # weekday: 0=Mon … 6=Sun
        rtc.datetime((2026, 5, 17, 6, 14, 0, 0, 0))

    state = 'map'
    last_draw_state = None
    last_min = -1

    while True:
        M5.update()
        if BtnA.wasPressed():
            state = 'map'
        elif BtnB.wasPressed():
            state = 'next'
        elif BtnC.wasPressed():
            state = 'all'

        dt = rtc.datetime()
        now_min = dt[4] * 60 + dt[5]
        sched = _s.get_schedule_type(dt)

        # 状態変化か毎分（MAP: 列車位置更新 / NEXT: あと何分更新 / ALL: 過去グレー更新）
        if state != last_draw_state or now_min != last_min:
            if state == 'map':
                draw_map(sched, now_min)
            elif state == 'next':
                draw_next(sched, now_min)
            elif state == 'all':
                draw_all(sched, now_min)
            last_draw_state = state
            last_min = now_min

        time.sleep_ms(200)


run()
