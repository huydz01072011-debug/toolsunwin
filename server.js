const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');

// ==================== CẤU HÌNH ====================
const BOT_TOKEN = '8792790286:AAHuxMzba8iOyyrXhrKHOwLxIX6Ie8urAhY'.trim();
const WS_URL = 'wss://wtxmd52.tele68.com/txmd5/?EIO=4&transport=websocket';
const PORT = 3000;

// ==================== KHỞI TẠO ====================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let bot = null;

// Khởi tạo Telegram Bot
(async function initBot() {
    try {
        const me = await require('axios').get(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
        if (me.data.ok) {
            console.log(`✅ Bot @${me.data.result.username} đã sẵn sàng`);
            bot = new TelegramBot(BOT_TOKEN, { polling: true });
            setupBotHandlers();
        } else {
            console.error('❌ Token không hợp lệ');
        }
    } catch (error) {
        console.error('❌ Không thể kết nối Telegram:', error.message);
    }
})();

// ==================== STATE ====================
const userStates = new Map();
const wsConnections = new Map();

// ==================== TELEGRAM BOT HANDLERS ====================
function setupBotHandlers() {
    bot.on('polling_error', (error) => {
        console.error('Polling error:', error.message);
    });

    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId,
            '🎯 BOT VIP LC79 🎯\n\n' +
            '/login [token] - Đăng nhập với JWT token\n' +
            '/logout - Đăng xuất\n' +
            '/balance - Xem số dư\n' +
            '/bet [Tài/Xỉu] [số tiền] - Đặt cược\n' +
            '/info - Thông tin tài khoản\n' +
            '/status - Trạng thái kết nối'
        );
    });

    bot.onText(/\/login (.+)/, (msg, match) => {
        const chatId = msg.chat.id;
        const token = match[1].trim();
        
        if (!token || token.length < 50) {
            bot.sendMessage(chatId, '❌ Token không hợp lệ. Vui lòng kiểm tra lại.');
            return;
        }

        const oldState = userStates.get(chatId);
        if (oldState && oldState.ws) {
            try { oldState.ws.close(); } catch (e) {}
        }

        const newState = {
            step: null,
            jwtToken: token,
            ws: null,
            wsReady: false,
            isLoggedIn: true,
            balance: 0,
            nickname: 'Đang kết nối...',
            betResolve: null,
            betReject: null,
            betTimeout: null,
            reconnectTimer: null,
            _notifiedBalance: false
        };

        userStates.set(chatId, newState);
        bot.sendMessage(chatId, '🔌 Đang kết nối WebSocket...');
        connectWebSocket(chatId);
    });

    bot.onText(/\/logout/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        if (state) {
            if (state.reconnectTimer) {
                clearTimeout(state.reconnectTimer);
                state.reconnectTimer = null;
            }
            if (state.ws) {
                try {
                    state.ws.removeAllListeners();
                    if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
                        state.ws.close();
                    }
                } catch (e) {}
                state.ws = null;
            }
            state.isLoggedIn = false;
        }
        userStates.delete(chatId);
        bot.sendMessage(chatId, '✅ Đã logout.');
    });

    bot.onText(/\/balance/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        if (!state || !state.isLoggedIn) {
            bot.sendMessage(chatId, '❌ Cần đăng nhập. Dùng /login [token]');
            return;
        }
        bot.sendMessage(chatId,
            '💰 SỐ DƯ\n━━━━━━━━━━━━\n' +
            'Vin: ' + (state.balance || 0).toLocaleString()
        );
    });

    bot.onText(/\/info/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        if (!state || !state.isLoggedIn) {
            bot.sendMessage(chatId, '❌ Cần đăng nhập. Dùng /login [token]');
            return;
        }
        let reply = '👤 THÔNG TIN\n━━━━━━━━━━━━\n';
        reply += 'Tên: ' + (state.nickname || 'Chưa có') + '\n';
        reply += 'Vin: ' + (state.balance || 0).toLocaleString() + '\n';
        reply += 'Trạng thái: ' + (state.wsReady ? '✅ Kết nối' : '❌ Mất kết nối');
        bot.sendMessage(chatId, reply);
    });

    bot.onText(/\/status/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        if (!state || !state.isLoggedIn) {
            bot.sendMessage(chatId, '❌ Chưa đăng nhập.');
            return;
        }
        const status = state.ws && state.ws.readyState === WebSocket.OPEN ? '🟢 Đang kết nối' : '🔴 Mất kết nối';
        bot.sendMessage(chatId,
            '📊 TRẠNG THÁI\n━━━━━━━━━━━━\n' +
            'WebSocket: ' + status + '\n' +
            'Số dư: ' + (state.balance || 0).toLocaleString() + ' Vin'
        );
    });

    bot.onText(/\/bet (.+) (.+)/, (msg, match) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        
        if (!state || !state.isLoggedIn) {
            bot.sendMessage(chatId, '❌ Cần đăng nhập. Dùng /login [token]');
            return;
        }

        if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
            bot.sendMessage(chatId, '❌ Mất kết nối WebSocket. Dùng /login lại.');
            return;
        }

        const betTypeRaw = match[1].toLowerCase().trim();
        const betAmount = parseInt(match[2].trim(), 10);

        if (isNaN(betAmount) || betAmount <= 0) {
            bot.sendMessage(chatId, '❌ Số tiền không hợp lệ.');
            return;
        }

        let betType = null;
        if (betTypeRaw === 'tai' || betTypeRaw === 'tài') {
            betType = 'TAI';
        } else if (betTypeRaw === 'xiu' || betTypeRaw === 'xỉu') {
            betType = 'XIU';
        } else {
            bot.sendMessage(chatId, '❌ Loại cược không hợp lệ. Dùng: Tài hoặc Xỉu');
            return;
        }

        executeBet(chatId, betType, betAmount);
    });

    bot.on('message', (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        if (!text || text.startsWith('/')) return;

        const state = userStates.get(chatId);
        if (!state) return;

        if (state.step === 'awaiting_token') {
            const token = text.trim();
            if (!token || token.length < 50) {
                bot.sendMessage(chatId, '❌ Token không hợp lệ. Vui lòng kiểm tra lại.');
                return;
            }

            state.jwtToken = token;
            state.isLoggedIn = true;
            state.step = null;
            userStates.set(chatId, state);
            
            bot.sendMessage(chatId, '🔌 Đang kết nối WebSocket...');
            connectWebSocket(chatId);
            return;
        }
    });
}

// ==================== KẾT NỐI WEBSOCKET ====================
function connectWebSocket(chatId) {
    const state = userStates.get(chatId);
    if (!state || !state.isLoggedIn) {
        console.log('❌ Không tìm thấy state cho ' + chatId);
        return;
    }

    if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
    }

    if (state.ws) {
        try {
            state.ws.removeAllListeners();
            if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
                state.ws.close();
            }
        } catch (e) {}
        state.ws = null;
        state.wsReady = false;
    }

    if (!state.jwtToken || state.jwtToken.length < 50) {
        console.error('❌ JWT token không hợp lệ cho ' + chatId);
        if (bot) {
            bot.sendMessage(chatId, '❌ Token không hợp lệ. Vui lòng đăng nhập lại.');
        }
        return;
    }

    console.log('🔌 Đang kết nối WebSocket cho ' + chatId);
    console.log('📌 JWT: ' + state.jwtToken.substring(0, 30) + '...');

    try {
        const ws = new WebSocket(WS_URL);
        state.ws = ws;
        state.wsReady = false;
        userStates.set(chatId, state);

        ws.on('open', () => {
            console.log('✅ WebSocket đã kết nối cho ' + chatId);
            const authMsg = '40/txmd5,{"token":"' + state.jwtToken + '"}';
            ws.send(authMsg);
            console.log('📤 Đã gửi auth');

            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send('42/txmd5,{"session-info":{"id":0}}');
                }
            }, 1000);
        });

        ws.on('message', (data) => {
            const message = data.toString();
            handleWebSocketMessage(chatId, message);
        });

        ws.on('ping', () => {
            if (ws.readyState === WebSocket.OPEN) ws.pong();
        });

        ws.on('close', (code, reason) => {
            console.log('🔌 WebSocket đóng cho ' + chatId + ', code: ' + code + ', reason: ' + reason);
            const st = userStates.get(chatId);
            if (st) {
                st.ws = null;
                st.wsReady = false;
                userStates.set(chatId, st);
                if (st.isLoggedIn && !st.reconnectTimer) {
                    console.log('🔄 Thử reconnect cho ' + chatId + ' sau 3s...');
                    st.reconnectTimer = setTimeout(() => {
                        const st2 = userStates.get(chatId);
                        if (st2 && st2.isLoggedIn) {
                            st2.reconnectTimer = null;
                            connectWebSocket(chatId);
                        }
                    }, 3000);
                    userStates.set(chatId, st);
                }
            }
        });

        ws.on('error', (err) => {
            console.error('❌ WebSocket error cho ' + chatId + ':', err.message);
        });

    } catch (error) {
        console.error('❌ Lỗi tạo WebSocket:', error.message);
        if (bot) {
            bot.sendMessage(chatId, '⚠️ Lỗi kết nối WebSocket. Thử lại sau.');
        }
    }
}

// ==================== XỬ LÝ MESSAGE WEBSOCKET ====================
function handleWebSocketMessage(chatId, message) {
    const state = userStates.get(chatId);
    if (!state) return;

    if (message === '2') {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send('3');
        }
        return;
    }

    if (!message.startsWith('42/txmd5,')) return;

    const payload = message.substring('42/txmd5,'.length);
    try {
        const data = JSON.parse(payload);

        if (Array.isArray(data) && data.length >= 2) {
            const event = data[0];
            const body = data[1];

            if (event === 'your-info') {
                if (body.balance !== undefined) state.balance = body.balance;
                if (body.nickname) state.nickname = body.nickname;
                state.wsReady = true;
                state.isLoggedIn = true;
                userStates.set(chatId, state);
                console.log('📊 Cập nhật balance ' + chatId + ': ' + state.balance);
                if (!state._notifiedBalance && bot) {
                    state._notifiedBalance = true;
                    bot.sendMessage(chatId,
                        '✅ WebSocket sẵn sàng!\n' +
                        '👤 Tên: ' + state.nickname + '\n' +
                        '💰 Số dư: ' + state.balance.toLocaleString() + ' Vin'
                    );
                    userStates.set(chatId, state);
                }
                return;
            }

            if (event === 'session-info') {
                if (body.id) state.gameId = body.id;
                if (body.md5) state.tableMd5 = body.md5;
                userStates.set(chatId, state);
                console.log('📋 Session: gameId=' + state.gameId + ', md5=' + state.tableMd5);
                return;
            }

            if (event === 'bet-result') {
                const result = body;
                if (result.postBalance !== undefined && result.amount !== undefined && result.type) {
                    console.log('🎯 Bet result: ' + result.type + ' ' + result.amount + ' -> ' + result.postBalance);
                    state.balance = result.postBalance;
                    userStates.set(chatId, state);
                    if (state.betResolve) {
                        state.betResolve(result);
                        state.betResolve = null;
                        state.betReject = null;
                        if (state.betTimeout) {
                            clearTimeout(state.betTimeout);
                            state.betTimeout = null;
                        }
                        userStates.set(chatId, state);
                    } else if (bot) {
                        bot.sendMessage(chatId,
                            '📢 KẾT QUẢ CƯỢC\n━━━━━━━━━━━━\n' +
                            'Loại: ' + (result.type === 'TAI' ? 'TÀI' : 'XỈU') + '\n' +
                            'Tiền: ' + result.amount.toLocaleString() + ' Vin\n' +
                            'Số dư mới: ' + result.postBalance.toLocaleString() + ' Vin'
                        );
                    }
                }
                return;
            }
        } else if (typeof data === 'object' && data !== null) {
            if (data['your-info']) {
                const info = data['your-info'];
                if (info.balance !== undefined) state.balance = info.balance;
                if (info.nickname) state.nickname = info.nickname;
                state.wsReady = true;
                state.isLoggedIn = true;
                userStates.set(chatId, state);
                console.log('📊 Cập nhật balance: ' + state.balance);
                return;
            }
            if (data['session-info']) {
                const info = data['session-info'];
                if (info.id) state.gameId = info.id;
                if (info.md5) state.tableMd5 = info.md5;
                userStates.set(chatId, state);
                return;
            }
        }
    } catch (e) {
        console.error('❌ Parse WS error:', e.message);
    }
}

// ==================== THỰC HIỆN ĐẶT CƯỢC ====================
function executeBet(chatId, betType, betAmount) {
    const state = userStates.get(chatId);
    if (!state) {
        if (bot) bot.sendMessage(chatId, '❌ Lỗi state, login lại.');
        return;
    }

    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
        if (bot) bot.sendMessage(chatId, '❌ Mất WebSocket. /login lại.');
        return;
    }

    const betPromise = new Promise((resolve, reject) => {
        const st = userStates.get(chatId);
        if (!st) {
            reject(new Error('State not found'));
            return;
        }
        st.betResolve = resolve;
        st.betReject = reject;
        st.betTimeout = setTimeout(() => {
            reject(new Error('Timeout, không nhận được kết quả'));
            const st2 = userStates.get(chatId);
            if (st2) {
                st2.betResolve = null;
                st2.betReject = null;
                st2.betTimeout = null;
            }
        }, 15000);
        userStates.set(chatId, st);
    });

    try {
        const betCommand = ["bet", { type: betType, amount: betAmount }];
        const msg = '42/txmd5,' + JSON.stringify(betCommand);
        state.ws.send(msg);
        console.log('📤 Bet sent: ' + msg);
        if (bot) {
            bot.sendMessage(chatId,
                '⏳ ĐANG ĐẶT CƯỢC\n━━━━━━━━━━━━\n' +
                'Loại: ' + (betType === 'TAI' ? 'TÀI' : 'XỈU') + '\n' +
                'Tiền: ' + betAmount.toLocaleString() + ' Vin'
            );
        }
    } catch (err) {
        if (bot) bot.sendMessage(chatId, '❌ Lỗi gửi: ' + err.message);
        const st = userStates.get(chatId);
        if (st) {
            st.betResolve = null;
            st.betReject = null;
            if (st.betTimeout) {
                clearTimeout(st.betTimeout);
                st.betTimeout = null;
            }
            userStates.set(chatId, st);
        }
        return;
    }

    betPromise
        .then((result) => {
            const msg = '🎉 ĐẶT CƯỢC THÀNH CÔNG!\n━━━━━━━━━━━━\n' +
                'Loại: ' + (result.type === 'TAI' ? 'TÀI' : 'XỈU') + '\n' +
                'Tiền: ' + result.amount.toLocaleString() + ' Vin\n' +
                'Số dư mới: ' + result.postBalance.toLocaleString() + ' Vin';
            if (bot) bot.sendMessage(chatId, msg);
            const st = userStates.get(chatId);
            if (st) {
                st.balance = result.postBalance;
                userStates.set(chatId, st);
            }
        })
        .catch((err) => {
            if (bot) bot.sendMessage(chatId, '❌ Đặt cược thất bại: ' + err.message);
        })
        .finally(() => {
            const st = userStates.get(chatId);
            if (st) {
                st.betResolve = null;
                st.betReject = null;
                if (st.betTimeout) {
                    clearTimeout(st.betTimeout);
                    st.betTimeout = null;
                }
                userStates.set(chatId, st);
            }
        });
}

// ==================== WEB DASHBOARD ====================
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LC79 VIP Bot</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
            color: #fff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container {
            background: rgba(255,255,255,0.05);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            width: 90%;
            max-width: 500px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.1);
        }
        h1 {
            text-align: center;
            margin-bottom: 10px;
            font-size: 28px;
            background: linear-gradient(90deg, #f7971e, #ffd200);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle {
            text-align: center;
            color: #aaa;
            margin-bottom: 30px;
            font-size: 14px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #ccc;
            font-size: 14px;
            font-weight: 600;
        }
        input, select {
            width: 100%;
            padding: 14px 18px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.15);
            background: rgba(255,255,255,0.08);
            color: #fff;
            font-size: 16px;
            transition: all 0.3s;
        }
        input:focus, select:focus {
            outline: none;
            border-color: #ffd200;
            background: rgba(255,255,255,0.12);
        }
        input::placeholder {
            color: #666;
        }
        .btn {
            width: 100%;
            padding: 16px;
            border: none;
            border-radius: 12px;
            background: linear-gradient(90deg, #f7971e, #ffd200);
            color: #1a1a2e;
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(247, 151, 30, 0.4);
        }
        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        .btn-bet {
            background: linear-gradient(90deg, #00b894, #00cec9);
            margin-top: 10px;
        }
        .btn-bet:hover {
            box-shadow: 0 8px 25px rgba(0, 206, 201, 0.4);
        }
        .status {
            margin: 20px 0;
            padding: 15px;
            border-radius: 12px;
            background: rgba(255,255,255,0.05);
            text-align: center;
            font-size: 14px;
            min-height: 60px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            border: 1px solid rgba(255,255,255,0.05);
        }
        .status .balance {
            font-size: 22px;
            font-weight: 700;
            color: #ffd200;
            margin-top: 5px;
        }
        .status .connected {
            color: #00b894;
        }
        .status .disconnected {
            color: #ff6b6b;
        }
        .row {
            display: flex;
            gap: 10px;
        }
        .row .form-group {
            flex: 1;
        }
        .bet-type-group {
            display: flex;
            gap: 10px;
        }
        .bet-type-group button {
            flex: 1;
            padding: 12px;
            border: 2px solid rgba(255,255,255,0.15);
            border-radius: 10px;
            background: rgba(255,255,255,0.05);
            color: #fff;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        .bet-type-group button:hover {
            background: rgba(255,255,255,0.1);
        }
        .bet-type-group button.active-tai {
            border-color: #00b894;
            background: rgba(0, 184, 148, 0.2);
            color: #00b894;
        }
        .bet-type-group button.active-xiu {
            border-color: #ff6b6b;
            background: rgba(255, 107, 107, 0.2);
            color: #ff6b6b;
        }
        .result {
            margin-top: 15px;
            padding: 15px;
            border-radius: 12px;
            background: rgba(0,0,0,0.3);
            display: none;
        }
        .result.show {
            display: block;
        }
        .result.success {
            border-left: 4px solid #00b894;
        }
        .result.error {
            border-left: 4px solid #ff6b6b;
        }
        .result-text {
            font-size: 14px;
            color: #ccc;
            white-space: pre-line;
        }
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,0.1);
            border-radius: 50%;
            border-top-color: #ffd200;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .footer {
            text-align: center;
            margin-top: 20px;
            font-size: 12px;
            color: #666;
        }
        .token-info {
            background: rgba(255,215,0,0.1);
            border: 1px solid rgba(255,215,0,0.2);
            border-radius: 8px;
            padding: 10px;
            margin-bottom: 10px;
            font-size: 12px;
            color: #aaa;
            word-break: break-all;
            max-height: 60px;
            overflow-y: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎯 LC79 VIP</h1>
        <div class="subtitle">Đặt cược Tài Xỉu tự động</div>

        <div class="form-group">
            <label>🔑 JWT Token</label>
            <input type="text" id="tokenInput" placeholder="Paste JWT token vào đây...">
        </div>

        <button class="btn" onclick="connect()" id="connectBtn">🚀 Kết nối</button>

        <div class="status" id="status">
            <span>Chưa kết nối</span>
            <span class="balance" id="balanceDisplay">0</span>
        </div>

        <div class="form-group">
            <label>🎲 Chọn loại cược</label>
            <div class="bet-type-group">
                <button onclick="selectBet('TAI')" id="btnTai">TÀI</button>
                <button onclick="selectBet('XIU')" id="btnXiu">XỈU</button>
            </div>
        </div>

        <div class="form-group">
            <label>💰 Số tiền (Vin)</label>
            <input type="number" id="amountInput" placeholder="Nhập số tiền..." min="1">
        </div>

        <button class="btn btn-bet" onclick="placeBet()" id="betBtn" disabled>🎲 Đặt cược</button>

        <div class="result" id="result">
            <div class="result-text" id="resultText"></div>
        </div>

        <div class="footer">LC79 VIP Bot v2.0</div>
    </div>

    <script>
        var selectedBet = null;
        var ws = null;
        var isConnected = false;
        var sessionId = null;

        function selectBet(type) {
            selectedBet = type;
            document.getElementById('btnTai').className = type === 'TAI' ? 'active-tai' : '';
            document.getElementById('btnXiu').className = type === 'XIU' ? 'active-xiu' : '';
            updateBetButton();
        }

        function updateBetButton() {
            var btn = document.getElementById('betBtn');
            var amount = document.getElementById('amountInput').value;
            btn.disabled = !(selectedBet && amount > 0 && isConnected);
        }

        async function connect() {
            var token = document.getElementById('tokenInput').value.trim();
            if (!token || token.length < 50) {
                showResult('❌ Token không hợp lệ. Vui lòng kiểm tra lại.', 'error');
                return;
            }

            var btn = document.getElementById('connectBtn');
            btn.disabled = true;
            btn.innerHTML = '⏳ Đang kết nối...';

            try {
                var response = await fetch('/api/connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: token })
                });

                var data = await response.json();

                if (data.success) {
                    sessionId = data.sessionId;
                    isConnected = true;
                    document.getElementById('status').innerHTML = 
                        '<span class="connected">✅ Đã kết nối</span>' +
                        '<span class="balance" id="balanceDisplay">' + data.balance.toLocaleString() + ' Vin</span>';
                    updateBetButton();
                    showResult('✅ Kết nối thành công!', 'success');
                    listenWebSocket();
                } else {
                    showResult('❌ ' + data.message, 'error');
                    isConnected = false;
                }
            } catch (error) {
                showResult('❌ Lỗi kết nối: ' + error.message, 'error');
                isConnected = false;
            }

            btn.disabled = false;
            btn.innerHTML = '🚀 Kết nối';
        }

        async function listenWebSocket() {
            try {
                var response = await fetch('/api/ws-events');
                var reader = response.body.getReader();
                var decoder = new TextDecoder();

                while (true) {
                    var result = await reader.read();
                    if (result.done) break;
                    
                    var chunk = decoder.decode(result.value);
                    var lines = chunk.split('\\n');
                    
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i];
                        if (line.trim()) {
                            try {
                                var data = JSON.parse(line);
                                if (data.balance !== undefined) {
                                    document.getElementById('balanceDisplay').textContent = 
                                        data.balance.toLocaleString() + ' Vin';
                                }
                                if (data.result) {
                                    showResult(data.result, data.success ? 'success' : 'error');
                                }
                                if (data.disconnected) {
                                    isConnected = false;
                                    document.getElementById('status').innerHTML = 
                                        '<span class="disconnected">❌ Mất kết nối</span>' +
                                        '<span class="balance">0</span>';
                                    updateBetButton();
                                }
                            } catch (e) {}
                        }
                    }
                }
            } catch (error) {
                console.error('WebSocket listen error:', error);
            }
        }

        async function placeBet() {
            if (!isConnected) {
                showResult('❌ Chưa kết nối WebSocket', 'error');
                return;
            }

            var amount = parseInt(document.getElementById('amountInput').value);
            if (!selectedBet) {
                showResult('❌ Vui lòng chọn Tài hoặc Xỉu', 'error');
                return;
            }
            if (isNaN(amount) || amount <= 0) {
                showResult('❌ Số tiền không hợp lệ', 'error');
                return;
            }

            var btn = document.getElementById('betBtn');
            btn.disabled = true;
            btn.innerHTML = '⏳ Đang đặt...';

            try {
                var response = await fetch('/api/bet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        sessionId: sessionId, 
                        betType: selectedBet, 
                        amount: amount 
                    })
                });

                var data = await response.json();
                if (data.success) {
                    showResult('🎉 Đặt cược thành công!\\nLoại: ' + (data.type === 'TAI' ? 'TÀI' : 'XỈU') + '\\nTiền: ' + data.amount.toLocaleString() + ' Vin\\nSố dư mới: ' + data.balance.toLocaleString() + ' Vin', 'success');
                    document.getElementById('balanceDisplay').textContent = data.balance.toLocaleString() + ' Vin';
                } else {
                    showResult('❌ ' + data.message, 'error');
                }
            } catch (error) {
                showResult('❌ Lỗi đặt cược: ' + error.message, 'error');
            }

            btn.disabled = false;
            btn.innerHTML = '🎲 Đặt cược';
        }

        function showResult(text, type) {
            var resultDiv = document.getElementById('result');
            var resultText = document.getElementById('resultText');
            resultText.textContent = text;
            resultDiv.className = 'result show ' + type;
            
            clearTimeout(window.resultTimeout);
            window.resultTimeout = setTimeout(function() {
                resultDiv.className = 'result';
            }, 10000);
        }

        document.getElementById('amountInput').addEventListener('input', updateBetButton);
    </script>
</body>
</html>
    `);
});

// ==================== API ENDPOINTS ====================

app.post('/api/connect', (req, res) => {
    var token = req.body.token;
    
    if (!token || token.length < 50) {
        return res.json({ success: false, message: 'Token không hợp lệ' });
    }

    var sessionId = 'web_' + Date.now() + '_' + Math.random().toString(36).substring(7);
    
    var state = {
        step: null,
        jwtToken: token,
        ws: null,
        wsReady: false,
        isLoggedIn: true,
        balance: 0,
        nickname: 'Đang kết nối...',
        betResolve: null,
        betReject: null,
        betTimeout: null,
        reconnectTimer: null,
        _notifiedBalance: false
    };
    
    userStates.set(sessionId, state);
    wsConnections.set(sessionId, { state: state });
    
    connectWebSocket(sessionId);
    
    setTimeout(function() {
        var st = userStates.get(sessionId);
        if (st) {
            res.json({ 
                success: true, 
                sessionId: sessionId, 
                balance: st.balance || 0,
                nickname: st.nickname || 'Unknown'
            });
        } else {
            res.json({ success: false, message: 'Không thể kết nối' });
        }
    }, 2000);
});

app.get('/api/ws-events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    var sentBalance = false;
    
    var checkInterval = setInterval(function() {
        for (var entry of userStates.entries()) {
            var id = entry[0];
            var state = entry[1];
            if (id.startsWith('web_') && state.isLoggedIn && state.wsReady) {
                if (!sentBalance || state.balance !== undefined) {
                    res.write('data: ' + JSON.stringify({ balance: state.balance }) + '\n\n');
                    sentBalance = true;
                }
            }
        }
    }, 1000);
    
    req.on('close', function() {
        clearInterval(checkInterval);
    });
});

app.post('/api/bet', (req, res) => {
    var sessionId = req.body.sessionId;
    var betType = req.body.betType;
    var amount = req.body.amount;
    
    if (!sessionId || !betType || !amount) {
        return res.json({ success: false, message: 'Thiếu thông tin' });
    }
    
    var state = userStates.get(sessionId);
    if (!state || !state.isLoggedIn) {
        return res.json({ success: false, message: 'Chưa đăng nhập' });
    }
    
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
        return res.json({ success: false, message: 'Mất kết nối WebSocket' });
    }
    
    executeBet(sessionId, betType, amount);
    
    var betPromise = new Promise(function(resolve) {
        var checkResult = function() {
            var st = userStates.get(sessionId);
            if (st && st.betResolve) {
                var origResolve = st.betResolve;
                st.betResolve = function(result) {
                    origResolve(result);
                    resolve({ success: true, result: result });
                };
                st.betReject = function(err) {
                    resolve({ success: false, message: err.message });
                };
                userStates.set(sessionId, st);
            } else {
                setTimeout(checkResult, 100);
            }
        };
        checkResult();
        
        setTimeout(function() {
            resolve({ success: false, message: 'Timeout' });
        }, 15000);
    });
    
    betPromise.then(function(result) {
        if (result.success) {
            res.json({
                success: true,
                type: result.result.type,
                amount: result.result.amount,
                balance: result.result.postBalance
            });
        } else {
            res.json({ success: false, message: result.message });
        }
    });
});

// ==================== SHUTDOWN ====================
process.on('SIGINT', function() {
    console.log('🛑 Đang tắt...');
    for (var entry of userStates.entries()) {
        var id = entry[0];
        var state = entry[1];
        if (state.reconnectTimer) {
            clearTimeout(state.reconnectTimer);
            state.reconnectTimer = null;
        }
        if (state.ws) {
            try {
                state.ws.removeAllListeners();
                if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
                    state.ws.close();
                }
            } catch (e) {}
        }
    }
    process.exit(0);
});

process.on('SIGTERM', function() {
    console.log('🛑 Đang tắt...');
    for (var entry of userStates.entries()) {
        var id = entry[0];
        var state = entry[1];
        if (state.reconnectTimer) {
            clearTimeout(state.reconnectTimer);
            state.reconnectTimer = null;
        }
        if (state.ws) {
            try {
                state.ws.removeAllListeners();
                if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
                    state.ws.close();
                }
            } catch (e) {}
        }
    }
    process.exit(0);
});

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', function() {
    console.log('🚀 Server đang chạy tại http://localhost:' + PORT);
    console.log('📌 Dashboard: http://localhost:' + PORT + '/');
    console.log('🤖 Telegram Bot đang chạy');
});