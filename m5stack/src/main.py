import math
import time
import machine

import M5
from M5 import *

import schedule as _s
import map_coords as _mc
try:
    import wifi_ntp
    _WIFI_AVAILABLE = True
except Exception:
    wifi_ntp = None
    _WIFI_AVAILABLE = False

# ── 観測スポット (local_config.py がなければデフォルト) ──
try:
    from local_config import TARGET_KM as _DEFAULT_KM
except ImportError:
    _DEFAULT_KM = 2.5

# ── WiFi 接続情報 (local_config.py に WIFI_NETWORKS がなければ空) ──
try:
    from local_config import WIFI_NETWORKS
except ImportError:
    WIFI_NETWORKS = []

# ── user_prefs.json から TARGET_KM を復元（なければデフォルト） ──
try:
    import ujson
    with open('user_prefs.json', 'r') as _f:
        _prefs = ujson.load(_f)
    TARGET_KM = float(_prefs.get('target_km', _DEFAULT_KM))
except Exception:
    TARGET_KM = _DEFAULT_KM


def _save_target_km():
    try:
        import ujson
        with open('user_prefs.json', 'w') as f:
            ujson.dump({'target_km': TARGET_KM}, f)
    except Exception:
        pass

# ── Colors (RGB888) ──
BG     = 0xFFFFFF  # 白
BLACK  = 0x000000
GRAY   = 0x888888
LGRAY  = 0xF0F0F0  # INFO バー背景
ROUTE  = 0x444444  # 路線線色
RED    = 0xDD2200  # ターゲットマーカー専用
INBND  = 0x0055CC  # 上り列車 (青)
OUTBND = 0x006600  # 下り列車 (濃い緑)
NAVBG  = 0x1A2744  # ナビ／ヘッダ背景 (ネイビー)
DKGRAY = 0x555555  # 相対時刻テキスト

INFO_H       = 36   # 上部 INFO バー高さ (y=0..35): size2(30px)+上下3px余白
MAP_Y_OFFSET = 8    # 地図全体を下方向にシフト: 北端駅(y=34)が完全に見えるよう余裕を持たせる
NAV_Y  = 204   # ナビバー上端
NAV_H  = 36    # 204+36=240

# ── Font metrics (Lcd.fontHeight 実測値) ──
FH2 = 30   # setTextSize(2) 実フォント高
FH1 = 15   # setTextSize(1) 実フォント高
PAD = 2    # 行間最小余白
ROW_H_SZ2 = FH2 + PAD  # 32
ROW_H_SZ1 = FH1 + 1    # 16

ST_HOME  = 0
ST_MENU  = 1
ST_TABLE = 2
ST_WIFI  = 3

ARROW_SZ  = 14
ARROW_PAD = ARROW_SZ + 3   # 端からこれ以内なら矢印スキップ

WDAYS = ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')


# ── RTC ──
def _jst(rtc):
    dt = rtc.datetime()  # (year,month,day,weekday,hour,min,sec,subsec)
    return dt[4] * 60 + dt[5], dt


# ── 座標変換 ──

def _km_to_screen(km):
    km_list = _mc.STATION_KM
    rd_list = _mc.STATION_ROUTE_DIST
    for i in range(len(km_list) - 1):
        k0, k1 = km_list[i], km_list[i + 1]
        if k0 <= km <= k1:
            t  = (km - k0) / (k1 - k0)
            rd = rd_list[i] + t * (rd_list[i + 1] - rd_list[i])
            return _route_dist_to_screen(rd)
    if km <= km_list[0]:
        return _mc.TRACK_PX[0][0], _mc.TRACK_PX[0][1] + MAP_Y_OFFSET, 0
    return _mc.TRACK_PX[-1][0], _mc.TRACK_PX[-1][1] + MAP_Y_OFFSET, len(_mc.TRACK_PX) - 2


def _route_dist_to_screen(rd):
    cumlen = _mc.TRACK_CUMLEN
    track  = _mc.TRACK_PX
    for j in range(len(cumlen) - 1):
        if cumlen[j] <= rd <= cumlen[j + 1]:
            seg = cumlen[j + 1] - cumlen[j]
            t   = (rd - cumlen[j]) / seg if seg > 0 else 0
            x   = track[j][0] + t * (track[j + 1][0] - track[j][0])
            y   = track[j][1] + t * (track[j + 1][1] - track[j][1])
            return round(x), round(y) + MAP_Y_OFFSET, j
    return track[-1][0], track[-1][1] + MAP_Y_OFFSET, len(track) - 2


def _tangent_angle(seg_idx, direction):
    t = _mc.TRACK_PX
    j = max(0, min(seg_idx, len(t) - 2))
    dx = t[j + 1][0] - t[j][0]
    dy = t[j + 1][1] - t[j][1]
    angle = math.atan2(dy, dx)
    if direction == 'inbound':
        angle += math.pi
    return angle


# ── 描画ヘルパー ──

def _arrow(x, y, angle, color):
    if (x < ARROW_PAD or x > 320 - ARROW_PAD or
            y < INFO_H + ARROW_PAD or y > NAV_Y - ARROW_PAD):
        return
    s, c = math.sin(angle), math.cos(angle)
    perp = angle + math.pi / 2
    sz = ARROW_SZ
    for osz, col in ((sz + 3, BLACK), (sz, color)):
        h   = osz // 2
        tip = (round(x + osz * c), round(y + osz * s))
        bx  = round(x - h * c)
        by  = round(y - h * s)
        lft = (round(bx + h * math.cos(perp)), round(by + h * math.sin(perp)))
        rgt = (round(bx - h * math.cos(perp)), round(by - h * math.sin(perp)))
        Lcd.fillTriangle(tip[0], tip[1], lft[0], lft[1], rgt[0], rgt[1], col)


def _thick_route():
    t = _mc.TRACK_PX
    for i in range(len(t) - 1):
        x0, y0 = t[i][0],     t[i][1]     + MAP_Y_OFFSET
        x1, y1 = t[i + 1][0], t[i + 1][1] + MAP_Y_OFFSET
        Lcd.drawLine(x0,     y0,     x1,     y1,     ROUTE)
        Lcd.drawLine(x0 + 1, y0,     x1 + 1, y1,     ROUTE)
        if y0 + 1 >= INFO_H:
            Lcd.drawLine(x0, y0 + 1, x1, y1 + 1, ROUTE)


def _nav_bar(state, dt):
    Lcd.fillRect(0, NAV_Y, 320, NAV_H, NAVBG)
    Lcd.drawLine(107, NAV_Y, 107, 240, GRAY)
    Lcd.drawLine(213, NAV_Y, 213, 240, GRAY)
    cy = NAV_Y + NAV_H // 2  # 222

    # A アイコン (cx=53)
    if state == ST_HOME:
        # ← (左矢印)
        Lcd.fillTriangle(43, cy, 63, cy - 10, 63, cy + 10, BG)
    elif state in (ST_MENU, ST_TABLE):
        Lcd.fillTriangle(53, cy - 10, 43, cy + 8, 63, cy + 8, BG)

    # B アイコン (cx=160)
    if state == ST_HOME:
        # km X.X を中央表示
        Lcd.setTextSize(1)
        km_str = "km {:.1f}".format(TARGET_KM)
        tw = Lcd.textWidth(km_str)
        Lcd.setTextColor(BG, NAVBG)
        Lcd.drawString(km_str, 160 - tw // 2, cy - 7)
        # ハンバーガーアイコンは省略（km表示で領域使用）
    elif state == ST_TABLE:
        Lcd.fillTriangle(150, cy, 170, cy - 10, 170, cy + 10, BG)
    else:
        Lcd.drawLine(150, cy + 2, 156, cy + 9, BG)
        Lcd.drawLine(151, cy + 2, 157, cy + 9, BG)
        Lcd.drawLine(156, cy + 9, 170, cy - 5, BG)
        Lcd.drawLine(157, cy + 9, 171, cy - 5, BG)

    # C アイコン (cx=266)
    if state == ST_HOME:
        # → (右矢印)
        Lcd.fillTriangle(277, cy, 257, cy - 10, 257, cy + 10, BG)
    elif state in (ST_MENU, ST_TABLE):
        Lcd.fillTriangle(266, cy + 10, 256, cy - 8, 276, cy - 8, BG)
    # ST_WIFI: C 不活性 → アイコンなし



def _info_bar(sched, now_min, dt):
    Lcd.fillRect(0, 0, 320, INFO_H, NAVBG)

    evs      = _s.get_passage_events(sched, TARGET_KM)
    upcoming = sorted([e for e in evs if e['min'] >= now_min], key=lambda e: e['min'])[:2]

    # ── 左: 直近2本を「Xmin(H:MM)」形式・時刻順 ──
    # 1本目: minutes=size2(y=3)、(HH:MM)=size1(y=18)  ← 下端がINFO_H内で揃う
    # 2本目: 全体size1(y=18)
    Y_BIG   = 3   # size2下端 = 3+30=33 < INFO_H=36 ✓
    Y_SMALL = 18  # size1下端 = 18+15=33 — size2と底揃え
    x = 4
    for idx, e in enumerate(upcoming):
        color     = 0x88BBFF if e['direction'] == 'inbound' else 0x66DD66
        delta     = max(0, round(e['min'] - now_min))
        mins_str  = "{}min".format(delta)
        paren_str = "({})".format(_s.fmt_hm(e['min']))
        if idx == 0:
            Lcd.setTextSize(2)
            Lcd.setTextColor(color, NAVBG)
            Lcd.drawString(mins_str, x, Y_BIG)
            w = Lcd.textWidth(mins_str)
            Lcd.setTextSize(1)
            Lcd.setTextColor(color, NAVBG)
            Lcd.drawString(paren_str, x + w, Y_SMALL)
            x += w + Lcd.textWidth(paren_str) + 10
        else:
            Lcd.setTextSize(1)
            label = mins_str + paren_str
            Lcd.setTextColor(color, NAVBG)
            Lcd.drawString(label, x, Y_SMALL)
            x += Lcd.textWidth(label)

    # ── 右: 日付(row1) + 現在時刻(row2) (size1) ──
    Lcd.setTextSize(1)
    date_str = "{}/{} {}".format(dt[1], dt[2], WDAYS[dt[3]])
    time_str = "{:02d}:{:02d}".format(now_min // 60, now_min % 60)
    Lcd.setTextColor(0xAAAAAA, NAVBG)
    Lcd.drawString(date_str, 320 - Lcd.textWidth(date_str) - 4, 3)
    Lcd.setTextColor(0xDDDDDD, NAVBG)
    Lcd.drawString(time_str, 320 - Lcd.textWidth(time_str) - 4, 21)


# ── 各画面 ──

def draw_home(sched, now_min, dt):
    Lcd.fillScreen(BG)
    _thick_route()

    # 駅マル (MAP_Y_OFFSET 適用、INFO バーと重なる駅はスキップ)
    for sx, sy in _mc.STATION_PX:
        sy_off = sy + MAP_Y_OFFSET
        if sy_off < INFO_H + 5:
            continue
        Lcd.fillCircle(sx, sy_off, 5, NAVBG)
        Lcd.fillCircle(sx, sy_off, 3, BG)

    # ターゲットマーカー（塗り赤・黒縁）
    mx, my, _ = _km_to_screen(TARGET_KM)
    Lcd.fillCircle(mx, my, 8, BLACK)
    Lcd.fillCircle(mx, my, 6, RED)

    # 列車矢印
    trains = _s.get_running_trains(sched, now_min)
    for tr in trains:
        x, y, seg = _km_to_screen(tr['km'])
        color = INBND if tr['direction'] == 'inbound' else OUTBND
        _arrow(x, y, _tangent_angle(seg, tr['direction']), color)

    # ブランド表記（右下空き領域）: textWidth で動的右寄せ、8px マージン
    Lcd.setTextSize(2)
    Lcd.setTextColor(NAVBG, BG)
    Lcd.drawString("GAKUTETSU", 320 - Lcd.textWidth("GAKUTETSU") - 8, 138)
    Lcd.drawString("IMADOKO",   320 - Lcd.textWidth("IMADOKO")   - 8, 170)

    _info_bar(sched, now_min, dt)

    _nav_bar(ST_HOME, dt)


def draw_menu(sched, now_min, dt, sel):
    Lcd.fillScreen(BG)
    Lcd.fillRect(0, 0, 320, 36, NAVBG)
    Lcd.setTextColor(BG, NAVBG)
    Lcd.setTextSize(2)
    Lcd.drawString("MENU", 10, 3)

    items = ('Timetable', 'Sync Time', 'WiFi Info', 'Back')
    for i, lbl in enumerate(items):
        y  = 40 + i * 40
        bg = LGRAY if i == sel else BG
        Lcd.fillRect(4, y - 2, 312, 32, bg)
        if i == sel:
            Lcd.fillRect(4, y - 2, 6, 32, INBND)
        Lcd.setTextColor(BLACK, bg)
        Lcd.setTextSize(2)
        Lcd.drawString(lbl, 18, y)

    _nav_bar(ST_MENU, dt)


def draw_timetable(sched, now_min, dt, scroll):
    """
    y=0..21    ヘッダ (22px)
    y=22..40   列ヘッダ (19px)
    y=41..200  コンテンツ (size1×10行=16px×10=160px)
    y=204..239 ナビバー
    """
    Lcd.fillScreen(BG)
    events  = _s.get_passage_events(sched, TARGET_KM)
    in_evs  = sorted([e for e in events if e['direction'] == 'inbound'],  key=lambda e: e['min'])
    out_evs = sorted([e for e in events if e['direction'] == 'outbound'], key=lambda e: e['min'])
    max_len = max(len(in_evs), len(out_evs), 1)

    ROWS      = 10
    scroll    = max(0, min(scroll, max(0, max_len - ROWS)))
    CONTENT_Y = 41

    # ヘッダ
    Lcd.fillRect(0, 0, 320, 22, NAVBG)
    Lcd.setTextColor(BG, NAVBG)
    Lcd.setTextSize(1)
    Lcd.drawString("{}/{} {}  km{:.1f}  ({:d}/{:d})".format(
        dt[1], dt[2], WDAYS[dt[3]], TARGET_KM, scroll + 1, max_len), 4, 7)

    # 列ヘッダ (高さ19px: テキスト15px + 上下2px余白)
    Lcd.fillRect(0,   22, 160, 19, INBND)
    Lcd.fillRect(160, 22, 160, 19, OUTBND)
    Lcd.setTextSize(1)
    Lcd.setTextColor(BG, INBND)
    Lcd.drawString("^ Inbound", 4, 24)
    Lcd.setTextColor(BG, OUTBND)
    Lcd.drawString("v Outbound", 164, 24)

    # 縦区切り線
    Lcd.drawLine(160, 22, 160, NAV_Y, GRAY)

    # 時刻行: 全行 size1。次の未来列車=赤、過去=GRAY、それ以外=BLACK
    Lcd.setTextSize(1)
    for evs, cx in ((in_evs, 4), (out_evs, 164)):
        visible = evs[scroll:scroll + ROWS]

        # 表示範囲内で最初の未来列車インデックスを求める
        next_idx = next(
            (i for i, e in enumerate(visible) if e['min'] >= now_min), None)

        ry        = CONTENT_Y
        prev_past = None
        for idx, e in enumerate(visible):
            is_past = e['min'] < now_min
            if prev_past is True and not is_past:
                Lcd.drawLine(cx, ry - 1, cx + 154, ry - 1, GRAY)
            if is_past:
                color = GRAY
            elif idx == next_idx:
                color = RED
            else:
                color = BLACK
            Lcd.setTextColor(color, BG)
            Lcd.drawString(_s.fmt_hm(e['min']), cx, ry)
            ry       += ROW_H_SZ1
            prev_past = is_past

    _nav_bar(ST_TABLE, dt)



def draw_wifi_info(dt):
    Lcd.fillScreen(BG)
    Lcd.fillRect(0, 0, 320, 22, NAVBG)
    Lcd.setTextColor(BG, NAVBG)
    Lcd.setTextSize(1)
    Lcd.drawString("WiFi INFO", 4, 7)

    n = len(WIFI_NETWORKS)
    Lcd.setTextSize(1)
    if n == 0:
        Lcd.setTextColor(0xCC4400, BG)
        Lcd.drawString("No WiFi configured", 4, 28)
    else:
        Lcd.setTextColor(0x007700, BG)
        Lcd.drawString("{} network(s) registered:".format(n), 4, 28)
        for i, (ssid, _) in enumerate(WIFI_NETWORKS[:3]):
            Lcd.setTextColor(GRAY, BG)
            Lcd.drawString("  {}. {}".format(i + 1, ssid[:30]), 4, 44 + i * 14)

    Lcd.drawLine(0, 92, 320, 92, LGRAY)
    Lcd.setTextColor(DKGRAY, BG)
    Lcd.drawString("To add WiFi:", 4, 96)
    Lcd.drawString("1. Edit local_config.py", 4, 110)
    Lcd.drawString("   WIFI_NETWORKS = [", 4, 124)
    Lcd.drawString("     (\"SSID\", \"PASS\"),", 4, 138)
    Lcd.drawString("   ]", 4, 152)
    Lcd.drawString("2. Run upload.ps1 COM5", 4, 166)
    Lcd.drawString("3. Reset M5Stack", 4, 180)

    _nav_bar(ST_WIFI, dt)


# ── WiFi同期ヘルパー ──

def _draw_sync_screen(msg):
    Lcd.fillRect(0, 0, 320, 36, NAVBG)
    Lcd.setTextSize(1)
    Lcd.setTextColor(BG, NAVBG)
    Lcd.drawString(msg, 8, 11)


def _do_wifi_sync(rtc):
    """WiFi + NTP 同期を試みる。失敗してもクラッシュしない。"""
    if not _WIFI_AVAILABLE:
        _draw_sync_screen("WiFi module N/A")
        time.sleep_ms(1000)
        return
    _draw_sync_screen("WiFi connecting...")
    ok = wifi_ntp.sync_time(rtc, WIFI_NETWORKS)
    if ok:
        _draw_sync_screen("Time synced!")
    else:
        _draw_sync_screen("Sync failed - using RTC")
    time.sleep_ms(1200)


# ── メインループ ──

def run():
    global TARGET_KM
    M5.begin()
    Lcd.fillScreen(BG)

    rtc = machine.RTC()

    # RTC が未設定（year < 2025）なら flash 時刻をフォールバックに使う
    try:
        from boot_time import FLASH_DT
        if rtc.datetime()[0] < 2025:
            rtc.datetime(FLASH_DT)
    except Exception:
        pass

    # WiFi同期は起動時に自動実行しない（mpremote 接続のためブロッキング処理を起動時に置かない）
    # 同期は B長押し または メニュー "Sync Time" から手動で実行

    state    = ST_HOME
    menu_sel = 0
    scroll   = 0
    prev_min = -1
    dirty    = True
    last_sync_day = -1

    # 長押しタイマー (ticks_ms、0=未押下)
    a_held_t    = 0
    c_held_t    = 0
    a_repeat_t  = 0
    c_repeat_t  = 0
    b_press_tick = 0  # B長押し判定用（HOMEのみ使用）

    LONG_MS   = 500   # 長押し判定閾値 (ms)
    REPEAT_MS = 150   # オートリピート間隔 (ms)

    while True:
        M5.update()
        now_t = time.ticks_ms()

        a_press   = BtnA.wasPressed()
        b_press   = BtnB.wasPressed()
        b_release = BtnB.wasReleased()
        c_press   = BtnC.wasPressed()
        a_down    = BtnA.isPressed()
        b_down    = BtnB.isPressed()
        c_down    = BtnC.isPressed()

        # A/C 長押し開始時刻を記録
        if a_press:    a_held_t = now_t
        if c_press:    c_held_t = now_t
        if not a_down: a_held_t = 0; a_repeat_t = 0
        if not c_down: c_held_t = 0; c_repeat_t = 0
        # B: HOME画面でのみ長押し判定に使う（他状態からのリリースで誤発火しないよう）
        if b_press and state == ST_HOME: b_press_tick = now_t
        if not b_down and not b_release: b_press_tick = 0

        if state == ST_HOME:
            # B長押し (800ms) → 強制WiFi同期
            if b_down and b_press_tick and time.ticks_diff(now_t, b_press_tick) >= 800:
                b_press_tick = 0
                _do_wifi_sync(rtc)
                dirty = True
            # B短押しリリース → メニュー
            elif b_release and b_press_tick:
                b_press_tick = 0
                state = ST_MENU; menu_sel = 0; dirty = True
            elif b_release:
                b_press_tick = 0

            # A: 短押し -0.1、長押しオートリピート
            if a_press:
                TARGET_KM = max(0.0, round(TARGET_KM - 0.1, 1))
                _save_target_km(); dirty = True
            elif a_down and a_held_t and time.ticks_diff(now_t, a_held_t) >= LONG_MS:
                if a_repeat_t == 0 or time.ticks_diff(now_t, a_repeat_t) >= REPEAT_MS:
                    TARGET_KM = max(0.0, round(TARGET_KM - 0.1, 1))
                    _save_target_km(); dirty = True
                    a_repeat_t = now_t

            # C: 短押し +0.1、長押しオートリピート
            if c_press:
                TARGET_KM = min(20.0, round(TARGET_KM + 0.1, 1))
                _save_target_km(); dirty = True
            elif c_down and c_held_t and time.ticks_diff(now_t, c_held_t) >= LONG_MS:
                if c_repeat_t == 0 or time.ticks_diff(now_t, c_repeat_t) >= REPEAT_MS:
                    TARGET_KM = min(20.0, round(TARGET_KM + 0.1, 1))
                    _save_target_km(); dirty = True
                    c_repeat_t = now_t

        elif state == ST_MENU:
            if a_press:
                menu_sel = (menu_sel - 1) % 4; dirty = True
            elif c_press:
                menu_sel = (menu_sel + 1) % 4; dirty = True
            elif b_press:
                if menu_sel == 0:   # Timetable
                    state     = ST_TABLE
                    now2, dt2 = _jst(rtc)
                    sched2    = _s.get_schedule_type(dt2)
                    evs2      = _s.get_passage_events(sched2, TARGET_KM)
                    in2       = sorted([e for e in evs2 if e['direction'] == 'inbound'],
                                       key=lambda e: e['min'])
                    fi     = next((i for i, e in enumerate(in2) if e['min'] >= now2), 0)
                    scroll = max(0, fi - 2)
                elif menu_sel == 1: # Sync Time
                    _do_wifi_sync(rtc)
                elif menu_sel == 2: # WiFi Info
                    state = ST_WIFI
                else:               # Back
                    state = ST_HOME
                dirty = True

        elif state == ST_WIFI:
            if b_press:
                state = ST_MENU; dirty = True

        elif state == ST_TABLE:
            # A: 短押し / 長押しオートリピートで上スクロール
            if a_press:
                scroll = max(0, scroll - 1); dirty = True
            elif a_down and a_held_t and time.ticks_diff(now_t, a_held_t) >= LONG_MS:
                if a_repeat_t == 0 or time.ticks_diff(now_t, a_repeat_t) >= REPEAT_MS:
                    scroll = max(0, scroll - 1); dirty = True
                    a_repeat_t = now_t
            # C: 下スクロール
            if c_press:
                scroll += 1; dirty = True
            elif c_down and c_held_t and time.ticks_diff(now_t, c_held_t) >= LONG_MS:
                if c_repeat_t == 0 or time.ticks_diff(now_t, c_repeat_t) >= REPEAT_MS:
                    scroll += 1; dirty = True
                    c_repeat_t = now_t
            if b_press:
                state = ST_MENU; dirty = True

        now_min, dt = _jst(rtc)
        sched       = _s.get_schedule_type(dt)

        # 毎朝4:00の自動WiFi同期（1日1回）
        if now_min == 4 * 60 and dt[2] != last_sync_day:
            last_sync_day = dt[2]
            _do_wifi_sync(rtc)
            dirty = True

        if state == ST_HOME and now_min != prev_min:
            dirty = True

        if dirty:
            if state == ST_HOME:
                draw_home(sched, now_min, dt)
            elif state == ST_MENU:
                draw_menu(sched, now_min, dt, menu_sel)
            elif state == ST_TABLE:
                draw_timetable(sched, now_min, dt, scroll)
            elif state == ST_WIFI:
                draw_wifi_info(dt)
            dirty    = False
            prev_min = now_min

        time.sleep_ms(100)


try:
    run()
except Exception as exc:
    import sys
    try:
        Lcd.fillScreen(0xFF4444)
        Lcd.setTextColor(0xFFFFFF, 0xFF4444)
        Lcd.setTextSize(1)
        msg = str(exc)
        for i in range(0, min(len(msg), 168), 42):
            Lcd.drawString(msg[i:i + 42], 4, 8 + (i // 42) * 12)
        Lcd.drawString("--- HALTED ---", 4, 68)
    except:
        pass
    sys.print_exception(exc)
    time.sleep(3)  # 3秒後に再起動（mpremote が割り込めるよう短めに）
