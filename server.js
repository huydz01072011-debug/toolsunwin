const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');

const BOT_TOKEN = '8792790286:AAHuxMzba8iOyyrXhrKHOwLxIX6Ie8urAhY'.trim();
const API_BASE = 'https://apifo88daigia.tele68.com/api';
const TABLE_MD5 = 'a944f524ee23cb617d19095e31539926'; // từ log của thím

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

// Lưu state của từng user: { step, username, sessionData, betType, amount, ... }
const userStates = new Map();

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
  if (error.code === 'ETELEGRAM' && error.message.includes('404')) {
    console.error('Token hết hạn hoặc không đúng, dừng bot...');
    process.exit(1);
  }
});

// -------- LỆNH CHÍNH --------
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
`🎯 CHÀO MỪNG ĐẾN BOT VIP LC79 🎯
Danh sách lệnh:
/start - Xem hướng dẫn
/login - Đăng nhập tài khoản game
/logout - Xoá thông tin đăng nhập
/balance - Xem số dư hiện tại
/bet - Đặt cược Tài / Xỉu (yêu cầu đã login)
/cancel - Hủy thao tác đang thực hiện
`);
});

bot.onText(/\/login/, (msg) => {
  const chatId = msg.chat.id;
  // Nếu đã có session thì thông báo
  if (userStates.has(chatId) && userStates.get(chatId).sessionData) {
    bot.sendMessage(chatId, '⚠️ Bạn đã đăng nhập rồi. Dùng /logout nếu muốn đổi tài khoản.');
    return;
  }
  userStates.set(chatId, { step: 'awaiting_username' });
  bot.sendMessage(chatId, '🔑 Nhập tên đăng nhập trong game LC79:');
});

bot.onText(/\/logout/, (msg) => {
  const chatId = msg.chat.id;
  if (userStates.has(chatId)) {
    userStates.delete(chatId);
    bot.sendMessage(chatId, '✅ Đã xoá session đăng nhập.');
  } else {
    bot.sendMessage(chatId, 'Bạn chưa đăng nhập.');
  }
});

bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id;
  const state = userStates.get(chatId);
  if (!state || !state.sessionData) {
    bot.sendMessage(chatId, '❌ Bạn cần đăng nhập trước. Dùng /login');
    return;
  }
  const data = state.sessionData;
  let reply = `💰 Số dư hiện tại:\n`;
  reply += `Vin: ${(data.vinTotal || 0).toLocaleString()}\n`;
  reply += `VIP Point: ${(data.vippoint || 0).toLocaleString()}\n`;
  reply += `VIP Point Save: ${(data.vippointSave || 0).toLocaleString()}`;
  bot.sendMessage(chatId, reply);
});

bot.onText(/\/bet/, async (msg) => {
  const chatId = msg.chat.id;
  const state = userStates.get(chatId);
  if (!state || !state.sessionData) {
    bot.sendMessage(chatId, '❌ Cần đăng nhập trước khi đặt cược. Dùng /login');
    return;
  }
  // Bắt đầu quy trình đặt cược
  state.step = 'awaiting_bet_type';
  state.betType = null;
  state.amount = null;
  userStates.set(chatId, state);
  bot.sendMessage(chatId, '🎲 Chọn loại cược: gõ **Tài** hoặc **Xỉu** (không dấu hoặc có dấu đều được)');
});

bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  if (userStates.has(chatId)) {
    const state = userStates.get(chatId);
    // Không xoá session, chỉ reset step
    state.step = null;
    state.betType = null;
    state.amount = null;
    userStates.set(chatId, state);
    bot.sendMessage(chatId, '🔄 Đã huỷ thao tác hiện tại.');
  } else {
    bot.sendMessage(chatId, 'Không có thao tác nào để huỷ.');
  }
});

// -------- XỬ LÝ TIN NHẮN THƯỜNG (không phải lệnh) --------
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith('/')) return;

  const state = userStates.get(chatId);
  if (!state) return;

  // ---------- ĐĂNG NHẬP ----------
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

    // Xoá state tạm (chưa có sessionData)
    userStates.delete(chatId);

    const url = `${API_BASE}?c=3&un=${username}&pw=${md5Password}&cp=R&cl=R&pf=web&at=`;

    try {
      const response = await axios.get(url, { timeout: 10000 });
      const data = response.data;

      if (data.success) {
        let sessionJson = {};
        try {
          const decoded = Buffer.from(data.sessionKey, 'base64').toString('utf8');
          sessionJson = JSON.parse(decoded);
        } catch (e) {}

        const nickname = sessionJson.nickname || username;
        const vinTotal = sessionJson.vinTotal || 0;
        const vippoint = sessionJson.vippoint || 0;
        const vippointSave = sessionJson.vippointSave || 0;
        const createTime = sessionJson.createTime || 'N/A';
        const ipAddress = sessionJson.ipAddress || 'N/A';
        const curLevel = data.curLevel || 0;
        const levelRatio = data.levelRatio || [];

        // Lưu session vào state
        const newState = {
          step: null,
          username: username,
          sessionData: {
            sessionKey: data.sessionKey,
            token: sessionJson.token || null,
            nickname,
            vinTotal,
            vippoint,
            vippointSave,
            createTime,
            ipAddress,
            curLevel,
            levelRatio
          }
        };
        userStates.set(chatId, newState);

        let reply = `✅ Đăng nhập thành công!\n\n`;
        reply += `Tên: ${nickname}\n`;
        reply += `Cấp độ: ${curLevel}\n`;
        reply += `Vin: ${vinTotal.toLocaleString()}\n`;
        reply += `VIP Point: ${vippoint.toLocaleString()}\n`;
        reply += `VIP Point Save: ${vippointSave.toLocaleString()}\n`;
        reply += `Ngày tạo: ${createTime}\n`;
        reply += `IP: ${ipAddress}`;
        if (levelRatio.length > 0) {
          reply += `\nMốc cấp độ: ${levelRatio.join(', ')}`;
        }
        reply += `\n\n💡 Dùng /bet để đặt cược, /balance xem số dư.`;

        bot.sendMessage(chatId, reply);
      } else {
        const errorCode = data.errorCode || 'không rõ';
        bot.sendMessage(chatId, `❌ Đăng nhập thất bại. Mã lỗi: ${errorCode}`);
        // Xoá state nếu lỗi
        userStates.delete(chatId);
      }
    } catch (error) {
      console.error('API login error:', error.message);
      bot.sendMessage(chatId, '⚠️ Lỗi kết nối đến máy chủ, thử lại sau.');
      userStates.delete(chatId);
    }
    return;
  }

  // ---------- ĐẶT CƯỢC: CHỌN LOẠI ----------
  if (state.step === 'awaiting_bet_type') {
    const lower = text.toLowerCase().trim();
    // Chấp nhận 'tai', 'xiu', 'tài', 'xỉu' (có dấu)
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

  // ---------- ĐẶT CƯỢC: NHẬP SỐ TIỀN ----------
  if (state.step === 'awaiting_bet_amount') {
    const amount = parseInt(text.trim(), 10);
    if (isNaN(amount) || amount <= 0) {
      bot.sendMessage(chatId, '⚠️ Vui lòng nhập một số nguyên dương (ví dụ: 1000).');
      return;
    }

    // Lưu amount và reset step
    state.amount = amount;
    state.step = null; // kết thúc quy trình
    userStates.set(chatId, state);

    // Gọi API đặt cược
    const sessionData = state.sessionData;
    if (!sessionData) {
      bot.sendMessage(chatId, '❌ Session đã hết hạn, vui lòng đăng nhập lại.');
      userStates.delete(chatId);
      return;
    }

    const betType = state.betType;
    const username = state.username;

    // Dùng sessionKey để xác thực
    const url = `${API_BASE}?c=4&un=${username}&sessionKey=${encodeURIComponent(sessionData.sessionKey)}&type=${betType}&amount=${amount}&tableMd5=${TABLE_MD5}`;

    try {
      const response = await axios.get(url, { timeout: 10000 });
      const result = response.data;

      if (result.success) {
        // Cập nhật lại số dư (nếu API trả về balance mới)
        if (result.balance !== undefined) {
          sessionData.vinTotal = result.balance;
          userStates.set(chatId, state);
        }
        let reply = `🎉 Đặt cược thành công!\n`;
        reply += `Loại: ${betType === 'TAI' ? 'TÀI' : 'XỈU'}\n`;
        reply += `Số tiền: ${amount.toLocaleString()} Vin\n`;
        if (result.balance !== undefined) {
          reply += `Số dư mới: ${result.balance.toLocaleString()} Vin`;
        }
        bot.sendMessage(chatId, reply);
      } else {
        const errorMsg = result.errorCode || 'lỗi không xác định';
        bot.sendMessage(chatId, `❌ Đặt cược thất bại. Mã lỗi: ${errorMsg}`);
      }
    } catch (error) {
      console.error('API bet error:', error.message);
      bot.sendMessage(chatId, '⚠️ Lỗi kết nối đến máy chủ, thử lại sau.');
    }
    return;
  }

  // Nếu không khớp step nào, bỏ qua
});

console.log('Bot đang chạy...');