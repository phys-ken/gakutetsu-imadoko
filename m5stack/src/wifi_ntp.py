import time

NTP_TIMEOUT_MS = 15000
WIFI_TIMEOUT_MS = 10000


def _wait_connected(wlan, timeout_ms):
    t0 = time.ticks_ms()
    while not wlan.isconnected():
        if time.ticks_diff(time.ticks_ms(), t0) > timeout_ms:
            return False
        time.sleep_ms(200)
    return True


def _apply_jst(rtc):
    """NTP(UTC)設定後に +9h してRTCをJSTで上書き"""
    t = time.time() + 9 * 3600
    lt = time.localtime(t)
    rtc.datetime((lt[0], lt[1], lt[2], lt[6], lt[3], lt[4], lt[5], 0))


def sync_time(rtc, networks):
    """
    networks: [("ssid", "pass"), ...] を順に試してNTP同期する。
    成功したら True、失敗は False を返す。例外は外に出さない。
    """
    if not networks:
        return False

    # network / ntptime は呼び出し時に遅延インポート（起動時クラッシュを防ぐ）
    try:
        import network
        import ntptime
    except ImportError:
        return False

    wlan = network.WLAN(network.STA_IF)
    try:
        wlan.active(True)
        for ssid, pwd in networks:
            try:
                wlan.connect(ssid, pwd)
                if not _wait_connected(wlan, WIFI_TIMEOUT_MS):
                    wlan.disconnect()
                    continue
                t0 = time.ticks_ms()
                while time.ticks_diff(time.ticks_ms(), t0) < NTP_TIMEOUT_MS:
                    try:
                        ntptime.settime()
                        _apply_jst(rtc)
                        return True
                    except OSError:
                        time.sleep_ms(1000)
                wlan.disconnect()
            except Exception:
                pass
    except Exception:
        pass
    finally:
        try:
            wlan.active(False)
        except Exception:
            pass
    return False
