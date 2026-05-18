# SPDX-FileCopyrightText: 2024 M5Stack Technology CO LTD
# SPDX-License-Identifier: MIT
# boot.py (がくてつ用カスタム版)
#
# UIFlow2 標準の boot.py は NVS に SSID 等のキーが揃っていることを前提にしており、
# NVS が不完全だと startup() が ESP_ERR_NVS_NOT_FOUND で落ちる → main.py に到達しない。
# このカスタム版は startup/sync を try/except で囲み、失敗しても main.py に進む。
import esp32

NETWORK_TIMEOUT = 60

if __name__ == "__main__":
    nvs = esp32.NVS("uiflow")
    try:
        boot_option = nvs.get_u8("boot_option")
    except Exception:
        boot_option = 0  # NVS にキーが無ければ「main.py 直接実行」扱い

    # boot_option=0 のときは startup/sync を呼ぶ必要が無い（がくてつアプリのみ動作させる）
    if boot_option == 0:
        print("[boot.py] boot_option=0: skip startup, run main.py")
    else:
        # UIFlow ネットワーク設定モード等。NVS 欠損時は startup() が落ちるので保護
        try:
            from startup import startup
            startup(boot_option, NETWORK_TIMEOUT)
        except Exception as e:
            print("[boot.py] startup() failed:", e)
        try:
            from m5sync import sync
            sync.run()
        except Exception as e:
            print("[boot.py] sync.run() failed:", e)

    # OTA 更新ファイルがあれば main.py に上書き（UIFlow 標準動作）
    try:
        import os
        s = open("/flash/main_ota_temp.py", "rb")
        f = open("/flash/main.py", "wb")
        f.write(s.read())
        s.close()
        f.close()
        os.remove("/flash/main_ota_temp.py")
    except Exception:
        pass
