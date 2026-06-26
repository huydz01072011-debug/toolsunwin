// =============================================
//  Sun.Win Tài Xỉu Data Stream - FULL CODE Node.js
//  Tác giả: HuyDaiXuVN
//  Phiên bản: Final (đã sửa lỗi template literal)
// =============================================

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// --------------- TOKEN GỘP CỨNG ---------------
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

// --------------- WEBSOCKET CONFIG ---------------
const WS_URL = `wss://websocket.azhkthg1.net/websocket?token=${TOKEN_DATA.wsToken}`;
const WS_OPTIONS = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://play.sun.pw'
    }
};

const initialMessages = [
    [
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
    ],
    [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
    [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
];

// --------------- BIẾN TOÀN CỤC ---------------
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
const history = [];
const pendingPredictions = [];
const checkedPredictions = [];

// --------------- THUẬT TOÁN AI (ĐẦY ĐỦ) ---------------
class TX_LogicPen_AI_V5 {
    constructor() {
        this.error_streak = 0;
        this.last_prediction = null;
        this.history = [];
        this.last_pattern = null;
        this.patternMemory = {};
        this.memorySize = 50;
        this.recentPatterns = [];
    }

    loadData(data) {
        this.history = [...data].sort((a, b) => (b.phien || 0) - (a.phien || 0));
    }

    _arr() {
        return this.history.map(s =>
            (s.ket_qua || '').toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI')
        );
    }

    _points() {
        return this.history
            .filter(s => s.tong !== undefined && s.tong !== null)
            .map(s => s.tong);
    }

    cauSap(arr) {
        if (arr.length < 2) return null;
        let length = 1;
        for (let i = 1; i < arr.length; i++) {
            if (arr[i] === arr[0]) length++;
            else break;
        }
        if (length >= 2 && length <= 5) {
            return { pred: arr[0], conf: 72, type: "Đu Bệt", reason: `Bệt ${length} phiên` };
        }
        if (length >= 6) {
            return { pred: arr[0] === "TAI" ? "XIU" : "TAI", conf: 80, type: "Bẻ Bệt Rồng", reason: `Bệt dài ${length} → hồi` };
        }
        return null;
    }

    cauNoi(arr) {
        if (arr.length < 5) return null;
        for (let i = 0; i < 4; i++) {
            if (arr[i] === arr[i + 1]) return null;
        }
        return { pred: arr[0] === "TAI" ? "XIU" : "TAI", conf: 82, type: "Cầu Nối 1-1", reason: "Nhịp 1-1 ổn định" };
    }

    cauDoi(arr) {
        if (arr.length < 4) return null;
        if (arr[0] === arr[1] && arr[2] === arr[3] && arr[0] !== arr[2]) {
            return { pred: arr[2], conf: 78, type: "Cầu 2-2", reason: "AABB → B" };
        }
        if (arr.length >= 6 && arr[0] === arr[1] && arr[1] === arr[2] &&
            arr[3] === arr[4] && arr[4] === arr[5] && arr[0] !== arr[3]) {
            return { pred: arr[3], conf: 80, type: "Cầu 3-3", reason: "AAABBB → B" };
        }
        return null;
    }

    cauGay(arr) {
        if (arr.length >= 5 && arr[0] === arr[1] && arr[1] === arr[2] && arr[2] !== arr[3] && arr[3] === arr[4]) {
            return { pred: arr[3], conf: 74, type: "Gãy 3-2", reason: "AAABB → B" };
        }
        if (arr.length >= 5 && arr[0] === arr[1] && arr[1] !== arr[2] && arr[2] === arr[3] && arr[3] === arr[4]) {
            return { pred: arr[2], conf: 74, type: "Gãy 2-3", reason: "AABBB → B" };
        }
        if (arr.length >= 4 && arr[0] !== arr[1] && arr[1] === arr[2] && arr[2] !== arr[3] && arr[0] === arr[3]) {
            return { pred: arr[1], conf: 72, type: "Gãy 1-2-1", reason: "ABBA → B" };
        }
        return null;
    }

    phatHienMauLap(arr) {
        if (arr.length < 6) return null;
        for (let len = 2; len <= 4; len++) {
            let pattern = arr.slice(0, len);
            for (let i = len; i < arr.length - len; i++) {
                let sub = arr.slice(i, i + len);
                if (JSON.stringify(sub) === JSON.stringify(pattern) && arr[i - 1]) {
                    return { pred: arr[i - 1], conf: 88, type: "Mẫu Lặp", reason: `Mẫu "${pattern.join(',')}"` };
                }
            }
        }
        return null;
    }

    duDoanVi() {
        const points = this._points();
        if (points.length < 5) return null;
        const last = points[0], prev = points[1];
        const slice = points.slice(0, 5);
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length;

        if (last >= 15) return { pred: "XIU", conf: 75, type: "Vị cực đại", reason: `Điểm ${last} → hồi Xỉu` };
        if (last <= 5) return { pred: "TAI", conf: 75, type: "Vị cực tiểu", reason: `Điểm ${last} → hồi Tài` };
        if (avg > 11 && last > prev) return { pred: "XIU", conf: 68, type: "Vị bão hòa", reason: "Đà tăng chạm ngưỡng" };
        if (avg < 10 && last < prev) return { pred: "TAI", conf: 68, type: "Vị cạn kiệt", reason: "Đà giảm chạm đáy" };
        if (avg >= 11 && last >= 11 && last <= 13) return { pred: "TAI", conf: 65, type: "Vị ổn định", reason: "Duy trì Tài nhẹ" };
        if (avg <= 9 && last >= 7 && last <= 9) return { pred: "XIU", conf: 65, type: "Vị ổn định", reason: "Duy trì Xỉu nhẹ" };
        return null;
    }

    tongHopDuDoan() {
        const arr = this._arr();
        if (arr.length < 2) return null;
        const result = this.phatHienMauLap(arr) || this.cauNoi(arr) || this.cauDoi(arr) ||
               this.cauGay(arr) || this.cauSap(arr) || this.duDoanVi() ||
               { pred: arr[0], conf: 55, type: "Theo", reason: "Bám phiên cuối" };
        if (result) this.last_pattern = result.type;
        return result;
    }

    aiDaoChieu(p) {
        if (!p || !this.last_pattern) return p;
        const mem = this.patternMemory[this.last_pattern];
        if (!mem || mem.total === 0) return p;
        const failRate = mem.fail / mem.total;
        const successRate = mem.success / mem.total;
        if (failRate > 0.6) {
            return {
                ...p,
                pred: p.pred === "TAI" ? "XIU" : "TAI",
                conf: Math.min(90, p.conf + 15),
                reason: `🤖 AI đảo (${this.last_pattern} thất bại ${(failRate*100).toFixed(0)}%)`
            };
        }
        if (successRate > 0.85) {
            return {
                ...p,
                conf: Math.min(95, p.conf + 10),
                reason: `🤖 AI tăng cường (${this.last_pattern} thành công ${(successRate*100).toFixed(0)}%)`
            };
        }
        return p;
    }

    learnFromResult(actual, predicted, pattern) {
        if (!pattern) return;
        if (!this.patternMemory[pattern]) {
            this.patternMemory[pattern] = { success: 0, fail: 0, total: 0 };
        }
        const a = actual.toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI');
        const p = predicted.toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI');
        const correct = (a === p);
        if (correct) this.patternMemory[pattern].success++;
        else this.patternMemory[pattern].fail++;
        this.patternMemory[pattern].total++;

        this.recentPatterns.push(pattern);
        if (this.recentPatterns.length > this.memorySize) {
            const removed = this.recentPatterns.shift();
            const mem = this.patternMemory[removed];
            if (mem && mem.total > 0) {
                mem.total = Math.max(0, mem.total - 1);
                mem.success = Math.max(0, mem.success - 1);
                mem.fail = Math.max(0, mem.fail - (correct ? 0 : 1));
            }
        }
    }

    predict(data) {
        this.loadData(data);
        let result = this.tongHopDuDoan();
        if (!result) result = { pred: "TAI", conf: 50, type: "Theo", reason: "Không đủ dữ liệu" };
        else result = this.aiDaoChieu(result);
        this.last_prediction = result.pred;
        return result;
    }

    updateStatus(actual) {
        if (this.last_prediction) {
            const a = actual.toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI');
            if (this.last_prediction === a) this.error_streak = 0;
            else this.error_streak++;
        }
    }
}

const predictor = new TX_LogicPen_AI_V5();

// --------------- HÀM TIỆN ÍCH ---------------
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
    history.push({ ...result });
    if (history.length > MAX_HISTORY) history.shift();
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

    const minPhien = phien - 10;
    for (let i = pendingPredictions.length - 1; i >= 0; i--) {
        if (pendingPredictions[i].phien < minPhien) pendingPredictions.splice(i, 1);
    }
}

// --------------- WEBSOCKET CLIENT ---------------
function connectWebSocket() {
    console.log("[🔄] Đang kết nối WebSocket...");
    const ws = new WebSocket(WS_URL, WS_OPTIONS);

    ws.on('open', () => {
        console.log("[✅] WebSocket đã kết nối tới Sun.Win");
        let delay = 0;
        initialMessages.forEach(msg => {
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
            }, delay);
            delay += 600;
        });
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
            console.error(`[❌] Lỗi xử lý message: ${e.message}`);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[❌] WebSocket đóng. Mã: ${code}. Tự động kết nối lại sau 2.5s...`);
        setTimeout(connectWebSocket, 2500);
    });

    ws.on('error', (err) => {
        console.error(`[❌] Lỗi WebSocket: ${err.message}`);
        ws.close();
    });
}

function keepAlive() {
    setInterval(() => {
        http.get(`${SELF_URL}/api/tx`, (res) => console.log(`[💓] Keep-alive: ${res.statusCode}`))
           .on('error', (e) => console.error(`[💓] Lỗi keep-alive: ${e.message}`));
    }, 60000);
}

// --------------- ROUTES ---------------
app.get('/', (req, res) => {
    res.json({ app: "Sun.Win Tài Xỉu Data Stream (VIP)", version: "3.0", author: "HuyDaiXuVN" });
});

app.get('/api/tx', (req, res) => res.json(currentResult));

app.get('/api/history', (req, res) => {
    const reversed = [...history].reverse();
    res.json({ total: reversed.length, history: reversed });
});

app.get('/api/dudoan', (req, res) => {
    if (history.length < 5) {
        return res.json({ error: "Chưa đủ dữ liệu (cần ít nhất 5 phiên)", current_count: history.length });
    }
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
        loai_cau: prediction.type,
        ai_memory: predictor.patternMemory
    });
});

app.get('/api/check', (req, res) => {
    const checkHtmlPath = path.join(__dirname, 'check.html');
    if (!fs.existsSync(checkHtmlPath)) {
        const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sun.Win - Kiểm tra Dự đoán</title>
    <style>
        body { font-family: Arial, sans-serif; background: #1a1a2e; color: #eee; margin: 20px; }
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
        <span>Tỉ lệ đúng: <b id="accuracy">0%</b></span>
    </div>
    <table>
        <thead><tr><th>Phiên</th><th>Dự đoán</th><th>Thực tế</th><th>Kết quả</th><th>Độ tin cậy</th><th>Loại cầu</th><th>Thời gian</th></tr></thead>
        <tbody id="tbody"></tbody>
    </table>

    <script>
        async function fetchData() {
            try {
                const res = await fetch('/api/check/data');
                const data = await res.json();
                document.getElementById('total').textContent = data.summary.total;
                document.getElementById('correct').textContent = data.summary.correct;
                document.getElementById('wrong').textContent = data.summary.wrong;
                document.getElementById('accuracy').textContent = (data.summary.total > 0 ? (data.summary.correct / data.summary.total * 100).toFixed(1) : 0) + '%';

                const tbody = document.getElementById('tbody');
                tbody.innerHTML = '';
                const history = [...data.recentHistory].reverse();
                history.forEach(item => {
                    const row = document.createElement('tr');
                    row.innerHTML = 
                        '<td>' + (item.phien || '') + '</td>' +
                        '<td>' + (item.prediction || '') + '</td>' +
                        '<td>' + (item.actual || '') + '</td>' +
                        '<td class="' + (item.correct ? 'correct' : 'wrong') + '">' + (item.correct ? '✅ Đúng' : '❌ Sai') + '</td>' +
                        '<td>' + (item.conf || '') + '%</td>' +
                        '<td>' + (item.type || '') + '</td>' +
                        '<td>' + (item.timestamp || '') + '</td>';
                    tbody.appendChild(row);
                });
            } catch (e) {
                console.error('Lỗi fetch:', e);
            }
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

// --------------- KHỞI ĐỘNG ---------------
connectWebSocket();
app.listen(PORT, () => console.log(`[🚀] Server sẵn sàng tại http://localhost:${PORT}`));
keepAlive();