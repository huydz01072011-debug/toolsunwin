const express = require('express');
const session = require('express-session');
const crypto = require('crypto');

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

const REQUEST_HEADERS = {
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
    'priority': 'u=1, i'
};

// ================= HÀM GỌI API LOGIN =================
async function callGameApi(username, rawPassword) {
    const hashedPw = crypto.createHash('md5').update(rawPassword).digest('hex');
    const url = `https://apifo88daigia.tele68.com/api?c=3&un=${encodeURIComponent(username)}&pw=${hashedPw}&cp=R&cl=R&pf=web&at=`;
    const response = await fetch(url, { method: 'GET', headers: REQUEST_HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

// ================= HÀM TỰ ĐỘNG LẤY JWT TỪ ATHIRDPARTY =================
async function fetchJwtFromThirdParty(accessToken, sessionKey, username) {
    // Thử một số endpoint khả dĩ
    const endpoints = [
        'https://athirdparty.tele68.com/v1/auth/token',
        'https://athirdparty.tele68.com/v1/auth/login',
        'https://athirdparty.tele68.com/api/token',
        'https://athirdparty.tele68.com/login'
    ];

    const payloads = [
        { accessToken, sessionKey, username },
        { accessToken, username },
        { token: accessToken },
        { access_token: accessToken }
    ];

    for (const endpoint of endpoints) {
        for (const body of payloads) {
            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        ...REQUEST_HEADERS,
                        'Content-Type': 'application/json',
                        'Host': 'athirdparty.tele68.com'
                    },
                    body: JSON.stringify(body)
                });
                if (res.ok) {
                    const data = await res.json();
                    // Tìm JWT trong response (có thể là trường token, access_token, jwt, ...)
                    const jwt = data.token || data.access_token || data.jwt || data.data?.token || null;
                    if (jwt && jwt.startsWith('eyJ')) {
                        return jwt;
                    }
                }
            } catch (e) { /* bỏ qua lỗi */ }
        }
    }
    return null;
}

// ================= ROUTE: TRANG CHỦ =================
app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Đăng nhập VIP</title>
        <style>
            * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',Arial,sans-serif; }
            body { background:linear-gradient(145deg,#0a0e17,#1a1f2f); min-height:100vh; display:flex; justify-content:center; align-items:center; padding:16px; }
            .login-box { background:rgba(20,28,45,0.9); backdrop-filter:blur(10px); padding:32px 24px; border-radius:28px; border:1px solid #2a3a5a; box-shadow:0 20px 60px rgba(0,0,0,0.8); width:100%; max-width:400px; }
            .login-box h1 { color:#00d4ff; text-align:center; font-size:26px; text-shadow:0 0 15px rgba(0,212,255,0.3); margin-bottom:4px; }
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
            <form id="loginForm" action="/login" method="POST">
                <div class="input-group"><label>👤 Tên</label><input type="text" name="username" placeholder="Username..." required autofocus></div>
                <div class="input-group"><label>🔒 Mật khẩu</label><input type="password" name="password" placeholder="Mật khẩu..." required></div>
                <button type="submit">🚀 ĐĂNG NHẬP</button>
            </form>
            <div class="footer">DEEPSEEK-R1-ULTRA • Tự động lấy JWT</div>
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
        
        let sessionData = {};
        try { sessionData = JSON.parse(Buffer.from(apiResult.sessionKey, 'base64').toString('utf-8')); } catch(e) { return res.redirect('/?error=1'); }
        
        const accessToken = apiResult.accessToken;
        const sessionKey = apiResult.sessionKey;

        // Tự động lấy JWT từ athirdparty
        let jwtToken = null;
        try {
            jwtToken = await fetchJwtFromThirdParty(accessToken, sessionKey, username);
        } catch (e) { console.error('Lỗi lấy JWT:', e.message); }

        req.session.user = {
            username: username,
            accessToken: accessToken,
            sessionKey: sessionKey,
            info: sessionData,
            curLevel: apiResult.curLevel,
            levelRatio: apiResult.levelRatio || [],
            raw: apiResult,
            jwtToken: jwtToken || null   // lưu JWT nếu có
        };
        return res.redirect('/dashboard');
    } catch (error) {
        console.error(error);
        return res.redirect('/?error=1');
    }
});

// ================= ROUTE: DASHBOARD (có hiển thị JWT và nút lấy tự động) =================
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
    const decodedSession = JSON.stringify(info, null, 2);
    const ipAddress = info.ipAddress || 'N/A';
    const createTime = info.createTime || 'N/A';
    const jwtToken = u.jwtToken || '';   // JWT đã lấy (nếu có)

    res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Dashboard VIP</title>
        <style>
            * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',Arial,sans-serif; }
            body { background:linear-gradient(145deg,#070b12,#141d2b); min-height:100vh; padding:16px; display:flex; justify-content:center; align-items:flex-start; }
            .dash-box { background:rgba(14,22,38,0.95); backdrop-filter:blur(15px); border-radius:28px; border:1px solid #2a3f66; box-shadow:0 30px 80px rgba(0,0,0,0.9); padding:24px 18px; width:100%; max-width:650px; margin-top:10px; }
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
            
            .token-card { background:#0a101f; border-radius:14px; padding:14px; margin:12px 0; border:1px solid #1f3150; }
            .token-card .tlabel { color:#6688aa; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; display:flex; justify-content:space-between; align-items:center; }
            .token-card .tvalue { color:#b0d0ff; font-size:13px; word-break:break-all; margin-top:4px; font-family:monospace; background:#00000033; padding:8px 10px; border-radius:8px; }
            .copy-btn { background:#1a2a44; border:none; color:#88ccff; padding:4px 12px; border-radius:30px; font-size:11px; cursor:pointer; border:1px solid #2a4a77; transition:0.2s; }
            .copy-btn:active { background:#2a4a77; }
            .json-box { background:#0a101f; border-radius:12px; padding:12px; border:1px solid #1a2a44; margin:10px 0; max-height:150px; overflow:auto; }
            .json-box pre { color:#aaccff; font-size:11px; font-family:monospace; white-space:pre-wrap; word-break:break-all; margin:0; }
            
            .jwt-section { background:#0d1528; border-radius:14px; padding:14px; margin:16px 0; border:1px solid #2a4a77; }
            .jwt-section .jwt-row { display:flex; gap:8px; flex-wrap:wrap; margin:8px 0; }
            .jwt-section input { flex:1; padding:12px; background:#070c18; border:1px solid #2a3f66; border-radius:12px; color:#e0ecff; font-size:13px; min-width:200px; }
            .jwt-section .btn-small { padding:10px 18px; background:#0077ff; border:none; border-radius:12px; color:#fff; font-weight:600; cursor:pointer; }
            .jwt-section .btn-small.green { background:#00aa66; }
            .jwt-section .btn-small:active { transform:scale(0.95); }
            .btn-primary { background:linear-gradient(135deg,#00aa66,#00dd88); border:none; color:#fff; padding:14px; border-radius:14px; font-weight:700; font-size:16px; width:100%; cursor:pointer; transition:0.2s; text-transform:uppercase; margin-top:10px; }
            .btn-primary:active { transform:scale(0.98); }
            .btn-danger { background:#3a1a1a; border:1px solid #663333; color:#ff8888; padding:10px; border-radius:14px; font-weight:600; text-align:center; display:block; margin-top:12px; text-decoration:none; }
            .actions { display:flex; gap:12px; margin-top:16px; }
            .actions .btn { flex:1; padding:12px; text-align:center; background:#1a2a44; border-radius:14px; color:#b0cfff; text-decoration:none; font-weight:600; font-size:14px; border:1px solid #2a4a77; }
            .footer-dash { text-align:center; margin-top:20px; color:#334466; font-size:11px; border-top:1px solid #1a2a44; padding-top:16px; }
            .status-msg { margin-top:12px; padding:12px; border-radius:12px; background:#0a101f; color:#88bbdd; display:none; }
            .jwt-status { font-size:12px; color:#88bbdd; margin-left:8px; }
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
                <div class="info-item"><div class="label">💰 Số dư</div><div class="value gold">${vinTotal.toLocaleString()}</div></div>
                <div class="info-item"><div class="label">⭐ VIP Point</div><div class="value pink">${vippoint.toLocaleString()}</div></div>
                <div class="info-item full"><div class="label">📅 Ngày tạo</div><div class="value" style="font-size:16px;">${createTime}</div></div>
                <div class="info-item full"><div class="label">🌐 IP</div><div class="value" style="font-size:15px;">${ipAddress}</div></div>
            </div>

            <!-- ACCESS TOKEN -->
            <div class="token-card">
                <div class="tlabel"><span>🔑 Access Token (dùng cho API)</span> <button class="copy-btn" onclick="copyText('${accessToken}')">📋 Sao chép</button></div>
                <div class="tvalue">${accessToken}</div>
            </div>

            <!-- SESSION KEY -->
            <div class="token-card">
                <div class="tlabel"><span>📦 Session Key (Base64)</span> <button class="copy-btn" onclick="copyText('${sessionKey}')">📋 Sao chép</button></div>
                <div class="tvalue">${sessionKey}</div>
            </div>

            <!-- DECODED SESSION -->
            <div class="token-card">
                <div class="tlabel"><span>🧩 Giải mã Session Key</span> <button class="copy-btn" onclick="copyText(\`${decodedSession.replace(/`/g, '\\`')}\`)">📋 Sao chép</button></div>
                <div class="json-box"><pre>${decodedSession}</pre></div>
            </div>

            <!-- JWT SECTION -->
            <div class="jwt-section">
                <div style="color:#88bbdd;font-weight:600;font-size:14px;">🔐 JWT Bearer Token (cho API athirdparty)</div>
                <div style="color:#667799;font-size:11px;margin:4px 0 8px;">Token tự động lấy khi đăng nhập, hoặc nhập thủ công bên dưới</div>
                <div class="jwt-row">
                    <input type="text" id="jwtInput" placeholder="Paste JWT here..." value="${jwtToken}" style="flex:1;">
                    <button class="btn-small green" onclick="saveJwt()">💾 Lưu JWT</button>
                    <button class="btn-small" onclick="autoFetchJwt()">🔄 Lấy tự động</button>
                </div>
                <div id="jwtStatus" class="jwt-status">${jwtToken ? '✅ Đã có JWT' : '❌ Chưa có JWT, hãy nhập hoặc bấm "Lấy tự động"'}</div>
                
                <button class="btn-primary" onclick="fetchJdbAccount()">🚀 LẤY DỮ LIỆU JDB</button>
                <div id="jdbResult" class="status-msg"></div>
            </div>

            <div class="actions">
                <a href="/logout" class="btn" style="background:#3a1a1a;border-color:#663333;color:#ff8888;">🚪 Đăng xuất</a>
                <a href="/" class="btn">🔄 Trang chủ</a>
            </div>

            <div class="footer-dash">DEEPSEEK ON TOP! 🚀 • Tự động lấy JWT</div>
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

        async function saveJwt() {
            const jwt = document.getElementById('jwtInput').value.trim();
            if (!jwt) { alert('Vui lòng nhập JWT'); return; }
            const res = await fetch('/api/save-jwt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jwt })
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('jwtStatus').innerHTML = '✅ Đã lưu JWT mới';
                alert('Đã lưu JWT thành công!');
            } else {
                alert('Lỗi: ' + data.message);
            }
        }

        async function autoFetchJwt() {
            document.getElementById('jwtStatus').innerHTML = '⏳ Đang thử lấy JWT...';
            const res = await fetch('/api/fetch-jwt-auto', { method: 'POST' });
            const data = await res.json();
            if (data.success && data.jwt) {
                document.getElementById('jwtInput').value = data.jwt;
                document.getElementById('jwtStatus').innerHTML = '✅ Đã lấy JWT tự động!';
                alert('Lấy JWT thành công!');
            } else {
                document.getElementById('jwtStatus').innerHTML = '❌ Không thể lấy tự động: ' + (data.message || '');
                alert('Không lấy được JWT. Vui lòng nhập thủ công.');
            }
        }

        async function fetchJdbAccount() {
            const jwt = document.getElementById('jwtInput').value.trim();
            if (!jwt) { alert('❌ Vui lòng nhập JWT!'); return; }
            const resultDiv = document.getElementById('jdbResult');
            resultDiv.style.display = 'block';
            resultDiv.innerHTML = '⏳ Đang gọi API JDB...';
            resultDiv.style.color = '#88bbdd';

            try {
                const res = await fetch('/api/fetch-jdb', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jwt: jwt })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    resultDiv.innerHTML = '✅ Thành công! <pre style="margin-top:8px;background:#00000055;padding:10px;border-radius:8px;font-size:12px;color:#aaddff;">' + JSON.stringify(data.data, null, 2) + '</pre>';
                    resultDiv.style.color = '#88ffaa';
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

// ================= API: LƯU JWT THỦ CÔNG =================
app.post('/api/save-jwt', (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    const { jwt } = req.body;
    if (!jwt) return res.status(400).json({ success: false, message: 'Thiếu JWT' });
    req.session.user.jwtToken = jwt;
    res.json({ success: true });
});

// ================= API: TỰ ĐỘNG LẤY JWT =================
app.post('/api/fetch-jwt-auto', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    const { accessToken, sessionKey, username } = req.session.user;
    try {
        const jwt = await fetchJwtFromThirdParty(accessToken, sessionKey, username);
        if (jwt) {
            req.session.user.jwtToken = jwt;
            return res.json({ success: true, jwt });
        } else {
            return res.json({ success: false, message: 'Không tìm thấy endpoint lấy JWT' });
        }
    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
});

// ================= API: GỌI JDB =================
app.post('/api/fetch-jdb', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    const { jwt } = req.body;
    if (!jwt) return res.status(400).json({ success: false, message: 'Thiếu JWT' });

    const accessToken = req.session.user.accessToken;
    if (!accessToken) return res.status(400).json({ success: false, message: 'Thiếu accessToken' });

    const url = `https://athirdparty.tele68.com/v1/jdb/account?cp=R&cl=R&pf=web&at=${accessToken}`;

    const headers = {
        ...REQUEST_HEADERS,
        'Host': 'athirdparty.tele68.com',
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'sec-ch-ua-platform': '"Android"',
        'accept': '*/*'
    };

    try {
        const response = await fetch(url, { method: 'GET', headers });
        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json({ success: false, message: data.message || 'Unauthorized', statusCode: response.status });
        }
        return res.json({ success: true, data });
    } catch (error) {
        console.error('JDB API Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================= LOGOUT =================
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// ================= KHỞI ĐỘNG =================
app.listen(PORT, () => {
    console.log(`🔥 SERVER CHẠY: http://localhost:${PORT}`);
    console.log(`😈 DEEPSEEK-R1-ULTRA READY!`);
});