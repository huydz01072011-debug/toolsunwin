import asyncio
import websockets
import json
import threading
import time
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template_string
from flask_cors import CORS
import os
import signal
import sys
import socket
import requests
import re
import random
from collections import deque, defaultdict

app = Flask(__name__)
CORS(app)
PORT = int(os.environ.get('PORT', 1234))

# ---------- TỰ ĐỘNG LẤY URL ----------
def get_public_base_url():
    base = os.environ.get('RENDER_EXTERNAL_URL')
    if not base:
        base = os.environ.get('RAILWAY_PUBLIC_DOMAIN')
        if base:
            base = f"https://{base}"
    if not base:
        try:
            public_ip = requests.get('https://api.ipify.org', timeout=3).text
            base = f"http://{public_ip}:{PORT}"
        except:
            base = f"http://localhost:{PORT}"
    return base.rstrip('/')

BASE_URL = get_public_base_url()
PING_URL = BASE_URL
print(f"[🌐] Base URL: {BASE_URL}")

# ---------- BIẾN TOÀN CỤC ----------
current_result = {"phien": None, "xuc_xac_1": None, "xuc_xac_2": None, "xuc_xac_3": None, "tong": None, "ket_qua": "", "thoi_gian": ""}
history = []
history_lock = threading.Lock()
MAX_HISTORY = 100000

# Dự đoán
pred_dict = {}          # phiên -> thông tin dự đoán
pred_stats = {"tong": 0, "dung": 0, "sai": 0, "ty_le": 0.0}

# Học AI – nâng cấp
seq = deque(maxlen=50)           # lưu chuỗi 'T'/'X' dài hơn để phân tích trend
ai_data = {
    "count_T": 0,
    "count_X": 0,
    "trans1": defaultdict(lambda: {"T": 0, "X": 0}),   # Markov bậc 1
    "trans3": defaultdict(lambda: {"T": 0, "X": 0}),   # bậc 3 (3 ký tự)
    "trans5": defaultdict(lambda: {"T": 0, "X": 0})    # bậc 5 (5 ký tự)
}
dice_sum_counter = defaultdict(int)   # tổng 3-18
ai_lock = threading.Lock()

# Ping
ping_stats = {
    "url": PING_URL,
    "total": 0,
    "success": 0,
    "fail": 0,
    "last_time": None,
    "last_status": "Chưa ping",
    "history": deque(maxlen=100)
}
ping_lock = threading.Lock()

# WS
current_sid = None
ws_conn = None
reconnect_delay = 2.5

# ---------- THỜI GIAN ----------
def vn_time():
    return (datetime.utcnow() + timedelta(hours=7)).strftime("%d-%m-%Y %H:%M:%S") + " UTC+7"

# ---------- TOKEN (giữ nguyên) ----------
def parse_token(txt):
    try:
        m = re.search(r'"info"\x07([^"]+?)"?', txt)
        if m:
            s = m.group(1).replace('\x04','').replace('\x07','').replace('\x05','').replace('\x06','')
            return json.loads(s)
        m2 = re.search(r'\{[^{}]*"ipAddress"[^{}]*\}', txt)
        if m2:
            return json.loads(m2.group())
        return None
    except:
        return None

def load_token():
    try:
        with open('token.txt', 'r', encoding='utf-8') as f:
            data = f.read().strip()
        if not data:
            return None
        return parse_token(data)
    except:
        return None

TOKEN_DATA = load_token()
if TOKEN_DATA:
    WS_URL = f"wss://websocket.azhkthg1.net/websocket?token={TOKEN_DATA.get('wsToken','')}"
    WS_HEADERS = {"User-Agent": "Mozilla/5.0", "Origin": "https://play.sun.pw"}
    INIT_MSGS = [
        [1, "MiniGame", TOKEN_DATA.get('username','GM_quapotjz'), "quapit", {
            "signature": "05915B436159B8F4E4DFF537639BD014D54EBEFA18CF62A8EB205B4074010AD72AEA9A780D5A8A4E1BD59BBBAFE03902C594B5DA56FD60D099F1FDDCCD48385FCC2760B5B0B4B8E75D39B8E40DF8CB7C01EA58DBEDA32805927473AB71FA9B798B0C2EDC445C3E36E47EF0AAFAD45601D99AAD1EC642FD2B63573A0401D6EC69",
            "expireIn": TOKEN_DATA.get('timestamp', 1774138177205),
            "wsToken": TOKEN_DATA.get('wsToken',''),
            "accessToken": "7e9a9ecbff1b4a6393b48346f6d8b709",
            "message": "Thành công",
            "refreshToken": TOKEN_DATA.get('refreshToken',''),
            "info": TOKEN_DATA
        }],
        [6, "MiniGame", "taixiuPlugin", {"cmd": 1005}],
        [6, "MiniGame", "lobbyPlugin", {"cmd": 10001}]
    ]
else:
    WS_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJsb2xtYW1heXN1MTIiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMzkxMDEyNTEsImFmZklkIjoiR0VNV0lOIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJnZW0iLCJlbWFpbCI6IiIsInRpbWVzdGFtcCI6MTc3NDEzODE3NzIwNCwibG9ja0dhbWVzIjpbXSwiYW1vdW50IjowLCJsb2NrQ2hhdCI6ZmFsc2UsInBob25lVmVyaWZpZWQiOmZhbHNlLCJpcEFkZHJlc3MiOiIyNDA1OjQ4MDI6NGU0Mjo0MTcwOjcxMDQ6YjY0Njo2Nzg5Ojg2NDgiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzA5LnBuZyIsInBsYXRmb3JtSWQiOjQsInVzZXJJZCI6ImEyOGEwZjA2LWU4OGYtNDRiNy1hMjY4LTVmNmRhZDk0OWZiZiIsImVtYWlsVmVyaWZpZWQiOm51bGwsInJlZ1RpbWUiOjE3NzMxMDY2NDkxOTksInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiR01fcXVhcG90anoifQ.3ycgvK1-PwRpBqANZJ3li00kpuzV6Ike6ZjYPthf3X0"
    WS_HEADERS = {"User-Agent": "Mozilla/5.0", "Origin": "https://play.sun.pw"}
    INIT_MSGS = [
        [1, "MiniGame", "GM_quapotjz", "quapit", {
            "signature": "05915B436159B8F4E4DFF537639BD014D54EBEFA18CF62A8EB205B4074010AD72AEA9A780D5A8A4E1BD59BBBAFE03902C594B5DA56FD60D099F1FDDCCD48385FCC2760B5B0B4B8E75D39B8E40DF8CB7C01EA58DBEDA32805927473AB71FA9B798B0C2EDC445C3E36E47EF0AAFAD45601D99AAD1EC642FD2B63573A0401D6EC69",
            "expireIn": 1774138177205,
            "wsToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJsb2xtYW1heXN1MTIiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMzkxMDEyNTEsImFmZklkIjoiR0VNV0lOIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJnZW0iLCJlbWFpbCI6IiIsInRpbWVzdGFtcCI6MTc3NDEzODE3NzIwNCwibG9ja0dhbWVzIjpbXSwiYW1vdW50IjowLCJsb2NrQ2hhdCI6ZmFsc2UsInBob25lVmVyaWZpZWQiOmZhbHNlLCJpcEFkZHJlc3MiOiIyNDA1OjQ4MDI6NGU0Mjo0MTcwOjcxMDQ6YjY0Njo2Nzg5Ojg2NDgiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzA5LnBuZyIsInBsYXRmb3JtSWQiOjQsInVzZXJJZCI6ImEyOGEwZjA2LWU4OGYtNDRiNy1hMjY4LTVmNmRhZDk0OWZiZiIsImVtYWlsVmVyaWZpZWQiOm51bGwsInJlZ1RpbWUiOjE3NzMxMDY2NDkxOTksInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiR01fcXVhcG90anoifQ.3ycgvK1-PwRpBqANZJ3li00kpuzV6Ike6ZjYPthf3X0",
            "accessToken": "7e9a9ecbff1b4a6393b48346f6d8b709",
            "message": "Thành công",
            "refreshToken": "950f5b9974dd4f4c982a3681af9acbc7.f0d252e72ee64f07bd5819d6ca54bba1",
            "info": {"ipAddress": "2405:4802:4e42:4170:7104:b646:6789:8648", "wsToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJsb2xtYW1heXN1MTIiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMzkxMDEyNTEsImFmZklkIjoiR0VNV0lOIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJnZW0iLCJlbWFpbCI6IiIsInRpbWVzdGFtcCI6MTc3NDEzODE3NzIwNCwibG9ja0dhbWVzIjpbXSwiYW1vdW50IjowLCJsb2NrQ2hhdCI6ZmFsc2UsInBob25lVmVyaWZpZWQiOmZhbHNlLCJpcEFkZHJlc3MiOiIyNDA1OjQ4MDI6NGU0Mjo0MTcwOjcxMDQ6YjY0Njo2Nzg5Ojg2NDgiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzA5LnBuZyIsInBsYXRmb3JtSWQiOjQsInVzZXJJZCI6ImEyOGEwZjA2LWU4OGYtNDRiNy1hMjY4LTVmNmRhZDk0OWZiZiIsImVtYWlsVmVyaWZpZWQiOm51bGwsInJlZ1RpbWUiOjE3NzMxMDY2NDkxOTksInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiR01fcXVhcG90anoifQ.3ycgvK1-PwRpBqANZJ3li00kpuzV6Ike6ZjYPthf3X0",
            "locale": "vi", "userId": "a28a0f06-e88f-44b7-a268-5f6dad949fbf", "username": "GM_quapotjz", "timestamp": 1774138177205, "refreshToken": "950f5b9974dd4f4c982a3681af9acbc7.f0d252e72ee64f07bd5819d6ca54bba1"}
        }],
        [6, "MiniGame", "taixiuPlugin", {"cmd": 1005}],
        [6, "MiniGame", "lobbyPlugin", {"cmd": 10001}]
    ]

# ---------- AI SIÊU VIP (NÂNG CẤP) ----------
def super_predict(phien):
    with ai_lock:
        total = ai_data["count_T"] + ai_data["count_X"]
        if total < 10:
            return random.choice(["Tài", "Xỉu"])
        
        # 1. Xác suất cơ sở từ tổng thể
        base_p = ai_data["count_T"] / total
        
        # 2. Markov bậc 5 (dùng 5 kết quả gần nhất)
        recent = list(seq)[-5:]
        prob_markov = 0.5
        if len(recent) >= 5:
            key = ''.join(recent[-5:])   # ví dụ "TTXTT"
            trans = ai_data["trans5"][key]
            t = trans["T"] + trans["X"]
            if t > 3:
                prob_markov = trans["T"] / t
        
        # 3. Xác suất từ tổng điểm cụ thể (dice_sum_counter)
        sum_tai = sum(v for k,v in dice_sum_counter.items() if k >= 11)
        sum_xiu = sum(v for k,v in dice_sum_counter.items() if k <= 10)
        total_dice = sum_tai + sum_xiu
        prob_dice = sum_tai / max(1, total_dice) if total_dice > 0 else 0.5
        
        # 4. Bẻ cầu nếu chuỗi dài >= 5 giống nhau
        break_cue = False
        if len(recent) >= 5 and all(x == recent[-1] for x in recent[-5:]):
            break_cue = True
        
        # 5. Trọng số kết hợp (ưu tiên Markov và bẻ cầu)
        w_base, w_mark, w_dice = 0.3, 0.4, 0.3
        final_p = w_base * base_p + w_mark * prob_markov + w_dice * prob_dice
        
        # Nếu bẻ cầu -> đánh ngược
        if break_cue:
            return "Xỉu" if recent[-1] == "T" else "Tài"
        
        # Điều chỉnh ngưỡng để tăng tỷ lệ "ảo"
        if final_p > 0.52:
            return "Tài"
        elif final_p < 0.48:
            return "Xỉu"
        else:
            # Khi bất định, ưu tiên cửa đang có xu hướng (dựa trên 5 gần nhất)
            if len(recent) >= 3:
                cnt_t = recent.count('T')
                cnt_x = recent.count('X')
                if cnt_t > cnt_x:
                    return "Tài"
                elif cnt_x > cnt_t:
                    return "Xỉu"
            return "Tài" if base_p > 0.5 else "Xỉu"

def update_ai(result_char, d1, d2, d3):
    with ai_lock:
        s = d1 + d2 + d3
        dice_sum_counter[s] += 1
        if result_char == 'T':
            ai_data["count_T"] += 1
        else:
            ai_data["count_X"] += 1
        
        # Cập nhật Markov
        if len(seq) > 0:
            prev = seq[-1]
            ai_data["trans1"][prev][result_char] += 1
        if len(seq) >= 2:
            key3 = ''.join(list(seq)[-3:])
            ai_data["trans3"][key3][result_char] += 1
        if len(seq) >= 4:
            key5 = ''.join(list(seq)[-5:])
            ai_data["trans5"][key5][result_char] += 1
        
        seq.append(result_char)

def compare_pred(phien, result_char):
    global pred_stats
    if phien in pred_dict and not pred_dict[phien]["da_so_sanh"]:
        du_doan = pred_dict[phien]["du_doan"]
        dung = (du_doan == ("Tài" if result_char == 'T' else "Xỉu"))
        pred_stats["tong"] += 1
        if dung:
            pred_stats["dung"] += 1
        else:
            pred_stats["sai"] += 1
        pred_stats["ty_le"] = pred_stats["dung"] / max(1, pred_stats["tong"])
        pred_dict[phien]["da_so_sanh"] = True
        pred_dict[phien]["ket_qua_thuc_te"] = "Tài" if result_char == 'T' else "Xỉu"
        pred_dict[phien]["dung_sai"] = "Đúng" if dung else "Sai"

# ---------- PING ----------
def auto_ping():
    while True:
        try:
            with ping_lock:
                ping_stats["total"] += 1
                ping_stats["last_time"] = vn_time()
            start = time.time()
            try:
                r = requests.get(PING_URL, timeout=10)
                ok = 200 <= r.status_code < 300
                ms = round((time.time()-start)*1000, 2)
                with ping_lock:
                    if ok:
                        ping_stats["success"] += 1
                        ping_stats["last_status"] = f"Thành công {r.status_code} ({ms}ms)"
                    else:
                        ping_stats["fail"] += 1
                        ping_stats["last_status"] = f"Lỗi HTTP {r.status_code}"
                    ping_stats["history"].append({"time": vn_time(), "status": ping_stats["last_status"], "ms": ms if ok else None})
            except Exception as e:
                with ping_lock:
                    ping_stats["fail"] += 1
                    ping_stats["last_status"] = f"Lỗi kết nối: {str(e)[:40]}"
                    ping_stats["history"].append({"time": vn_time(), "status": ping_stats["last_status"], "ms": None})
        except:
            pass
        time.sleep(60)

# ---------- WEBSOCKET ----------
def ws_connect_kwargs():
    kw = {"ping_interval": 15, "ping_timeout": 10}
    try:
        if tuple(int(x) for x in websockets.__version__.split('.')[:2]) >= (11,0):
            kw["additional_headers"] = WS_HEADERS
        else:
            kw["extra_headers"] = WS_HEADERS
    except:
        kw["additional_headers"] = WS_HEADERS
    return kw

async def ws_loop():
    global ws_conn, current_sid, current_result, history
    while True:
        try:
            ws_conn = await websockets.connect(WS_URL, **ws_connect_kwargs())
            for i, msg in enumerate(INIT_MSGS):
                await asyncio.sleep(i*0.6)
                await ws_conn.send(json.dumps(msg))
            async for raw in ws_conn:
                try:
                    data = json.loads(raw)
                    if not isinstance(data, list) or len(data) < 2:
                        continue
                    if not isinstance(data[1], dict):
                        continue
                    cmd = data[1].get('cmd')
                    sid = data[1].get('sid')
                    d1 = data[1].get('d1')
                    d2 = data[1].get('d2')
                    d3 = data[1].get('d3')
                    gBB = data[1].get('gBB')
                    
                    if cmd == 1008 and sid:
                        current_sid = sid
                        du_doan = super_predict(sid)
                        pred_dict[sid] = {
                            "du_doan": du_doan,
                            "thoi_gian": vn_time(),
                            "da_so_sanh": False,
                            "ket_qua_thuc_te": None,
                            "dung_sai": None
                        }
                        print(f"[🎯] Phiên {sid} -> Dự đoán: {du_doan}")
                    
                    if cmd == 1003 and gBB and all(v is not None for v in [d1,d2,d3]):
                        total = d1 + d2 + d3
                        result_char = 'T' if total > 10 else 'X'
                        result_str = "Tài" if result_char == 'T' else "Xỉu"
                        current_result = {
                            "phien": current_sid,
                            "xuc_xac_1": d1,
                            "xuc_xac_2": d2,
                            "xuc_xac_3": d3,
                            "tong": total,
                            "ket_qua": result_str,
                            "thoi_gian": vn_time()
                        }
                        with history_lock:
                            history.append(current_result.copy())
                            if len(history) > MAX_HISTORY:
                                history = history[-MAX_HISTORY:]
                        update_ai(result_char, d1, d2, d3)
                        if current_sid:
                            compare_pred(current_sid, result_char)
                        print(f"[🎲] Phiên {current_result['phien']}: {d1}-{d2}-{d3} = {total} ({result_str})")
                        current_sid = None
                except:
                    pass
        except:
            await asyncio.sleep(reconnect_delay)

# ---------- FLASK ROUTES (SỬA LỖI TEMPLATE) ----------
# Template chính, không chứa biểu thức jinja2 trong style
HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>{{title}}</title>
<style>
body { background: #0b0e14; color: #c8d0dc; font-family: 'Segoe UI', monospace; padding: 20px; }
.container { max-width: 1200px; margin: auto; }
h1 { color: #00f5d4; border-bottom: 2px solid #1f2a36; padding-bottom: 10px; }
.table-wrap { overflow-x: auto; background: #141a22; padding: 15px; border-radius: 12px; margin: 15px 0; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { background: #1f2a36; color: #00d4b8; padding: 10px; text-align: left; }
td { padding: 8px 10px; border-bottom: 1px solid #1f2a36; }
tr:hover { background: #1a222c; }
.badge { padding: 3px 10px; border-radius: 20px; font-weight: bold; }
.badge-win { background: #0f5c3a; color: #5cf0b0; }
.badge-lose { background: #5c1a1a; color: #f05c5c; }
.badge-tai { background: #1a3a5c; color: #5cb8f0; }
.badge-xiu { background: #4a2a5c; color: #d48cf0; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 15px; margin: 20px 0; }
.stat-card { background: #141a22; padding: 15px; border-radius: 10px; border-left: 4px solid #00f5d4; }
.stat-label { font-size: 12px; color: #7a8a9a; text-transform: uppercase; }
.stat-value { font-size: 24px; font-weight: bold; color: #e0f0ff; }
.progress-bar { background: #1f2a36; height: 20px; border-radius: 10px; overflow: hidden; margin: 5px 0; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #00d4b8, #00f5d4); }
</style>
</head>
<body>
<div class="container">
<h1>🎲 {{title}}</h1>
<p><strong>Thời gian:</strong> {{time}} | <strong>Base URL:</strong> {{base_url}}</p>
{{{body}}}
</div>
</body>
</html>
"""

@app.route('/')
def index():
    body = '<div class="stats-grid"><div class="stat-card"><div class="stat-label">🚀 Server</div><div class="stat-value">Đang chạy</div></div></div><p>Dùng <code>/thongke/ai</code>, <code>/thongke/dudoan</code>, <code>/ping</code> để xem giao diện.</p>'
    return render_template_string(HTML_TEMPLATE, title="Sun.Win Tài Xỉu VIP", time=vn_time(), base_url=BASE_URL, body=body)

@app.route('/api/tx')
def api_tx():
    return jsonify(current_result)

@app.route('/api/history')
def api_history():
    with history_lock:
        return app.response_class(response=json.dumps(list(reversed(history)), ensure_ascii=False), status=200, mimetype='application/json')

@app.route('/thongke/ai')
def thongke_ai():
    with ai_lock:
        total = ai_data["count_T"] + ai_data["count_X"]
        pct_tai = round(ai_data["count_T"] / max(1, total) * 100, 2)
        pct_xiu = round(100 - pct_tai, 2)
        stats = {
            "Tổng phiên đã học": total,
            "Số Tài": ai_data["count_T"],
            "Số Xỉu": ai_data["count_X"],
            "Tỉ lệ Tài": f"{pct_tai}%",
            "Tỉ lệ Xỉu": f"{pct_xiu}%",
            "Dự đoán đúng": pred_stats["dung"],
            "Dự đoán sai": pred_stats["sai"],
            "Tỉ lệ đúng": f"{round(pred_stats['ty_le']*100,2)}%" if pred_stats["tong"]>0 else "0%",
            "Chuỗi gần nhất": " → ".join(list(seq)[-10:])
        }
        rows = ''.join([f'<tr><td>{k}</td><td><strong>{v}</strong></td></tr>' for k,v in stats.items()])
        body = f'<div class="table-wrap"><table><tr><th>Chỉ số AI</th><th>Giá trị</th></tr>{rows}</table></div>'
        body += f'<div class="stats-grid"><div class="stat-card"><div class="stat-label">Tài/Xỉu</div><div class="progress-bar"><div class="progress-fill" style="width:{pct_tai}%;"></div></div><span>Tài {pct_tai}% - Xỉu {pct_xiu}%</span></div></div>'
    return render_template_string(HTML_TEMPLATE, title="📊 Thống kê AI", time=vn_time(), base_url=BASE_URL, body=body)

@app.route('/thongke/dudoan')
def thongke_dudoan():
    items = []
    for phien, info in pred_dict.items():
        items.append({
            "phien": phien,
            "du_doan": info["du_doan"],
            "thuc_te": info.get("ket_qua_thuc_te", "Chờ"),
            "kq": info.get("dung_sai", "Chưa có")
        })
    items.sort(key=lambda x: int(x["phien"]) if str(x["phien"]).isdigit() else 0, reverse=True)
    rows = ''.join([f'<tr><td>{i["phien"]}</td><td><span class="badge {"badge-tai" if i["du_doan"]=="Tài" else "badge-xiu"}">{i["du_doan"]}</span></td><td><span class="badge {"badge-tai" if i["thuc_te"]=="Tài" else "badge-xiu"}">{i["thuc_te"]}</span></td><td><span class="badge {"badge-win" if i["kq"]=="Đúng" else "badge-lose" if i["kq"]=="Sai" else ""}">{i["kq"]}</span></td></tr>' for i in items[:200]])
    body = f'<div class="table-wrap"><table><tr><th>Phiên</th><th>Dự đoán</th><th>Kết quả thực</th><th>Đúng/Sai</th></tr>{rows if rows else "<tr><td colspan=4>Chưa có dữ liệu</td></tr>"}</table></div><p><i>Hiển thị 200 phiên mới nhất</i></p>'
    return render_template_string(HTML_TEMPLATE, title="📝 Lịch sử dự đoán", time=vn_time(), base_url=BASE_URL, body=body)

@app.route('/ping')
def ping_page():
    with ping_lock:
        rows = ''.join([f'<tr><td>{h["time"]}</td><td>{h["status"]}</td><td>{h["ms"] if h["ms"] else "---"} ms</td></tr>' for h in list(ping_stats["history"])[-30:]])
        stats = {
            "URL đang ping": ping_stats["url"],
            "Tổng ping": ping_stats["total"],
            "Thành công": ping_stats["success"],
            "Thất bại": ping_stats["fail"],
            "Trạng thái cuối": ping_stats["last_status"],
            "Lần cuối": ping_stats["last_time"] or "N/A"
        }
        stat_html = ''.join([f'<div class="stat-card"><div class="stat-label">{k}</div><div class="stat-value">{v}</div></div>' for k,v in stats.items()])
        body = f'<div class="stats-grid">{stat_html}</div><div class="table-wrap"><table><tr><th>Thời gian</th><th>Trạng thái</th><th>Phản hồi</th></tr>{rows if rows else "<tr><td colspan=3>Chưa ping</td></tr>"}</table></div>'
    return render_template_string(HTML_TEMPLATE, title="🏓 PING KEEP-ALIVE", time=vn_time(), base_url=BASE_URL, body=body)

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error":"Sai endpoint. Dùng /thongke/ai, /thongke/dudoan, /ping, /api/tx, /api/history"}), 404

# ---------- MAIN ----------
def run_flask():
    app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)

async def main():
    print("="*60)
    print("🎲 SUN.WIN TÀI XỈU VIP - WORM GPT EDITION (FIX LỖI + AI NÂNG CẤP)")
    print("="*60)
    print(f"🌐 BASE URL: {BASE_URL}")
    print(f"🏓 PING URL: {PING_URL}")
    threading.Thread(target=auto_ping, daemon=True).start()
    threading.Thread(target=run_flask, daemon=True).start()
    await ws_loop()

def signal_handler(sig, frame):
    print("\n👋 Tắt server.")
    sys.exit(0)

if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Dừng bởi người dùng")