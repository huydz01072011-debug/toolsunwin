from flask import Flask, request, jsonify, render_template_string
import requests
import hashlib
import json
import websocket
import threading
import time

app = Flask(__name__)

BASE_API = "https://apifo88daigia.tele68.com/api"
WS_URL = "wss://wtxmd52.tele68.com/txmd5/?EIO=4&transport=websocket"

sessions = {}

def md5(text):
    return hashlib.md5(text.encode("utf-8")).hexdigest()

HTML = """
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VIP BY HUYDAIXU</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0d0d1a; color:#ddd; font-family:'Segoe UI',sans-serif; display:flex; justify-content:center; align-items:center; min-height:100vh; }
.container { background:#1a1a2e; padding:2rem; border-radius:28px; width:460px; max-width:96%; box-shadow:0 12px 30px rgba(0,0,0,0.7); }
.hidden { display:none; }
h1 { color:#f1c40f; text-align:center; font-weight:700; margin-bottom:0.5rem; }
.sub { text-align:center; color:#888; margin-bottom:1.8rem; border-bottom:1px solid #2a2a44; padding-bottom:12px; }
label { display:block; font-size:0.85rem; color:#aaa; margin-top:14px; }
input { width:100%; padding:12px; background:#12121e; border:1px solid #333; border-radius:12px; color:#fff; font-size:1rem; outline:none; }
input:focus { border-color:#e67e22; }
.btn { background:#e67e22; color:#111; border:none; padding:14px; width:100%; border-radius:40px; font-weight:700; font-size:1rem; margin-top:20px; cursor:pointer; }
.btn:hover { background:#d35400; }
.status { color:#f39c12; text-align:center; margin-top:10px; font-size:0.9rem; }
.balance { background:#0f0f1a; padding:12px 16px; border-radius:16px; display:flex; justify-content:space-between; margin:16px 0; border-left:4px solid #e67e22; }
.bet-options { display:flex; gap:12px; margin:12px 0; }
.bet-options button { flex:1; padding:12px; border:2px solid #333; background:transparent; color:#ccc; border-radius:40px; font-weight:600; cursor:pointer; }
.bet-options button.active { border-color:#e67e22; background:#e67e22; color:#111; }
.money-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:12px 0; }
.money-grid button { background:#252540; border:none; padding:10px; border-radius:30px; color:#eee; font-weight:500; cursor:pointer; }
.money-grid button.selected { background:#e67e22; color:#111; }
.action-row { display:flex; gap:12px; margin-top:14px; }
.action-row button { flex:1; padding:14px; border:none; border-radius:40px; font-weight:700; font-size:1.1rem; cursor:pointer; }
.btn-tai { background:#2ecc71; color:#111; }
.btn-xiu { background:#e74c3c; color:#fff; }
.btn-dat { background:#3498db; color:#fff; flex:2; }
.log { margin-top:16px; background:#0d0d18; padding:12px; border-radius:14px; font-family:monospace; font-size:0.8rem; max-height:200px; overflow-y:auto; border:1px solid #2a2a40; white-space:pre-wrap; word-break:break-all; }
.footer { text-align:right; margin-top:10px; color:#555; font-size:0.7rem; }
</style>
</head>
<body>
<div class="container" id="app">
    <div id="loginArea">
        <h1>VIP BY HUYDAIXU</h1>
        <div class="sub">Đăng nhập hệ thống</div>
        <label>Tài khoản</label>
        <input type="text" id="username" value="GiaHuyNhoNguyet">
        <label>Mật khẩu</label>
        <input type="password" id="password" value="123456">
        <button class="btn" id="loginBtn">Đăng nhập</button>
        <div class="status" id="loginStatus"></div>
    </div>
    <div id="betArea" class="hidden">
        <h1>VIP BY HUYDAIXU</h1>
        <div style="display:flex; justify-content:space-between; font-size:0.9rem; color:#aaa;">
            <span>VIP 4</span>
            <span id="balanceDisplay">0</span>
        </div>
        <div class="balance">
            <span>💰 Số dư</span>
            <span id="balanceAmount">0</span>
        </div>
        <div style="margin:6px 0 2px; color:#aaa;">Chọn cửa</div>
        <div class="bet-options">
            <button id="btnTai" class="active">Tài</button>
            <button id="btnXiu">Xỉu</button>
        </div>
        <div style="margin:6px 0 2px; color:#aaa;">Chọn tiền</div>
        <div class="money-grid" id="moneyGrid">
            <button data-amount="1000">1K</button>
            <button data-amount="10000">10K</button>
            <button data-amount="50000">50K</button>
            <button data-amount="100000">100K</button>
            <button data-amount="500000">500K</button>
            <button data-amount="1000000">1M</button>
            <button data-amount="10000000">10M</button>
            <button data-amount="50000000">50M</button>
        </div>
        <div class="action-row">
            <button class="btn-tai" id="quickTai">Tài</button>
            <button class="btn-xiu" id="quickXiu">Xỉu</button>
            <button class="btn-dat" id="betBtn">Đặt cược</button>
        </div>
        <div class="log" id="logArea">Chờ kết nối...</div>
        <div class="footer">Powered by worm gpt</div>
    </div>
</div>
<script>
(function() {
    const loginBtn = document.getElementById('loginBtn');
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    const loginStatus = document.getElementById('loginStatus');
    const loginArea = document.getElementById('loginArea');
    const betArea = document.getElementById('betArea');

    let sessionKey = '', balance = 0, choice = 'tai', amount = 1000;
    let betLocked = false;

    function md5(str) { return CryptoJS.MD5(str).toString(); }

    loginBtn.addEventListener('click', function() {
        const un = username.value.trim();
        const pw = password.value.trim();
        if (!un || !pw) { loginStatus.innerText = '❌ Điền đủ thông tin'; return; }
        loginStatus.innerText = '⏳ Đang đăng nhập...';
        loginBtn.disabled = true;
        fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: un, password: pw })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                sessionKey = data.sessionKey;
                balance = data.balance;
                loginStatus.innerText = '✅ Thành công';
                loginArea.classList.add('hidden');
                betArea.classList.remove('hidden');
                document.getElementById('balanceAmount').innerText = balance.toLocaleString('vi-VN');
                document.getElementById('balanceDisplay').innerText = '💰 ' + balance.toLocaleString('vi-VN');
                log('⚡ Kết nối WebSocket qua proxy server');
                fetchBalance();
            } else {
                loginStatus.innerText = '❌ ' + (data.error || 'Sai thông tin');
            }
        })
        .catch(err => loginStatus.innerText = '⚠️ Lỗi: ' + err.message)
        .finally(() => loginBtn.disabled = false);
    });

    const btnTai = document.getElementById('btnTai');
    const btnXiu = document.getElementById('btnXiu');
    const moneyBtns = document.querySelectorAll('#moneyGrid button');
    const quickTai = document.getElementById('quickTai');
    const quickXiu = document.getElementById('quickXiu');
    const betBtn = document.getElementById('betBtn');
    const logArea = document.getElementById('logArea');

    function log(msg) {
        logArea.innerText += msg + '\n';
        logArea.scrollTop = logArea.scrollHeight;
    }

    function setChoice(c) {
        choice = c;
        btnTai.className = c === 'tai' ? 'active' : '';
        btnXiu.className = c === 'xiu' ? 'active' : '';
    }
    btnTai.addEventListener('click', () => setChoice('tai'));
    btnXiu.addEventListener('click', () => setChoice('xiu'));

    function setAmount(a) {
        amount = a;
        moneyBtns.forEach(b => b.classList.toggle('selected', parseInt(b.dataset.amount) === a));
    }
    moneyBtns.forEach(b => b.addEventListener('click', function() { setAmount(parseInt(this.dataset.amount)); }));
    setAmount(1000);
    document.querySelector('#moneyGrid button[data-amount="1000"]').classList.add('selected');

    quickTai.addEventListener('click', () => { setChoice('tai'); placeBet(); });
    quickXiu.addEventListener('click', () => { setChoice('xiu'); placeBet(); });

    function fetchBalance() {
        if (!sessionKey) return;
        fetch('/balance?sessionKey=' + sessionKey)
        .then(r => r.json())
        .then(d => {
            if (d.balance !== undefined) {
                balance = d.balance;
                document.getElementById('balanceAmount').innerText = balance.toLocaleString('vi-VN');
                document.getElementById('balanceDisplay').innerText = '💰 ' + balance.toLocaleString('vi-VN');
            }
        })
        .catch(() => {});
    }

    function placeBet() {
        if (betLocked) { log('⏳ Đang xử lý...'); return; }
        if (balance < amount) { alert('Đéo đủ tiền'); return; }
        betLocked = true;
        betBtn.disabled = true;
        betBtn.innerText = 'ĐANG XỬ LÝ...';
        log('📤 Đặt cược: ' + choice + ' - ' + amount);
        fetch('/bet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ choice: choice, amount: amount, sessionKey: sessionKey })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                balance -= amount;
                document.getElementById('balanceAmount').innerText = balance.toLocaleString('vi-VN');
                document.getElementById('balanceDisplay').innerText = '💰 ' + balance.toLocaleString('vi-VN');
                log('✅ Cược thành công');
                if (data.result) log('🎯 Kết quả: ' + JSON.stringify(data.result));
            } else {
                log('❌ Cược thất bại: ' + (data.error || 'unknown'));
                fetchBalance();
            }
        })
        .catch(e => log('⚠️ Lỗi: ' + e.message))
        .finally(() => {
            betLocked = false;
            betBtn.disabled = false;
            betBtn.innerText = 'Đặt cược';
        });
    }
    betBtn.addEventListener('click', placeBet);

    setInterval(fetchBalance, 5000);
})();
</script>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(HTML)

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    un = data.get('username', '').strip()
    pw = data.get('password', '').strip()
    if not un or not pw:
        return jsonify({"success": False, "error": "Thiếu thông tin"})
    try:
        params = {"c":"3","un":un,"pw":md5(pw),"cp":"R","cl":"R","pf":"web","at":""}
        resp = requests.get(BASE_API, params=params, headers={"User-Agent":"Mozilla/5.0"}, timeout=10)
        resp.raise_for_status()
        result = resp.json()
        if result.get("success"):
            session_key = result.get("sessionKey", "")
            access_token = result.get("accessToken", "")
            balance = result.get("vinTotal", 0)
            sessions[session_key] = {
                "access_token": access_token,
                "balance": balance,
                "ws": None,
                "ws_connected": False
            }
            return jsonify({
                "success": True,
                "sessionKey": session_key,
                "accessToken": access_token,
                "balance": balance
            })
        else:
            return jsonify({"success": False, "error": result.get("errorCode", "Lỗi không xác định")})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/balance', methods=['GET'])
def get_balance():
    sk = request.args.get('sessionKey')
    if not sk:
        return jsonify({"balance": 0})
    info = sessions.get(sk)
    if info:
        return jsonify({"balance": info.get("balance", 0)})
    return jsonify({"balance": 0})

@app.route('/bet', methods=['POST'])
def place_bet():
    data = request.get_json()
    choice = data.get('choice', 'tai')
    amount = data.get('amount', 0)
    session_key = data.get('sessionKey', '')
    if not session_key:
        return jsonify({"success": False, "error": "Missing session"})
    info = sessions.get(session_key)
    if not info:
        return jsonify({"success": False, "error": "Invalid session"})
    if info.get("balance", 0) < amount:
        return jsonify({"success": False, "error": "Insufficient balance"})

    ws = info.get("ws")
    if not ws or not info.get("ws_connected"):
        def on_open(ws_obj):
            info["ws_connected"] = True
            auth = {"action":"auth","token":session_key,"game":"taixiu_md5"}
            ws_obj.send(json.dumps(auth))
            print("WS auth sent")

        def on_message(ws_obj, msg):
            print("WS recv:", msg[:100])

        def on_error(ws_obj, err):
            print("WS error:", err)
            info["ws_connected"] = False

        def on_close(ws_obj, a, b):
            print("WS closed")
            info["ws_connected"] = False

        ws = websocket.WebSocketApp(WS_URL,
                                    on_open=on_open,
                                    on_message=on_message,
                                    on_error=on_error,
                                    on_close=on_close)
        info["ws"] = ws
        threading.Thread(target=ws.run_forever, daemon=True).start()
        time.sleep(1)

    if not info.get("ws_connected"):
        return jsonify({"success": False, "error": "WebSocket not ready"})

    bet_cmd = {"action":"bet","game":"taixiu_md5","choice":choice,"amount":amount,"session":session_key}
    try:
        info["ws"].send(json.dumps(bet_cmd))
        info["balance"] -= amount
        return jsonify({"success": True, "result": "sent"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)