import M5
from M5 import *

M5.begin()
Lcd.fillScreen(0xFFFFFF)

BK=0x000000; RD=0xFF0000; BL=0x0000FF; GR=0x888888; NV=0x1A2744; WH=0xFFFFFF

# ───────── Ruler: ticks every 16px ─────────
for x in range(0, 320, 16):
    Lcd.drawLine(x, 0, x, 5, RD)
for x, lbl in ((0,'0'),(64,'64'),(128,'128'),(192,'192'),(256,'256'),(304,'304')):
    Lcd.setTextSize(1); Lcd.setTextColor(RD, WH)
    Lcd.drawString(lbl, x+1, 0)

# ───── A: 幅テスト — 26文字のAを横幅いっぱいに並べる ─────
# 12px/ch: 26A=312px(fit);  16px/ch: 20A=320px(ぴったり);  18px/ch: 17A=306px
Lcd.setTextSize(2); Lcd.setTextColor(BK, WH)
Lcd.drawString("AAAAAAAAAAAAAAAAAAAAAAAAAA", 0, 8)   # 26個

# ───── B: textWidth 実測値を表示 ─────
wa  = Lcd.textWidth("A")
wga = Lcd.textWidth("GAKUTETSU")
wim = Lcd.textWidth("IMADOKO")
wt  = Lcd.textWidth("10:52")
Lcd.setTextSize(1); Lcd.setTextColor(BK, WH)
Lcd.drawString("A={}  GAKU={}  IMA={}  10:52={}".format(wa, wga, wim, wt), 0, 34)

# ───── C: 行高テスト — ROW_H=18で4行。重なったら高さ>18px ─────
Lcd.setTextColor(GR, WH)
Lcd.drawString("[C] row=18px: overlap => font_h > 18", 0, 46)
for i, (s, c) in enumerate([("8:00",BK), ("8:44",BL), ("9:22",BK), ("10:05",BL)]):
    yy = 56 + i * 18
    Lcd.setTextSize(2); Lcd.setTextColor(c, WH)
    Lcd.drawString(s, 0, yy)
    Lcd.drawLine(0, yy+17, 240, yy+17, 0xDDDDDD)  # 行境界

# ───── D: GAKUTETSU 幅実証 — x=0 と x=172 を並べて溢れ確認 ─────
# C末尾: y=56+3*18=110, フォント高24px worst → y=134。140から安全
Lcd.setTextSize(1); Lcd.setTextColor(GR, WH)
Lcd.drawString("[D] x=0", 0, 140)
Lcd.drawString("x=172", 172, 140)
# 仮説B(9*16=144)・仮説A(9*12=108)の終端マーカー
Lcd.setTextColor(RD, WH); Lcd.drawString("108", 98, 140)
Lcd.setTextColor(BL, WH); Lcd.drawString("144", 143, 140)

Lcd.setTextSize(2); Lcd.setTextColor(NV, WH)
Lcd.drawString("GAKUTETSU", 0, 150)    # x=0 版
Lcd.drawString("GAKUTETSU", 172, 150)  # x=172 版（右端溢れ確認）
Lcd.drawLine(108, 148, 108, 174, RD)   # 9ch*12px 終端
Lcd.drawLine(144, 148, 144, 174, BL)   # 9ch*16px 終端

# ───── E: INFO バーシミュ（新配色: 青・濃緑・赤）─────
Lcd.fillRect(0, 180, 320, 28, 0xF0F0F0)
Lcd.drawLine(0, 179, 320, 179, GR)
Lcd.setTextSize(2)
Lcd.setTextColor(0x0055CC, 0xF0F0F0)   # 青=上り
Lcd.drawString("^ 7:34", 8, 182)
Lcd.setTextColor(0x006600, 0xF0F0F0)   # 濃緑=下り
Lcd.drawString("v 7:47", 164, 182)
Lcd.setTextSize(1)
Lcd.setTextColor(GR, 0xF0F0F0)
Lcd.drawString("+4m", 14, 200); Lcd.drawString("+17m", 170, 200)

# ───── F: NAV バーシミュ ─────
Lcd.fillRect(0, 210, 320, 30, NV)
Lcd.setTextSize(1); Lcd.setTextColor(WH, NV)
Lcd.drawString("1/1 THU", 4, 223)
for oy in (-6, 0, 6):
    Lcd.fillRect(150, 225 + oy - 1, 20, 2, WH)
