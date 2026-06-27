const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Giao diện nhập token
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>ZaloPay VIP - Nhập Token</title></head>
    <body style="font-family: Arial; padding: 20px;">
      <h2 style="color: #d32f2f;">Nhập token để lấy thông tin tài khoản</h2>
      <form method="POST" action="/get-info">
        <label>zalo_oauth:</label><br>
        <input type="text" name="zalo_oauth" style="width: 80%; padding: 8px;" required><br><br>
        <label>zlp_token:</label><br>
        <input type="text" name="zlp_token" style="width: 80%; padding: 8px;" required><br><br>
        <label>zalo_id (tuỳ chọn):</label><br>
        <input type="text" name="zalo_id" style="width: 80%; padding: 8px;"><br><br>
        <label>zalopay_id (tuỳ chọn):</label><br>
        <input type="text" name="zalopay_id" style="width: 80%; padding: 8px;"><br><br>
        <button type="submit" style="padding: 10px 30px; background: #1976d2; color: white; border: none; border-radius: 4px;">Lấy thông tin</button>
      </form>
    </body>
    </html>
  `);
});

// Xử lý submit, gọi API ZaloPay
app.post('/get-info', async (req, res) => {
  try {
    const { zalo_oauth, zlp_token, zalo_id, zalopay_id } = req.body;

    if (!zalo_oauth || !zlp_token) {
      return res.status(400).json({ error: 'Thiếu zalo_oauth hoặc zlp_token, mày đổ đầy đủ vào' });
    }

    // Tạo cookie object từ dữ liệu nhập
    const cookies = {
      has_device_id: '0',
      zalo_id: zalo_id || '555803366508544765', // nếu không nhập thì dùng cái mẫu
      zalopay_id: zalopay_id || '260522002000452',
      zalo_oauth: zalo_oauth,
      zlp_token: zlp_token
    };

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
      'X-Requested-With': 'mark.via.gp',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'vi-VN,vi;q=0.9',
      'Origin': 'https://zalopay.vn',
      'Referer': 'https://zalopay.vn/'
    };

    // Thử endpoint /v1/user/info trước
    let response;
    try {
      response = await axios.get('https://sapi.zalopay.vn/v1/user/info', { headers, cookies, timeout: 10000 });
    } catch (err) {
      // Nếu lỗi, thử endpoint /v1/account/profile
      try {
        response = await axios.get('https://sapi.zalopay.vn/v1/account/profile', { headers, cookies, timeout: 10000 });
      } catch (err2) {
        // Vẫn lỗi thì trả về JSON lỗi chi tiết
        return res.status(500).json({
          error: 'Cả hai endpoint đều thất bại',
          detail_first: err.response ? err.response.data : err.message,
          detail_second: err2.response ? err2.response.data : err2.message,
          full_axios_error: err2
        });
      }
    }

    // Thành công
    res.json({
      success: true,
      data: response.data,
      status: response.status,
      headers_sent: response.headers
    });

  } catch (error) {
    // Bắt lỗi tổng
    res.status(500).json({
      error: 'Lỗi không xác định từ server',
      message: error.message,
      stack: error.stack,
      full_error: error
    });
  }
});

app.listen(PORT, () => {
  console.log(`Web VIP đang chạy tại http://localhost:${PORT}, mày vào mà chơi`);
});