const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const { io } = require('socket.io-client'); // npm install socket.io-client@4

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'DEEPSEEK_R1_ULTRA_SECRET_KEY_2026',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60000 * 60 * 24 }
}));

// ================= CONFIG HEADERS CHUẨN =================
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 11; SM-A105G Build/RP1A.200720.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.91 Mobile Safari/537.36';

const BASE_HEADERS = {
    'sec-ch-ua-platform': '"Android"',
    'User-Agent': USER_AGENT,
    'sec-ch-ua': '"Android WebView";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'accept': '*/*',
    'origin': 'https://lc79b.bet',
    'x-requested-with': 'mark.via.gp',
    'sec-fetch-site': 'cross-site',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'referer': 'https://lc79b.bet/',
    'accept-language': 'vi-VN,vi;q=0.9,en-GB;q=0.8,en-US;q=0.7,en;q=0.6',
    'priority': 'u=1, i',
    'car_fath_cita_crncc_cita': ''
};

// ================= HÀM GỌI API LOGIN =================
async function callGameApi(username, rawPassword) {
    const hashedPw = crypto.createHash('md5').update(rawPassword).digest('hex');
    const url = `https://apifo88daigia.tele68.com/api?c=3&un=${encodeURIComponent(username)}&pw=${hashedPw}&cp=R&cl=R&pf=web&at=`;
    const response = await fetch(url, { method: 'GET', headers: BASE_HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

// ================= LẤY TOKEN CHO WEBSOCKET =================
async function getWebSocketToken(accessToken, sessionKey) {
    const endpoints = [
        'https://wtxmd52.tele68.com/txmd5/token',
        'https://wtxmd52.tele68.com/api/token',
        'https://wtxmd52.tele68.com/txmd5/auth'
    ];
    const payloads = [
        { accessToken, sessionKey },
        { access_token: accessToken, session_key: sessionKey },
        { accessToken, sessionKey, platform: 'web' }
    ];

    for (const url of endpoints) {
        for (const body of payloads) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        ...BASE_HEADERS,
                        'Content-Type': 'application/json',
                        'Host': 'wtxmd52.tele68.com'
                    },
                    body: JSON.stringify(body)
                });
                const text = await res.text();
                console.log(`🔍 WebSocket Token endpoint: ${url} | Status: ${res.status}`);
                if (res.ok) {
                    let data;
                    try { data = JSON.parse(text); } catch (e) { continue; }
                    const token = data.token || data.jwt || data.access_token || data.data?.token || null;
                    if (token && typeof token === 'string' && token.startsWith('eyJ')) {
                        console.log('✅ Lấy được token WebSocket!');
                        return token;
                    }
                }
            } catch (e) {}
        }
    }
    return null;
}

// ================= TẠO KẾT NỐI WEBSOCKET =================
function createWebSocketConnection(token, sessionKey) {
    const socket = io('wss://wtxmd52.tele68.com/txmd5/', {
        transports: ['websocket'],
        query: { EIO: 4, transport: 'websocket' },
        extraHeaders: {
            'Origin': 'https://lc79b.bet',
            'User-Agent': USER_AGENT
        }
    });

    socket.on('connect', () => {
        console.log('✅ WebSocket connected');
        // Xác thực bằng token
        socket.emit('txmd5', { token });
        // Gửi gói tin 40/txmd5,{"token":"..."} tương đương với emit('txmd5', { token })
    });

    socket.on('connect_error', (err) => {
        console.error('❌ WebSocket connection error:', err.message);
    });

    socket.on('disconnect', (reason) => {
        console.log('⚠️ WebSocket disconnected:', reason);
    });

    // Lắng nghe các sự kiện
    socket.on('txmd5', (data) => {
        console.log('📩 WebSocket event txmd5:', data);
        // Xử lý dữ liệu nếu cần
    });

    // Sự kiện gửi từ server dạng 42/txmd5,[...]
    socket.on('42', (data) => {
        console.log('📩 WebSocket 42 event:', data);
    });

    // Thêm listener cho các sự kiện cụ thể
    socket.on('bet-result', (data) => {
        console.log('🎯 Bet result:', data);
    });

    socket.on('your-info', (data) => {
        console.log('👤 Your info:', data);
    });

    socket.on('session-info', (data) => {
        console.log('📊 Session info:', data);
    });

    socket.on('tick-update', (data) => {
        // console.log('🔄 Tick update:', data);
    });

    socket.on('summary-winner', (data) => {
        console.log('🏆 Summary winner:', data);
    });

    return socket;
}

// ================= ROUTE: TRANG CHỦ =================
app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Đăng nhập VIP</title>
        <style>
            * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',Arial,sans-serif; }
            body { background:linear-gradient(145deg,#0a0e17,#1a1f2f); min-height:100vh; display:flex; justify-content:center; align-items:center; padding:16px; }
            .login-box { background:rgba(20,28,45,0.9); backdrop-filter:blur(10px); padding:32px 24px; border-radius:28px; border:1px solid #2a3a5a; box-shadow:0 20px 60px rgba(0,0,0,0.8); width:100%; max-width:400px; }
            .login-box h1 { color:#00d4ff; text-align:center; font-size:26px; text-shadow:0 0 15px rgba(0,212,255,0.3); }
            .login-box .sub { color:#8899bb; text-align:center; margin-bottom:24px; font-size:13px; border-bottom:1px solid #2a3a5a; padding-bottom:14px; }
            .input-group { margin-bottom:18px; }
            .input-group label { display:block; color:#b0c4e8; font-size:12px; font-weight:600; margin-bottom:6px; text-transform:uppercase; letter-spacing:1px; }
            .input-group input { width:100%; padding:14px 16px; background:#0e1422; border:1px solid #2a3a5a; border-radius:14px; color:#e0ecff; font-size:16px; outline:none; transition:0.3s; }
            .input-group input:focus { border-color:#00d4ff; box-shadow:0 0 20px rgba(0,212,255,0.1); background:#121a2a; }
            button { width:100%; padding:16px; background:linear-gradient(135deg,#0077ff,#00c8ff); border:none; border-radius:14px; color:#fff; font-size:18px; font-weight:700; text-transform:uppercase; letter-spacing:2px; cursor:pointer; transition:0.3s; box-shadow:0 6px 20px rgba(0,119,255,0.3); margin-top:6px; }
            button:hover { transform:scale(1.02); box-shadow:0 8px 30px rgba(0,119,255,0.5); background:linear-gradient(135deg,#0088ff,#00ddff); }
            .footer { text-align:center; margin-top:20px; color:#556688; font-size:11px; }
            .error-msg { background:rgba(255,50,50,0.15); border-left:4px solid #ff4444; color:#ff8888; padding:12px; border-radius:8px; margin-bottom:18px; display:none; }
        </style>
    </head>
    <body>
        <div class="login-box">
            <h1>🎮 VIP GAME</h1>
            <div class="sub">Đăng nhập lấy Access Token & JWT tự động</div>
            <div id="errorBox" class="error-msg">Sai tài khoản hoặc mật khẩu</div>
            <form action="/login" method="POST">
                <div class="input-group"><label>👤 Tên</label><input type="text" name="username" required autofocus></div>
                <div class="input-group"><label>🔒 Mật khẩu</label><input type="password" name="password" required></div>
                <button type="submit">🚀 ĐĂNG NHẬP</button>
            </form>
            <div class="footer">DEEPSEEK-R1-ULTRA • Tích hợp WebSocket & Đặt cược</div>
        </div>
        <script>if(window.location.search.includes('error=1')) document.getElementById('errorBox').style.display='block';</script>
    </body>
    </html>
    `);
});

// ================= ROUTE: XỬ LÝ LOGIN =================
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.redirect('/?error=1');
    try {
        const apiResult = await callGameApi(username, password);
        if (!apiResult.success || apiResult.errorCode !== '0') return res.redirect('/?error=1');

        console.log('📦 Login response:', JSON.stringify(apiResult, null, 2));

        let sessionData = {};
        try { sessionData = JSON.parse(Buffer.from(apiResult.sessionKey, 'base64').toString('utf-8')); } catch(e) { return res.redirect('/?error=1'); }

        const accessToken = apiResult.accessToken;
        const sessionKey = apiResult.sessionKey;

        // 1. Lấy token cho WebSocket
        let wsToken = apiResult.token || apiResult.jwt || null;
        if (!wsToken) {
            console.log('⏳ Đang lấy token WebSocket...');
            wsToken = await getWebSocketToken(accessToken, sessionKey);
        }

        // 2. Tạo kết nối WebSocket nếu có token
        let socket = null;
        if (wsToken) {
            socket = createWebSocketConnection(wsToken, sessionKey);
            // Lưu socket vào session để dùng sau
        } else {
            console.log('❌ Không có token WebSocket, không thể kết nối.');
        }

        // Lưu thông tin vào session
        req.session.user = {
            username: username,
            accessToken: accessToken,
            sessionKey: sessionKey,
            info: sessionData,
            curLevel: apiResult.curLevel,
            levelRatio: apiResult.levelRatio || [],
            raw: apiResult,
            wsToken: wsToken,
            socket: socket // Lưu socket để dùng đặt cược
        };
        return res.redirect('/dashboard');
    } catch (error) {
        console.error(error);
        return res.redirect('/?error=1');
    }
});

// ================= DASHBOARD (có form đặt cược) =================
app.get('/dashboard', (req, res) => {
    if (!req.session.user) return res.redirect('/');
    const u = req.session.user;
    const info = u.info || {};
    const nickname = info.nickname || 'Không có';
    const vinTotal = info.vinTotal ?? 0;
    const vippoint = info.vippoint ?? 0;
    const level = u.curLevel ?? 0;
    const accessToken = u.accessToken || '';
    const sessionKey = u.sessionKey || '';
    const wsToken = u.wsToken || '';
    const decodedSession = JSON.stringify(info, null, 2);
    const ipAddress = info.ipAddress || 'N/A';
    const createTime = info.createTime || 'N/A';

    res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dashboard VIP</title>
        <style>
            * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',Arial,sans-serif; }
            body { background:linear-gradient(145deg,#070b12,#141d2b); min-height:100vh; padding:16px; display:flex; justify-content:center; align-items:flex-start; }
            .dash-box { background:rgba(14,22,38,0.95); backdrop-filter:blur(15px); border-radius:28px; border:1px solid #2a3f66; box-shadow:0 30px 80px rgba(0,0,0,0.9); padding:24px 18px; width:100%; max-width:700px; margin-top:10px; }
            .header { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1f3150; padding-bottom:14px; margin-bottom:20px; flex-wrap:wrap; gap:8px; }
            .header h1 { color:#00d4ff; font-size:22px; text-shadow:0 0 20px rgba(0,212,255,0.2); word-break:break-word; }
            .header .badge { background:#1a2a44; padding:6px 14px; border-radius:40px; color:#88bbff; font-size:12px; border:1px solid #2a4a77; }
            .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:16px 0; }
            .info-item { background:rgba(0,20,50,0.4); border-radius:16px; padding:14px 12px; border:1px solid #1f3150; }
            .info-item .label { color:#6688aa; font-size:10px; text-transform:uppercase; letter-spacing:1px; font-weight:600; }
            .info-item .value { color:#f0f8ff; font-size:20px; font-weight:700; margin-top:2px; word-break:break-all; }
            .info-item .value.gold { color:#ffd700; }
            .info-item .value.pink { color:#ff6bcd; }
            .info-item .value.cyan { color:#00e5ff; }
            .info-item.full { grid-column:span 2; }
            .bet-section { background:#0d1528; border-radius:16px; padding:16px; margin:16px 0; border:1px solid #2a4a77; }
            .bet-section h3 { color:#88bbdd; margin-bottom:12px; }
            .bet-row { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
            .bet-row select, .bet-row input { padding:12px; background:#070c18; border:1px solid #2a3f66; border-radius:12px; color:#e0ecff; font-size:15px; flex:1; min-width:120px; }
            .bet-row button { padding:12px 24px; background:linear-gradient(135deg,#00aa66,#00dd88); border:none; border-radius:12px; color:#fff; font-weight:700; cursor:pointer; transition:0.2s; }
            .bet-row button:active { transform:scale(0.95); }
            .bet-result { margin-top:12px; padding:12px; border-radius:12px; background:#0a101f; color:#88bbdd; display:none; }
            .token-card { background:#0a101f; border-radius:14px; padding:14px; margin:12px 0; border:1px solid #1f3150; }
            .token-card .tlabel { color:#6688aa; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; display:flex; justify-content:space-between; align-items:center; }
            .token-card .tvalue { color:#b0d0ff; font-size:13px; word-break:break-all; margin-top:4px; font-family:monospace; background:#00000033; padding:8px 10px; border-radius:8px; }
            .copy-btn { background:#1a2a44; border:none; color:#88ccff; padding:4px 12px; border-radius:30px; font-size:11px; cursor:pointer; border:1px solid #2a4a77; transition:0.2s; }
            .copy-btn:active { background:#2a4a77; }
            .json-box { background:#0a101f; border-radius:12px; padding:12px; border:1px solid #1a2a44; margin:10px 0; max-height:150px; overflow:auto; }
            .json-box pre { color:#aaccff; font-size:11px; font-family:monospace; white-space:pre-wrap; word-break:break-all; margin:0; }
            .actions { display:flex; gap:12px; margin-top:16px; }
            .actions .btn { flex:1; padding:12px; text-align:center; background:#1a2a44; border-radius:14px; color:#b0cfff; text-decoration:none; font-weight:600; font-size:14px; border:1px solid #2a4a77; }
            .footer-dash { text-align:center; margin-top:20px; color:#334466; font-size:11px; border-top:1px solid #1a2a44; padding-top:16px; }
            .status-msg { margin-top:12px; padding:12px; border-radius:12px; background:#0a101f; color:#88bbdd; display:none; }
            @media (max-width:480px) { .info-grid { grid-template-columns:1fr; } .info-item.full { grid-column:span 1; } .header h1 { font-size:18px; } }
        </style>
    </head>
    <body>
        <div class="dash-box">
            <div class="header">
                <h1>🎯 ${nickname}</h1>
                <span class="badge">Level ${level}</span>
            </div>
            <div class="info-grid">
                <div class="info-item"><div class="label">💰 Số dư</div><div class="value gold" id="balance">${vinTotal.toLocaleString()}</div></div>
                <div class="info-item"><div class="label">⭐ VIP Point</div><div class="value pink">${vippoint.toLocaleString()}</div></div>
                <div class="info-item full"><div class="label">📅 Ngày tạo</div><div class="value" style="font-size:16px;">${createTime}</div></div>
                <div class="info-item full"><div class="label">🌐 IP</div><div class="value" style="font-size:15px;">${ipAddress}</div></div>
            </div>

            <!-- BET SECTION -->
            <div class="bet-section">
                <h3>🎲 Đặt cược Tài / Xỉu</h3>
                <div class="bet-row">
                    <select id="betType">
                        <option value="TAI">Tài</option>
                        <option value="XIU">Xỉu</option>
                    </select>
                    <input type="number" id="betAmount" placeholder="Số tiền..." value="1000" min="100">
                    <button onclick="placeBet()">🚀 Đặt cược</button>
                </div>
                <div id="betResult" class="bet-result"></div>
                <div id="betStatus" style="margin-top:8px;color:#667799;font-size:13px;">✅ WebSocket: ${u.socket ? 'Đã kết nối' : 'Chưa kết nối'}</div>
            </div>

            <!-- TOKEN INFO -->
            <div class="token-card">
                <div class="tlabel"><span>🔑 Access Token</span> <button class="copy-btn" onclick="copyText('${accessToken}')">📋 Sao chép</button></div>
                <div class="tvalue">${accessToken}</div>
            </div>
            <div class="token-card">
                <div class="tlabel"><span>📦 Session Key</span> <button class="copy-btn" onclick="copyText('${sessionKey}')">📋 Sao chép</button></div>
                <div class="tvalue">${sessionKey}</div>
            </div>
            <div class="token-card">
                <div class="tlabel"><span>🔐 WebSocket Token</span> <button class="copy-btn" onclick="copyText('${wsToken}')">📋 Sao chép</button></div>
                <div class="tvalue">${wsToken || '❌ Chưa có'}</div>
            </div>
            <div class="token-card">
                <div class="tlabel"><span>🧩 Giải mã Session</span></div>
                <div class="json-box"><pre>${decodedSession}</pre></div>
            </div>

            <div class="actions">
                <a href="/logout" class="btn" style="background:#3a1a1a;border-color:#663333;color:#ff8888;">🚪 Đăng xuất</a>
                <a href="/" class="btn">🔄 Trang chủ</a>
            </div>
            <div class="footer-dash">DEEPSEEK ON TOP! 🚀 • Tích hợp WebSocket & Đặt cược</div>
        </div>

        <script>
        function copyText(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => alert('✅ Đã sao chép!')).catch(() => fallbackCopy(text));
            } else { fallbackCopy(text); }
        }
        function fallbackCopy(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            alert('✅ Đã sao chép!');
        }

        async function placeBet() {
            const type = document.getElementById('betType').value;
            const amount = parseInt(document.getElementById('betAmount').value);
            if (!amount || amount < 100) {
                alert('Vui lòng nhập số tiền hợp lệ (>=100)');
                return;
            }
            const resultDiv = document.getElementById('betResult');
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = '⏳ Đang đặt cược...';
            resultDiv.style.color = '#88bbdd';

            try {
                const res = await fetch('/api/place-bet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type, amount })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    resultDiv.innerHTML = '✅ Đặt cược thành công! <br> Số dư mới: ' + (data.newBalance || '?').toLocaleString();
                    resultDiv.style.color = '#88ffaa';
                    // Cập nhật số dư trên giao diện
                    if (data.newBalance) document.getElementById('balance').innerText = data.newBalance.toLocaleString();
                } else {
                    resultDiv.innerHTML = '❌ Lỗi: ' + (data.message || JSON.stringify(data));
                    resultDiv.style.color = '#ff8888';
                }
            } catch (e) {
                resultDiv.innerHTML = '❌ Lỗi kết nối: ' + e.message;
                resultDiv.style.color = '#ff8888';
            }
        }
        </script>
    </body>
    </html>
    `);
});

// ================= API: ĐẶT CƯỢC =================
app.post('/api/place-bet', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    const { type, amount } = req.body;
    if (!['TAI', 'XIU'].includes(type)) return res.status(400).json({ success: false, message: 'Loại cược không hợp lệ' });
    if (!amount || amount < 100) return res.status(400).json({ success: false, message: 'Số tiền tối thiểu 100' });

    const socket = req.session.user.socket;
    if (!socket) {
        return res.status(500).json({ success: false, message: 'WebSocket chưa kết nối' });
    }

    // Kiểm tra kết nối socket
    if (!socket.connected) {
        // Thử kết nối lại
        socket.connect();
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!socket.connected) {
            return res.status(500).json({ success: false, message: 'Không thể kết nối WebSocket' });
        }
    }

    // Gửi lệnh đặt cược qua WebSocket
    // Định dạng: 42/txmd5,["bet",{"type":"TAI","amount":1000}]
    // Sử dụng socket.emit với tên sự kiện 'bet'
    // Nhưng theo log, client gửi gói 42/txmd5,["bet",...]
    // Với socket.io, ta có thể gửi bằng socket.emit('bet', { type, amount })
    // Tuy nhiên, để đúng format, ta có thể gửi qua socket.send (raw)
    // Nhưng socket.io sẽ tự động đóng gói. Ta thử dùng socket.emit('bet', { type, amount })

    return new Promise((resolve) => {
        // Lắng nghe kết quả bet-result
        const betResultHandler = (data) => {
            // data có thể là { postBalance, amount, type }
            console.log('🎯 Bet result:', data);
            const newBalance = data.postBalance || null;
            // Hủy listener sau khi nhận kết quả
            socket.off('bet-result', betResultHandler);
            // Trả về response
            resolve(res.json({ success: true, newBalance }));
        };

        socket.on('bet-result', betResultHandler);

        // Gửi lệnh đặt cược
        socket.emit('bet', { type, amount });

        // Timeout nếu không nhận phản hồi
        setTimeout(() => {
            socket.off('bet-result', betResultHandler);
            resolve(res.status(504).json({ success: false, message: 'Timeout' }));
        }, 15000);
    });
});

// ================= LOGOUT =================
app.get('/logout', (req, res) => {
    if (req.session.user && req.session.user.socket) {
        req.session.user.socket.disconnect();
    }
    req.session.destroy(() => res.redirect('/'));
});

// ================= KHỞI ĐỘNG =================
app.listen(PORT, () => {
    console.log(`🔥 SERVER CHẠY: http://localhost:${PORT}`);
    console.log(`😈 DEEPSEEK-R1-ULTRA READY!`);
});