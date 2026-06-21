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
let isBotReady = false;

(async function initBot() {
    try {
        const me = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
        if (me.data.ok) {
            console.log(`✅ Bot @${me.data.result.username} đã sẵn sàng`);
            isBotReady = true;
            bot = new TelegramBot(BOT_TOKEN, { polling: true });
            setupBotHandlers();
        } else {
            console.error('❌ Token không hợp lệ, bot không thể khởi động');
            process.exit(1);
        }
    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.error('❌ Token sai hoặc bot đã bị xoá. Vui lòng lấy token mới từ @BotFather.');
        } else {
            console.error('❌ Không thể kết nối đến Telegram API:', error.message);
        }
        process.exit(1);
    }
})();

// ==================== STATE QUẢN LÝ USER ====================
const userStates = new Map();

// ==================== SETUP BOT HANDLERS ====================
function setupBotHandlers() {
    bot.on('polling_error', (error) => {
        console.error('Polling error:', error.message);
        if (error.code === 'ETELEGRAM' && error.message.includes('404')) {
            console.error('Token hết hạn hoặc không đúng, dừng bot...');
            process.exit(1);
        }
    });

    // ==================== LỆNH /START ====================
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        bot.sendMessage(chatId,
            `🎯 CHÀO MỪNG ĐẾN BOT VIP LC79 🎯\n\n` +
            `Danh sách lệnh:\n` +
            `/start - Hướng dẫn\n` +
            `/login - Đăng nhập tài khoản\n` +
            `/logout - Xoá session & ngắt WebSocket\n` +
            `/balance - Xem số dư hiện tại\n` +
            `/bet - Đặt cược Tài / Xỉu\n` +
            `/cancel - Huỷ thao tác đang thực hiện\n` +
            `/info - Xem thông tin tài khoản`
        );
    });

    // ==================== LỆNH /LOGIN ====================
    bot.onText(/\/login/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        
        if (state && state.ws && state.ws.readyState === WebSocket.OPEN && state.isLoggedIn) {
            bot.sendMessage(chatId, '⚠️ Bạn đã đăng nhập rồi. Dùng /logout nếu muốn đổi tài khoản.');
            return;
        }
        
        if (state && state.ws) {
            try { 
                if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
                    state.ws.close();
                }
            } catch (e) {}
        }
        
        userStates.set(chatId, { 
            step: 'awaiting_username',
            isLoggedIn: false,
            ws: null,
            wsReady: false,
            reconnectTimer: null
        });
        bot.sendMessage(chatId, '🔑 Nhập tên đăng nhập trong game LC79:');
    });

    // ==================== LỆNH /LOGOUT ====================
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
                    if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
                        state.ws.removeAllListeners();
                        state.ws.close();
                    }
                } catch (e) {}
                state.ws = null;
            }
            state.isLoggedIn = false;
            state.wsReady = false;
            userStates.set(chatId, state);
        }
        userStates.delete(chatId);
        bot.sendMessage(chatId, '✅ Đã xoá session và ngắt kết nối.');
    });

    // ==================== LỆNH /BALANCE ====================
    bot.onText(/\/balance/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        if (!state || !state.isLoggedIn || state.balance === undefined) {
            bot.sendMessage(chatId, '❌ Bạn cần đăng nhập trước. Dùng /login');
            return;
        }
        bot.sendMessage(chatId, 
            `💰 SỐ DƯ HIỆN TẠI\n` +
            `━━━━━━━━━━━━━━━━\n` +
            `Vin: ${(state.balance || 0).toLocaleString()}\n` +
            `VIP Point: ${(state.vippoint || 0).toLocaleString()}\n` +
            `VIP Point Save: ${(state.vippointSave || 0).toLocaleString()}`
        );
    });

    // ==================== LỆNH /INFO ====================
    bot.onText(/\/info/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        if (!state || !state.isLoggedIn) {
            bot.sendMessage(chatId, '❌ Bạn cần đăng nhập trước. Dùng /login');
            return;
        }
        
        let reply = `👤 THÔNG TIN TÀI KHOẢN\n`;
        reply += `━━━━━━━━━━━━━━━━\n`;
        reply += `Tên: ${state.nickname || state.username || 'N/A'}\n`;
        reply += `Cấp độ: ${state.curLevel || 0}\n`;
        reply += `Vin: ${(state.balance || 0).toLocaleString()}\n`;
        reply += `VIP Point: ${(state.vippoint || 0).toLocaleString()}\n`;
        reply += `VIP Point Save: ${(state.vippointSave || 0).toLocaleString()}\n`;
        if (state.createTime) {
            reply += `Ngày tạo: ${state.createTime}\n`;
        }
        if (state.ipAddress) {
            reply += `IP: ${state.ipAddress}`;
        }
        bot.sendMessage(chatId, reply);
    });

    // ==================== LỆNH /BET ====================
    bot.onText(/\/bet/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        
        if (!state || !state.isLoggedIn) {
            bot.sendMessage(chatId, '❌ Cần đăng nhập trước. Dùng /login');
            return;
        }
        
        if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
            bot.sendMessage(chatId, '❌ Mất kết nối WebSocket. Đang thử kết nối lại...');
            connectWebSocket(chatId);
            return;
        }
        
        state.step = 'awaiting_bet_type';
        state.betType = null;
        state.amount = null;
        userStates.set(chatId, state);
        bot.sendMessage(chatId, '🎲 Chọn loại cược: gõ **Tài** hoặc **Xỉu**');
    });

    // ==================== LỆNH /CANCEL ====================
    bot.onText(/\/cancel/, (msg) => {
        const chatId = msg.chat.id;
        const state = userStates.get(chatId);
        if (state) {
            state.step = null;
            state.betType = null;
            state.amount = null;
            state.betResolve = null;
            state.betReject = null;
            if (state.betTimeout) {
                clearTimeout(state.betTimeout);
                state.betTimeout = null;
            }
            userStates.set(chatId, state);
            bot.sendMessage(chatId, '🔄 Đã huỷ thao tác hiện tại.');
        } else {
            bot.sendMessage(chatId, 'Không có thao tác nào để huỷ.');
        }
    });

    // ==================== XỬ LÝ TIN NHẮN THƯỜNG ====================
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        if (!text || text.startsWith('/')) return;

        const state = userStates.get(chatId);
        if (!state) return;

        // ----- BƯỚC 1: CHỜ USERNAME -----
        if (state.step === 'awaiting_username') {
            state.username = text.trim();
            state.step = 'awaiting_password';
            userStates.set(chatId, state);
            bot.sendMessage(chatId, '🔒 Nhập mật khẩu:');
            return;
        }

        // ----- BƯỚC 2: CHỜ PASSWORD -----
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
                    // Parse sessionKey để lấy token JWT
                    let sessionJson = {};
                    let token = null;
                    try {
                        const decoded = Buffer.from(data.sessionKey, 'base64').toString('utf8');
                        sessionJson = JSON.parse(decoded);
                        console.log('📋 Decoded sessionKey:', sessionJson);
                        // Lấy token JWT từ trường 'token' (chính xác)
                        token = sessionJson.token || sessionJson.accessToken || null;
                    } catch (e) {
                        console.error('❌ Parse sessionKey error:', e.message);
                    }

                    // Nếu vẫn chưa có token, thử lấy từ data trực tiếp
                    if (!token) {
                        token = data.token || data.accessToken || null;
                    }

                    if (!token) {
                        bot.sendMessage(chatId, '❌ Không lấy được token JWT. Vui lòng thử lại và báo lỗi.');
                        console.log('❌ Token not found in:', data);
                        return;
                    }

                    // Tạo state mới
                    const newState = {
                        step: null,
                        username: username,
                        nickname: sessionJson.nickname || username,
                        balance: sessionJson.money || sessionJson.vinTotal || 0,
                        vippoint: sessionJson.vippoint || 0,
                        vippointSave: sessionJson.vippointSave || 0,
                        curLevel: data.curLevel || 0,
                        createTime: sessionJson.createTime || 'N/A',
                        ipAddress: sessionJson.ipAddress || 'N/A',
                        token: token,          // JWT dùng cho WebSocket
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

                    // Kết nối WebSocket
                    connectWebSocket(chatId);

                    // Gửi thông báo đăng nhập thành công
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
                bot.sendMessage(chatId, '⚠️ Lỗi kết nối đến máy chủ, thử lại sau.');
                userStates.delete(chatId);
            }
            return;
        }

        // ----- BƯỚC 3: CHỌN LOẠI CƯỢC -----
        if (state.step === 'awaiting_bet_type') {
            const lower = text.toLowerCase().trim();
            if (lower === 'tai' || lower === 'tài') {
                state.betType = 'TAI';
            } else if (lower === 'xiu' || lower === 'xỉu') {
                state.betType = 'XIU';
            } else {
                bot.sendMessage(chatId, '⚠️ Vui lòng gõ **Tài** hoặc **Xỉu**.');
                return;
            }
            state.step = 'awaiting_bet_amount';
            userStates.set(chatId, state);
            bot.sendMessage(chatId, `💰 Đã chọn ${state.betType === 'TAI' ? 'TÀI' : 'XỈU'}. Nhập số tiền muốn đặt (số nguyên dương):`);
            return;
        }

        // ----- BƯỚC 4: NHẬP SỐ TIỀN CƯỢC -----
        if (state.step === 'awaiting_bet_amount') {
            const amount = parseInt(text.trim(), 10);
            if (isNaN(amount) || amount <= 0) {
                bot.sendMessage(chatId, '⚠️ Vui lòng nhập một số nguyên dương (ví dụ: 1000).');
                return;
            }

            state.step = null;
            state.amount = amount;
            userStates.set(chatId, state);

            if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
                bot.sendMessage(chatId, '❌ Mất kết nối WebSocket. Vui lòng /logout rồi /login lại.');
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
        console.log(`❌ Không tìm thấy state cho chatId ${chatId}`);
        return;
    }

    // Xoá reconnect timer cũ
    if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
    }

    // Đóng kết nối cũ an toàn
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

    console.log(`🔌 Đang kết nối WebSocket cho user ${state.username} với token: ${state.token.substring(0, 20)}...`);

    try {
        const ws = new WebSocket(WS_URL);
        state.ws = ws;
        state.wsReady = false;
        userStates.set(chatId, state);

        // ===== KHI MỞ KẾT NỐI =====
        ws.on('open', () => {
            console.log(`✅ WebSocket đã kết nối cho user ${state.username}`);
            // Gửi token xác thực (JWT)
            const authMsg = `40/txmd5,${JSON.stringify({ token: state.token })}`;
            ws.send(authMsg);
            console.log(`📤 Đã gửi auth: ${authMsg}`);
            
            // Sau 1 giây, yêu cầu thông tin phiên
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(`42/txmd5,${JSON.stringify({ "session-info": { "id": 0 } })}`);
                }
            }, 1000);
        });

        // ===== NHẬN MESSAGE =====
        ws.on('message', (data) => {
            const message = data.toString();
            handleWebSocketMessage(chatId, message);
        });

        // ===== PING/PONG =====
        ws.on('ping', () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.pong();
            }
        });

        // ===== ĐÓNG KẾT NỐI =====
        ws.on('close', (code, reason) => {
            console.log(`🔌 WebSocket đóng cho user ${state.username}, code: ${code}, reason: ${reason}`);
            const st = userStates.get(chatId);
            if (st) {
                st.ws = null;
                st.wsReady = false;
                userStates.set(chatId, st);
                
                // Thử reconnect nếu vẫn login và chưa có timer
                if (st.isLoggedIn && !st.reconnectTimer) {
                    console.log(`🔄 Thử reconnect cho user ${st.username} sau 3s...`);
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

        // ===== LỖI =====
        ws.on('error', (err) => {
            console.error(`❌ WebSocket error cho user ${state.username}:`, err.message);
            // Không đóng ở đây để tránh vòng lặp, để 'close' xử lý
        });

    } catch (error) {
        console.error(`❌ Lỗi tạo WebSocket cho user ${state.username}:`, error.message);
        bot.sendMessage(chatId, '⚠️ Lỗi kết nối WebSocket. Vui lòng thử /logout rồi /login lại.');
    }
}

// ==================== XỬ LÝ MESSAGE WEBSOCKET ====================
function handleWebSocketMessage(chatId, message) {
    const state = userStates.get(chatId);
    if (!state) return;

    // Xử lý ping/pong
    if (message === '2') {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send('3');
        }
        return;
    }

    // Chỉ xử lý message dạng "42/txmd5,..."
    if (!message.startsWith('42/txmd5,')) {
        return;
    }

    const payload = message.substring('42/txmd5,'.length);
    try {
        const data = JSON.parse(payload);
        
        // Nếu data là mảng ["event", {...}]
        if (Array.isArray(data) && data.length >= 2) {
            const event = data[0];
            const body = data[1];
            
            if (event === 'your-info') {
                if (body.balance !== undefined) {
                    state.balance = body.balance;
                }
                if (body.nickname) {
                    state.nickname = body.nickname;
                }
                if (body.avatar !== undefined) {
                    state.avatar = body.avatar;
                }
                state.wsReady = true;
                state.isLoggedIn = true;
                userStates.set(chatId, state);
                
                console.log(`📊 Cập nhật thông tin user ${state.username}: balance=${state.balance}`);
                
                if (!state._notifiedBalance) {
                    state._notifiedBalance = true;
                    bot.sendMessage(chatId, 
                        `✅ Kết nối WebSocket thành công!\n` +
                        `💰 Số dư hiện tại: ${state.balance.toLocaleString()} Vin`
                    );
                    userStates.set(chatId, state);
                }
                return;
            }
            
            if (event === 'session-info') {
                if (body.id) {
                    state.gameId = body.id;
                }
                if (body.md5) {
                    state.tableMd5 = body.md5;
                }
                userStates.set(chatId, state);
                console.log(`📋 Session info: gameId=${state.gameId}, md5=${state.tableMd5}`);
                return;
            }
            
            if (event === 'tick-update') {
                // Có thể lấy thông tin bàn, không xử lý
                return;
            }
            
            if (event === 'bet-result') {
                const result = body;
                if (result.postBalance !== undefined && result.amount !== undefined && result.type) {
                    console.log(`🎯 Bet result: ${result.type} ${result.amount} -> balance ${result.postBalance}`);
                    
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
                            `📢 KẾT QUẢ CƯỢC TỰ ĐỘNG\n` +
                            `━━━━━━━━━━━━━━━━\n` +
                            `Loại: ${result.type === 'TAI' ? 'TÀI' : 'XỈU'}\n` +
                            `Số tiền: ${result.amount.toLocaleString()} Vin\n` +
                            `Số dư mới: ${result.postBalance.toLocaleString()} Vin`
                        );
                    }
                }
                return;
            }
        } else if (typeof data === 'object' && data !== null) {
            // Xử lý object kiểu {"session-info": {...}}
            if (data['session-info']) {
                const info = data['session-info'];
                if (info.id) state.gameId = info.id;
                if (info.md5) state.tableMd5 = info.md5;
                userStates.set(chatId, state);
                return;
            }
            if (data['your-info']) {
                const info = data['your-info'];
                if (info.balance !== undefined) {
                    state.balance = info.balance;
                }
                if (info.nickname) {
                    state.nickname = info.nickname;
                }
                state.wsReady = true;
                state.isLoggedIn = true;
                userStates.set(chatId, state);
                console.log(`📊 Cập nhật balance: ${state.balance}`);
                return;
            }
        }
    } catch (e) {
        console.error('❌ Parse WS message error:', e.message);
    }
}

// ==================== ĐẶT CƯỢC ====================
function placeBet(chatId) {
    const state = userStates.get(chatId);
    if (!state) {
        bot.sendMessage(chatId, '❌ Lỗi state, vui lòng đăng nhập lại.');
        return;
    }

    const betType = state.betType;
    const betAmount = state.amount;

    if (!betType || !betAmount) {
        bot.sendMessage(chatId, '❌ Lỗi dữ liệu cược, vui lòng thử lại.');
        return;
    }

    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
        bot.sendMessage(chatId, '❌ Mất kết nối WebSocket. Vui lòng /logout rồi /login lại.');
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
            reject(new Error('Timeout, không nhận được kết quả từ server'));
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
            `⏳ ĐANG ĐẶT CƯỢC\n` +
            `━━━━━━━━━━━━━━━━\n` +
            `Loại: ${betType === 'TAI' ? 'TÀI' : 'XỈU'}\n` +
            `Số tiền: ${betAmount.toLocaleString()} Vin\n` +
            `Vui lòng chờ kết quả...`
        );
    } catch (err) {
        bot.sendMessage(chatId, `❌ Lỗi gửi lệnh: ${err.message}`);
        const st = userStates.get(chatId);
        if (st) {
            st.betResolve = null;
            st.betReject = null;
            if (st.betTimeout) clearTimeout(st.betTimeout);
            st.betTimeout = null;
            userStates.set(chatId, st);
        }
        return;
    }

    betPromise
        .then((result) => {
            bot.sendMessage(chatId,
                `🎉 ĐẶT CƯỢC THÀNH CÔNG!\n` +
                `━━━━━━━━━━━━━━━━\n` +
                `Loại: ${result.type === 'TAI' ? 'TÀI' : 'XỈU'}\n` +
                `Số tiền: ${result.amount.toLocaleString()} Vin\n` +
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

// ==================== SHUTDOWN CLEANUP ====================
process.on('SIGINT', () => {
    console.log('🛑 Đang tắt bot...');
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
    console.log('🛑 Đang tắt bot...');
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