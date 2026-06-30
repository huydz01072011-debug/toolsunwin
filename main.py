import asyncio
import websockets
import json
import threading
import time
from datetime import datetime, timedelta
from flask import Flask, jsonify
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

# ---------- TOKEN CỐ ĐỊNH (GỘP VÀO CODE) ----------
TOKEN_RAW = {
    "ipAddress": "1.55.124.245",
    "wsToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0",
    "locale": "vi",
    "userId": "a28a0f06-e88f-44b7-a268-5f6dad949fbf",
    "username": "GM_quapotjz",
    "timestamp": 1780029354479,
    "refreshToken": "26b930ec6dc04d7db5c2b362a1baac87.7549ba6185d4467380ee447589380061"
}

WS_URL = f"wss://websocket.azhkthg1.net/websocket?token={TOKEN_RAW['wsToken']}"
WS_HEADERS = {"User-Agent": "Mozilla/5.0", "Origin": "https://play.sun.pw"}
INIT_MSGS = [
    [1, "MiniGame", TOKEN_RAW['username'], "quapit", {
        "signature": "05915B436159B8F4E4DFF537639BD014D54EBEFA18CF62A8EB205B4074010AD72AEA9A780D5A8A4E1BD59BBBAFE03902C594B5DA56FD60D099F1FDDCCD48385FCC2760B5B0B4B8E75D39B8E40DF8CB7C01EA58DBEDA32805927473AB71FA9B798B0C2EDC445C3E36E47EF0AAFAD45601D99AAD1EC642FD2B63573A0401D6EC69",
        "expireIn": TOKEN_RAW['timestamp'],
        "wsToken": TOKEN_RAW['wsToken'],
        "accessToken": "7e9a9ecbff1b4a6393b48346f6d8b709",
        "message": "Thành công",
        "refreshToken": TOKEN_RAW['refreshToken'],
        "info": TOKEN_RAW
    }],
    [6, "MiniGame", "taixiuPlugin", {"cmd": 1005}],
    [6, "MiniGame", "lobbyPlugin", {"cmd": 10001}]
]

# ---------- BIẾN TOÀN CỤC ----------
current_result = {"phien": None, "xuc_xac_1": None, "xuc_xac_2": None, "xuc_xac_3": None, "tong": None, "ket_qua": "", "thoi_gian": ""}
history = []
history_lock = threading.Lock()
MAX_HISTORY = 100000

# Dự đoán
pred_dict = {}
pred_stats = {"tong": 0, "dung": 0, "sai": 0, "ty_le": 0.0}

# AI siêu cấp
seq = deque(maxlen=100)
ai_data = {
    "count_T": 0,
    "count_X": 0,
    "trans1": defaultdict(lambda: {"T": 0, "X": 0}),
    "trans2": defaultdict(lambda: {"T": 0, "X": 0}),
    "trans3": defaultdict(lambda: {"T": 0, "X": 0}),
    "trans5": defaultdict(lambda: {"T": 0, "X": 0})
}
dice_sum_counter = defaultdict(int)
face_counter = [defaultdict(int) for _ in range(3)]
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
reconnect_delay = 5  # reconnect mỗi 5s

# ---------- THỜI GIAN ----------
def vn_time():
    return (datetime.utcnow() + timedelta(hours=7)).strftime("%d-%m-%Y %H:%M:%S") + " UTC+7"

# ---------- AI SIÊU VIP ----------
def super_predict(phien):
    with ai_lock:
        total = ai_data["count_T"] + ai_data["count_X"]
        if total < 10:
            return random.choice(["Tài", "Xỉu"])
        
        base_p = ai_data["count_T"] / total
        recent = list(seq)[-5:]
        prob_markov = 0.5
        if len(recent) >= 5:
            key = ''.join(recent[-5:])
            trans = ai_data["trans5"][key]
            t = trans["T"] + trans["X"]
            if t > 3:
                prob_markov = trans["T"] / t
        
        sum_tai = sum(v for k,v in dice_sum_counter.items() if k >= 11)
        sum_xiu = sum(v for k,v in dice_sum_counter.items() if k <= 10)
        total_dice = sum_tai + sum_xiu
        prob_dice = sum_tai / max(1, total_dice) if total_dice > 0 else 0.5
        
        break_cue = False
        if len(recent) >= 5 and all(x == recent[-1] for x in recent[-5:]):
            break_cue = True
        
        w_base, w_mark, w_dice = 0.3, 0.4, 0.3
        final_p = w_base * base_p + w_mark * prob_markov + w_dice * prob_dice
        
        if len(recent) >= 5:
            cnt_t = recent.count('T')
            cnt_x = recent.count('X')
            if cnt_t >= 4:
                final_p = min(1.0, final_p + 0.05)
            elif cnt_x >= 4:
                final_p = max(0.0, final_p - 0.05)
        
        if break_cue:
            return "Xỉu" if recent[-1] == 'T' else "Tài"
        
        if final_p > 0.53:
            return "Tài"
        elif final_p < 0.47:
            return "Xỉu"
        else:
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
        for i, val in enumerate([d1, d2, d3]):
            face_counter[i][val] += 1
        
        if result_char == 'T':
            ai_data["count_T"] += 1
        else:
            ai_data["count_X"] += 1
        
        if len(seq) > 0:
            prev = seq[-1]
            ai_data["trans1"][prev][result_char] += 1
        if len(seq) >= 1:
            prev2 = ''.join(list(seq)[-2:]) if len(seq) >= 2 else seq[-1]
            if len(prev2) == 2:
                ai_data["trans2"][prev2][result_char] += 1
        if len(seq) >= 2:
            prev3 = ''.join(list(seq)[-3:])
            ai_data["trans3"][prev3][result_char] += 1
        if len(seq) >= 4:
            prev5 = ''.join(list(seq)[-5:])
            ai_data["trans5"][prev5][result_char] += 1
        
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
            print("[🔄] Đang kết nối WebSocket...")
            ws_conn = await websockets.connect(WS_URL, **ws_connect_kwargs())
            print("[✅] WebSocket đã kết nối!")
            
            for i, msg in enumerate(INIT_MSGS):
                await asyncio.sleep(i * 0.6)
                await ws_conn.send(json.dumps(msg))
                print(f"[📤] Đã gửi init message {i+1}")
            
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
                    
                    # Khi có phiên mới (cmd 1008)
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
                    
                    # Khi có kết quả (cmd 1003)
                    if cmd == 1003 and gBB and all(v is not None for v in [d1, d2, d3]):
                        total = d1 + d2 + d3
                        result_char = 'T' if total > 10 else 'X'
                        result_str = "Tài" if result_char == 'T' else "Xỉu"
                        
                        # Lưu kết quả hiện tại
                        current_result = {
                            "phien": current_sid,
                            "xuc_xac_1": d1,
                            "xuc_xac_2": d2,
                            "xuc_xac_3": d3,
                            "tong": total,
                            "ket_qua": result_str,
                            "thoi_gian": vn_time()
                        }
                        
                        # Lưu vào lịch sử
                        with history_lock:
                            history.append(current_result.copy())
                            if len(history) > MAX_HISTORY:
                                history = history[-MAX_HISTORY:]
                        
                        # Cập nhật AI
                        update_ai(result_char, d1, d2, d3)
                        
                        # So sánh dự đoán
                        if current_sid:
                            compare_pred(current_sid, result_char)
                        
                        print(f"[🎲] Phiên {current_result['phien']}: {d1}-{d2}-{d3} = {total} ({result_str})")
                        current_sid = None
                        
                except json.JSONDecodeError as e:
                    print(f"[❌] Lỗi parse JSON: {e}")
                except Exception as e:
                    print(f"[❌] Lỗi xử lý message: {e}")
                    
        except websockets.exceptions.ConnectionClosed as e:
            print(f"[❌] WebSocket đóng: {e}. Reconnect sau {reconnect_delay}s...")
            await asyncio.sleep(reconnect_delay)
        except Exception as e:
            print(f"[❌] Lỗi kết nối WS: {e}. Reconnect sau {reconnect_delay}s...")
            await asyncio.sleep(reconnect_delay)

# ---------- FLASK ROUTES ----------
@app.route('/')
def index():
    return jsonify({
        "name": "Sun.Win Tài Xỉu VIP - Worm GPT AI",
        "version": "7.0",
        "base_url": BASE_URL,
        "time": vn_time(),
        "endpoints": {
            "/api/tx": "Kết quả mới nhất",
            "/api/history": f"Lịch sử {MAX_HISTORY} phiên (mới nhất -> cũ)",
            "/thongke/ai": "Thống kê AI chi tiết",
            "/thongke/dudoan": "Lịch sử dự đoán đúng/sai",
            "/ping": "Thống kê ping keep-alive"
        },
        "status": "running"
    })

@app.route('/api/tx')
def api_tx():
    return jsonify(current_result)

@app.route('/api/history')
def api_history():
    with history_lock:
        return app.response_class(
            response=json.dumps(list(reversed(history)), ensure_ascii=False),
            status=200,
            mimetype='application/json'
        )

@app.route('/thongke/ai')
def thongke_ai():
    with ai_lock:
        total = ai_data["count_T"] + ai_data["count_X"]
        pct_tai = round(ai_data["count_T"] / max(1, total) * 100, 2)
        pct_xiu = round(100 - pct_tai, 2)
        top_trans = sorted(ai_data["trans5"].items(), key=lambda x: x[1]['T'] + x[1]['X'], reverse=True)[:10]
        trans_show = {k: dict(v) for k, v in top_trans}
        return jsonify({
            "tong_phien_da_hoc": total,
            "so_Tai": ai_data["count_T"],
            "so_Xiu": ai_data["count_X"],
            "ti_le_Tai_%": pct_tai,
            "ti_le_Xiu_%": pct_xiu,
            "du_doan_dung": pred_stats["dung"],
            "du_doan_sai": pred_stats["sai"],
            "ti_le_dung_%": round(pred_stats["ty_le"] * 100, 2) if pred_stats["tong"] > 0 else 0,
            "chuoi_gan_nhat": list(seq)[-20:],
            "transition_bac5_top10": trans_show,
            "thoi_gian": vn_time()
        })

@app.route('/thongke/dudoan')
def thongke_dudoan():
    items = []
    for phien, info in pred_dict.items():
        items.append({
            "phien": phien,
            "du_doan": info["du_doan"],
            "thuc_te": info.get("ket_qua_thuc_te", "Chờ"),
            "dung_sai": info.get("dung_sai", "Chưa")
        })
    items.sort(key=lambda x: int(x["phien"]) if str(x["phien"]).isdigit() else 0, reverse=True)
    return jsonify({
        "tong_so_du_doan": len(items),
        "chi_tiet_200_moi_nhat": items[:200],
        "thoi_gian": vn_time()
    })

@app.route('/ping')
def ping_page():
    with ping_lock:
        return jsonify({
            "url": ping_stats["url"],
            "total_pings": ping_stats["total"],
            "success": ping_stats["success"],
            "fail": ping_stats["fail"],
            "last_time": ping_stats["last_time"],
            "last_status": ping_stats["last_status"],
            "history_30": list(ping_stats["history"])[-30:],
            "thoi_gian": vn_time()
        })

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        "error": "Endpoint không tồn tại. Dùng /thongke/ai, /thongke/dudoan, /ping, /api/tx, /api/history"
    }), 404

# ---------- MAIN ----------
def run_flask():
    app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)

async def main():
    print("=" * 60)
    print("🎲 SUN.WIN TÀI XỈU VIP - WORM GPT EDITION (FIX LỖI + TOKEN GỘP)")
    print("=" * 60)
    print(f"🌐 BASE URL: {BASE_URL}")
    print(f"🏓 PING URL: {PING_URL}")
    print(f"👤 USER: {TOKEN_RAW['username']}")
    print(f"🔗 WS URL: {WS_URL[:80]}...")
    print("=" * 60)
    
    # Khởi động thread ping
    threading.Thread(target=auto_ping, daemon=True).start()
    # Khởi động Flask
    threading.Thread(target=run_flask, daemon=True).start()
    # Chạy WebSocket
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