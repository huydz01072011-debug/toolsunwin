const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Proxy API đăng nhập (tránh CORS)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Thiếu tài khoản hoặc mật khẩu' });
    }

    const passwordMD5 = crypto.createHash('md5').update(password).digest('hex');
    const baseUrl = 'https://apifo88daigia.tele68.com/api';
    const params = new URLSearchParams({
        c: '3',
        un: username,
        pw: passwordMD5,
        cp: 'R',
        cl: 'R',
        pf: 'web',
        at: '',
    });

    try {
        const response = await axios.get(`${baseUrl}?${params.toString()}`, {
            headers: { 'Accept': 'application/json' }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve giao diện
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>LC79 - Đại Gia</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body {
            background: #0b0b0b;
            font-family: 'Inter', 'Segoe UI', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
            color: #d4c8b0;
        }
        .card {
            width: 440px;
            max-width: 94vw;
            background: rgba(18,18,18,0.85);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(201,164,75,0.25);
            border-radius: 20px;
            padding: 28px 24px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.6);
        }
        .brand {
            text-align:center;
            font-size: 26px;
            font-weight:700;
            background: linear-gradient(180deg,#f0d78c,#c9a44b,#a07d28);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 6px;
        }
        .brand-sub {
            text-align:center;
            font-size:10px;
            letter-spacing:4px;
            color:#8a8070;
            margin-bottom: 20px;
        }
        .field { margin-bottom:16px; }
        .field-label {
            display:block;
            font-size:11px;
            font-weight:600;
            letter-spacing:1px;
            color:#8a8070;
            margin-bottom:4px;
        }
        .input-field {
            width:100%;
            padding:12px 16px;
            background:rgba(255,255,255,0.03);
            border:1px solid rgba(255,255,255,0.1);
            border-radius:12px;
            color:#e8ddcc;
            font-size:14px;
            outline:none;
            transition:0.3s;
        }
        .input-field:focus {
            border-color:rgba(201,164,75,0.5);
            background:rgba(255,255,255,0.05);
        }
        .btn {
            width:100%;
            padding:14px;
            border:none;
            border-radius:12px;
            font-size:15px;
            font-weight:700;
            letter-spacing:1.2px;
            text-transform:uppercase;
            cursor:pointer;
            color:#1a1000;
            background:linear-gradient(180deg,#f0d78c,#c9a44b,#a07d28);
            box-shadow:0 4px 16px rgba(201,164,75,0.25);
            transition:0.3s;
        }
        .btn:hover { transform:translateY(-2px); box-shadow:0 6px 24px rgba(201,164,75,0.35); }
        .btn:active { transform:translateY(0); }
        .btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
        .msg {
            margin-top:14px;
            padding:12px 16px;
            border-radius:10px;
            font-size:13px;
            display:none;
        }
        .msg.error { display:block; background:rgba(231,76,60,0.08); border:1px solid rgba(231,76,60,0.25); color:#f09090; }
        .msg.success { display:block; background:rgba(39,174,96,0.08); border:1px solid rgba(39,174,96,0.25); color:#6fcf97; }
        .msg .msg-title { font-weight:700; margin-bottom:4px; }
        .msg .msg-detail { font-size:11px; color:#b0a590; }

        .account-view { display:none; }
        .bet-view { display:none; margin-top:20px; border-top:1px solid rgba(255,255,255,0.05); padding-top:20px; }
        .bet-view .row { display:flex; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
        .bet-view .row label { display:flex; align-items:center; gap:6px; font-size:14px; color:#d4c8b0; cursor:pointer; }
        .bet-view .row input[type="radio"] { accent-color:#c9a44b; width:18px; height:18px; }
        .bet-view .row input[type="number"] {
            flex:1;
            padding:10px 14px;
            background:rgba(255,255,255,0.03);
            border:1px solid rgba(255,255,255,0.1);
            border-radius:10px;
            color:#e8ddcc;
            font-size:15px;
            min-width:120px;
        }
        .bet-view .row input[type="number"]:focus { border-color:#c9a44b; outline:none; }
        .bet-view .status {
            font-size:12px;
            padding:6px 12px;
            border-radius:20px;
            display:inline-block;
            margin-bottom:12px;
        }
        .status.connected { background:rgba(39,174,96,0.15); color:#6fcf97; }
        .status.disconnected { background:rgba(231,76,60,0.1); color:#f09090; }
        .balance {
            font-size:14px;
            margin-bottom:12px;
            color:#e0c878;
        }
        .bet-result {
            margin-top:12px;
            padding:10px 14px;
            border-radius:8px;
            background:rgba(255,255,255,0.03);
            border:1px solid rgba(255,255,255,0.05);
            font-size:13px;
            white-space:pre-wrap;
            word-break:break-word;
            max-height:150px;
            overflow-y:auto;
        }
        .btn-secondary {
            background:transparent;
            border:1px solid rgba(201,164,75,0.4);
            color:#c9a44b;
            padding:10px 16px;
            border-radius:10px;
            cursor:pointer;
            font-size:13px;
            font-weight:600;
            transition:0.3s;
        }
        .btn-secondary:hover { background:rgba(201,164,75,0.08); }
        .info-table { width:100%; border-collapse:collapse; margin:10px 0 16px; }
        .info-table td { padding:8px 4px; font-size:13px; border-bottom:1px solid rgba(255,255,255,0.04); }
        .info-table .label { color:#8a8070; font-weight:600; white-space:nowrap; }
        .info-table .value { color:#e0d6c2; word-break:break-all; }
        .flex { display:flex; gap:10px; flex-wrap:wrap; }
        .flex .btn { flex:1; }
        .mt-12 { margin-top:12px; }
    </style>
</head>
<body>

<div class="card" id="app">
    <div class="brand">LC79</div>
    <div class="brand-sub">Đại Gia · VIP</div>

    <!-- VIEW ĐĂNG NHẬP -->
    <div id="loginView">
        <form id="loginForm">
            <div class="field">
                <label class="field-label">Tài khoản</label>
                <input type="text" id="username" class="input-field" placeholder="Nhập tên tài khoản" required>
            </div>
            <div class="field">
                <label class="field-label">Mật khẩu</label>
                <input type="password" id="password" class="input-field" placeholder="Nhập mật khẩu" required>
            </div>
            <button type="submit" class="btn" id="btnLogin">Đăng Nhập</button>
        </form>
        <div class="msg" id="msgBox"></div>
    </div>

    <!-- VIEW TÀI KHOẢN -->
    <div class="account-view" id="accountView">
        <div style="text-align:center; margin-bottom:10px;">
            <span style="background:rgba(39,174,96,0.1); border:1px solid rgba(39,174,96,0.25); padding:4px 14px; border-radius:20px; font-size:11px;">✅ Đã đăng nhập</span>
        </div>
        <table class="info-table" id="infoTable"></table>
        <div class="flex">
            <button class="btn" id="goBetBtn">🎲 Vào trang đặt cược</button>
            <button class="btn-secondary" id="logoutBtn">← Thoát</button>
        </div>
    </div>

    <!-- VIEW ĐẶT CƯỢC -->
    <div class="bet-view" id="betView">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
            <span class="status disconnected" id="wsStatus">⚡ Chưa kết nối</span>
            <span class="balance" id="balanceDisplay">💰 Số dư: --</span>
        </div>

        <div class="row">
            <label><input type="radio" name="betType" value="TAI" checked> Tài</label>
            <label><input type="radio" name="betType" value="XIU"> Xỉu</label>
        </div>
        <div class="row">
            <input type="number" id="betAmount" placeholder="Số tiền" min="100" step="100" value="1000">
            <button class="btn" id="placeBetBtn" style="flex:0 0 auto; width:auto; padding:10px 24px;">Đặt cược</button>
        </div>
        <button class="btn-secondary" id="backToAccountBtn" style="margin-top:4px;">← Quay lại tài khoản</button>
        <div class="bet-result" id="betResult">Kết quả sẽ hiển thị tại đây...</div>
    </div>
</div>

<script>
    (function() {
        // DOM refs
        const loginView = document.getElementById('loginView');
        const accountView = document.getElementById('accountView');
        const betView = document.getElementById('betView');
        const loginForm = document.getElementById('loginForm');
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const msgBox = document.getElementById('msgBox');
        const infoTable = document.getElementById('infoTable');
        const goBetBtn = document.getElementById('goBetBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const backToAccountBtn = document.getElementById('backToAccountBtn');
        const wsStatus = document.getElementById('wsStatus');
        const balanceDisplay = document.getElementById('balanceDisplay');
        const betAmount = document.getElementById('betAmount');
        const placeBetBtn = document.getElementById('placeBetBtn');
        const betResult = document.getElementById('betResult');
        const betTypeRadios = document.querySelectorAll('input[name="betType"]');

        let accessToken = null;
        let sessionKey = null;
        let userData = null;
        let ws = null;
        let wsConnected = false;
        let wsAuthenticated = false;

        function showMessage(type, title, detail = '') {
            msgBox.className = 'msg ' + type;
            let html = '<div class="msg-title">' + title + '</div>';
            if (detail) html += '<div class="msg-detail">' + detail + '</div>';
            msgBox.innerHTML = html;
            msgBox.style.display = 'block';
        }

        function renderInfo(data) {
            const sessionData = parseSessionKey(data.sessionKey);
            let rows = '';
            const fields = [];
            if (data.sessionKey) fields.push({ label: '🔑 Session Key', value: data.sessionKey });
            if (data.accessToken) fields.push({ label: '🎫 Access Token', value: data.accessToken });
            if (data.curLevel !== undefined) fields.push({ label: '🎯 Cấp độ', value: data.curLevel });

            if (sessionData) {
                const skip = new Set(['sessionKey','accessToken','curLevel']);
                for (const [k,v] of Object.entries(sessionData)) {
                    if (skip.has(k)) continue;
                    if (['xutotal','daily','luckyrotate','mobilesecure','birthday','vippointsave','avatar','certificate'].includes(k.toLowerCase())) continue;
                    let label = k.replace(/([A-Z])/g,' $1').replace(/^./, s => s.toUpperCase()).trim();
                    let val = v;
                    if (typeof val === 'number' && k.toLowerCase().includes('vin')) val = Number(val).toLocaleString('vi-VN');
                    if (typeof val === 'boolean') val = val ? '✅ Có' : '❌ Không';
                    if (val === null || val === undefined) val = '—';
                    fields.push({ label: label, value: String(val) });
                }
            }
            if (fields.length === 0) fields.push({ label: '📦 Dữ liệu', value: JSON.stringify(data) });
            fields.forEach(f => {
                rows += '<tr><td class="label">'+f.label+'</td><td class="value">'+escapeHtml(f.value)+'</td></tr>';
            });
            infoTable.innerHTML = rows;
        }

        function parseSessionKey(key) {
            try { return JSON.parse(atob(key)); } catch(e) { return null; }
        }

        function escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = str;
            return d.innerHTML;
        }

        function showAccountView(data) {
            userData = data;
            accessToken = data.accessToken;
            sessionKey = data.sessionKey;
            renderInfo(data);
            loginView.style.display = 'none';
            accountView.style.display = 'block';
            betView.style.display = 'none';
            msgBox.style.display = 'none';
            // Reset WebSocket khi thoát
            if (ws) { ws.close(); ws = null; wsConnected = false; wsAuthenticated = false; }
        }

        function showLoginView() {
            loginForm.reset();
            msgBox.style.display = 'none';
            accountView.style.display = 'none';
            betView.style.display = 'none';
            loginView.style.display = 'block';
            if (ws) { ws.close(); ws = null; wsConnected = false; wsAuthenticated = false; }
        }

        function showBetView() {
            accountView.style.display = 'none';
            betView.style.display = 'block';
            betResult.textContent = 'Đang kết nối WebSocket...';
            connectWebSocket();
        }

        // ===================== WEBSOCKET =====================
        function connectWebSocket() {
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                ws.close();
            }
            ws = new WebSocket('wss://wtxmd52.tele68.com/txmd5/?EIO=4&transport=websocket');
            wsConnected = false;
            wsAuthenticated = false;
            wsStatus.className = 'status disconnected';
            wsStatus.textContent = '⚡ Đang kết nối...';
            balanceDisplay.textContent = '💰 Số dư: --';

            ws.onopen = function() {
                console.log('WebSocket mở');
                wsStatus.textContent = '🔄 Đang xác thực...';
                // Gửi token xác thực
                if (accessToken) {
                    const authMsg = '40/txmd5,{"token":"' + accessToken + '"}';
                    ws.send(authMsg);
                    console.log('Gửi xác thực:', authMsg);
                } else {
                    wsStatus.textContent = '❌ Thiếu token';
                }
            };

            ws.onmessage = function(e) {
                const msg = e.data;
                console.log('WS nhận:', msg);
                handleWsMessage(msg);
            };

            ws.onerror = function(err) {
                console.error('WS lỗi:', err);
                wsStatus.className = 'status disconnected';
                wsStatus.textContent = '❌ Lỗi kết nối';
                betResult.textContent = 'Lỗi WebSocket: ' + (err.message || 'không xác định');
            };

            ws.onclose = function() {
                console.log('WS đóng');
                wsConnected = false;
                wsAuthenticated = false;
                wsStatus.className = 'status disconnected';
                wsStatus.textContent = '⚡ Mất kết nối';
                betResult.textContent = 'Đã ngắt kết nối. Nhấn nút đặt cược để thử lại.';
            };
        }

        function handleWsMessage(msg) {
            // Xử lý các gói tin
            if (typeof msg !== 'string') return;

            // Gói 0: ping? bỏ qua
            if (msg.startsWith('0')) return;

            // Gói 40: thường là xác thực hoặc handshake
            if (msg.startsWith('40/txmd5,')) {
                const payload = msg.substring('40/txmd5,'.length);
                try {
                    const data = JSON.parse(payload);
                    if (data.sid) {
                        // Xác thực thành công
                        wsConnected = true;
                        wsAuthenticated = true;
                        wsStatus.className = 'status connected';
                        wsStatus.textContent = '✅ Đã kết nối';
                        betResult.textContent = 'Kết nối WebSocket thành công!';

                        // Gửi lấy thông tin cá nhân
                        ws.send('42/txmd5,["get-current-my-info",null]');
                        console.log('Gửi get-current-my-info');
                    } else if (data.token) {
                        // Có thể là yêu cầu token? nhưng ta đã gửi rồi
                    }
                } catch (e) {
                    console.warn('Parse 40 thất bại:', e);
                }
                return;
            }

            // Gói 42: sự kiện
            if (msg.startsWith('42/txmd5,')) {
                const payload = msg.substring('42/txmd5,'.length);
                try {
                    const arr = JSON.parse(payload);
                    const event = arr[0];
                    const data = arr[1];

                    if (event === 'your-current-session-info' || event === 'your-info') {
                        // Cập nhật số dư
                        let balance = data.balance || data.betAmountt || 0;
                        if (data.balance !== undefined) balance = data.balance;
                        if (data.betAmountt !== undefined) balance = data.betAmountt;
                        balanceDisplay.textContent = '💰 Số dư: ' + Number(balance).toLocaleString('vi-VN');
                        betResult.textContent = 'Đã nhận thông tin tài khoản. Số dư: ' + Number(balance).toLocaleString('vi-VN');
                    } else if (event === 'bet-result') {
                        // Kết quả đặt cược
                        const result = data;
                        let msg = 'Kết quả đặt cược:\n';
                        msg += 'Loại: ' + (result.type || '--') + '\n';
                        msg += 'Số tiền: ' + (result.amount ? Number(result.amount).toLocaleString('vi-VN') : '--') + '\n';
                        msg += 'Số dư mới: ' + (result.postBalance ? Number(result.postBalance).toLocaleString('vi-VN') : '--');
                        betResult.textContent = msg;
                        // Cập nhật số dư
                        if (result.postBalance) {
                            balanceDisplay.textContent = '💰 Số dư: ' + Number(result.postBalance).toLocaleString('vi-VN');
                        }
                    } else if (event === 'tick-update') {
                        // Cập nhật phiên, có thể hiển thị thông tin
                        // Không xử lý chi tiết
                    } else if (event === 'session-info') {
                        // Thông tin phiên
                    } else if (event === 'error') {
                        betResult.textContent = 'Lỗi từ server: ' + JSON.stringify(data);
                    } else {
                        // Các sự kiện khác
                        betResult.textContent = 'Nhận sự kiện: ' + event + '\n' + JSON.stringify(data, null, 2);
                    }
                } catch (e) {
                    console.warn('Parse 42 thất bại:', e);
                    betResult.textContent = 'Lỗi parse dữ liệu: ' + e.message;
                }
                return;
            }

            // Các gói khác
            if (msg.startsWith('3')) {
                // ping? bỏ qua
            } else {
                betResult.textContent = 'Nhận tin nhắn lạ: ' + msg;
            }
        }

        // Gửi lệnh đặt cược
        function placeBet() {
            if (!ws || ws.readyState !== WebSocket.OPEN || !wsAuthenticated) {
                betResult.textContent = '⚠️ WebSocket chưa kết nối hoặc chưa xác thực. Đang thử kết nối lại...';
                connectWebSocket();
                // Đợi 1s rồi thử lại? Ta sẽ để user bấm lại.
                return;
            }

            const amount = parseInt(betAmount.value);
            if (isNaN(amount) || amount < 100) {
                betResult.textContent = '⚠️ Số tiền phải >= 100 và là số hợp lệ.';
                return;
            }

            let type = 'TAI';
            for (const radio of betTypeRadios) {
                if (radio.checked) { type = radio.value; break; }
            }

            const betCmd = ['bet', { type: type, amount: amount }];
            const msg = '42/txmd5,' + JSON.stringify(betCmd);
            ws.send(msg);
            betResult.textContent = 'Đã gửi lệnh đặt cược: ' + type + ' - ' + Number(amount).toLocaleString('vi-VN');
            console.log('Gửi bet:', msg);
        }

        // ===================== SỰ KIỆN =====================

        // Đăng nhập
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim();
            if (!username || !password) {
                showMessage('error', 'Vui lòng nhập đầy đủ thông tin');
                return;
            }

            const btn = document.getElementById('btnLogin');
            btn.disabled = true;
            btn.textContent = 'Đang xử lý...';
            msgBox.style.display = 'none';

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (data.success === true) {
                    showAccountView(data);
                } else {
                    const err = data.error || 'Sai tài khoản hoặc mật khẩu';
                    showMessage('error', 'Đăng nhập thất bại', err);
                }
            } catch (err) {
                showMessage('error', 'Lỗi kết nối', err.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Đăng Nhập';
            }
        });

        // Chuyển sang đặt cược
        goBetBtn.addEventListener('click', function() {
            if (!accessToken) {
                alert('Chưa có token, vui lòng đăng nhập lại.');
                return;
            }
            showBetView();
        });

        // Quay lại tài khoản
        backToAccountBtn.addEventListener('click', function() {
            if (ws) { ws.close(); ws = null; wsConnected = false; wsAuthenticated = false; }
            accountView.style.display = 'block';
            betView.style.display = 'none';
        });

        // Đăng xuất
        logoutBtn.addEventListener('click', function() {
            if (ws) { ws.close(); ws = null; }
            showLoginView();
        });

        // Đặt cược
        placeBetBtn.addEventListener('click', placeBet);

        // Enter trên input số tiền cũng đặt cược
        betAmount.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                placeBet();
            }
        });

        // Khởi tạo
        showLoginView();
    })();
</script>
</body>
</html>`);
});

app.listen(port, () => {
    console.log(`Server chạy tại http://localhost:${port}`);
});