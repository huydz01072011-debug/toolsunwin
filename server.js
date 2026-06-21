const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');
const WebSocket = require('ws');

const BOT_TOKEN = '8792790286:AAHuxMzba8iOyyrXhrKHOwLxIX6Ie8urAhY'.trim();
const API_BASE = 'https://apifo88daigia.tele68.com/api';
const WS_URL = 'wss://wtxmd52.tele68.com/txmd5/?EIO=4&transport=websocket';

// Kiểm tra token khởi động
(async () => {
  try {
    const me = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    if (me.data.ok) {
      console.log(`Bot @${me.data.result.username} đã sẵn sàng`);
    } else {
      console.error('Token không hợp lệ, bot không thể khởi động');
      process.exit(1);
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.error('Token sai hoặc bot đã bị xoá. Vui lòng lấy token mới từ @BotFather.');
    } else {
      console.error('Không thể kết nối đến Telegram API, kiểm tra mạng hoặc proxy.');
    }
    process.exit(1);
  }
})();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// State lưu cho từng user
const userStates = new Map();

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
  if (error.code === 'ETELEGRAM' && error.message.includes('404')) {
    console.error('Token hết hạn hoặc không đúng, dừng bot...');
    process.exit(1);
  }
});

// -------------------- LỆNH --------------------
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
`🎯 CHÀO MỪNG ĐẾN BOT VIP LC79 🎯
Danh sách lệnh:
/start - Hướng dẫn
/login - Đăng nhập tài khoản
/logout - Xoá session & ngắt WebSocket
/balance - Xem số dư hiện tại
/bet - Đặt cược Tài / Xỉu
/cancel - Huỷ thao tác đang thực hiện
`);
});

bot.onText(/\/login/, (msg) => {
  const chatId = msg.chat.id;
  const state = userStates.get(chatId);
  if (state && state.ws && state.ws.readyState === WebSocket.OPEN) {
    bot.sendMessage(chatId, '⚠️ Bạn đã đăng nhập rồi. Dùng /logout nếu muốn đổi tài khoản.');
    return;
  }
  userStates.set(chatId, { step: 'awaiting_username' });
  bot.sendMessage(chatId, '🔑 Nhập tên đăng nhập trong game LC79:');
});

bot.onText(/\/logout/, (msg) => {
  const chatId = msg.chat.id;
  const state = userStates.get(chatId);
  if (state && state.ws) {
    try { state.ws.close(); } catch (e) {}
  }
  userStates.delete(chatId);
  bot.sendMessage(chatId, '✅ Đã xoá session và ngắt kết nối.');
});

bot.onText(/\/balance/, (msg) => {
  const chatId = msg.chat.id;
  const state = userStates.get(chatId);
  if (!state || state.balance === undefined) {
    bot.sendMessage(chatId, '❌ Bạn cần đăng nhập trước. Dùng /login');
    return;
  }
  bot.sendMessage(chatId, `💰 Số dư hiện tại: ${state.balance.toLocaleString()} Vin`);
});

bot.onText(/\/bet/, (msg) => {
  const chatId = msg.chat.id;
  const state = userStates.get(chatId);
  if (!state || !state.ws || state.ws.readyState !== WebSocket.OPEN) {
    bot.sendMessage(chatId, '❌ Cần đăng nhập và kết nối WebSocket. Dùng /login');
    return;
  }
  state.step = 'awaiting_bet_type';
  state.betType = null;
  state.amount = null;
  userStates.set(chatId, state);
  bot.sendMessage(chatId, '🎲 Chọn loại cược: gõ **Tài** hoặc **Xỉu** (không dấu hoặc có dấu đều được)');
});

bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  const state = userStates.get(chatId);
  if (state) {
    state.step = null;
    state.betType = null;
    state.amount = null;
    userStates.set(chatId, state);
    bot.sendMessage(chatId, '🔄 Đã huỷ thao tác hiện tại.');
  } else {
    bot.sendMessage(chatId, 'Không có thao tác nào để huỷ.');
  }
});

// -------------------- XỬ LÝ TIN NHẮN THƯỜNG --------------------
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;

  const state = userStates.get(chatId);
  if (!state) return;

  // ------ ĐĂNG NHẬP ------
  if (state.step === 'awaiting_username') {
    state.username = text.trim();
    state.step = 'awaiting_password';
    userStates.set(chatId, state);
    bot.sendMessage(chatId, '🔒 Nhập mật khẩu:');
    return;
  }

  if (state.step === 'awaiting_password') {
    const username = state.username;
    const password = text.trim();
    const md5Password = crypto.createHash('md5').update(password).digest('hex');

    // Xoá state tạm
    userStates.delete(chatId);

    const url = `${API_BASE}?c=3&un=${username}&pw=${md5Password}&cp=R&cl=R&pf=web&at=`;

    try {
      const response = await axios.get(url, { timeout: 10000 });
      const data = response.data;

      // Log response để debug
      console.log('Login response:', JSON.stringify(data, null, 2));

      if (data.success) {
        let token = null;
        // Ưu tiên lấy token từ data.token
        if (data.token) {
          token = data.token;
        } else if (data.accessToken) {
          token = data.accessToken;
        } else {
          // Nếu không, parse sessionKey
          try {
            const decoded = Buffer.from(data.sessionKey, 'base64').toString('utf8');
            const sessionJson = JSON.parse(decoded);
            token = sessionJson.token || sessionJson.accessToken || null;
          } catch (e) {
            console.error('Parse sessionKey error:', e.message);
          }
        }

        if (!token) {
          bot.sendMessage(chatId, '❌ Không lấy được token từ response login. Vui lòng kiểm tra log và báo lại cho dev.');
          console.log('Raw data:', data);
          return;
        }

        // Tạo state mới
        const newState = {
          step: null,
          username: username,
          balance: 0, // sẽ cập nhật sau
          token: token,
          ws: null,
          wsReady: false,
          betResolve: null,
          betReject: null,
          betTimeout: null,
        };
        userStates.set(chatId, newState);

        // Kết nối WebSocket
        try {
          const ws = new WebSocket(WS_URL);
          newState.ws = ws;

          ws.on('open', () => {
            console.log(`WebSocket connected for user ${username}`);
            // Gửi token xác thực
            const authMsg = `40/txmd5,${JSON.stringify({ token })}`;
            ws.send(authMsg);
            console.log(`Sent auth: ${authMsg}`);
          });

          ws.on('message', (data) => {
            const message = data.toString();
            // Xử lý ping/pong: nếu là "2" thì gửi "3"
            if (message === '2') {
              ws.send('3');
              return;
            }
            handleWebSocketMessage(chatId, message);
          });

          ws.on('close', () => {
            console.log(`WebSocket closed for user ${username}`);
            const st = userStates.get(chatId);
            if (st) {
              st.ws = null;
              st.wsReady = false;
              userStates.set(chatId, st);
            }
          });

          ws.on('error', (err) => {
            console.error(`WebSocket error for user ${username}:`, err.message);
          });

          // Lưu ws vào state
          userStates.set(chatId, newState);

          let reply = `✅ Đăng nhập thành công!\n`;
          reply += `Tên: ${username}\n`;
          reply += `Đang kết nối WebSocket...\n`;
          reply += `\n💡 Dùng /bet để đặt cược, /balance xem số dư.`;
          bot.sendMessage(chatId, reply);

        } catch (wsError) {
          console.error('WebSocket connection error:', wsError.message);
          bot.sendMessage(chatId, '⚠️ Đăng nhập thành công nhưng không thể kết nối WebSocket. Vui lòng thử lại.');
          userStates.delete(chatId);
        }

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

  // ------ ĐẶT CƯỢC: CHỌN LOẠI ------
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

  // ------ ĐẶT CƯỢC: NHẬP SỐ TIỀN ------
  if (state.step === 'awaiting_bet_amount') {
    const amount = parseInt(text.trim(), 10);
    if (isNaN(amount) || amount <= 0) {
      bot.sendMessage(chatId, '⚠️ Vui lòng nhập một số nguyên dương (ví dụ: 1000).');
      return;
    }

    // Reset step
    state.step = null;
    state.amount = amount;
    userStates.set(chatId, state);

    // Kiểm tra WebSocket
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      bot.sendMessage(chatId, '❌ Mất kết nối WebSocket. Vui lòng /logout rồi /login lại.');
      return;
    }

    // Gửi lệnh bet qua WebSocket
    const betType = state.betType;
    const betAmount = amount;
    const chatIdForResponse = chatId;

    // Tạo promise để chờ kết quả
    const betPromise = new Promise((resolve, reject) => {
      const st = userStates.get(chatIdForResponse);
      if (!st) {
        reject(new Error('State not found'));
        return;
      }
      st.betResolve = resolve;
      st.betReject = reject;
      st.betTimeout = setTimeout(() => {
        reject(new Error('Timeout, không nhận được kết quả từ server'));
        const st2 = userStates.get(chatIdForResponse);
        if (st2) {
          st2.betResolve = null;
          st2.betReject = null;
          st2.betTimeout = null;
        }
      }, 15000);
      userStates.set(chatIdForResponse, st);
    });

    // Gửi lệnh bet
    try {
      const msg = `42/txmd5,${JSON.stringify(["bet", { type: betType, amount: betAmount }])}`;
      state.ws.send(msg);
      console.log(`Bet sent: ${msg}`);
      bot.sendMessage(chatId, `⏳ Đang gửi lệnh đặt cược ${betType} ${betAmount}...`);
    } catch (err) {
      bot.sendMessage(chatId, `❌ Lỗi gửi lệnh: ${err.message}`);
      const st = userStates.get(chatId);
      if (st) {
        st.betResolve = null;
        st.betReject = null;
        if (st.betTimeout) clearTimeout(st.betTimeout);
        st.betTimeout = null;
      }
      return;
    }

    // Chờ kết quả
    try {
      const result = await betPromise;
      bot.sendMessage(chatId,
`🎉 Đặt cược thành công!
Loại: ${result.type}
Số tiền: ${result.amount.toLocaleString()} Vin
Số dư mới: ${result.postBalance.toLocaleString()} Vin`
      );
      // Cập nhật balance
      const st = userStates.get(chatId);
      if (st) {
        st.balance = result.postBalance;
        userStates.set(chatId, st);
      }
    } catch (err) {
      bot.sendMessage(chatId, `❌ Đặt cược thất bại: ${err.message}`);
    } finally {
      const st = userStates.get(chatId);
      if (st) {
        st.betResolve = null;
        st.betReject = null;
        if (st.betTimeout) clearTimeout(st.betTimeout);
        st.betTimeout = null;
        userStates.set(chatId, st);
      }
    }
    return;
  }

  // Không khớp step nào
});

// -------------------- XỬ LÝ MESSAGE TỪ WEBSOCKET --------------------
function handleWebSocketMessage(chatId, message) {
  const state = userStates.get(chatId);
  if (!state) return;

  // Log để debug (có thể comment bớt)
  console.log(`WS received: ${message}`);

  // Xử lý message dạng "42/txmd5,..." hoặc "42/txmd5,[...]"
  if (!message.startsWith('42/txmd5,')) {
    return;
  }

  const payload = message.substring('42/txmd5,'.length);
  try {
    const data = JSON.parse(payload);
    if (!Array.isArray(data) || data.length < 2) return;

    const event = data[0];
    const body = data[1];

    if (event === 'tick-update') {
      // Có thể cập nhật thông tin bàn, không xử lý
    } else if (event === 'bet-result') {
      const result = body;
      if (result.postBalance !== undefined && result.amount !== undefined && result.type) {
        // Có promise đang chờ
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
          // Kết quả không đồng bộ, thông báo cho user
          bot.sendMessage(chatId,
`📢 Kết quả cược tự động:
Loại: ${result.type}
Số tiền: ${result.amount.toLocaleString()} Vin
Số dư mới: ${result.postBalance.toLocaleString()} Vin`
          );
          state.balance = result.postBalance;
          userStates.set(chatId, state);
        }
      }
    } else if (event === 'your-info') {
      // Cập nhật balance từ your-info
      if (body.balance !== undefined) {
        state.balance = body.balance;
        userStates.set(chatId, state);
      }
    } else if (event === 'session-info') {
      // Có thể lấy md5, id
    }
  } catch (e) {
    console.error('Parse WS message error:', e.message);
  }
}

// Đóng kết nối WebSocket khi bot dừng
process.on('SIGINT', () => {
  console.log('Shutting down bot...');
  for (const [chatId, state] of userStates.entries()) {
    if (state.ws) {
      try { state.ws.close(); } catch (e) {}
    }
  }
  process.exit();
});

console.log('Bot đang chạy với WebSocket...');