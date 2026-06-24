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
            headers: { 'Accept': 'application/json' },
            timeout: 10000
        });
        res.json(response.data);
    } catch (error) {
        console.error('Login proxy error:', error.message);
        res.status(500).json({ success: false, error: 'Lỗi kết nối đến máy chủ đăng nhập' });
    }
});

// Serve giao diện chính
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>LC79 - Đại Gia VIP</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body {
            background: #0a0a0a;
            font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
            color: #d4c8b0;
            -webkit-user-select: none;
            user-select: none;
        }
        .app-container {
            width: 480px;
            max-width: 100%;
            background: rgba(16,16,16,0.92);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(201,164,75,0.2);
            border-radius: 24px;
            padding: 28px 24px 24px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset;
            animation: fadeUp 0.5s ease forwards;
        }
        @keyframes fadeUp {
            0% { opacity:0; transform:translateY(30px); }
            100% { opacity:1; transform:translateY(0); }
        }
        .brand {
            text-align: center;
            font-size: 28px;
            font-weight: 800;
            letter-spacing: 2px;
            background: linear-gradient(180deg, #f5e3a0, #c9a44b, #a07d28);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 4px;
        }
        .brand-sub {
            text-align: center;
            font-size: 10px;
            letter-spacing: 5px;
            color: #7a7060;
            margin-bottom: 22px;
            text-transform: uppercase;
        }
        .field { margin-bottom:16px; }
        .field-label {
            display:block;
            font-size:11px;
            font-weight:600;
            letter-spacing:1px;
            color:#8a8070;
            margin-bottom:5px;
        }
        .input-field {
            width:100%;
            padding:13px 16px;
            background:rgba(255,255,255,0.03);
            border:1px solid rgba(255,255,255,0.08);
            border-radius:12px;
            color:#e8ddcc;
            font-size:14px;
            outline:none;
            transition: border 0.3s, background 0.3s;
        }
        .input-field:focus {
            border-color:rgba(201,164,75,0.5);
            background:rgba(255,255,255,0.06);
        }
        .input-field::placeholder { color:rgba(160,150,130,0.35); }

        .btn-primary {
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
            box-shadow:0 4px 20px rgba(201,164,75,0.25);
            transition:all 0.25s ease;
            font-family:inherit;
        }
        .btn-primary:hover { transform:translateY(-2px); box-shadow:0 8px 28px rgba(201,164,75,0.35); }
        .btn-primary:active { transform:translateY(0); }
        .btn-primary:disabled { opacity:0.5; cursor:not-allowed; transform:none; }

        .btn-secondary {
            background:transparent;
            border:1px solid rgba(201,164,75,0.3);
            color:#c9a44b;
            padding:10px 16px;
            border-radius:10px;
            cursor:pointer;
            font-size:13px;
            font-weight:600;
            transition:all 0.3s;
            font-family:inherit;
        }
        .btn-secondary:hover { background:rgba(201,164,75,0.08); }

        .msg {
            margin-top:14px;
            padding:12px 16px;
            border-radius:10px;
            font-size:13px;
            display:none;
            animation:fadeSlide 0.3s ease;
        }
        @keyframes fadeSlide {
            0% { opacity:0; transform:translateY(-6px); }
            100% { opacity:1; transform:translateY(0); }
        }
        .msg.error { display:block; background:rgba(231,76,60,0.08); border:1px solid rgba(231,76,60,0.2); color:#f09090; }
        .msg.success { display:block; background:rgba(39,174,96,0.08); border:1px solid rgba(39,174,96,0.2); color:#6fcf97; }
        .msg .msg-title { font-weight:700; margin-bottom:3px; }
        .msg .msg-detail { font-size:11px; color:#b0a590; }

        .view-account { display:none; }
        .view-bet { display:none; margin-top:16px; border-top:1px solid rgba(255,255,255,0.05); padding-top:16px; }

        .account-header {
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin-bottom:12px;
            flex-wrap:wrap;
            gap:8px;
        }
        .account-header .badge {
            background:rgba(39,174,96,0.12);
            border:1px solid rgba(39,174,96,0.2);
            padding:4px 14px;
            border-radius:20px;
            font-size:11px;
            color:#6fcf97;
        }
        .info-table {
            width:100%;
            border-collapse:collapse;
            margin:8px 0 14px;
        }
        .info-table td {
            padding:8px 4px;
            font-size:13px;
            border-bottom:1px solid rgba(255,255,255,0.04);
        }
        .info-table .label { color:#8a8070; font-weight:600; white-space:nowrap; }
        .info-table .value { color:#e0d6c2; word-break:break-all; }

        .flex-row {
            display:flex;
            gap:12px;
            flex-wrap:wrap;
        }
        .flex-row .btn-primary { flex:1; }
        .flex-row .btn-secondary { flex:1; }

        .bet-status {
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin-bottom:14px;
            flex-wrap:wrap;
        }
        .ws-status {
            font-size:12px;
            padding:4px 14px;
            border-radius:20px;
            display:inline-block;
        }
        .ws-status.connected { background:rgba(39,174,96,0.12); color:#6fcf97; }
        .ws-status.disconnected { background:rgba(231,76,60,0.08); color:#f09090; }
        .balance-display { font-size:15px; font-weight:600; color:#e0c878; }

        .bet-row {
            display:flex;
            flex-wrap:wrap;
            gap:12px;
            margin-bottom:12px;
            align-items:center;
        }
        .bet-row label {
            display:flex;
            align-items:center;
            gap:6px;
            font-size:14px;
            color:#d4c8b0;
            cursor:pointer;
        }
        .bet-row input[type="radio"] { accent-color:#c9a44b; width:18px; height:18px; }
        .bet-row input[type="number"] {
            flex:1;
            min-width:120px;
            padding:10px 14px;
            background:rgba(255,255,255,0.03);
            border:1px solid rgba(255,255,255,0.08);
            border-radius:10px;
            color:#e8ddcc;
            font-size:15px;
            outline:none;
        }
        .bet-row input[type="number"]:focus { border-color:#c9a44b; }
        .bet-row .btn-primary { width:auto; padding:10px 24px; flex:0 0 auto; }

        .bet-result {
            margin-top:12px;
            padding:12px 14px;
            border-radius:10px;
            background:rgba(255,255,255,0.02);
            border:1px solid rgba(255,255,255,0.05);
            font-size:13px;
            white-space:pre-wrap;
            word-break:break-word;
            max-height:160px;
            overflow-y:auto;
            color:#c0b8a0;
            line-height:1.6;
        }
        .mt-12 { margin-top:12px; }
        .text-center { text-align:center; }

        @media (max-width:480px) {
            .app-container { padding:20px 16px; }
            .brand { font-size:24px; }
            .flex-row .btn-primary, .flex-row .btn-secondary { flex:1 1 100%; }
            .bet-row .btn-primary { flex:1; }
        }
    </style>
</head>
<body>
<div class="app-container" id="app">

    <div class="brand">LC79</div>
    <div class="brand-sub">Đại Gia • VIP</div>

    <!-- VIEW LOGIN -->
    <div id="loginView">
        <form id="loginForm" autocomplete="off">
            <div class="field">
                <label class="field-label">Tài khoản</label>
                <input type="text" id="username" class="input-field" placeholder="Nhập tên tài khoản" required>
            </div>
            <div class="field">
                <label class="field-label">Mật khẩu</label>
                <input type="password" id="password" class="input-field" placeholder="Nhập mật khẩu" required>
            </div>
            <button type="submit" class="btn-primary" id="loginBtn">Đăng Nhập</button>
        </form>
        <div class="msg" id="msgBox"></div>
    </div>

    <!-- VIEW ACCOUNT -->
    <div class="view-account" id="accountView">
        <div class="account-header">
            <span class="badge">✅ Đã đăng nhập</span>
            <span style="font-size:13px; color:#8a8070;" id="userNickname"></span>
        </div>
        <table class="info-table" id="infoTable"></table>
        <div class="flex-row">
            <button class="btn-primary" id="goBetBtn">🎲 Đặt cược</button>
            <button class="btn-secondary" id="logoutBtn">← Thoát</button>
        </div>
    </div>

    <!-- VIEW BET -->
    <div class="view-bet" id="betView">
        <div class="bet-status">
            <span class="ws-status disconnected" id="wsStatus">⚡ Chưa kết nối</span>
            <span class="balance-display" id="balanceDisplay">💰 --</span>
        </div>

        <div class="bet-row">
            <label><input type="radio" name="betType" value="TAI" checked> Tài</label>
            <label><input type="radio" name="betType" value="XIU"> Xỉu</label>
        </div>
        <div class="bet-row">
            <input type="number" id="betAmount" placeholder="Số tiền" min="100" step="100" value="1000">
            <button class="btn-primary" id="placeBetBtn">Đặt cược</button>
        </div>
        <button class="btn-secondary" id="backToAccountBtn" style="width:100%;">← Quay lại tài khoản</button>
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
    const loginBtn = document.getElementById('loginBtn');
    const msgBox = document.getElementById('msgBox');
    const infoTable = document.getElementById('infoTable');
    const userNickname = document.getElementById('userNickname');
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
    let userData = null;
    let ws = null;
    let wsConnected = false;
    let wsAuthenticated = false;
    let currentBalance = 0;

    // Helper functions
    function showMessage(type, title, detail = '') {
        msgBox.className = 'msg ' + type;
        let html = '<div class="msg-title">' + title + '</div>';
        if (detail) html += '<div class="msg-detail">' + detail + '</div>';
        msgBox.innerHTML = html;
        msgBox.style.display = 'block';
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function parseSessionKey(key) {
        try { return JSON.parse(atob(key)); } catch(e) { return null; }
    }

    function renderAccountInfo(data) {
        const sessionData = parseSessionKey(data.sessionKey);
        let rows = '';
        const fields = [];

        if (sessionData && sessionData.nickname) {
            userNickname.textContent = '👤 ' + sessionData.nickname;
        } else {
            userNickname.textContent = '';
        }

        if (data.accessToken) fields.push({ label: '🎫 Access Token', value: data.accessToken, mono: true });
        if (data.curLevel !== undefined) fields.push({ label: '🎯 Cấp độ', value: data.curLevel });

        if (sessionData) {
            const skip = new Set(['accessToken','curLevel']);
            const hiddenKeys = ['xutotal','daily','luckyrotate','mobilesecure','birthday','vippointsave','avatar','certificate','ipaddress'];
            for (const [k, v] of Object.entries(sessionData)) {
                if (skip.has(k)) continue;
                if (hiddenKeys.includes(k.toLowerCase())) continue;
                let label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
                let val = v;
                if (typeof val === 'number' && (k.toLowerCase().includes('vin') || k.toLowerCase().includes('total'))) {
                    val = Number(val).toLocaleString('vi-VN');
                }
                if (typeof val === 'boolean') val = val ? '✅ Có' : '❌ Không';
                if (val === null || val === undefined) val = '—';
                fields.push({ label: label, value: String(val) });
            }
        }

        if (fields.length === 0) {
            fields.push({ label: '📦 Dữ liệu', value: JSON.stringify(data, null, 2) });
        }

        fields.forEach(f => {
            const monoClass = f.mono ? ' value-mono' : '';
            rows += '<tr><td class="label">' + escapeHtml(f.label) + '</td><td class="value' + monoClass + '">' + escapeHtml(f.value) + '</td></tr>';
        });
        infoTable.innerHTML = rows;
    }

    function showAccountView(data) {
        userData = data;
        accessToken = data.accessToken;
        renderAccountInfo(data);
        loginView.style.display = 'none';
        accountView.style.display = 'block';
        betView.style.display = 'none';
        msgBox.style.display = 'none';
        if (ws) { ws.close(); ws = null; wsConnected = false; wsAuthenticated = false; }
    }

    function showLoginView() {
        loginForm.reset();
        msgBox.style.display = 'none';
        msgBox.className = 'msg';
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

    // ==================== WEBSOCKET ====================
    function connectWebSocket() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            ws.close();
        }
        ws = new WebSocket('wss://wtxmd52.tele68.com/txmd5/?EIO=4&transport=websocket');
        wsConnected = false;
        wsAuthenticated = false;
        wsStatus.className = 'ws-status disconnected';
        wsStatus.textContent = '⚡ Đang kết nối...';
        balanceDisplay.textContent = '💰 --';

        ws.onopen = function() {
            console.log('WebSocket mở');
            wsStatus.textContent = '🔄 Xác thực...';
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
            wsStatus.className = 'ws-status disconnected';
            wsStatus.textContent = '❌ Lỗi';
            betResult.textContent = 'Lỗi WebSocket: ' + (err.message || 'không xác định');
        };

        ws.onclose = function() {
            console.log('WS đóng');
            wsConnected = false;
            wsAuthenticated = false;
            wsStatus.className = 'ws-status disconnected';
            wsStatus.textContent = '⚡ Mất kết nối';
            betResult.textContent = 'Đã ngắt kết nối. Nhấn đặt cược để thử lại.';
        };
    }

    function handleWsMessage(msg) {
        if (typeof msg !== 'string') return;

        if (msg.startsWith('0')) return; // ping

        // Handshake / Auth (40)
        if (msg.startsWith('40/txmd5,')) {
            const payload = msg.substring('40/txmd5,'.length);
            try {
                const data = JSON.parse(payload);
                if (data.sid) {
                    wsConnected = true;
                    wsAuthenticated = true;
                    wsStatus.className = 'ws-status connected';
                    wsStatus.textContent = '✅ Đã kết nối';
                    betResult.textContent = 'Kết nối WebSocket thành công!';
                    ws.send('42/txmd5,["get-current-my-info",null]');
                    console.log('Gửi get-current-my-info');
                }
            } catch(e) {
                console.warn('Parse 40 fail:', e);
            }
            return;
        }

        // Event (42)
        if (msg.startsWith('42/txmd5,')) {
            const payload = msg.substring('42/txmd5,'.length);
            try {
                const arr = JSON.parse(payload);
                const event = arr[0];
                const data = arr[1];

                if (event === 'your-current-session-info' || event === 'your-info') {
                    let balance = data.balance || data.betAmountt || 0;
                    if (data.balance !== undefined) balance = data.balance;
                    if (data.betAmountt !== undefined) balance = data.betAmountt;
                    currentBalance = balance;
                    balanceDisplay.textContent = '💰 ' + Number(balance).toLocaleString('vi-VN');
                    betResult.textContent = 'Đã nhận thông tin. Số dư: ' + Number(balance).toLocaleString('vi-VN');
                } else if (event === 'bet-result') {
                    const result = data;
                    let msg = '🎲 Kết quả cược:\n';
                    msg += 'Loại: ' + (result.type || '--') + '\n';
                    msg += 'Tiền: ' + (result.amount ? Number(result.amount).toLocaleString('vi-VN') : '--') + '\n';
                    msg += 'Số dư mới: ' + (result.postBalance ? Number(result.postBalance).toLocaleString('vi-VN') : '--');
                    betResult.textContent = msg;
                    if (result.postBalance) {
                        currentBalance = result.postBalance;
                        balanceDisplay.textContent = '💰 ' + Number(result.postBalance).toLocaleString('vi-VN');
                    }
                } else if (event === 'error') {
                    betResult.textContent = '❌ Lỗi: ' + JSON.stringify(data);
                } else {
                    betResult.textContent = '📨 ' + event + '\n' + JSON.stringify(data, null, 2);
                }
            } catch(e) {
                console.warn('Parse 42 fail:', e);
                betResult.textContent = 'Lỗi parse dữ liệu: ' + e.message;
            }
            return;
        }

        if (!msg.startsWith('3')) {
            betResult.textContent = 'Tin nhắn lạ: ' + msg;
        }
    }

    function placeBet() {
        if (!ws || ws.readyState !== WebSocket.OPEN || !wsAuthenticated) {
            betResult.textContent = '⚠️ Chưa kết nối. Đang thử kết nối lại...';
            connectWebSocket();
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN && wsAuthenticated) {
                    placeBet();
                } else {
                    betResult.textContent = '❌ Không thể kết nối. Vui lòng thử lại sau.';
                }
            }, 1500);
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
        betResult.textContent = '📤 Đã gửi lệnh: ' + type + ' - ' + Number(amount).toLocaleString('vi-VN');
        console.log('Gửi bet:', msg);
    }

    // ==================== SỰ KIỆN ====================

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault(); // Ngăn reload trang
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        if (!username || !password) {
            showMessage('error', 'Vui lòng nhập đầy đủ thông tin');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang xử lý...';
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
                const errMsg = data.error || data.errorCode || 'Sai tài khoản hoặc mật khẩu';
                showMessage('error', 'Đăng nhập thất bại', errMsg);
            }
        } catch (err) {
            showMessage('error', 'Lỗi kết nối', err.message);
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Đăng Nhập';
        }
    });

    goBetBtn.addEventListener('click', function() {
        if (!accessToken) {
            alert('Chưa có token. Vui lòng đăng nhập lại.');
            return;
        }
        showBetView();
    });

    backToAccountBtn.addEventListener('click', function() {
        if (ws) { ws.close(); ws = null; wsConnected = false; wsAuthenticated = false; }
        accountView.style.display = 'block';
        betView.style.display = 'none';
    });

    logoutBtn.addEventListener('click', function() {
        if (ws) { ws.close(); ws = null; }
        showLoginView();
    });

    placeBetBtn.addEventListener('click', placeBet);

    betAmount.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            placeBet();
        }
    });

    showLoginView();
})();
</script>
</body>
</html>`);
});

app.listen(port, () => {
    console.log(`🚀 Server chạy tại http://localhost:${port}`);
});