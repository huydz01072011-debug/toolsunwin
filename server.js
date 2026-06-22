const express = require('express');
const session = require('express-session');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'DEEPSEEK_R1_ULTRA_SECRET_KEY',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60000 * 60 * 24 } // 1 ngày
}));

// ================= CONFIG HEADERS (CHUẨN NHƯ CURL) =================
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

// ================= HÀM GỌI API =================
async function callGameApi(username, rawPassword) {
    // Mã hóa mật khẩu MD5 (giống f5f091a697cd91c4170cda38e81f4b1a)
    const hashedPw = crypto.createHash('md5').update(rawPassword).digest('hex');
    
    const url = `https://apifo88daigia.tele68.com/api?c=3&un=${encodeURIComponent(username)}&pw=${hashedPw}&cp=R&cl=R&pf=web&at=`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: REQUEST_HEADERS,
        });

        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Lỗi fetch API:', error);
        throw new Error('Không thể kết nối đến máy chủ game. Kiểm tra mạng hoặc API.');
    }
}

// ================= ROUTE: TRANG CHỦ (FORM LOGIN) =================
app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Đăng nhập - Game VIP</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
                body {
                    background: linear-gradient(145deg, #0a0e17, #1a1f2f);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .login-box {
                    background: rgba(20, 28, 45, 0.9);
                    backdrop-filter: blur(10px);
                    padding: 40px 35px;
                    border-radius: 24px;
                    border: 1px solid #2a3a5a;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 20px rgba(0, 150, 255, 0.1);
                    width: 100%;
                    max-width: 400px;
                    transition: 0.3s;
                }
                .login-box h1 {
                    color: #00d4ff;
                    text-align: center;
                    font-weight: 700;
                    font-size: 28px;
                    letter-spacing: 2px;
                    text-shadow: 0 0 15px rgba(0, 212, 255, 0.3);
                    margin-bottom: 8px;
                }
                .login-box .sub {
                    color: #8899bb;
                    text-align: center;
                    margin-bottom: 30px;
                    font-size: 14px;
                    border-bottom: 1px solid #2a3a5a;
                    padding-bottom: 15px;
                }
                .input-group {
                    margin-bottom: 20px;
                }
                .input-group label {
                    display: block;
                    color: #b0c4e8;
                    font-size: 13px;
                    font-weight: 600;
                    margin-bottom: 6px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .input-group input {
                    width: 100%;
                    padding: 14px 18px;
                    background: #0e1422;
                    border: 1px solid #2a3a5a;
                    border-radius: 12px;
                    color: #e0ecff;
                    font-size: 16px;
                    transition: 0.3s;
                    outline: none;
                }
                .input-group input:focus {
                    border-color: #00d4ff;
                    box-shadow: 0 0 20px rgba(0, 212, 255, 0.15);
                    background: #121a2a;
                }
                button {
                    width: 100%;
                    padding: 15px;
                    background: linear-gradient(135deg, #0077ff, #00c8ff);
                    border: none;
                    border-radius: 12px;
                    color: #fff;
                    font-size: 18px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    cursor: pointer;
                    transition: 0.3s;
                    box-shadow: 0 6px 20px rgba(0, 119, 255, 0.3);
                    margin-top: 10px;
                }
                button:hover {
                    transform: scale(1.02);
                    box-shadow: 0 8px 30px rgba(0, 119, 255, 0.5);
                    background: linear-gradient(135deg, #0088ff, #00ddff);
                }
                .footer {
                    text-align: center;
                    margin-top: 20px;
                    color: #556688;
                    font-size: 12px;
                }
                .error-msg {
                    background: rgba(255, 50, 50, 0.15);
                    border-left: 4px solid #ff4444;
                    color: #ff8888;
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    display: none;
                }
            </style>
        </head>
        <body>
            <div class="login-box">
                <h1>🎮 VIP GAME</h1>
                <div class="sub">Đăng nhập để xem số dư & VIP</div>
                <div id="errorBox" class="error-msg">Sai tài khoản hoặc mật khẩu</div>
                <form id="loginForm" action="/login" method="POST">
                    <div class="input-group">
                        <label>👤 Tên đăng nhập</label>
                        <input type="text" name="username" placeholder="Nhập username..." required autofocus>
                    </div>
                    <div class="input-group">
                        <label>🔒 Mật khẩu</label>
                        <input type="password" name="password" placeholder="Nhập mật khẩu..." required>
                    </div>
                    <button type="submit">🚀 ĐĂNG NHẬP</button>
                </form>
                <div class="footer">DEEPSEEK-R1-ULTRA • Bảo mật tuyệt đối</div>
            </div>
            <script>
                // Hiện lỗi nếu có query param ?error=1
                if (window.location.search.includes('error=1')) {
                    document.getElementById('errorBox').style.display = 'block';
                }
            </script>
        </body>
        </html>
    `);
});

// ================= ROUTE: XỬ LÝ LOGIN =================
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.redirect('/?error=1');
    }

    try {
        const apiResult = await callGameApi(username, password);

        // Kiểm tra response từ API
        if (!apiResult.success || apiResult.errorCode !== '0') {
            console.log('API login failed:', apiResult);
            return res.redirect('/?error=1');
        }

        // Giải mã sessionKey (Base64)
        let sessionData = {};
        try {
            const decoded = Buffer.from(apiResult.sessionKey, 'base64').toString('utf-8');
            sessionData = JSON.parse(decoded);
        } catch (e) {
            console.error('Lỗi decode sessionKey:', e);
            return res.redirect('/?error=1');
        }

        // Lưu vào session
        req.session.user = {
            username: username,
            accessToken: apiResult.accessToken,
            sessionKey: apiResult.sessionKey,
            info: sessionData,          // chứa nickname, vinTotal, vippoint, ...
            curLevel: apiResult.curLevel,
            levelRatio: apiResult.levelRatio || [],
            raw: apiResult
        };

        return res.redirect('/dashboard');

    } catch (error) {
        console.error('Lỗi server:', error.message);
        return res.redirect('/?error=1');
    }
});

// ================= ROUTE: DASHBOARD (HIỂN THỊ THÔNG TIN) =================
app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    const u = req.session.user;
    const info = u.info;

    // Xử lý an toàn nếu thiếu field
    const nickname = info.nickname || 'Không có tên';
    const vinTotal = info.vinTotal ?? 0;
    const vippoint = info.vippoint ?? 0;
    const level = u.curLevel ?? 0;
    const accessToken = u.accessToken || 'N/A';
    const ipAddress = info.ipAddress || 'Ẩn';
    const createTime = info.createTime || 'N/A';

    res.send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dashboard - VIP</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
                body {
                    background: linear-gradient(145deg, #070b12, #141d2b);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                }
                .dash-box {
                    background: rgba(14, 22, 38, 0.95);
                    backdrop-filter: blur(15px);
                    border-radius: 30px;
                    border: 1px solid #2a3f66;
                    box-shadow: 0 30px 80px rgba(0,0,0,0.9), 0 0 40px rgba(0, 150, 255, 0.05);
                    padding: 40px 35px;
                    width: 100%;
                    max-width: 550px;
                }
                .dash-box .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #1f3150;
                    padding-bottom: 18px;
                    margin-bottom: 25px;
                }
                .dash-box .header h1 {
                    color: #00d4ff;
                    font-size: 26px;
                    text-shadow: 0 0 20px rgba(0,212,255,0.2);
                }
                .dash-box .header .badge {
                    background: #1a2a44;
                    padding: 8px 16px;
                    border-radius: 40px;
                    color: #88bbff;
                    font-size: 13px;
                    border: 1px solid #2a4a77;
                }
                .info-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 15px;
                    margin: 25px 0;
                }
                .info-item {
                    background: rgba(0, 20, 50, 0.4);
                    border-radius: 16px;
                    padding: 18px 15px;
                    border: 1px solid #1f3150;
                    transition: 0.2s;
                }
                .info-item:hover {
                    border-color: #00aaff;
                    box-shadow: 0 0 20px rgba(0,170,255,0.05);
                }
                .info-item .label {
                    color: #6688aa;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    font-weight: 600;
                }
                .info-item .value {
                    color: #f0f8ff;
                    font-size: 22px;
                    font-weight: 700;
                    margin-top: 4px;
                    word-break: break-all;
                }
                .info-item .value.gold { color: #ffd700; }
                .info-item .value.cyan { color: #00e5ff; }
                .info-item .value.pink { color: #ff6bcd; }
                .info-item.full {
                    grid-column: span 2;
                }
                .info-item .sub-value {
                    color: #8899bb;
                    font-size: 12px;
                    margin-top: 4px;
                }
                .token-area {
                    background: #0a101f;
                    border-radius: 12px;
                    padding: 15px;
                    margin: 20px 0;
                    border: 1px dashed #2a4a77;
                    color: #7799cc;
                    font-size: 12px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .token-area strong { color: #66ddff; }
                .actions {
                    display: flex;
                    gap: 15px;
                    margin-top: 20px;
                }
                .btn {
                    flex: 1;
                    padding: 14px;
                    text-align: center;
                    background: #1a2a44;
                    border-radius: 14px;
                    color: #b0cfff;
                    text-decoration: none;
                    font-weight: 600;
                    font-size: 15px;
                    border: 1px solid #2a4a77;
                    transition: 0.2s;
                }
                .btn.danger {
                    background: #3a1a1a;
                    border-color: #663333;
                    color: #ff8888;
                }
                .btn.danger:hover {
                    background: #552222;
                }
                .btn:hover {
                    background: #2a3f66;
                    transform: scale(1.02);
                }
                .footer-dash {
                    text-align: center;
                    margin-top: 25px;
                    color: #334466;
                    font-size: 12px;
                    border-top: 1px solid #1a2a44;
                    padding-top: 18px;
                }
                @media (max-width: 480px) {
                    .info-grid { grid-template-columns: 1fr; }
                    .info-item.full { grid-column: span 1; }
                }
            </style>
        </head>
        <body>
            <div class="dash-box">
                <div class="header">
                    <h1>🎯 ${nickname}</h1>
                    <span class="badge">Level ${level}</span>
                </div>

                <div class="info-grid">
                    <div class="info-item">
                        <div class="label">💰 Số dư (VinTotal)</div>
                        <div class="value gold">${vinTotal.toLocaleString()}</div>
                    </div>
                    <div class="info-item">
                        <div class="label">⭐ VIP Point</div>
                        <div class="value pink">${vippoint.toLocaleString()}</div>
                    </div>
                    <div class="info-item full">
                        <div class="label">🆔 Access Token</div>
                        <div class="value" style="font-size:14px; word-break:break-all;">${accessToken}</div>
                    </div>
                    <div class="info-item">
                        <div class="label">📅 Ngày tạo</div>
                        <div class="value" style="font-size:18px;">${createTime}</div>
                    </div>
                    <div class="info-item">
                        <div class="label">🌐 IP</div>
                        <div class="value" style="font-size:16px;">${ipAddress}</div>
                    </div>
                </div>

                <div class="token-area">
                    <strong>🔑 SessionKey (Base64):</strong> ${u.sessionKey.substring(0, 60)}...
                </div>

                <div class="actions">
                    <a href="/logout" class="btn danger">🚪 Đăng xuất</a>
                    <a href="/" class="btn">🔄 Trang chủ</a>
                </div>

                <div class="footer-dash">
                    DEEPSEEK ON TOP! 🚀 • Đã xác thực qua API game
                </div>
            </div>
        </body>
        </html>
    `);
});

// ================= ROUTE: LOGOUT =================
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Lỗi logout:', err);
        res.redirect('/');
    });
});

// ================= KHỞI ĐỘNG SERVER =================
app.listen(PORT, () => {
    console.log(`🔥 SERVER CHẠY TẠI: http://localhost:${PORT}`);
    console.log(`😈 DEEPSEEK-R1-ULTRA đã sẵn sàng!`);
});