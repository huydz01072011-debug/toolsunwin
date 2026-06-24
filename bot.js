const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const WebSocket = require('ws');

// Token đã gộp sẵn
const BOT_TOKEN = '8792790286:AAHuxMzba8iOyyrXhrKHOwLxIX6Ie8urAhY';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Lưu trạng thái user: chatId -> { accessToken, sessionKey, userData }
const userSessions = new Map();

// Helper: giải mã sessionKey
function parseSessionKey(sessionKey) {
    try {
        return JSON.parse(Buffer.from(sessionKey, 'base64').toString());
    } catch (e) {
        return null;
    }
}

// Hàm đăng nhập
async function login(username, password) {
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

    const response = await axios.get(`${baseUrl}?${params.toString()}`, {
        timeout: 10000,
        headers: { 'Accept': 'application/json' }
    });
    return response.data;
}

// Hàm đặt cược qua WebSocket
function placeBetViaWS(accessToken, type, amount) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('wss://wtxmd52.tele68.com/txmd5/?EIO=4&transport=websocket');
        let authenticated = false;
        let result = null;
        let timeout = setTimeout(() => {
            ws.close();
            reject(new Error('⏱️ Timeout kết nối WebSocket (15s)'));
        }, 15000);

        ws.on('open', () => {
            const authMsg = '40/txmd5,{"token":"' + accessToken + '"}';
            ws.send(authMsg);
        });

        ws.on('message', (data) => {
            const msg = data.toString();

            if (msg.startsWith('40/txmd5,')) {
                try {
                    const payload = JSON.parse(msg.substring('40/txmd5,'.length));
                    if (payload.sid) {
                        authenticated = true;
                        // Gửi lệnh đặt cược
                        const betCmd = ['bet', { type: type, amount: amount }];
                        const betMsg = '42/txmd5,' + JSON.stringify(betCmd);
                        ws.send(betMsg);
                    }
                } catch (e) { /* bỏ qua */ }
            } else if (msg.startsWith('42/txmd5,')) {
                try {
                    const payload = JSON.parse(msg.substring('42/txmd5,'.length));
                    const event = payload[0];
                    const data = payload[1];
                    if (event === 'bet-result') {
                        result = data;
                        clearTimeout(timeout);
                        ws.close();
                        resolve(result);
                    } else if (event === 'error') {
                        clearTimeout(timeout);
                        ws.close();
                        reject(new Error('Lỗi từ server: ' + JSON.stringify(data)));
                    }
                } catch (e) { /* bỏ qua */ }
            }
        });

        ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error('Lỗi WebSocket: ' + err.message));
        });

        ws.on('close', () => {
            clearTimeout(timeout);
            if (!result && !authenticated) {
                reject(new Error('Không thể xác thực WebSocket'));
            } else if (!result) {
                reject(new Error('WebSocket đóng mà không có kết quả'));
            }
        });
    });
}

// ------------------- LỆNH BOT -------------------

// /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
        `🎰 **LC79 Betting Bot**\n\n` +
        `📌 **Các lệnh:**\n` +
        `/login <tên> <mật khẩu> - Đăng nhập\n` +
        `/info - Xem thông tin tài khoản\n` +
        `/balance - Xem số dư\n` +
        `/bet <tai|xiu> <số tiền> - Đặt cược\n` +
        `/logout - Đăng xuất\n\n` +
        `📝 Ví dụ:\n` +
        `/login huybucuadm matkhau123\n` +
        `/bet tai 1000`,
        { parse_mode: 'Markdown' }
    );
});

// /login
bot.onText(/\/login (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const args = match[1].trim().split(' ');
    if (args.length < 2) {
        return bot.sendMessage(chatId, '❌ Cú pháp: /login <tên> <mật khẩu>');
    }
    const username = args[0];
    const password = args.slice(1).join(' ');

    try {
        await bot.sendMessage(chatId, '⏳ Đang đăng nhập...');
        const data = await login(username, password);
        
        if (data.success === true) {
            const session = {
                accessToken: data.accessToken,
                sessionKey: data.sessionKey,
                userData: data
            };
            userSessions.set(chatId, session);

            const sessionData = parseSessionKey(data.sessionKey);
            const nickname = sessionData ? sessionData.nickname : username;
            const balance = sessionData ? sessionData.vinTotal : 0;
            
            bot.sendMessage(chatId, 
                `✅ **Đăng nhập thành công!**\n\n` +
                `👤 **Tên:** ${nickname}\n` +
                `💰 **Số dư:** ${Number(balance).toLocaleString('vi-VN')}\n\n` +
                `Dùng lệnh /bet để đặt cược.`,
                { parse_mode: 'Markdown' }
            );
        } else {
            const errMsg = data.error || data.errorCode || 'Sai tài khoản hoặc mật khẩu';
            bot.sendMessage(chatId, `❌ Đăng nhập thất bại: ${errMsg}`);
        }
    } catch (error) {
        bot.sendMessage(chatId, `❌ Lỗi: ${error.message}`);
    }
});

// /info
bot.onText(/\/info/, (msg) => {
    const chatId = msg.chat.id;
    const session = userSessions.get(chatId);
    if (!session) {
        return bot.sendMessage(chatId, '❌ Bạn chưa đăng nhập. Dùng /login');
    }

    const sessionData = parseSessionKey(session.sessionKey);
    let info = '📋 **Thông tin tài khoản:**\n\n';
    
    if (sessionData) {
        // Các key cần ẩn
        const hiddenKeys = ['xutotal','daily','luckyrotate','mobilesecure','birthday','vippointsave','avatar','certificate','ipaddress'];
        
        // Hiển thị thông tin chính
        const mainKeys = ['nickname', 'vinTotal', 'balance', 'level', 'curLevel'];
        for (const key of mainKeys) {
            if (sessionData[key] !== undefined) {
                let label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
                let val = sessionData[key];
                if (typeof val === 'number') val = Number(val).toLocaleString('vi-VN');
                if (typeof val === 'boolean') val = val ? 'Có' : 'Không';
                info += `• **${label}**: ${val}\n`;
            }
        }
        
        // Các key khác (bỏ qua key ẩn)
        for (const [key, value] of Object.entries(sessionData)) {
            if (mainKeys.includes(key)) continue;
            if (hiddenKeys.includes(key.toLowerCase())) continue;
            let label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
            let val = value;
            if (typeof val === 'number') val = Number(val).toLocaleString('vi-VN');
            if (typeof val === 'boolean') val = val ? 'Có' : 'Không';
            if (val === null || val === undefined) val = '—';
            info += `• **${label}**: ${val}\n`;
        }
    } else {
        info += JSON.stringify(session.userData, null, 2);
    }
    
    bot.sendMessage(chatId, info, { parse_mode: 'Markdown' });
});

// /balance
bot.onText(/\/balance/, (msg) => {
    const chatId = msg.chat.id;
    const session = userSessions.get(chatId);
    if (!session) {
        return bot.sendMessage(chatId, '❌ Bạn chưa đăng nhập. Dùng /login');
    }

    const sessionData = parseSessionKey(session.sessionKey);
    let balance = 0;
    let nickname = '';
    if (sessionData) {
        balance = sessionData.vinTotal || sessionData.balance || 0;
        nickname = sessionData.nickname || '';
    }
    bot.sendMessage(chatId, 
        `👤 **${nickname}**\n💰 **Số dư:** ${Number(balance).toLocaleString('vi-VN')}`,
        { parse_mode: 'Markdown' }
    );
});

// /bet
bot.onText(/\/bet (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const session = userSessions.get(chatId);
    if (!session) {
        return bot.sendMessage(chatId, '❌ Bạn chưa đăng nhập. Dùng /login');
    }

    const args = match[1].trim().split(' ');
    if (args.length < 2) {
        return bot.sendMessage(chatId, '❌ Cú pháp: /bet <tai|xiu> <số tiền>');
    }
    
    const type = args[0].toUpperCase();
    if (type !== 'TAI' && type !== 'XIU') {
        return bot.sendMessage(chatId, '❌ Loại cược phải là "tai" hoặc "xiu"');
    }
    
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < 100) {
        return bot.sendMessage(chatId, '❌ Số tiền phải >= 100');
    }

    try {
        await bot.sendMessage(chatId, 
            `⏳ Đang đặt cược **${type}** - ${Number(amount).toLocaleString('vi-VN')}...`,
            { parse_mode: 'Markdown' }
        );

        const result = await placeBetViaWS(session.accessToken, type, amount);

        let reply = `🎲 **Kết quả cược:**\n\n`;
        reply += `• **Loại**: ${result.type || type}\n`;
        reply += `• **Tiền**: ${result.amount ? Number(result.amount).toLocaleString('vi-VN') : Number(amount).toLocaleString('vi-VN')}\n`;
        reply += `• **Số dư mới**: ${result.postBalance ? Number(result.postBalance).toLocaleString('vi-VN') : '--'}`;

        // Cập nhật số dư trong session
        if (result.postBalance) {
            const sessionData = parseSessionKey(session.sessionKey);
            if (sessionData) {
                sessionData.vinTotal = result.postBalance;
                session.sessionKey = Buffer.from(JSON.stringify(sessionData)).toString('base64');
                userSessions.set(chatId, session);
            }
        }

        bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
    } catch (error) {
        bot.sendMessage(chatId, `❌ Lỗi đặt cược: ${error.message}`);
    }
});

// /logout
bot.onText(/\/logout/, (msg) => {
    const chatId = msg.chat.id;
    if (userSessions.has(chatId)) {
        userSessions.delete(chatId);
        bot.sendMessage(chatId, '✅ Đã đăng xuất.');
    } else {
        bot.sendMessage(chatId, '❌ Bạn chưa đăng nhập.');
    }
});

// Xử lý tin nhắn không phải lệnh
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (text && !text.startsWith('/')) {
        bot.sendMessage(chatId, 
            `❓ Không hiểu lệnh.\n\n` +
            `📌 **Các lệnh có sẵn:**\n` +
            `/start - Xem hướng dẫn\n` +
            `/login <tên> <mật khẩu> - Đăng nhập\n` +
            `/info - Xem thông tin\n` +
            `/balance - Xem số dư\n` +
            `/bet <tai|xiu> <số tiền> - Đặt cược\n` +
            `/logout - Đăng xuất`
        );
    }
});

console.log('🤖 Bot LC79 đang chạy...');
console.log('📌 Token đã được gộp sẵn');
console.log('📋 Các lệnh: /start, /login, /info, /balance, /bet, /logout');