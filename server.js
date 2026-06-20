const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const crypto = require('crypto');

const BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
const API_BASE = 'https://apifo88daigia.tele68.com/api';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const userStates = new Map();

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const text = `Chào mừng đến với Bot VIP\nDanh sách lệnh:\n/start - Xem danh sách lệnh\n/login - Đăng nhập tài khoản game LC79\n/cancel - Hủy thao tác`;
  bot.sendMessage(chatId, text);
});

bot.onText(/\/login/, (msg) => {
  const chatId = msg.chat.id;
  userStates.set(chatId, { step: 'awaiting_username' });
  bot.sendMessage(chatId, 'Vui lòng nhập tên đăng nhập trong game LC79 của bạn:');
});

bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  userStates.delete(chatId);
  bot.sendMessage(chatId, 'Đã hủy thao tác.');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  const state = userStates.get(chatId);
  if (!state) return;

  if (state.step === 'awaiting_username') {
    state.username = text.trim();
    state.step = 'awaiting_password';
    userStates.set(chatId, state);
    bot.sendMessage(chatId, 'Vui lòng nhập mật khẩu:');
  } else if (state.step === 'awaiting_password') {
    const username = state.username;
    const password = text.trim();
    const md5Password = crypto.createHash('md5').update(password).digest('hex');

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

        let reply = `Đăng nhập thành công!\n\n`;
        reply += `Tên đăng nhập: ${nickname}\n`;
        reply += `Cấp độ: ${curLevel}\n`;
        reply += `Vin: ${vinTotal.toLocaleString()}\n`;
        reply += `VIP Point: ${vippoint.toLocaleString()}\n`;
        reply += `VIP Point Save: ${vippointSave.toLocaleString()}\n`;
        reply += `Ngày tạo: ${createTime}\n`;
        reply += `IP: ${ipAddress}`;

        if (levelRatio.length > 0) {
          reply += `\nMốc cấp độ: ${levelRatio.join(', ')}`;
        }

        bot.sendMessage(chatId, reply);
      } else {
        const errorCode = data.errorCode || 'không rõ';
        bot.sendMessage(chatId, `Đăng nhập thất bại. Mã lỗi: ${errorCode}`);
      }
    } catch (error) {
      console.error('API error:', error.message);
      bot.sendMessage(chatId, 'Lỗi kết nối đến máy chủ, thử lại sau.');
    }
  }
});

console.log('Bot dang chay...');