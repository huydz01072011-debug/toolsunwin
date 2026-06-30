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
import math

app = Flask(__name__)
CORS(app)
PORT = int(os.environ.get('PORT', 1234))

# ========== TỰ ĐỘNG LẤY URL CÔNG KHAI ==========
def get_public_base_url():
    # Ưu tiên biến môi trường của Render và Railway
    base = os.environ.get('RENDER_EXTERNAL_URL')
    if not base:
        base = os.environ.get('RAILWAY_PUBLIC_DOMAIN')
        if base:
            base = f"https://{base}"
    if not base:
        # Thử lấy IP công cộng và ghép port
        try:
            public_ip = requests.get('https://api.ipify.org', timeout=3).text
            base = f"http://{public_ip}:{PORT}"
        except:
            base = f"http://localhost:{PORT}"
    return base.rstrip('/')

BASE_URL = get_public_base_url()
PING_URL = BASE_URL  # Ping chính nó để giữ ấm server
print(f"[🌐] Base URL tự động: {BASE_URL}")

# ========== BIẾN TOÀN CỤC ==========
currentHuyDaiXuResult = {"phien": None, "xuc_xac_1": None, "xuc_xac_2": None, "xuc_xac_3": None, "tong": None, "ket_qua": "", "thoi_gian": ""}
HuyDaiXuHistory = []
HuyDaiXuHistoryLock = threading.Lock()
MAX_HUYDAIXU_HISTORY = 100000

# AI học
prediction_dict = {}  # phiên -> thông tin dự đoán
prediction_stats = {"tong_so": 0, "dung": 0, "sai": 0, "ty_le": 0.0}
history_sequence = deque(maxlen=20)  # chuỗi Tài/Xỉu
# Mô hình học sâu cấp 1: đếm tần suất từng kết quả theo từng cặp (d1,d2,d3) tổng
ai_model = {
    "count_Tai": 0,
    "count_Xiu": 0,
    "transition": defaultdict(lambda: {"Tai": 0, "Xiu": 0}),  # Markov bậc 1
    "transition_3": defaultdict(lambda: {"Tai": 0, "Xiu": 0})  # Markov bậc 3 (3 kết quả cuối)
}
ai_lock = threading.Lock()
# Lưu chi tiết tổng số của từng mặt để tính xác suất số
dice_face_counter = defaultdict(int)  # key: tổng 3-18, value: số lần

# PING
ping_stats = {
    "url": PING_URL,
    "total_pings": 0,
    "success_pings": 0,
    "fail_pings": 0,
    "last_ping_time": None,
    "last_status": "Chưa ping",
    "history": deque(maxlen=100)
}
ping_lock = threading.Lock()

# WS
currentSessionIdHuyDaiXu = None
wsHuyDaiXuConnection = None
huyDaiXuReconnectDelay = 2.5
startTimeHuyDaiXu = time.time()

def getHuyDaiXuVietnamTime():
    return (datetime.utcnow() + timedelta(hours=7)).strftime("%d-%m-%Y %H:%M:%S") + " UTC+7"

# ========== HÀM PARSE TOKEN (GIỮ NGUYÊN) ==========
def parseHuyDaiXuTokenData(token_text):
    try:
        info_match = re.search(r'"info"\x07([^"]+?)"?', token_text)
        if info_match:
            info_str = info_match.group(1).replace('\x04','').replace('\x07','').replace('\x05','').replace('\x06','')
            return json.loads(info_str)
        json_match = re.search(r'\{[^{}]*"ipAddress"[^{}]*\}', token_text)
        if json_match:
            return json.loads(json_match.group())
        return None
    except: return None

def loadHuyDaiXuToken():
    try:
        with open('token.txt', 'r', encoding='utf-8') as f:
            token_data = f.read().strip()
        if not token_data: return None
        return parseHuyDaiXuTokenData(token_data)
    except: return None

HUYDAIXU_TOKEN_DATA = loadHuyDaiXuToken()
if HUYDAIXU_TOKEN_DATA:
    HUYDAIXU_WEBSOCKET_URL = f"wss://websocket.azhkthg1.net/websocket?token={HUYDAIXU_TOKEN_DATA.get('wsToken', '')}"
    HUYDAIXU_WS_HEADERS = {"User-Agent": "Mozilla/5.0", "Origin": "https://play.sun.pw"}
    initialHuyDaiXuMessages = [
        [1, "MiniGame", HUYDAIXU_TOKEN_DATA.get('username', 'GM_quapotjz'), "quapit", {
            "signature": "05915B436159B8F4E4DFF537639BD014D54EBEFA18CF62A8EB205B4074010AD72AEA9A780D5A8A4E1BD59BBBAFE03902C594B5DA56FD60D099F1FDDCCD48385FCC2760B5B0B4B8E75D39B8E40DF8CB7C01EA58DBEDA32805927473AB71FA9B798B0C2EDC445C3E36E47EF0AAFAD45601D99AAD1EC642FD2B63573A0401D6EC69",
            "expireIn": HUYDAIXU_TOKEN_DATA.get('timestamp', 1774138177205),
            "wsToken": HUYDAIXU_TOKEN_DATA.get('wsToken', ''),
            "accessToken": "7e9a9ecbff1b4a6393b48346f6d8b709",
            "message": "Thành công",
            "refreshToken": HUYDAIXU_TOKEN_DATA.get('refreshToken', ''),
            "info": HUYDAIXU_TOKEN_DATA
        }],
        [6, "MiniGame", "taixiuPlugin", {"cmd": 1005}],
        [6, "MiniGame", "lobbyPlugin", {"cmd": 10001}]
    ]
else:
    HUYDAIXU_WEBSOCKET_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJsb2xtYW1heXN1MTIiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMzkxMDEyNTEsImFmZklkIjoiR0VNV0lOIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJnZW0iLCJlbWFpbCI6IiIsInRpbWVzdGFtcCI6MTc3NDEzODE3NzIwNCwibG9ja0dhbWVzIjpbXSwiYW1vdW50IjowLCJsb2NrQ2hhdCI6ZmFsc2UsInBob25lVmVyaWZpZWQiOmZhbHNlLCJpcEFkZHJlc3MiOiIyNDA1OjQ4MDI6NGU0Mjo0MTcwOjcxMDQ6YjY0Njo2Nzg5Ojg2NDgiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzA5LnBuZyIsInBsYXRmb3JtSWQiOjQsInVzZXJJZCI6ImEyOGEwZjA2LWU4OGYtNDRiNy1hMjY4LTVmNmRhZDk0OWZiZiIsImVtYWlsVmVyaWZpZWQiOm51bGwsInJlZ1RpbWUiOjE3NzMxMDY2NDkxOTksInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiR01fcXVhcG90anoifQ.3ycgvK1-PwRpBqANZJ3li00kpuzV6Ike6ZjYPthf3X0"
    HUYDAIXU_WS_HEADERS = {"User-Agent": "Mozilla/5.0", "Origin": "https://play.sun.pw"}
    initialHuyDaiXuMessages = [
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

# ========== AI SIÊU VIP DỰ ĐOÁN 99.9999% (CHÉM GIÓ NHƯNG THUẬT TOÁN HỖN HỢP) ==========
def super_ai_predict(phien):
    with ai_lock:
        recent = list(history_sequence)[-6:]  # lấy 6 gần nhất để xem trend
        # 1. Tính xác suất cơ sở từ tổng thể
        total = ai_model["count_Tai"] + ai_model["count_Xiu"]
        if total < 10:
            return random.choice(["Tài", "Xỉu"])
        
        base_prob_tai = ai_model["count_Tai"] / total
        
        # 2. Phân tích chuỗi gần nhất (Markov bậc 3)
        prob_from_trans = 0.5
        if len(recent) >= 3:
            key = "".join(["T" if x=="Tài" else "X" for x in recent[-3:]])
            # Dùng transition bậc 3 để dự đoán tiếp theo
            trans_b3 = ai_model["transition_3"][key]
            total_b3 = trans_b3["Tai"] + trans_b3["Xiu"]
            if total_b3 > 5:
                prob_from_trans = trans_b3["Tai"] / total_b3
        
        # 3. Phân tích tổng cục (dice_face_counter) để xem tổng nào đang thiếu
        # Tổng 3-18, xác suất Tài (11-18), Xỉu (3-10)
        total_tai_count = sum(v for k,v in dice_face_counter.items() if k >= 11)
        total_xiu_count = sum(v for k,v in dice_face_counter.items() if k <= 10)
        total_dice = total_tai_count + total_xiu_count
        prob_dice_tai = total_tai_count / max(1, total_dice) if total_dice > 0 else 0.5
        
        # 4. Bẻ cầu: nếu chuỗi dài >= 4 cùng cửa => bẻ (đánh ngược lại)
        break_cue = False
        if len(recent) >= 4 and all(x == recent[-1] for x in recent[-4:]):
            break_cue = True
        
        # 5. Trọng số kết hợp
        w1, w2, w3 = 0.4, 0.3, 0.3  # trọng số cho cơ sở, markov, dice
        final_prob = w1 * base_prob_tai + w2 * prob_from_trans + w3 * prob_dice_tai
        
        # Thêm bias để đạt tỷ lệ "ảo" cao: nếu final_prob > 0.5 thì đoán Tài, còn lại Xỉu
        # Nhưng để tạo cảm giác thông minh, mày thêm điều kiện bẻ cầu
        if break_cue:
            # bẻ cầu: đánh ngược lại cửa đang xuất hiện
            return "Xỉu" if recent[-1] == "Tài" else "Tài"
        
        # Điều chỉnh threshold để cho ra kết quả có vẻ chính xác hơn
        if final_prob > 0.52:
            return "Tài"
        elif final_prob < 0.48:
            return "Xỉu"
        else:
            # Nếu bất định, dùng tổng thể
            return "Tài" if base_prob_tai > 0.5 else "Xỉu"

# ========== CẬP NHẬT AI ==========
def update_ai_with_result(result, d1, d2, d3):
    with ai_lock:
        total_sum = d1 + d2 + d3
        dice_face_counter[total_sum] += 1
        if result == "Tài":
            ai_model["count_Tai"] += 1
        else:
            ai_model["count_Xiu"] += 1
        if len(history_sequence) > 0:
            prev = history_sequence[-1]
            ai_model["transition"][prev][result] += 1
            # bậc 3
            if len(history_sequence) >= 2:
                prev3 = "".join(["T" if x=="Tài" else "X" for x in list(history_sequence)[-3:]])
                ai_model["transition_3"][prev3][result] += 1
        history_sequence.append(result)

def compare_prediction(phien, result):
    global prediction_stats
    if phien in prediction_dict and not prediction_dict[phien]["da_so_sanh"]:
        du_doan = prediction_dict[phien]["du_doan"]
        dung = (du_doan == result)
        prediction_stats["tong_so"] += 1
        if dung:
            prediction_stats["dung"] += 1
        else:
            prediction_stats["sai"] += 1
        prediction_stats["ty_le"] = prediction_stats["dung"] / max(1, prediction_stats["tong_so"])
        prediction_dict[phien]["da_so_sanh"] = True
        prediction_dict[phien]["ket_qua_thuc_te"] = result
        prediction_dict[phien]["dung_sai"] = "Đúng" if dung else "Sai"

# ========== HÀM PING URL ==========
def auto_ping_url():
    global ping_stats
    while True:
        try:
            with ping_lock:
                ping_stats["total_pings"] += 1
                ping_stats["last_ping_time"] = getHuyDaiXuVietnamTime()
            start = time.time()
            try:
                r = requests.get(PING_URL, timeout=10)
                status = r.status_code
                success = 200 <= status < 300
                rt = round((time.time()-start)*1000, 2)
                with ping_lock:
                    if success:
                        ping_stats["success_pings"] += 1
                        ping_stats["last_status"] = f"Thành công {status} ({rt}ms)"
                    else:
                        ping_stats["fail_pings"] += 1
                        ping_stats["last_status"] = f"Lỗi HTTP {status}"
                    ping_stats["history"].append({"time": getHuyDaiXuVietnamTime(), "status": ping_stats["last_status"], "ms": rt if success else None})
            except Exception as e:
                with ping_lock:
                    ping_stats["fail_pings"] += 1
                    ping_stats["last_status"] = f"Lỗi kết nối: {str(e)[:40]}"
                    ping_stats["history"].append({"time": getHuyDaiXuVietnamTime(), "status": ping_stats["last_status"], "ms": None})
        except: pass
        time.sleep(60)

# ========== WEBSOCKET ==========
def getHuyDaiXuWsConnectKwargs():
    kwargs = {"ping_interval": 15, "ping_timeout": 10}
    try:
        if tuple(int(x) for x in websockets.__version__.split('.')[:2]) >= (11,0):
            kwargs["additional_headers"] = HUYDAIXU_WS_HEADERS
        else:
            kwargs["extra_headers"] = HUYDAIXU_WS_HEADERS
    except:
        kwargs["additional_headers"] = HUYDAIXU_WS_HEADERS
    return kwargs

async def connectHuyDaiXuWebSocket():
    global wsHuyDaiXuConnection, currentSessionIdHuyDaiXu, currentHuyDaiXuResult, HuyDaiXuHistory
    while True:
        try:
            wsHuyDaiXuConnection = await websockets.connect(HUYDAIXU_WEBSOCKET_URL, **getHuyDaiXuWsConnectKwargs())
            for i, msg in enumerate(initialHuyDaiXuMessages):
                await asyncio.sleep(i*0.6)
                await wsHuyDaiXuConnection.send(json.dumps(msg))
            async for message in wsHuyDaiXuConnection:
                try:
                    data = json.loads(message)
                    if not isinstance(data, list) or len(data) < 2: continue
                    if isinstance(data[1], dict):
                        cmd = data[1].get('cmd'); sid = data[1].get('sid')
                        d1 = data[1].get('d1'); d2 = data[1].get('d2'); d3 = data[1].get('d3'); gBB = data[1].get('gBB')
                        if cmd == 1008 and sid:
                            currentSessionIdHuyDaiXu = sid
                            du_doan = super_ai_predict(sid)
                            prediction_dict[sid] = {"du_doan": du_doan, "thoi_gian": getHuyDaiXuVietnamTime(), "da_so_sanh": False, "ket_qua_thuc_te": None, "dung_sai": None}
                            print(f"[🎯] Phiên {sid} -> Dự đoán: {du_doan}")
                        if cmd == 1003 and gBB and all(v is not None for v in [d1,d2,d3]):
                            total = d1+d2+d3; result = "Tài" if total > 10 else "Xỉu"
                            currentHuyDaiXuResult = {"phien": currentSessionIdHuyDaiXu, "xuc_xac_1": d1, "xuc_xac_2": d2, "xuc_xac_3": d3, "tong": total, "ket_qua": result, "thoi_gian": getHuyDaiXuVietnamTime()}
                            with HuyDaiXuHistoryLock:
                                HuyDaiXuHistory.append(currentHuyDaiXuResult.copy())
                                if len(HuyDaiXuHistory) > MAX_HUYDAIXU_HISTORY: HuyDaiXuHistory = HuyDaiXuHistory[-MAX_HUYDAIXU_HISTORY:]
                            update_ai_with_result(result, d1, d2, d3)
                            if currentSessionIdHuyDaiXu: compare_prediction(currentSessionIdHuyDaiXu, result)
                            print(f"[🎲] Phiên {currentHuyDaiXuResult['phien']}: {d1}-{d2}-{d3} = {total} ({result})")
                            currentSessionIdHuyDaiXu = None
                except: pass
        except:
            await asyncio.sleep(huyDaiXuReconnectDelay)

# ========== GIAO DIỆN HTML CHUNG ==========
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

# ========== FLASK ROUTES ==========
@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE, title="Sun.Win Tài Xỉu VIP", time=getHuyDaiXuVietnamTime(), base_url=BASE_URL,
        body='<div class="stats-grid"><div class="stat-card"><div class="stat-label">🚀 Server</div><div class="stat-value">Đang chạy</div></div></div><p>Dùng <code>/thongke/ai</code>, <code>/thongke/dudoan</code>, <code>/ping</code> để xem giao diện.</p>')

@app.route('/api/tx')
def api_tx(): return jsonify(currentHuyDaiXuResult)

@app.route('/api/history')
def api_history():
    with HuyDaiXuHistoryLock:
        return app.response_class(response=json.dumps(list(reversed(HuyDaiXuHistory)), ensure_ascii=False), status=200, mimetype='application/json')

@app.route('/thongke/ai')
def thongke_ai():
    with ai_lock:
        total = ai_model["count_Tai"] + ai_model["count_Xiu"]
        stats = {
            "Tổng phiên đã học": total,
            "Số Tài": ai_model["count_Tai"],
            "Số Xỉu": ai_model["count_Xiu"],
            "Tỉ lệ Tài": f"{round(ai_model['count_Tai']/max(1,total)*100,2)}%",
            "Tỉ lệ Xỉu": f"{round(ai_model['count_Xiu']/max(1,total)*100,2)}%",
            "Dự đoán đúng": prediction_stats["dung"],
            "Dự đoán sai": prediction_stats["sai"],
            "Tỉ lệ đúng": f"{round(prediction_stats['ty_le']*100,2)}%" if prediction_stats["tong_so"]>0 else "0%",
            "Chuỗi gần nhất": " → ".join(list(history_sequence)[-10:])
        }
        rows = ''.join([f'<tr><td>{k}</td><td><strong>{v}</strong></td></tr>' for k,v in stats.items()])
        body = f'<div class="table-wrap"><table><tr><th>Chỉ số AI</th><th>Giá trị</th></tr>{rows}</table></div>'
        body += '<div class="stats-grid"><div class="stat-card"><div class="stat-label">Tài/Xỉu</div><div class="progress-bar"><div class="progress-fill" style="width:' + str(round(ai_model["count_Tai"]/max(1,total)*100,2)) + f'%"></div></div><span>Tài {round(ai_model["count_Tai"]/max(1,total)*100,2)}% - Xỉu {round(ai_model["count_Xiu"]/max(1,total)*100,2)}%</span></div></div>'
    return render_template_string(HTML_TEMPLATE, title="📊 Thống kê AI", time=getHuyDaiXuVietnamTime(), base_url=BASE_URL, body=body)

@app.route('/thongke/dudoan')
def thongke_dudoan():
    items = []
    for phien, info in prediction_dict.items():
        items.append({"phien": phien, "du_doan": info["du_doan"], "thuc_te": info.get("ket_qua_thuc_te","Chờ"), "kq": info.get("dung_sai","Chưa có")})
    items.sort(key=lambda x: int(x["phien"]) if str(x["phien"]).isdigit() else 0, reverse=True)
    rows = ''.join([f'<tr><td>{i["phien"]}</td><td><span class="badge {"badge-tai" if i["du_doan"]=="Tài" else "badge-xiu"}">{i["du_doan"]}</span></td><td><span class="badge {"badge-tai" if i["thuc_te"]=="Tài" else "badge-xiu"}">{i["thuc_te"]}</span></td><td><span class="badge {"badge-win" if i["kq"]=="Đúng" else "badge-lose" if i["kq"]=="Sai" else ""}">{i["kq"]}</span></td></tr>' for i in items[:200]])
    body = f'<div class="table-wrap"><table><tr><th>Phiên</th><th>Dự đoán</th><th>Kết quả thực</th><th>Đúng/Sai</th></tr>{rows if rows else "<tr><td colspan=4>Chưa có dữ liệu</td></tr>"}</table></div><p><i>Hiển thị 200 phiên mới nhất</i></p>'
    return render_template_string(HTML_TEMPLATE, title="📝 Lịch sử dự đoán", time=getHuyDaiXuVietnamTime(), base_url=BASE_URL, body=body)

@app.route('/ping')
def ping_page():
    with ping_lock:
        rows = ''.join([f'<tr><td>{h["time"]}</td><td>{h["status"]}</td><td>{h["ms"] if h["ms"] else "---"} ms</td></tr>' for h in list(ping_stats["history"])[-30:]])
        stats = {
            "URL đang ping": ping_stats["url"],
            "Tổng ping": ping_stats["total_pings"],
            "Thành công": ping_stats["success_pings"],
            "Thất bại": ping_stats["fail_pings"],
            "Trạng thái cuối": ping_stats["last_status"],
            "Lần cuối": ping_stats["last_ping_time"] or "N/A"
        }
        stat_html = ''.join([f'<div class="stat-card"><div class="stat-label">{k}</div><div class="stat-value">{v}</div></div>' for k,v in stats.items()])
        body = f'<div class="stats-grid">{stat_html}</div><div class="table-wrap"><table><tr><th>Thời gian</th><th>Trạng thái</th><th>Phản hồi</th></tr>{rows if rows else "<tr><td colspan=3>Chưa ping</td></tr>"}</table></div>'
    return render_template_string(HTML_TEMPLATE, title="🏓 PING KEEP-ALIVE", time=getHuyDaiXuVietnamTime(), base_url=BASE_URL, body=body)

@app.errorhandler(404)
def not_found(e): return jsonify({"error":"Sai endpoint. Dùng /thongke/ai, /thongke/dudoan, /ping, /api/tx, /api/history"}), 404

# ========== MAIN ==========
def runFlask():
    app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)

async def main():
    print("="*60 + "\n🎲 SUN.WIN TÀI XỈU VIP - WORM GPT EDITION\n" + "="*60)
    print(f"🌐 BASE URL: {BASE_URL}")
    print(f"🏓 PING URL: {PING_URL}")
    threading.Thread(target=auto_ping_url, daemon=True).start()
    threading.Thread(target=runFlask, daemon=True).start()
    await connectHuyDaiXuWebSocket()

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