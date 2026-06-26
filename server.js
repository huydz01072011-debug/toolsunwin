// =============================================
//  Sun.Win Tài Xỉu Stream - Node.js FINAL VIP
//  Tác giả: HuyDaiXuVN
//  Chức năng: Chống mất phiên, ping/pong 10s,
//  Auto resubscribe, AI tự học.
// =============================================

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==================== TOKEN GỘP CỨNG ====================
const TOKEN_DATA = {
    ipAddress: "1.55.124.245",
    wsToken: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0",
    locale: "vi",
    userId: "a28a0f06-e88f-44b7-a268-5f6dad949fbf",
    username: "GM_quapotjz",
    timestamp: 1780029354479,
    refreshToken: "26b930ec6dc04d7db5c2b362a1baac87.7549ba6185d4467380ee447589380061",
    signature: "05915B436159B8F4E4DFF537639BD014D54EBEFA18CF62A8EB205B4074010AD72AEA9A780D5A8A4E1BD59BBBAFE03902C594B5DA56FD60D099F1FDDCCD48385FCC2760B5B0B4B8E75D39B8E40DF8CB7C01EA58DBEDA32805927473AB71FA9B798B0C2EDC445C3E36E47EF0AAFAD45601D99AAD1EC642FD2B63573A0401D6EC69"
};

// ==================== WEBSOCKET CONFIG ====================
const WS_URL = `wss://websocket.azhkthg1.net/websocket?token=${TOKEN_DATA.wsToken}`;
const WS_OPTIONS = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://play.sun.pw'
    }
};

// Tin nhắn khởi tạo và subscription
const initAuth = [
    1,
    "MiniGame",
    TOKEN_DATA.username,
    "quapit",
    {
        signature: TOKEN_DATA.signature,
        expireIn: TOKEN_DATA.timestamp,
        wsToken: TOKEN_DATA.wsToken,
        accessToken: "7e9a9ecbff1b4a6393b48346f6d8b709",
        message: "Thành công",
        refreshToken: TOKEN_DATA.refreshToken,
        info: TOKEN_DATA
    }
];

const subTx = [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }];
const subLobby = [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }];

// ==================== BIẾN TOÀN CỤC ====================
const app = express();
app.use(cors());
const PORT = process.env.PORT || 1234;
const SELF_URL = process.env.SELF_URL || `http://localhost:${PORT}`;

let currentResult = {
    phien: null,
    xuc_xac_1: null,
    xuc_xac_2: null,
    xuc_xac_3: null,
    tong: null,
    ket_qua: "",
    thoi_gian: ""
};

let currentSessionId = null;
const MAX_HISTORY = 1000000;
const history = [];               // Lưu tất cả phiên (tăng dần)
const pendingPredictions = [];
const checkedPredictions = [];

// ==================== THUẬT TOÁN AI (GIỮ NGUYÊN) ====================
class TX_LogicPen_AI_V5 {
    // ... (toàn bộ code class AI từ các phiên bản trước, không thay đổi)
    // Để tiết kiệm không gian, tôi không chép lại ở đây, bạn vui lòng copy nguyên phần class AI từ các code trước vào đây.
    // (Nhớ copy đầy đủ: constructor, loadData, _arr, _points, cauSap, cauNoi, cauDoi, cauGay, phatHienMauLap, duDoanVi, tongHopDuDoan, aiDaoChieu, learnFromResult, predict, updateStatus)
}
const predictor = new TX_LogicPen_AI_V5();

// ==================== HÀM TIỆN ÍCH ====================
function getVietnamTime() {
    const now = new Date();
    const utc7 = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const dd = String(utc7.getUTCDate()).padStart(2, '0');
    const mm = String(utc7.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = utc7.getUTCFullYear();
    const hh = String(utc7.getUTCHours()).padStart(2, '0');
    const min = String(utc7.getUTCMinutes()).padStart(2, '0');
    const ss = String(utc7.getUTCSeconds()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss} UTC+7`;
}

function addToHistory(result) {
    // Chỉ thêm nếu chưa tồn tại
    if (!history.find(h => h.phien === result.phien)) {
        history.push({ ...result });
        if (history.length > MAX_HISTORY) history.shift();
    }
}

function checkPendingPredictions(newResult) {
    const phien = newResult.phien;
    const actual = newResult.ket_qua;
    if (!phien || !actual) return;

    for (let i = pendingPredictions.length - 1; i >= 0; i--) {
        const p = pendingPredictions[i];
        if (p.phien === phien) {
            const correct = p.prediction === actual;
            predictor.updateStatus(actual);
            predictor.learnFromResult(actual, p.prediction, p.type);

            checkedPredictions.push({
                phien, prediction: p.prediction, actual,
                correct, conf: p.conf, type: p.type,
                timestamp: getVietnamTime()
            });
            if (checkedPredictions.length > 1000) checkedPredictions.shift();
            pendingPredictions.splice(i, 1);
            break;
        }
    }
    // Dọn rác
    const minPhien = phien - 10;
    for (let i = pendingPredictions.length - 1; i >= 0; i--) {
        if (pendingPredictions[i].phien < minPhien) pendingPredictions.splice(i, 1);
    }
}

// ==================== WEBSOCKET CLIENT (CHỐNG MẤT PHIÊN) ====================
let ws = null;
let pingInterval = null;
let resubInterval = null;

function sendJson(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

function startKeepAlive() {
    // Gửi ping mỗi 10 giây
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.ping(); // gửi ping frame
        }
    }, 10000);

    // Gửi lại subscription mỗi 30 giây để đảm bảo không mất stream
    if (resubInterval) clearInterval(resubInterval);
    resubInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            sendJson(subTx);
            sendJson(subLobby);
            console.log("[🔄] Resubscribe để giữ stream");
        }
    }, 30000);
}

function stopKeepAlive() {
    if (pingInterval) clearInterval(pingInterval);
    if (resubInterval) clearInterval(resubInterval);
}

function connectWebSocket() {
    stopKeepAlive();
    console.log("[🔄] Đang kết nối WebSocket...");
    ws = new WebSocket(WS_URL, WS_OPTIONS);

    ws.on('open', () => {
        console.log("[✅] WebSocket đã kết nối");
        // Gửi auth
        sendJson(initAuth);
        // Sau 1s gửi subscription
        setTimeout(() => {
            sendJson(subTx);
            sendJson(subLobby);
        }, 1000);
        // Bắt đầu keep-alive
        startKeepAlive();
    });

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (!Array.isArray(msg) || msg.length < 2) return;
            const payload = msg[1];
            if (typeof payload !== 'object' || payload === null) return;

            const { cmd, sid, d1, d2, d3, gBB } = payload;

            if (cmd === 1008 && sid) {
                currentSessionId = sid;
                console.log(`[🎮] Phiên mới: ${sid}`);
            }

            if (cmd === 1003 && gBB) {
                if (d1 == null || d2 == null || d3 == null) return;
                const total = d1 + d2 + d3;
                const result = total > 10 ? "Tài" : "Xỉu";

                const newResult = {
                    phien: currentSessionId,
                    xuc_xac_1: d1,
                    xuc_xac_2: d2,
                    xuc_xac_3: d3,
                    tong: total,
                    ket_qua: result,
                    thoi_gian: getVietnamTime()
                };

                currentResult = newResult;
                addToHistory(newResult);
                console.log(`[🎲] #${newResult.phien}: ${d1}-${d2}-${d3} = ${total} (${result})`);
                checkPendingPredictions(newResult);
                currentSessionId = null;
            }
        } catch (e) {
            console.error(`[❌] Lỗi message: ${e.message}`);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[❌] WebSocket đóng. Mã: ${code}. Tự động kết nối lại sau 2s...`);
        stopKeepAlive();
        setTimeout(connectWebSocket, 2000);
    });

    ws.on('error', (err) => {
        console.error(`[❌] Lỗi WebSocket: ${err.message}`);
        ws.close(); // sẽ trigger on close
    });
}

// Auto ping HTTP (giữ Render không ngủ)
function keepAliveHttp() {
    setInterval(() => {
        http.get(`${SELF_URL}/api/tx`, (res) => console.log(`[💓] Keep-alive HTTP: ${res.statusCode}`))
           .on('error', (e) => console.error(`[💓] Lỗi HTTP: ${e.message}`));
    }, 60000);
}

// ==================== ROUTES ====================
app.get('/', (req, res) => res.json({ app: "Sun.Win TX Stream FINAL", version: "4.0", author: "HuyDaiXuVN" }));

app.get('/api/tx', (req, res) => res.json(currentResult));

app.get('/api/history', (req, res) => {
    const reversed = [...history].reverse();
    res.json({ total: reversed.length, history: reversed });
});

app.get('/api/dudoan', (req, res) => {
    if (history.length < 5) return res.json({ error: "Cần ít nhất 5 phiên", current_count: history.length });
    const prediction = predictor.predict(history);
    const latest = history[history.length - 1];
    const nextPhien = (latest.phien || 0) + 1;

    pendingPredictions.push({
        phien: nextPhien,
        prediction: prediction.pred,
        conf: prediction.conf,
        type: prediction.type,
        timestamp: getVietnamTime()
    });
    if (pendingPredictions.length > 50) pendingPredictions.shift();

    res.json({
        phien_hien_tai: latest.phien,
        phien_tiep_theo: nextPhien,
        du_doan: prediction.pred,
        ly_do: prediction.reason,
        do_tin_cay: prediction.conf,
        loai_cau: prediction.type
    });
});

app.get('/api/check', (req, res) => {
    // Tạo file HTML nếu chưa có (giữ nguyên giao diện cũ)
    const checkHtmlPath = path.join(__dirname, 'check.html');
    if (!fs.existsSync(checkHtmlPath)) {
        const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kiểm tra Dự đoán</title>
    <style>
        body { font-family: Arial; background: #1a1a2e; color: #eee; margin: 20px; }
        h1 { color: #ffd700; text-align: center; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #16213e; }
        th, td { padding: 10px; text-align: center; border: 1px solid #0f3460; }
        th { background: #0f3460; color: #ffd700; }
        .correct { color: #4caf50; font-weight: bold; }
        .wrong { color: #f44336; font-weight: bold; }
    </style>
</head>
<body>
    <h1>🎲 Lịch sử Dự đoán (Real-time)</h1>
    <div id="stats" style="display: flex; justify-content: space-around; background: #0f3460; padding: 15px;">
        <span>Tổng: <b id="total">0</b></span>
        <span>Đúng: <b id="correct" class="correct">0</b></span>
        <span>Sai: <b id="wrong" class="wrong">0</b></span>
        <span>Tỉ lệ: <b id="accuracy">0%</b></span>
    </div>
    <table>
        <thead><tr><th>Phiên</th><th>Dự đoán</th><th>Thực tế</th><th>Kết quả</th><th>Độ tin cậy</th><th>Loại cầu</th><th>Thời gian</th></tr></thead>
        <tbody id="tbody"></tbody>
    </table>
    <script>
        async function fetchData() {
            const res = await fetch('/api/check/data');
            const data = await res.json();
            document.getElementById('total').textContent = data.summary.total;
            document.getElementById('correct').textContent = data.summary.correct;
            document.getElementById('wrong').textContent = data.summary.wrong;
            document.getElementById('accuracy').textContent = (data.summary.total > 0 ? (data.summary.correct / data.summary.total * 100).toFixed(1) : 0) + '%';
            const tbody = document.getElementById('tbody');
            tbody.innerHTML = '';
            [...data.recentHistory].reverse().forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = 
                    '<td>' + (item.phien||'') + '</td>' +
                    '<td>' + (item.prediction||'') + '</td>' +
                    '<td>' + (item.actual||'') + '</td>' +
                    '<td class="' + (item.correct?'correct':'wrong') + '">' + (item.correct?'✅ Đúng':'❌ Sai') + '</td>' +
                    '<td>' + (item.conf||'') + '%</td>' +
                    '<td>' + (item.type||'') + '</td>' +
                    '<td>' + (item.timestamp||'') + '</td>';
                tbody.appendChild(row);
            });
        }
        fetchData();
        setInterval(fetchData, 2000);
    </script>
</body>
</html>`;
        fs.writeFileSync(checkHtmlPath, htmlContent, 'utf8');
    }
    res.sendFile(checkHtmlPath);
});

app.get('/api/check/data', (req, res) => {
    res.json({
        recentHistory: checkedPredictions,
        summary: {
            total: checkedPredictions.length,
            correct: checkedPredictions.filter(x => x.correct).length,
            wrong: checkedPredictions.filter(x => !x.correct).length
        }
    });
});

app.use((req, res) => res.status(404).json({ error: "Endpoint không tồn tại" }));

// ==================== KHỞI ĐỘNG ====================
connectWebSocket();
app.listen(PORT, () => console.log(`[🚀] Server sẵn sàng tại http://localhost:${PORT}`));
keepAliveHttp();