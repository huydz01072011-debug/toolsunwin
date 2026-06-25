// =============================================
//  Sun.Win Tài Xỉu Data Stream - VIP Node.js
//  Tác giả: HuyDaiXuVN
//  Full: Token gộp, Auto ping, WebSocket, History,
//        Dự đoán LogicPen V4 (100% nguyên bản),
//        Check real-time + Thống kê chi tiết
// =============================================

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');

// --------------- TOKEN GỘP TRỰC TIẾP ---------------
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

// WebSocket endpoint & headers
const WS_URL = `wss://websocket.azhkthg1.net/websocket?token=${TOKEN_DATA.wsToken}`;
const WS_OPTIONS = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://play.sun.pw'
    }
};

// Tin nhắn khởi tạo (đã gộp TOKEN_DATA)
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
const history = [];                     // Mảng lưu các phiên (thứ tự thời gian tăng dần)

// --------------- LỚP DỰ ĐOÁN (NGUYÊN BẢN 100%) ---------------
class TX_LogicPen_V4 {
    constructor() {
        this.error_streak = 0;
        this.last_prediction = null;
        this.history = [];
        this.last_pattern = null;
    }

    loadData(data) {
        // Sắp xếp giảm dần theo phien (mới nhất đầu)
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
        
        if (result) {
            this.last_pattern = result.type;
        }
        return result;
    }

    apDungDaoChieu(p) {
        if (!p || this.history.length < 1) return p;
        const currentResult = this._arr()[0];
        if (this.error_streak >= 2 && this.last_prediction && this.last_prediction !== currentResult) {
            return {
                ...p,
                pred: p.pred === "TAI" ? "XIU" : "TAI",
                conf: Math.min(88, p.conf + 10),
                reason: `🔄 Đảo: ${p.reason}`
            };
        }
        return p;
    }

    predict(data) {
        this.loadData(data);
        let result = this.tongHopDuDoan();
        if (result) result = this.apDungDaoChieu(result);
        else result = { pred: this._arr()[0] || "TAI", conf: 50, type: "Theo", reason: "Không đủ dữ liệu" };
        
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

// --------------- HỆ THỐNG THỐNG KÊ CHI TIẾT ---------------
let detailedStats = {
    byPattern: {
        'Đu Bệt': { total: 0, correct: 0, wrong: 0 },
        'Bẻ Bệt Rồng': { total: 0, correct: 0, wrong: 0 },
        'Cầu Nối 1-1': { total: 0, correct: 0, wrong: 0 },
        'Cầu 2-2': { total: 0, correct: 0, wrong: 0 },
        'Cầu 3-3': { total: 0, correct: 0, wrong: 0 },
        'Gãy 3-2': { total: 0, correct: 0, wrong: 0 },
        'Gãy 2-3': { total: 0, correct: 0, wrong: 0 },
        'Gãy 1-2-1': { total: 0, correct: 0, wrong: 0 },
        'Mẫu Lặp': { total: 0, correct: 0, wrong: 0 },
        'Vị cực đại': { total: 0, correct: 0, wrong: 0 },
        'Vị cực tiểu': { total: 0, correct: 0, wrong: 0 },
        'Vị bão hòa': { total: 0, correct: 0, wrong: 0 },
        'Vị cạn kiệt': { total: 0, correct: 0, wrong: 0 },
        'Vị ổn định': { total: 0, correct: 0, wrong: 0 },
        'Theo': { total: 0, correct: 0, wrong: 0 }
    },
    byConfidence: {
        '0-50': { total: 0, correct: 0, wrong: 0 },
        '51-60': { total: 0, correct: 0, wrong: 0 },
        '61-70': { total: 0, correct: 0, wrong: 0 },
        '71-80': { total: 0, correct: 0, wrong: 0 },
        '81-90': { total: 0, correct: 0, wrong: 0 },
        '91-100': { total: 0, correct: 0, wrong: 0 }
    },
    byPrediction: {
        'TAI': { total: 0, correct: 0, wrong: 0 },
        'XIU': { total: 0, correct: 0, wrong: 0 }
    },
    recentHistory: [],   // 1000 phần tử gần nhất
    summary: {
        totalPredictions: 0,
        totalCorrect: 0,
        totalWrong: 0,
        accuracy: 0,
        bestStreak: 0,
        worstStreak: 0,
        currentStreak: 0,
        lastUpdated: null
    }
};

let stats = {
    total: 0, correct: 0, wrong: 0,
    current_streak: 0,
    best_streak: 0,
    worst_streak: 0
};

function updateDetailedStats(prediction, actual, pattern, confidence, correct) {
    if (pattern && detailedStats.byPattern[pattern]) {
        detailedStats.byPattern[pattern].total++;
        if (correct) detailedStats.byPattern[pattern].correct++;
        else detailedStats.byPattern[pattern].wrong++;
    }

    let confRange = '0-50';
    if (confidence > 50 && confidence <= 60) confRange = '51-60';
    else if (confidence > 60 && confidence <= 70) confRange = '61-70';
    else if (confidence > 70 && confidence <= 80) confRange = '71-80';
    else if (confidence > 80 && confidence <= 90) confRange = '81-90';
    else if (confidence > 90) confRange = '91-100';
    
    if (detailedStats.byConfidence[confRange]) {
        detailedStats.byConfidence[confRange].total++;
        if (correct) detailedStats.byConfidence[confRange].correct++;
        else detailedStats.byConfidence[confRange].wrong++;
    }

    const predKey = prediction.toUpperCase();
    if (detailedStats.byPrediction[predKey]) {
        detailedStats.byPrediction[predKey].total++;
        if (correct) detailedStats.byPrediction[predKey].correct++;
        else detailedStats.byPrediction[predKey].wrong++;
    }

    detailedStats.recentHistory.push({
        phien: pendingCheck?.phien || 0,
        prediction: prediction,
        actual: actual,
        pattern: pattern,
        confidence: confidence,
        correct: correct,
        timestamp: getVietnamTime()
    });
    
    if (detailedStats.recentHistory.length > 1000) {
        detailedStats.recentHistory = detailedStats.recentHistory.slice(-1000);
    }

    // Cập nhật summary
    detailedStats.summary.totalPredictions = stats.total;
    detailedStats.summary.totalCorrect = stats.correct;
    detailedStats.summary.totalWrong = stats.wrong;
    detailedStats.summary.accuracy = stats.total > 0 ? (stats.correct / stats.total * 100) : 0;
    detailedStats.summary.bestStreak = stats.best_streak;
    detailedStats.summary.worstStreak = stats.worst_streak;
    detailedStats.summary.currentStreak = stats.current_streak;
    detailedStats.summary.lastUpdated = getVietnamTime();
}

// Instance toàn cục của predictor (giữ trạng thái error_streak)
const predictor = new TX_LogicPen_V4();

// Lưu các dự đoán đang chờ
const pendingPredictions = [];

// Biến tạm để truyền dữ liệu cho updateDetailedStats
let pendingCheck = null;

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

// Kiểm tra pending predictions khi có kết quả mới
function checkPendingPredictions(newResult) {
    const phien = newResult.phien;
    const actual = newResult.ket_qua;
    if (!phien || !actual) return;

    for (let i = pendingPredictions.length - 1; i >= 0; i--) {
        const p = pendingPredictions[i];
        if (p.phien === phien) {
            const correct = p.prediction === actual;
            // Cập nhật trạng thái error_streak cho predictor
            predictor.updateStatus(actual);

            // Cập nhật thống kê
            stats.total++;
            if (correct) {
                stats.correct++;
                stats.current_streak++;
                if (stats.current_streak > stats.best_streak) stats.best_streak = stats.current_streak;
            } else {
                stats.wrong++;
                stats.current_streak = 0;
                // Tính worst streak
                let wrongStreak = 0;
                for (let j = detailedStats.recentHistory.length - 1; j >= 0; j--) {
                    if (!detailedStats.recentHistory[j].correct) wrongStreak++;
                    else break;
                }
                if (wrongStreak > stats.worst_streak) stats.worst_streak = wrongStreak;
            }

            // Lưu vào recentHistory và cập nhật detailedStats
            pendingCheck = { phien: phien };
            updateDetailedStats(p.prediction, actual, p.type, p.conf, correct);
            pendingCheck = null;

            // Xóa khỏi pending
            pendingPredictions.splice(i, 1);
            break;
        }
    }

    // Dọn dẹp pending quá cũ
    const minPhien = phien - 10;
    for (let i = pendingPredictions.length - 1; i >= 0; i--) {
        if (pendingPredictions[i].phien < minPhien) {
            pendingPredictions.splice(i, 1);
        }
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

                // Kiểm tra pending predictions
                checkPendingPredictions(newResult);

                currentSessionId = null;
            }
        } catch (e) {
            console.error(`[❌] Lỗi xử lý message: ${e.message}`);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[❌] WebSocket đóng. Mã: ${code}, Lý do: ${reason}`);
        setTimeout(connectWebSocket, 2500);
    });

    ws.on('error', (err) => {
        console.error(`[❌] Lỗi WebSocket: ${err.message}`);
        ws.close();
    });
}

// --------------- AUTO PING ---------------
function keepAlive() {
    setInterval(() => {
        http.get(`${SELF_URL}/api/tx`, (res) => {
            console.log(`[💓] Keep-alive: ${res.statusCode}`);
        }).on('error', (e) => {
            console.error(`[💓] Lỗi keep-alive: ${e.message}`);
        });
    }, 60000);
}

// ==================== EXPRESS ROUTES ====================
app.get('/', (req, res) => {
    res.json({
        app: "Sun.Win Tài Xỉu Data Stream (VIP)",
        version: "2.0.0",
        author: "HuyDaiXuVN",
        endpoints: {
            "/api/tx": "Kết quả mới nhất",
            "/api/history": "Lịch sử 1.000.000 phiên (mới nhất đầu)",
            "/api/dudoan": "Dự đoán phiên tiếp theo (LogicPen V4 100%)",
            "/api/check": "Giao diện real-time kiểm tra & thống kê chi tiết",
            "/api/check/data": "Dữ liệu JSON cho giao diện check"
        },
        thoi_gian: getVietnamTime(),
        user: TOKEN_DATA.username
    });
});

app.get('/api/tx', (req, res) => {
    res.json(currentResult);
});

app.get('/api/history', (req, res) => {
    const reversed = [...history].reverse();
    res.json({
        total: reversed.length,
        history: reversed
    });
});

app.get('/api/dudoan', (req, res) => {
    if (history.length < 5) {
        return res.json({
            error: "Chưa đủ dữ liệu (cần ít nhất 5 phiên)",
            current_count: history.length
        });
    }

    const prediction = predictor.predict(history);  // predictor toàn cục, giữ error_streak

    const latest = history[history.length - 1];
    const nextPhien = (latest.phien || 0) + 1;

    // Lưu pending
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

// Giao diện kiểm tra real-time (HTML nâng cao)
app.get('/api/check', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sun.Win - Kiểm tra Dự đoán</title>
    <style>
        body { font-family: Arial, sans-serif; background: #1a1a2e; color: #eee; margin: 20px; }
        h1, h2 { color: #ffd700; text-align: center; }
        .container { max-width: 1200px; margin: auto; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; background: #16213e; box-shadow: 0 0 10px rgba(0,0,0,0.5); }
        th, td { padding: 10px; text-align: center; border: 1px solid #0f3460; }
        th { background: #0f3460; color: #ffd700; }
        .correct { color: #4caf50; font-weight: bold; }
        .wrong { color: #f44336; font-weight: bold; }
        .stats-box { display: flex; justify-content: space-around; background: #0f3460; padding: 15px; border-radius: 10px; margin-bottom: 20px; }
        .tabs { display: flex; justify-content: center; margin: 10px 0; }
        .tab { padding: 10px 20px; cursor: pointer; background: #0f3460; border: none; color: white; margin: 0 5px; border-radius: 5px; }
        .tab.active { background: #ffd700; color: black; font-weight: bold; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎲 Lịch sử Dự đoán & Thống kê (Real-time)</h1>
        <div class="stats-box" id="summaryStats">
            <span>Tổng: <b id="total">0</b></span>
            <span>Đúng: <b id="correct" class="correct">0</b></span>
            <span>Sai: <b id="wrong" class="wrong">0</b></span>
            <span>Tỉ lệ đúng: <b id="accuracy">0%</b></span>
            <span>Streak hiện tại: <b id="curStreak">0</b></span>
            <span>Streak tốt nhất: <b id="bestStreak">0</b></span>
        </div>

        <div class="tabs">
            <button class="tab active" onclick="showTab('history')">Lịch sử dự đoán</button>
            <button class="tab" onclick="showTab('patterns')">Theo loại cầu</button>
            <button class="tab" onclick="showTab('confidence')">Theo độ tin cậy</button>
            <button class="tab" onclick="showTab('prediction')">Theo kết quả dự đoán</button>
        </div>

        <div id="historyTab" class="tab-content active">
            <table>
                <thead>
                    <tr>
                        <th>Phiên</th>
                        <th>Dự đoán</th>
                        <th>Thực tế</th>
                        <th>Đúng/Sai</th>
                        <th>Độ tin cậy</th>
                        <th>Loại cầu</th>
                        <th>Thời gian</th>
                    </tr>
                </thead>
                <tbody id="historyBody"></tbody>
            </table>
        </div>

        <div id="patternsTab" class="tab-content">
            <table>
                <thead>
                    <tr>
                        <th>Loại cầu</th>
                        <th>Tổng</th>
                        <th>Đúng</th>
                        <th>Sai</th>
                        <th>Tỉ lệ %</th>
                    </tr>
                </thead>
                <tbody id="patternsBody"></tbody>
            </table>
        </div>

        <div id="confidenceTab" class="tab-content">
            <table>
                <thead>
                    <tr>
                        <th>Độ tin cậy</th>
                        <th>Tổng</th>
                        <th>Đúng</th>
                        <th>Sai</th>
                        <th>Tỉ lệ %</th>
                    </tr>
                </thead>
                <tbody id="confidenceBody"></tbody>
            </table>
        </div>

        <div id="predictionTab" class="tab-content">
            <table>
                <thead>
                    <tr>
                        <th>Dự đoán</th>
                        <th>Tổng</th>
                        <th>Đúng</th>
                        <th>Sai</th>
                        <th>Tỉ lệ %</th>
                    </tr>
                </thead>
                <tbody id="predictionBody"></tbody>
            </table>
        </div>

        <div class="footer" style="text-align:center; color:#aaa; margin-top:20px;">by HuyDaiXuVN | Tự động cập nhật mỗi 2 giây</div>
    </div>

    <script>
        function showTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
            document.getElementById(tabName + 'Tab').classList.add('active');
            event.target.classList.add('active');
        }

        async function fetchData() {
            try {
                const res = await fetch('/api/check/data');
                const data = await res.json();
                updateSummary(data.summary);
                renderHistory(data.recentHistory);
                renderPatterns(data.byPattern);
                renderConfidence(data.byConfidence);
                renderPrediction(data.byPrediction);
            } catch (e) {
                console.error('Lỗi fetch:', e);
            }
        }

        function updateSummary(sum) {
            document.getElementById('total').textContent = sum.totalPredictions;
            document.getElementById('correct').textContent = sum.totalCorrect;
            document.getElementById('wrong').textContent = sum.totalWrong;
            document.getElementById('accuracy').textContent = (sum.accuracy || 0).toFixed(1) + '%';
            document.getElementById('curStreak').textContent = sum.currentStreak;
            document.getElementById('bestStreak').textContent = sum.bestStreak;
        }

        function renderHistory(history) {
            const tbody = document.getElementById('historyBody');
            tbody.innerHTML = '';
            if (!history || history.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7">Chưa có dữ liệu</td></tr>';
                return;
            }
            [...history].reverse().forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.phien || ''}</td>
                    <td>${item.prediction || ''}</td>
                    <td>${item.actual || ''}</td>
                    <td class="${item.correct ? 'correct' : 'wrong'}">${item.correct ? '✅ Đúng' : '❌ Sai'}</td>
                    <td>${item.confidence || ''}%</td>
                    <td>${item.pattern || ''}</td>
                    <td>${item.timestamp || ''}</td>
                `;
                tbody.appendChild(row);
            });
        }

        function renderPatterns(patterns) {
            const tbody = document.getElementById('patternsBody');
            tbody.innerHTML = '';
            const sorted = Object.entries(patterns).filter(([_,v]) => v.total > 0).sort((a,b) => b[1].total - a[1].total);
            if (sorted.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5">Không có dữ liệu</td></tr>';
                return;
            }
            sorted.forEach(([name, data]) => {
                const rate = (data.correct / data.total * 100).toFixed(1);
                tbody.innerHTML += `
                    <tr>
                        <td>${name}</td>
                        <td>${data.total}</td>
                        <td>${data.correct}</td>
                        <td>${data.wrong}</td>
                        <td>${rate}%</td>
                    </tr>`;
            });
        }

        function renderConfidence(conf) {
            const tbody = document.getElementById('confidenceBody');
            tbody.innerHTML = '';
            const sorted = Object.entries(conf).filter(([_,v]) => v.total > 0);
            if (sorted.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5">Không có dữ liệu</td></tr>';
                return;
            }
            sorted.forEach(([range, data]) => {
                const rate = (data.correct / data.total * 100).toFixed(1);
                tbody.innerHTML += `
                    <tr>
                        <td>${range}</td>
                        <td>${data.total}</td>
                        <td>${data.correct}</td>
                        <td>${data.wrong}</td>
                        <td>${rate}%</td>
                    </tr>`;
            });
        }

        function renderPrediction(pred) {
            const tbody = document.getElementById('predictionBody');
            tbody.innerHTML = '';
            const sorted = Object.entries(pred).filter(([_,v]) => v.total > 0);
            if (sorted.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5">Không có dữ liệu</td></tr>';
                return;
            }
            sorted.forEach(([key, data]) => {
                const rate = (data.correct / data.total * 100).toFixed(1);
                tbody.innerHTML += `
                    <tr>
                        <td>${key}</td>
                        <td>${data.total}</td>
                        <td>${data.correct}</td>
                        <td>${data.wrong}</td>
                        <td>${rate}%</td>
                    </tr>`;
            });
        }

        fetchData();
        setInterval(fetchData, 2000);
    </script>
</body>
</html>
    `);
});

// API JSON cho giao diện check
app.get('/api/check/data', (req, res) => {
    res.json({
        recentHistory: detailedStats.recentHistory,
        byPattern: detailedStats.byPattern,
        byConfidence: detailedStats.byConfidence,
        byPrediction: detailedStats.byPrediction,
        summary: detailedStats.summary
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({ error: "Endpoint không tồn tại" });
});

// --------------- KHỞI ĐỘNG ---------------
async function main() {
    console.log("=".repeat(60));
    console.log("🎲  SUN.WIN TÀI XỈU DATA STREAM (VIP)  ");
    console.log("👤  HuyDaiXuVN");
    console.log("=".repeat(60));
    console.log(`👤 User: ${TOKEN_DATA.username}`);
    console.log(`🌐 IP: ${TOKEN_DATA.ipAddress}`);
    console.log(`📡 Server: http://localhost:${PORT}`);
    console.log(`🔗 Keep-alive: ${SELF_URL}`);
    console.log("=".repeat(60));

    // Kết nối WebSocket
    connectWebSocket();

    // Khởi động Express
    app.listen(PORT, () => {
        console.log(`[🚀] Server sẵn sàng trên cổng ${PORT}`);
    });

    // Tự động ping chống ngủ
    keepAlive();
}

// Xử lý thoát
process.on('SIGINT', () => {
    console.log("\n[👋] Tắt server...");
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log("\n[👋] Tắt server...");
    process.exit(0);
});

main().catch(err => {
    console.error(`[❌] Lỗi khởi động: ${err.message}`);
    process.exit(1);
});