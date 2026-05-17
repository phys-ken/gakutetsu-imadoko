# schedule.js のポート。M5Stack 固有モジュールは一切使わないため PC 上でも動作する。
# 時刻はすべて「午前0時からの分数（整数）」で扱う。

import data as _d

# 各テーブルを {direction, km_list, trains} の形に整形
# trains は [[min_stop0, min_stop1, ...], ...] の 2D リスト

_TABLES = {
    'weekday': {
        'inbound':  {'km': _d.INBOUND_KM,  'rows': _d.WEEKDAY_INBOUND},
        'outbound': {'km': _d.STATION_KM,  'rows': _d.WEEKDAY_OUTBOUND},
    },
    'holiday': {
        'inbound':  {'km': _d.INBOUND_KM,  'rows': _d.HOLIDAY_INBOUND},
        'outbound': {'km': _d.STATION_KM,  'rows': _d.HOLIDAY_OUTBOUND},
    },
}


def get_schedule_type(rtc_datetime):
    """rtc.datetime() の戻り値 (y,m,d,wd,h,min,s,sub) を受け取り 'weekday'/'holiday' を返す。"""
    y, mo, day, wd = rtc_datetime[0], rtc_datetime[1], rtc_datetime[2], rtc_datetime[3]
    date_str = "{:04d}-{:02d}-{:02d}".format(y, mo, day)
    # wd: UIFlow2 では 0=月,1=火,...,6=日 (MicroPython datetime weekday)
    if wd >= 5 or date_str in _d.HOLIDAYS_2026:
        return 'holiday'
    return 'weekday'


def _lerp(a, b, t):
    return a + (b - a) * t


def _compute_live_km(km_list, row, now_min):
    """1本の列車の現在 km を返す。走行中でなければ None。"""
    first, last = row[0], row[-1]
    if now_min < first or now_min > last:
        return None
    for i in range(len(row) - 1):
        t0, t1 = row[i], row[i + 1]
        k0, k1 = km_list[i], km_list[i + 1]
        if t0 <= now_min <= t1:
            if t1 == t0:
                return k0
            ratio = (now_min - t0) / (t1 - t0)
            return _lerp(k0, k1, ratio)
    return None


def get_running_trains(schedule_type, now_min):
    """
    走行中の列車一覧を返す。
    戻り値: [{'km': float, 'direction': 'inbound'|'outbound'}, ...]
    """
    result = []
    for direction, tbl in _TABLES[schedule_type].items():
        km_list = tbl['km']
        for row in tbl['rows']:
            km = _compute_live_km(km_list, row, now_min)
            if km is not None:
                result.append({'km': km, 'direction': direction})
    return result


def _compute_passage_min(km_list, row, target_km):
    """
    1本の列車が target_km を通過する時刻（分）を返す。通過しない場合は None。
    km_list の順序（inbound は降順）に関わらず min/max で区間判定する。
    """
    for i in range(len(row) - 1):
        k0, k1 = km_list[i], km_list[i + 1]
        lo, hi = (k0, k1) if k0 < k1 else (k1, k0)
        if lo <= target_km <= hi:
            if k1 == k0:
                return row[i]
            ratio = (target_km - k0) / (k1 - k0)
            return _lerp(row[i], row[i + 1], ratio)
    return None


def get_passage_events(schedule_type, target_km):
    """
    指定 km を通過する全列車の時刻リストを返す（時刻順ソート済み）。
    戻り値: [{'min': float, 'direction': 'inbound'|'outbound'}, ...]
    """
    result = []
    for direction, tbl in _TABLES[schedule_type].items():
        km_list = tbl['km']
        for row in tbl['rows']:
            t = _compute_passage_min(km_list, row, target_km)
            if t is not None:
                result.append({'min': t, 'direction': direction})
    result.sort(key=lambda e: e['min'])
    return result


def fmt_hm(minutes_float):
    """分数 → 'H:MM' 文字列"""
    m = round(minutes_float)
    return "{:d}:{:02d}".format(m // 60, m % 60)


def fmt_rel(now_min, target_min_float):
    """あと何分 / 何分前 の文字列を返す"""
    delta = round(target_min_float) - now_min
    if delta == 0:
        return "now"
    sign = "+" if delta > 0 else "-"
    total = abs(delta)
    h = total // 60
    m = total % 60
    if h > 0:
        return "{}{:d}h{:02d}m".format(sign, h, m)
    return "{}{:d}m".format(sign, m)


# ===== PC 上でのセルフテスト =====
if __name__ == '__main__':
    import datetime

    now = datetime.datetime.now()
    now_min = now.hour * 60 + now.minute
    sched = 'holiday' if now.weekday() >= 5 else 'weekday'
    print("schedule:", sched, "  now:", fmt_hm(now_min))

    print("\n--- running trains ---")
    trains = get_running_trains(sched, now_min)
    for t in trains:
        print("  km={:.2f}  dir={}".format(t['km'], t['direction']))
    print("total:", len(trains))

    print("\n--- passage events at km=2.5 ---")
    events = get_passage_events(sched, 2.5)
    for e in events[:6]:
        rel = fmt_rel(now_min, e['min'])
        print("  {} {}  ({})".format(fmt_hm(e['min']), e['direction'], rel))
    print("total:", len(events))
