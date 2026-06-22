const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;


const MAX_HISTORY = 10000;               
const FETCH_INTERVAL = 1500;             
const PATTERN_LENGTH = 10;        
const DEFAULT_HOST_TX = 'wtx.tele68.com';
const DEFAULT_HOST_TXMD5 = 'wtxmd52.tele68.com';
const API_TX = 'https://wtx.tele68.com/v1/tx/lite-sessions';
const API_TXMD5 = 'https://wtxmd52.tele68.com/v1/txmd5/lite-sessions';

let txHistory = [];                 
let txmd5History = [];             
const txIdSet = new Set();   
const txmd5IdSet = new Set();
let txPredictions = [];
let txmd5Predictions = [];
function buildHeaders(host) {
  return {
    'Host': host,
    'sec-ch-ua-platform': '"Android"',
    'user-agent': 'Mozilla/5.0 (Linux; Android 11; SM-A105G Build/RP1A.200720.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.91 Mobile Safari/537.36',
    'sec-ch-ua': '"Android WebView";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    'content-type': 'application/json',
    'sec-ch-ua-mobile': '?1',
    'accept': '*/*',
    'origin': 'https://lc79b.bet',
    'x-requested-with': 'mark.via.gp',
    'sec-fetch-site': 'cross-site',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'referer': 'https://lc79b.bet/',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'vi-VN,vi;q=0.9,en-GB;q=0.8,en-US;q=0.7,en;q=0.6',
    'priority': 'u=1, i'
  };
}
function transformData(list) {
  return list.map(item => ({
    phien: item.id,
    xuc_xac_1: item.dices[0],
    xuc_xac_2: item.dices[1],
    xuc_xac_3: item.dices[2],
    tong: item.point,
    ket_qua: item.resultTruyenThong,
    id: '@HuyDaiXuVN'
  }));
}
function sortHistory(arr) {
  arr.sort((a, b) => b.phien - a.phien);
}
function trimHistory(historyArray, idSet) {
  if (historyArray.length > MAX_HISTORY) {
    historyArray.sort((a, b) => b.phien - a.phien);
    const removed = historyArray.splice(MAX_HISTORY);
    removed.forEach(item => idSet.delete(item.phien));
  }
}
function addToHistory(newItems, historyArray, idSet) {
  let addedCount = 0;
  for (const item of newItems) {
    if (!idSet.has(item.phien)) {
      idSet.add(item.phien);
      historyArray.push(item);
      addedCount++;
    }
  }
  if (addedCount > 0) {
    sortHistory(historyArray);
    trimHistory(historyArray, idSet);
    checkPredictions(newItems);
  }
  return addedCount;
}
function checkPredictions(newItems) {
  [txPredictions, txmd5Predictions].forEach(predArray => {
    predArray.forEach(pred => {
      if (pred.daKiemTra) return;
      const match = newItems.find(item => item.phien === pred.phienDuDoan);
      if (match) {
        pred.ketQuaThuc = match.ket_qua;
        pred.daKiemTra = true;
      }
    });
  });
}
async function fetchAndUpdate(apiUrl, host, historyArray, idSet, sourceLabel) {
  try {
    const response = await axios.get(apiUrl, {
      headers: buildHeaders(host),
      timeout: 10000
    });
    const data = response.data;
    if (!data.list || !Array.isArray(data.list)) {
      console.log(`[${sourceLabel}] API trả về cấu trúc lạ`);
      return;
    }
    const transformed = transformData(data.list);
    const added = addToHistory(transformed, historyArray, idSet);
    if (added > 0) {
      console.log(`[${sourceLabel}] Đã thêm ${added} phiên mới. Tổng: ${historyArray.length}`);
    }
  } catch (error) {
    console.error(`[${sourceLabel}] Lỗi fetch: ${error.message}`);
  }
}
async function crawlAll() {
  await Promise.allSettled([
    fetchAndUpdate(API_TX, DEFAULT_HOST_TX, txHistory, txIdSet, 'TX'),
    fetchAndUpdate(API_TXMD5, DEFAULT_HOST_TXMD5, txmd5History, txmd5IdSet, 'TXMD5')
  ]);
}
function predict(historyArray, sourceName) {
  if (historyArray.length < PATTERN_LENGTH + 1) {
    return null;
  }
  const sorted = [...historyArray].sort((a, b) => b.phien - a.phien);
  const latest = sorted[0];
  const phienMoiNhat = latest.phien;
  const phienHienTai = phienMoiNhat + 1;
  const recentResults = sorted.slice(0, PATTERN_LENGTH).map(item => item.ket_qua === 'TAI' ? 'T' : 'X');
  const patternStr = recentResults.join('');
  const fullHistory = sorted.slice().reverse();
  const resultString = fullHistory.map(item => item.ket_qua === 'TAI' ? 'T' : 'X').join('');
  const nextResults = [];
  let searchIndex = 0;
  while ((searchIndex = resultString.indexOf(patternStr, searchIndex)) !== -1) {
    const nextIndex = searchIndex + patternStr.length;
    if (nextIndex < resultString.length) {
      nextResults.push(resultString[nextIndex]);
    }
    searchIndex++;
  }

  let duDoan = null;
  let doTinCay = 0;

  if (nextResults.length > 0) {
    const countT = nextResults.filter(r => r === 'T').length;
    const countX = nextResults.length - countT;
    duDoan = countT >= countX ? 'TAI' : 'XIU';
    doTinCay = (Math.max(countT, countX) / nextResults.length) * 100;
  } else {
    let found = false;
    for (let len = PATTERN_LENGTH - 1; len >= 2; len--) {
      const shortPattern = recentResults.slice(0, len).join('');
      const nextRes = [];
      let idx = 0;
      while ((idx = resultString.indexOf(shortPattern, idx)) !== -1) {
        const nextIdx = idx + shortPattern.length;
        if (nextIdx < resultString.length) {
          nextRes.push(resultString[nextIdx]);
        }
        idx++;
      }
      if (nextRes.length > 0) {
        const countT = nextRes.filter(r => r === 'T').length;
        const countX = nextRes.length - countT;
        duDoan = countT >= countX ? 'TAI' : 'XIU';
        doTinCay = (Math.max(countT, countX) / nextRes.length) * 100;
        found = true;
        break;
      }
    }
    if (!found) {
      const allResults = resultString.split('');
      const countT = allResults.filter(r => r === 'T').length;
      const total = allResults.length;
      duDoan = countT >= total / 2 ? 'TAI' : 'XIU';
      doTinCay = (Math.max(countT, total - countT) / total) * 100;
    }
  }
  doTinCay = Math.round(doTinCay * 100) / 100;

  const predictionResult = {
    phien: phienMoiNhat,
    xuc_xac_1: latest.xuc_xac_1,
    xuc_xac_2: latest.xuc_xac_2,
    xuc_xac_3: latest.xuc_xac_3,
    tong: latest.tong,
    ket_qua: latest.ket_qua,
    phien_hien_tai: phienHienTai,
    pattern: patternStr,
    du_doan: duDoan,
    do_tin_cay: doTinCay,
    id: '@HuyDaiXuVN' 
  const predStorage = sourceName === 'TX' ? txPredictions : txmd5Predictions;
  const alreadyPredicted = predStorage.some(p => p.phienDuDoan === phienHienTai);
  if (!alreadyPredicted) {
    predStorage.push({
      phienDuDoan: phienHienTai,
      duDoan: duDoan,
      pattern: patternStr,
      doTinCay: doTinCay,
      thoiGian: new Date().toISOString(),
      ketQuaThuc: null,
      daKiemTra: false
    });
  }

  return predictionResult;
}
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});
app.get('/', (req, res) => {
  res.send(`
    <h1>🎲 SERVER DỰ ĐOÁN TÀI XỈU VIP</h1>
    <p>Endpoints:</p>
    <ul>
      <li><a href="/api/history/tx">/api/history/tx</a> - Lịch sử TX (tối đa 10000 phiên)</li>
      <li><a href="/api/history/txmd5">/api/history/txmd5</a> - Lịch sử TXMD5</li>
      <li><a href="/api/dudoan/tx">/api/dudoan/tx</a> - Dự đoán TX (AI pattern)</li>
      <li><a href="/api/dudoan/txmd5">/api/dudoan/txmd5</a> - Dự đoán TXMD5</li>
      <li><a href="/status">/status</a> - Giao diện lịch sử dự đoán & kết quả</li>
    </ul>
    <p>Server đang crawl dữ liệu mỗi ${FETCH_INTERVAL/1000}s. Lịch sử hiện có: TX=${txHistory.length}, TXMD5=${txmd5History.length}</p>
  `);
});
app.get('/api/history/tx', (req, res) => {
  const limit = parseInt(req.query.limit) || txHistory.length;
  const sorted = [...txHistory].sort((a, b) => b.phien - a.phien);
  const result = sorted.slice(0, limit);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(result));
});
app.get('/api/history/txmd5', (req, res) => {
  const limit = parseInt(req.query.limit) || txmd5History.length;
  const sorted = [...txmd5History].sort((a, b) => b.phien - a.phien);
  const result = sorted.slice(0, limit);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(result));
});
app.get('/api/dudoan/tx', (req, res) => {
  const prediction = predict(txHistory, 'TX');
  if (!prediction) {
    return res.status(503).json({ error: 'Chưa đủ dữ liệu lịch sử để dự đoán (cần ít nhất 6 phiên)' });
  }
  res.json(prediction);
});
app.get('/api/dudoan/txmd5', (req, res) => {
  const prediction = predict(txmd5History, 'TXMD5');
  if (!prediction) {
    return res.status(503).json({ error: 'Chưa đủ dữ liệu lịch sử để dự đoán (cần ít nhất 6 phiên)' });
  }
  res.json(prediction);
});
app.get('/status', (req, res) => {
  const renderPredictionTable = (predictions, label) => {
    if (!predictions || predictions.length === 0) return `<p>Chưa có dự đoán ${label}.</p>`;
    const recent = predictions.slice(-50).reverse();
    let rows = '';
    recent.forEach(p => {
      const ketQua = p.daKiemTra ? p.ketQuaThuc : 'Chờ...';
      const dungSai = p.daKiemTra ? (p.duDoan === p.ketQuaThuc ? '✅ Đúng' : '❌ Sai') : '⏳';
      rows += `<tr>
        <td>${p.phienDuDoan}</td>
        <td><strong>${p.duDoan}</strong></td>
        <td>${ketQua}</td>
        <td>${p.doTinCay}%</td>
        <td>${p.pattern}</td>
        <td>${dungSai}</td>
      </tr>`;
    });
    const daKiemTra = predictions.filter(p => p.daKiemTra);
    const dung = daKiemTra.filter(p => p.duDoan === p.ketQuaThuc).length;
    const sai = daKiemTra.length - dung;
    const tiLe = daKiemTra.length > 0 ? ((dung / daKiemTra.length) * 100).toFixed(2) : '0';
    return `
      <h3>📊 Dự đoán ${label}</h3>
      <p>Tổng dự đoán đã kiểm tra: ${daKiemTra.length} | ✅ Đúng: ${dung} | ❌ Sai: ${sai} | Tỉ lệ đúng: ${tiLe}%</p>
      <table border="1" cellpadding="5" cellspacing="0">
        <tr><th>Phiên dự đoán</th><th>Dự đoán</th><th>Kết quả thực</th><th>Độ tin cậy</th><th>Pattern</th><th>Đúng/Sai</th></tr>
        ${rows}
      </table>
    `;
  };

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="5">
    <title>📡 Trạng thái dự đoán Tài Xỉu</title>
    <style>
      body { font-family: Arial; margin: 20px; background: #f0f2f5; }
      .container { max-width: 1200px; margin: 0 auto; }
      h1, h2 { color: #333; }
      table { background: white; border-collapse: collapse; width: 100%; margin-bottom: 30px; }
      th { background: #007bff; color: white; }
      td, th { padding: 8px; text-align: center; }
      .info { background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>🔴 Trạng thái dự đoán Tài Xỉu (Auto refresh mỗi 5s)</h1>
      <div class="info">
        <p>📦 Số phiên thu thập: TX = <b>${txHistory.length}</b>, TXMD5 = <b>${txmd5History.length}</b></p>
        <p>🕒 Thời gian hiện tại: ${new Date().toLocaleString('vi-VN')}</p>
        <p><a href="/">🏠 Về trang chủ</a> | <a href="/api/dudoan/tx">🔮 Dự đoán TX</a> | <a href="/api/dudoan/txmd5">🔮 Dự đoán TXMD5</a></p>
      </div>
      ${renderPredictionTable(txPredictions, 'TX')}
      ${renderPredictionTable(txmd5Predictions, 'TXMD5')}
    </div>
  </body>
  </html>
  `;
  res.send(html);
});
app.listen(PORT, () => {
  console.log(`🚀 Server VIP đang chạy tại http://localhost:${PORT}`);
  console.log(`⏳ Bắt đầu crawl dữ liệu mỗi ${FETCH_INTERVAL/1000}s...`);
  crawlAll();
  setInterval(crawlAll, FETCH_INTERVAL);
});