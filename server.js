const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const WebSocket = require('ws');

// ==================== CẤU HÌNH ====================
const BOT_TOKEN = '8792790286:AAHuxMzba8iOyyrXhrKHOwLxIX6Ie8urAhY'.trim();
const API_BASE = 'https://apifo88daigia.tele68.com/api';
const WS_URL = 'wss://wtxmd52.tele68.com/txmd5/?EIO=4&transport=websocket';

// ==================== KHỞI TẠO BOT ====================
let bot = null;

(async function initBot() {
    try {
        const me = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
        if (me.data.ok) {
            console.log(`✅ Bot @${me.data.result.username} đã sẵn sàng`);
            bot = new TelegramBot(BOT_TOKEN, { polling: true });
            setupBotHandlers();
        } else {
            console.error('❌ Token không hợp lệ');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Không thể kết nối Telegram:', error.message);
        process.exit(1);
    }
})();

// ==================== STATE ====================
const userStates = new Map();

// ==================== SETUP BOT ====================
function setupBotHandlers() {
    bot.on('polling_error', (error) => {
        console.error('Polling error:', error.message);
    });

    // ===== /START =====
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId,
            `🎯 CHÀO MỪNG BOT VIP LC79 🎯\n\n` +
            `/login - Đăng nhập\n` +
            `/logout - Xoá session\n` +
            `/balance - Số dư\n` +
            `/bet - Đặt cược Tài/Xỉu\n` +
            `/info - Thông tin tài khoản\n` +
            `/token - Xem JWT token\n` +
            `/cancel - Huỷ thao tác`
        );
    });

    // ===== /LOGIN =====
    bot.onText(/\/login/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        if (state && state.ws && state.ws.readyState === WebSocket.OPEN && state.isLoggedIn) {
            bot.sendMessage(chatId, '⚠️ Đã đăng nhập. Dùng /logout để đổi tài khoản.');
            return;
        }
        if (state && state.ws) {
            try { state.ws.close(); } catch (e) {}
        }
        userStates.set(chatId, {
            step: 'awaiting_username',
            isLoggedIn: false,
            ws: null,
            reconnectTimer: null
        });
        bot.sendMessage(chatId, '🔑 Nhập tên đăng nhập:');
    });

    // ===== /LOGOUT =====
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

    // ===== /BALANCE =====
    bot.onText(/\/balance/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        if (!state || !state.isLoggedIn || state.balance === undefined) {
            bot.sendMessage(chatId, '❌ Cần đăng nhập. Dùng /login');
            return;
        }
        bot.sendMessage(chatId,
            `💰 SỐ DƯ\n━━━━━━━━━━━━\n` +
            `Vin: ${(state.balance || 0).toLocaleString()}\n` +
            `VIP Point: ${(state.vippoint || 0).toLocaleString()}`
        );
    });

    // ===== /INFO =====
    bot.onText(/\/info/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        if (!state || !state.isLoggedIn) {
            bot.sendMessage(chatId, '❌ Cần đăng nhập. Dùng /login');
            return;
        }
        let reply = `👤 THÔNG TIN\n━━━━━━━━━━━━\n`;
        reply += `Tên: ${state.nickname || state.username}\n`;
        reply += `Cấp độ: ${state.curLevel || 0}\n`;
        reply += `Vin: ${(state.balance || 0).toLocaleString()}\n`;
        reply += `VIP Point: ${(state.vippoint || 0).toLocaleString()}\n`;
        reply += `Ngày tạo: ${state.createTime || 'N/A'}\n`;
        reply += `IP: ${state.ipAddress || 'N/A'}`;
        bot.sendMessage(chatId, reply);
    });

    // ===== /TOKEN =====
    bot.onText(/\/token/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        if (!state || !state.isLoggedIn) {
            bot.sendMessage(chatId, '❌ Cần đăng nhập. Dùng /login');
            return;
        }
        const jwtToken = state.jwtToken || 'Chưa có';
        bot.sendMessage(chatId,
            `🔑 JWT TOKEN (WebSocket)\n━━━━━━━━━━━━\n` +
            `${jwtToken}`
        );
    });

    // ===== /BET =====
    bot.onText(/\/bet/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        if (!state || !state.isLoggedIn) {
            bot.sendMessage(chatId, '❌ Cần đăng nhập. Dùng /login');
            return;
        }
        if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
            bot.sendMessage(chatId, '❌ Mất kết nối WebSocket. Đang thử lại...');
            connectWebSocket(chatId);
            return;
        }
        state.step = 'awaiting_bet_type';
        state.betType = null;
        state.amount = null;
        userStates.set(chatId, state);
        bot.sendMessage(chatId, '🎲 Chọn loại cược: **Tài** hoặc **Xỉu**');
    });

    // ===== /CANCEL =====
    bot.onText(/\/cancel/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        if (state) {
            state.step = null;
            state.betType = null;
            state.amount = null;
            if (state.betTimeout) {
                clearTimeout(state.betTimeout);
                state.betTimeout = null;
            }
            userStates.set(chatId, state);
            bot.sendMessage(chatId, '🔄 Đã huỷ.');
        } else {
            bot.sendMessage(chatId, 'Không có thao tác nào.');
        }
    });

    // ===== XỬ LÝ TIN NHẮN =====
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        if (!text || text.startsWith('/')) return;

        const state = userStates.get(chatId);
        if (!state) return;

        // ----- BƯỚC 1: USERNAME -----
        if (state.step === 'awaiting_username') {
            state.username = text.trim();
            state.step = 'awaiting_password';
            userStates.set(chatId, state);
            bot.sendMessage(chatId, '🔒 Nhập mật khẩu:');
            return;
        }

        // ----- BƯỚC 2: PASSWORD -----
        if (state.step === 'awaiting_password') {
            const username = state.username;
            const password = text.trim();
            const md5Password = crypto.createHash('md5').update(password).digest('hex');

            userStates.delete(chatId);

            const url = `${API_BASE}?c=3&un=${username}&pw=${md5Password}&cp=R&cl=R&pf=web&at=`;

            try {
                const response = await axios.get(url, { timeout: 10000 });
                const data = response.data;

                console.log('📥 Login response:', JSON.stringify(data, null, 2));

                if (data.success) {
                    // ===== LẤY ACCESSTOKEN =====
                    const accessToken = data.accessToken || null;
                    if (!accessToken) {
                        bot.sendMessage(chatId, '❌ Không lấy được accessToken.');
                        return;
                    }

                    // ===== GIẢI MÃ SESSIONKEY ĐỂ LẤY JWT TOKEN =====
                    let sessionData = {};
                    let jwtToken = null;
                    try {
                        const decoded = Buffer.from(data.sessionKey, 'base64').toString('utf8');
                        sessionData = JSON.parse(decoded);
                        console.log('📋 Decoded sessionKey:', sessionData);
                        // Lấy JWT token từ trường 'token' trong sessionData
                        jwtToken = sessionData.token || sessionData.jwt || null;
                    } catch (e) {
                        console.error('❌ Parse sessionKey error:', e.message);
                    }

                    // Nếu không có JWT, dùng accessToken
                    if (!jwtToken) {
                        jwtToken = accessToken;
                    }

                    // ===== TẠO STATE =====
                    const newState = {
                        step: null,
                        username: username,
                        nickname: sessionData.nickname || username,
                        balance: sessionData.vinTotal || sessionData.money || 0,
                        vippoint: sessionData.vippoint || 0,
                        vippointSave: sessionData.vippointSave || 0,
                        curLevel: data.curLevel || 0,
                        createTime: sessionData.createTime || 'N/A',
                        ipAddress: sessionData.ipAddress || 'N/A',
                        accessToken: accessToken,
                        jwtToken: jwtToken,
                        sessionKey: data.sessionKey,
                        ws: null,
                        wsReady: false,
                        isLoggedIn: true,
                        betResolve: null,
                        betReject: null,
                        betTimeout: null,
                        gameId: null,
                        tableMd5: null,
                        reconnectTimer: null,
                        _notifiedBalance: false
                    };

                    userStates.set(chatId, newState);

                    // ===== KẾT NỐI WEBSOCKET =====
                    connectWebSocket(chatId);

                    // ===== THÔNG BÁO =====
                    let reply = `✅ ĐĂNG NHẬP THÀNH CÔNG!\n`;
                    reply += `━━━━━━━━━━━━━━━━\n`;
                    reply += `👤 Tên: ${newState.nickname}\n`;
                    reply += `💰 Số dư: ${newState.balance.toLocaleString()} Vin\n`;
                    reply += `⭐ VIP Point: ${newState.vippoint.toLocaleString()}\n`;
                    reply += `📊 Cấp độ: ${newState.curLevel}\n`;
                    if (newState.createTime !== 'N/A') {
                        reply += `📅 Ngày tạo: ${newState.createTime}\n`;
                    }
                    reply += `\n🔄 Đang kết nối WebSocket...`;
                    bot.sendMessage(chatId, reply);

                } else {
                    const errorCode = data.errorCode || 'không rõ';
                    bot.sendMessage(chatId, `❌ Đăng nhập thất bại. Mã lỗi: ${errorCode}`);
                    userStates.delete(chatId);
                }
            } catch (error) {
                console.error('API login error:', error.message);
                bot.sendMessage(chatId, '⚠️ Lỗi kết nối server, thử lại sau.');
                userStates.delete(chatId);
            }
            return;
        }

        // ----- BƯỚC 3: CHỌN TÀI/XỈU -----
        if (state.step === 'awaiting_bet_type') {
            const lower = text.toLowerCase().trim();
            if (lower === 'tai' || lower === 'tài') {
                state.betType = 'TAI';
            } else if (lower === 'xiu' || lower === 'xỉu') {
                state.betType = 'XIU';
            } else {
                bot.sendMessage(chatId, '⚠️ Gõ **Tài** hoặc **Xỉu**.');
                return;
            }
            state.step = 'awaiting_bet_amount';
            userStates.set(chatId, state);
            bot.sendMessage(chatId, `💰 Đã chọn ${state.betType === 'TAI' ? 'TÀI' : 'XỈU'}. Nhập số tiền:`);
            return;
        }

        // ----- BƯỚC 4: NHẬP SỐ TIỀN -----
        if (state.step === 'awaiting_bet_amount') {
            const amount = parseInt(text.trim(), 10);
            if (isNaN(amount) || amount <= 0) {
                bot.sendMessage(chatId, '⚠️ Nhập số nguyên dương (vd: 1000).');
                return;
            }

            state.step = null;
            state.amount = amount;
            userStates.set(chatId, state);

            if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
                bot.sendMessage(chatId, '❌ Mất kết nối WebSocket. /logout rồi /login lại.');
                return;
            }

            placeBet(chatId);
            return;
        }
    });
}

// ==================== KẾT NỐI WEBSOCKET ====================
function connectWebSocket(chatId) {
    const state = userStates.get(chatId);
    if (!state || !state.isLoggedIn) {
        console.log(`❌ Không tìm thấy state cho ${chatId}`);
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

    // Kiểm tra JWT token
    if (!state.jwtToken || state.jwtToken.length < 10) {
        console.error(`❌ JWT token không hợp lệ cho ${state.username}: ${state.jwtToken}`);
        bot.sendMessage(chatId, '❌ JWT token không hợp lệ. Vui lòng đăng nhập lại.');
        return;
    }

    console.log(`🔌 Đang kết nối WebSocket cho ${state.username}`);
    console.log(`📌 JWT: ${state.jwtToken.substring(0, 30)}...`);

    try {
        const ws = new WebSocket(WS_URL);
        state.ws = ws;
        state.wsReady = false;
        userStates.set(chatId, state);

        ws.on('open', () => {
            console.log(`✅ WebSocket đã kết nối cho ${state.username}`);
            const authMsg = `40/txmd5,${JSON.stringify({ token: state.jwtToken })}`;
            ws.send(authMsg);
            console.log(`📤 Đã gửi auth: ${authMsg.substring(0, 100)}...`);

            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(`42/txmd5,${JSON.stringify({ "session-info": { "id": 0 } })}`);
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
            console.log(`🔌 WebSocket đóng cho ${state.username}, code: ${code}, reason: ${reason}`);
            const st = userStates.get(chatId);
            if (st) {
                st.ws = null;
                st.wsReady = false;
                userStates.set(chatId, st);
                if (st.isLoggedIn && !st.reconnectTimer) {
                    console.log(`🔄 Thử reconnect cho ${st.username} sau 3s...`);
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
            console.error(`❌ WebSocket error cho ${state.username}:`, err.message);
        });

    } catch (error) {
        console.error(`❌ Lỗi tạo WebSocket:`, error.message);
        bot.sendMessage(chatId, '⚠️ Lỗi kết nối WebSocket. Thử /logout rồi /login lại.');
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
                console.log(`📊 Cập nhật balance ${state.username}: ${state.balance}`);
                if (!state._notifiedBalance) {
                    state._notifiedBalance = true;
                    bot.sendMessage(chatId, `✅ WebSocket sẵn sàng!\n💰 Số dư: ${state.balance.toLocaleString()} Vin`);
                    userStates.set(chatId, state);
                }
                return;
            }

            if (event === 'session-info') {
                if (body.id) state.gameId = body.id;
                if (body.md5) state.tableMd5 = body.md5;
                userStates.set(chatId, state);
                console.log(`📋 Session: gameId=${state.gameId}, md5=${state.tableMd5}`);
                return;
            }

            if (event === 'tick-update') {
                return;
            }

            if (event === 'bet-result') {
                const result = body;
                if (result.postBalance !== undefined && result.amount !== undefined && result.type) {
                    console.log(`🎯 Bet result: ${result.type} ${result.amount} -> ${result.postBalance}`);
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
                    } else {
                        bot.sendMessage(chatId,
                            `📢 KẾT QUẢ CƯỢC\n━━━━━━━━━━━━\n` +
                            `Loại: ${result.type === 'TAI' ? 'TÀI' : 'XỈU'}\n` +
                            `Tiền: ${result.amount.toLocaleString()} Vin\n` +
                            `Số dư mới: ${result.postBalance.toLocaleString()} Vin`
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
                console.log(`📊 Cập nhật balance: ${state.balance}`);
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

// ==================== ĐẶT CƯỢC ====================
function placeBet(chatId) {
    const state = userStates.get(chatId);
    if (!state) {
        bot.sendMessage(chatId, '❌ Lỗi state, login lại.');
        return;
    }

    const betType = state.betType;
    const betAmount = state.amount;

    if (!betType || !betAmount) {
        bot.sendMessage(chatId, '❌ Lỗi dữ liệu cược.');
        return;
    }

    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
        bot.sendMessage(chatId, '❌ Mất WebSocket. /logout rồi /login lại.');
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
        const msg = `42/txmd5,${JSON.stringify(betCommand)}`;
        state.ws.send(msg);
        console.log(`📤 Bet sent: ${msg}`);
        bot.sendMessage(chatId,
            `⏳ ĐANG ĐẶT CƯỢC\n━━━━━━━━━━━━\n` +
            `Loại: ${betType === 'TAI' ? 'TÀI' : 'XỈU'}\n` +
            `Tiền: ${betAmount.toLocaleString()} Vin\n` +
            `Chờ kết quả...`
        );
    } catch (err) {
        bot.sendMessage(chatId, `❌ Lỗi gửi: ${err.message}`);
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
            bot.sendMessage(chatId,
                `🎉 ĐẶT CƯỢC THÀNH CÔNG!\n━━━━━━━━━━━━\n` +
                `Loại: ${result.type === 'TAI' ? 'TÀI' : 'XỈU'}\n` +
                `Tiền: ${result.amount.toLocaleString()} Vin\n` +
                `Số dư mới: ${result.postBalance.toLocaleString()} Vin`
            );
            const st = userStates.get(chatId);
            if (st) {
                st.balance = result.postBalance;
                userStates.set(chatId, st);
            }
        })
        .catch((err) => {
            bot.sendMessage(chatId, `❌ Đặt cược thất bại: ${err.message}`);
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

// ==================== SHUTDOWN ====================
process.on('SIGINT', () => {
    console.log('🛑 Đang tắt...');
    for (const [chatId, state] of userStates.entries()) {
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

process.on('SIGTERM', () => {
    console.log('🛑 Đang tắt...');
    for (const [chatId, state] of userStates.entries()) {
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

console.log('🚀 Bot LC79 VIP đang khởi động...');
console.log('📌 Chờ kết nối Telegram...');