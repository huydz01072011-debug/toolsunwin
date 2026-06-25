// ===================================================================
//  server.js - Sun.Win Tài Xỉu Full Node.js
//  Gộp toàn bộ chức năng của server.py (WebSocket + API) và
//  sunphhuy.js (thu thập dữ liệu, dự đoán, thống kê, console).
//  Token được nhúng trực tiếp, không cần file token.txt.
//  Giữ nguyên 100% logic gốc, không rút gọn.
// ===================================================================

const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ==================== CẤU HÌNH CHUNG ====================
const PORT = parseInt(process.env.PORT || '1234');      // Cổng HTTP server (giống server.py)
const WEBSOCKET_RECONNECT_DELAY = 2500;                  // ms, giống server.py
const MIN_DATA_FOR_PREDICTION = 10;                      // Số phiên tối thiểu để bắt đầu dự đoán
const MAX_PREDICTIONS = 100000;                          // Giới hạn tổng số dự đoán
const MAX_STORAGE = 1000000;                             // Giới hạn lưu trữ phiên

// Đường dẫn file lưu trữ (giống sunphhuy.js)
const DATA_FILE = path.join(__dirname, 'collected_data', 'sunwin_tx.json');
const STATS_FILE = path.join(__dirname, 'database', 'stats.json');
const DETAILED_STATS_FILE = path.join(__dirname, 'database', 'detailed_stats.json');

// ==================== TOKEN (NHÚNG TRỰC TIẾP) ====================
// Chuỗi token gốc (đã cung cấp)
const TOKEN_RAW_STRING = '�Simms����info@{"ipAddress":"1.55.124.245","wsToken":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0","locale":"vi","userId":"a28a0f06-e88f-44b7-a268-5f6dad949fbf","username":"GM_quapotjz","timestamp":1780029354479,"refreshToken":"26b930ec6dc04d7db5c2b362a1baac87.7549ba6185d4467380ee447589380061"}�signature�';

/**
 * Parse token data từ chuỗi thô (giống parse_token_data trong server.py)
 */
function parseTokenData(raw) {
    try {
        const infoIndex = raw.indexOf('info@');
        if (infoIndex === -1) return null;
        const jsonStart = raw.indexOf('{', infoIndex);
        if (jsonStart === -1) return null;
        let braceCount = 0;
        let jsonEnd = -1;
        for (let i = jsonStart; i < raw.length; i++) {
            if (raw[i] === '{') braceCount++;
            else if (raw[i] === '}') {
                braceCount--;
                if (braceCount === 0) {
                    jsonEnd = i;
                    break;
                }
            }
        }
        if (jsonEnd === -1) return null;
        const jsonStr = raw.substring(jsonStart, jsonEnd + 1);
        // Làm sạch ký tự điều khiển
        const cleanJson = jsonStr.replace(/[\x00-\x1F\x7F]/g, '');
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error('[❌] Lỗi parse token:', e.message);
        return null;
    }
}

const TOKEN_DATA = parseTokenData(TOKEN_RAW_STRING);
if (!TOKEN_DATA) {
    console.error('[❌] Không thể parse token. Vui lòng kiểm tra lại chuỗi token. Dừng chương trình.');
    process.exit(1);
}
console.log('[✅] Đã parse token thành công. Username:', TOKEN_DATA.username);

// ==================== CẤU HÌNH WEBSOCKET ====================
const WS_URL = `wss://websocket.azhkthg1.net/websocket?token=${TOKEN_DATA.wsToken}`;
const WS_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Origin': 'https://play.sun.pw'
};

// Danh sách message khởi tạo (giống hệt server.py)
const initialMessages = [
    [
        1,
        "MiniGame",
        TOKEN_DATA.username || "GM_quapotjz",
        "quapit",
        {
            signature: "05915B436159B8F4E4DFF537639BD014D54EBEFA18CF62A8EB205B4074010AD72AEA9A780D5A8A4E1BD59BBBAFE03902C594B5DA56FD60D099F1FDDCCD48385FCC2760B5B0B4B8E75D39B8E40DF8CB7C01EA58DBEDA32805927473AB71FA9B798B0C2EDC445C3E36E47EF0AAFAD45601D99AAD1EC642FD2B63573A0401D6EC69",
            expireIn: TOKEN_DATA.timestamp || 1774138177205,
            wsToken: TOKEN_DATA.wsToken || '',
            accessToken: "7e9a9ecbff1b4a6393b48346f6d8b709",
            message: "Thành công",
            refreshToken: TOKEN_DATA.refreshToken || '',
            info: TOKEN_DATA
        }
    ],
    [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
    [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
];

// ==================== BIẾN TOÀN CỤC ====================
// Kết quả hiện tại (giống current_result trong server.py)
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
let wsConnection = null;

// Dữ liệu lịch sử cho dự đoán (globalHistory)
let globalHistory = [];

// ==================== EXPRESS SERVER (HTTP API) ====================
const app = express();
app.use(cors());

// Endpoint /api/tx - Lấy kết quả tài xỉu mới nhất (từ server.py)
app.get('/api/tx', (req, res) => {
    res.json(currentResult);
});

// Endpoint / - Trang chủ (từ server.py)
app.get('/', (req, res) => {
    res.json({
        name: "Sun.Win Tài Xỉu Data Stream (Node.js Full)",
        version: "2.0",
        endpoints: {
            "/api/tx": "Lấy kết quả tài xỉu mới nhất",
            "/api/stats": "Xem thống kê dự đoán",
            "/api/history": "Xem lịch sử dự đoán gần đây"
        },
        thoi_gian: getVietnamTime(),
        current_user: TOKEN_DATA.username || "Unknown"
    });
});

// Endpoint /api/stats - Thống kê (mở rộng từ sunphhuy.js)
app.get('/api/stats', (req, res) => {
    const safeStats = {
        total_predictions: stats.total,
        correct: stats.correct,
        wrong: stats.wrong,
        accuracy: stats.total > 0 ? (stats.correct / stats.total * 100).toFixed(2) + '%' : '0%',
        current_streak: stats.current_streak,
        best_streak: stats.best_streak,
        worst_streak: stats.worst_streak,
        total_predictions_made: stats.total_predictions_made,
        max_predictions: MAX_PREDICTIONS,
        last_updated: getVietnamTime()
    };
    res.json(safeStats);
});

// Endpoint /api/history - Lịch sử dự đoán gần đây (từ detailedStats)
app.get('/api/history', (req, res) => {
    const recent = detailedStats.recentHistory.slice(-50).reverse(); // 50 mới nhất
    res.json({
        total_records: detailedStats.recentHistory.length,
        history: recent
    });
});

// Xử lý 404 (giống server.py)
app.use((req, res) => {
    res.status(404).json({ error: "Endpoint không tồn tại" });
});

// ==================== HÀM TIỆN ÍCH ====================
function getVietnamTime() {
    const now = new Date();
    const utc7 = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const day = String(utc7.getUTCDate()).padStart(2, '0');
    const month = String(utc7.getUTCMonth() + 1).padStart(2, '0');
    const year = utc7.getUTCFullYear();
    const hours = String(utc7.getUTCHours()).padStart(2, '0');
    const minutes = String(utc7.getUTCMinutes()).padStart(2, '0');
    const seconds = String(utc7.getUTCSeconds()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds} UTC+7`;
}

function safeInt(v, d = 0) {
    const parsed = parseInt(v);
    return isNaN(parsed) ? d : parsed;
}

// ==================== WEBSOCKET CLIENT ====================
function connectWebSocket() {
    console.log('[🔄] Đang kết nối WebSocket...');
    const options = {
        headers: WS_HEADERS,
        perMessageDeflate: false
    };

    wsConnection = new WebSocket(WS_URL, options);

    wsConnection.on('open', () => {
        console.log('[✅] WebSocket connected to Sun.Win');
        // Gửi các message khởi tạo với độ trễ (giống server.py)
        initialMessages.forEach((msg, i) => {
            setTimeout(() => {
                if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
                    wsConnection.send(JSON.stringify(msg));
                }
            }, i * 600);
        });
    });

    wsConnection.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            if (!Array.isArray(message) || message.length < 2) return;

            const payload = message[1];
            if (typeof payload !== 'object' || !payload) return;

            const cmd = payload.cmd;
            const sid = payload.sid;
            const d1 = payload.d1;
            const d2 = payload.d2;
            const d3 = payload.d3;
            const gBB = payload.gBB;

            // Nhận phiên mới (cmd=1008) - giống server.py
            if (cmd === 1008 && sid) {
                currentSessionId = sid;
                console.log(`[🎮] Phiên mới: ${sid}`);
            }

            // Nhận kết quả (cmd=1003) - giống server.py
            if (cmd === 1003 && gBB) {
                if (d1 === undefined || d2 === undefined || d3 === undefined) return;

                const total = d1 + d2 + d3;
                const resultStr = total > 10 ? "Tài" : "Xỉu";  // Đúng logic: >10 là Tài, <=10 là Xỉu
                const timeStr = getVietnamTime();

                currentResult = {
                    phien: currentSessionId,
                    xuc_xac_1: d1,
                    xuc_xac_2: d2,
                    xuc_xac_3: d3,
                    tong: total,
                    ket_qua: resultStr,
                    thoi_gian: timeStr
                };

                console.log(`[🎲] Phiên ${currentSessionId}: ${d1}-${d2}-${d3} = ${total} (${resultStr}) - ${timeStr}`);

                // Đưa kết quả vào luồng xử lý dự đoán (từ sunphhuy.js)
                handleNewResult(currentResult);

                // Reset session id sau khi đã có kết quả
                currentSessionId = null;
            }
        } catch (e) {
            console.error('[❌] Lỗi parse message:', e.message);
        }
    });

    wsConnection.on('close', (code) => {
        console.log(`[⚠️] WebSocket đóng (code: ${code}), sẽ kết nối lại sau ${WEBSOCKET_RECONNECT_DELAY / 1000}s...`);
        wsConnection = null;
        setTimeout(connectWebSocket, WEBSOCKET_RECONNECT_DELAY);
    });

    wsConnection.on('error', (err) => {
        console.error('[❌] WebSocket error:', err.message);
        wsConnection = null; // close event sẽ kích hoạt reconnect
    });
}

// ==================== LOGIC DỰ ĐOÁN (TX_LogicPen_V4) - NGUYÊN BẢN TỪ sunphhuy.js ====================
class TX_LogicPen_V4 {
    constructor() {
        this.error_streak = 0;
        this.last_prediction = null;
        this.history = [];
        this.last_pattern = null;
    }

    loadData(data) {
        // Sắp xếp giảm dần theo phien (mới nhất lên đầu) giống logic gốc
        this.history = [...data].sort((a, b) => (b.phien || 0) - (a.phien || 0));
    }

    _arr() {
        return this.history.map(s => (s.ket_qua || '').toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI'));
    }

    _points() {
        return this.history.filter(s => s.tong !== undefined && s.tong !== null).map(s => s.tong);
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

// ==================== KHỞI TẠO ĐỐI TƯỢNG DỰ ĐOÁN ====================
const predictor = new TX_LogicPen_V4();

// ==================== THỐNG KÊ & LƯU TRỮ (từ sunphhuy.js) ====================
// Thống kê chi tiết (giống detailedStats)
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
    recentHistory: [],
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

// Thống kê tổng quát (giống stats)
let stats = {
    total: 0,
    correct: 0,
    wrong: 0,
    last_prediction: null,
    start_time: getVietnamTime(),
    history: [],
    total_predictions_made: 0,
    prediction_started: false,
    current_streak: 0,
    best_streak: 0,
    worst_streak: 0
};

// ==================== HÀM XỬ LÝ FILE ====================
function loadHistory() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            return data.history || [];
        }
    } catch (e) {
        console.error(`[❌] Lỗi đọc file dữ liệu: ${e.message}`);
    }
    return [];
}

function loadDetailedStats() {
    try {
        if (fs.existsSync(DETAILED_STATS_FILE)) {
            return JSON.parse(fs.readFileSync(DETAILED_STATS_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error(`[❌] Lỗi đọc file thống kê chi tiết: ${e.message}`);
    }
    return detailedStats;
}

function saveDetailedStats() {
    const dir = path.dirname(DETAILED_STATS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    detailedStats.summary.totalPredictions = stats.total;
    detailedStats.summary.totalCorrect = stats.correct;
    detailedStats.summary.totalWrong = stats.wrong;
    detailedStats.summary.accuracy = stats.total > 0 ? (stats.correct / stats.total * 100) : 0;
    detailedStats.summary.bestStreak = stats.best_streak;
    detailedStats.summary.worstStreak = stats.worst_streak;
    detailedStats.summary.currentStreak = stats.current_streak;
    detailedStats.summary.lastUpdated = getVietnamTime();

    fs.writeFileSync(DETAILED_STATS_FILE, JSON.stringify(detailedStats, null, 2));
}

function saveHistory(history) {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const limited = history.slice(-MAX_STORAGE);
    fs.writeFileSync(DATA_FILE, JSON.stringify({
        history: limited,
        total_sessions: limited.length,
        max_storage: MAX_STORAGE,
        last_updated: getVietnamTime()
    }, null, 2));

    console.log(`💾 Đã lưu ${limited.length}/${MAX_STORAGE} phiên dữ liệu`);
}

function saveStatsFile() {
    const dir = path.dirname(STATS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify({
        ...stats,
        max_predictions: MAX_PREDICTIONS,
        min_data_required: MIN_DATA_FOR_PREDICTION,
        max_storage: MAX_STORAGE,
        last_updated: getVietnamTime()
    }, null, 2));
}

function updateDetailedStats(prediction, actual, pattern, confidence, correct) {
    if (pattern && detailedStats.byPattern[pattern]) {
        detailedStats.byPattern[pattern].total++;
        if (correct) detailedStats.byPattern[pattern].correct++;
        else detailedStats.byPattern[pattern].wrong++;
    }

    // Xác định khoảng độ tin cậy
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
        phien: stats.last_prediction?.phien || 0,
        prediction: prediction,
        actual: actual,
        pattern: pattern,
        confidence: confidence,
        correct: correct,
        timestamp: getVietnamTime()
    });

    // Giới hạn lịch sử gần đây 1000 bản ghi
    if (detailedStats.recentHistory.length > 1000) {
        detailedStats.recentHistory = detailedStats.recentHistory.slice(-1000);
    }

    saveDetailedStats();
}

// ==================== XỬ LÝ KẾT QUẢ MỚI VÀ DỰ ĐOÁN (từ sunphhuy.js) ====================
function handleNewResult(result) {
    if (!result || !result.phien) return;

    const phienNum = safeInt(result.phien);
    if (phienNum <= 0) return;

    // Kiểm tra trùng lặp
    const exists = globalHistory.some(h => safeInt(h.phien) === phienNum);
    if (!exists) {
        globalHistory.push({
            phien: phienNum,
            ket_qua: result.ket_qua || '',
            tong: safeInt(result.tong),
            xuc_xac_1: safeInt(result.xuc_xac_1),
            xuc_xac_2: safeInt(result.xuc_xac_2),
            xuc_xac_3: safeInt(result.xuc_xac_3)
        });

        // Sắp xếp tăng dần theo phiên
        globalHistory.sort((a, b) => a.phien - b.phien);
        if (globalHistory.length > MAX_STORAGE) {
            globalHistory = globalHistory.slice(-MAX_STORAGE);
        }

        saveHistory(globalHistory);

        // Tự động xác minh dự đoán trước đó và đưa ra dự đoán mới
        autoVerify(globalHistory);
        autoPredict(globalHistory);

        // Kiểm tra giới hạn dự đoán
        if (stats.prediction_started && stats.total_predictions_made >= MAX_PREDICTIONS) {
            console.log("\n🎯 ĐÃ ĐẠT GIỚI HẠN DỰ ĐOÁN!");
            printDetailedStats();
            console.log("\n🛑 Chương trình sẽ dừng...");
            rl.close();
            process.exit(0);
        }
    }
}

function autoVerify(history) {
    if (!stats.last_prediction || history.length === 0) return;

    const lp = stats.last_prediction;
    const latest = history[history.length - 1];

    if (safeInt(latest.phien) === lp.phien) {
        const actual = latest.ket_qua || '';
        if (!actual) return;

        stats.total++;
        const a = actual.toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI');
        const p = lp.prediction.toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI');
        const ok = p === a;

        if (ok) {
            stats.correct++;
            stats.current_streak++;
            if (stats.current_streak > stats.best_streak) {
                stats.best_streak = stats.current_streak;
            }
        } else {
            stats.wrong++;
            stats.current_streak = 0;
            // Tính chuỗi sai tệ nhất
            let wrongStreak = 0;
            for (let i = stats.history.length - 1; i >= 0; i--) {
                if (!stats.history[i].correct) wrongStreak++;
                else break;
            }
            if (wrongStreak > stats.worst_streak) {
                stats.worst_streak = wrongStreak;
            }
        }

        predictor.updateStatus(actual);

        const historyEntry = {
            phien: latest.phien,
            prediction: lp.prediction,
            actual: actual,
            confidence: lp.confidence,
            pattern: lp.pattern || 'Unknown',
            correct: ok,
            timestamp: getVietnamTime()
        };
        stats.history.push(historyEntry);
        if (stats.history.length > 500) stats.history = stats.history.slice(-500);

        updateDetailedStats(lp.prediction, actual, lp.pattern || 'Unknown', lp.confidence, ok);

        const acc = ((stats.correct / Math.max(stats.total, 1)) * 100).toFixed(1);
        console.log(`🔍 VERIFY #${latest.phien}: ${ok ? '✅ ĐÚNG' : '❌ SAI'} | Tỷ lệ: ${acc}% (${stats.correct}/${stats.total}) | Streak: ${stats.current_streak}`);

        stats.last_prediction = null;
        saveStatsFile();
    }
}

function autoPredict(history) {
    if (!stats.prediction_started) {
        if (history.length >= MIN_DATA_FOR_PREDICTION) {
            stats.prediction_started = true;
            console.log(`\n🎉 ĐÃ ĐỦ ${MIN_DATA_FOR_PREDICTION} PHIÊN DỮ LIỆU! BẮT ĐẦU DỰ ĐOÁN...\n`);
        } else {
            const remaining = MIN_DATA_FOR_PREDICTION - history.length;
            console.log(`⏳ Đang thu thập dữ liệu: ${history.length}/${MIN_DATA_FOR_PREDICTION} phiên. Cần thêm ${remaining} phiên nữa để bắt đầu dự đoán.`);
            return;
        }
    }

    if (stats.total_predictions_made >= MAX_PREDICTIONS) {
        console.log(`🏁 Đã đạt giới hạn ${MAX_PREDICTIONS} dự đoán. Ngừng dự đoán mới.`);
        return;
    }

    if (history.length >= 5) {
        try {
            const r = predictor.predict(history);
            const cur = history[history.length - 1];
            const nextPhien = safeInt(cur.phien) + 1;
            stats.last_prediction = {
                phien: nextPhien,
                prediction: r.pred,
                confidence: r.conf,
                pattern: r.type
            };
            stats.total_predictions_made++;
            const remaining = MAX_PREDICTIONS - stats.total_predictions_made;
            console.log(`🎯 DỰ ĐOÁN #${nextPhien}: ${r.pred} | Độ tin cậy: ${r.conf}% | ${r.type} | Còn: ${remaining}/${MAX_PREDICTIONS}`);
            saveStatsFile();
        } catch (e) {
            console.error(`[❌] Lỗi dự đoán: ${e.message}`);
        }
    }
}

// ==================== GIAO DIỆN CONSOLE (từ sunphhuy.js) ====================
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
});

function showPrediction(history) {
    console.log('\n🎯 === DỰ ĐOÁN TIẾP THEO ===');
    console.log('═══════════════════════════════════════════');

    if (!history || history.length < 5) {
        console.log('❌ Chưa đủ dữ liệu để dự đoán (cần ít nhất 5 phiên)');
        console.log(`📊 Hiện có: ${history ? history.length : 0} phiên`);
        return;
    }

    try {
        const r = predictor.predict(history);
        const cur = history[history.length - 1];
        const nextPhien = safeInt(cur.phien) + 1;

        console.log(`📋 DỰA TRÊN ${history.length} PHIÊN GẦN NHẤT:`);
        console.log(`\n🔮 DỰ ĐOÁN PHIÊN #${nextPhien}:`);
        console.log(`   🎯 Kết quả: ${r.pred}`);
        console.log(`   📊 Độ tin cậy: ${r.conf}%`);
        console.log(`   📌 Loại cầu: ${r.type}`);
        console.log(`   💬 Lý do: ${r.reason}`);

        console.log(`\n📜 10 PHIÊN GẦN NHẤT:`);
        console.log('   ┌──────────┬────────────┬────────────┬─────────────┐');
        console.log('   │ Phiên    │ Kết quả    │ Tổng điểm  │ Xúc xắc     │');
        console.log('   ├──────────┼────────────┼────────────┼─────────────┤');
        history.slice(-10).reverse().forEach(item => {
            const dice = `${item.xuc_xac_1||0},${item.xuc_xac_2||0},${item.xuc_xac_3||0}`;
            console.log(`   │ ${String(item.phien).padStart(8)} │ ${(item.ket_qua || '').padEnd(10)} │ ${String(item.tong || 0).padStart(10)} │ ${dice.padEnd(11)} │`);
        });
        console.log('   └──────────┴────────────┴────────────┴─────────────┘');
        console.log('\n═══════════════════════════════════════════\n');
    } catch (e) {
        console.error(`❌ Lỗi dự đoán: ${e.message}`);
    }
}

function showHistory() {
    console.log('\n📜 === LỊCH SỬ DỰ ĐOÁN ===');
    console.log('═══════════════════════════════════════════');

    if (!detailedStats.recentHistory || detailedStats.recentHistory.length === 0) {
        console.log('❌ Chưa có lịch sử dự đoán nào');
        console.log('💡 Hãy đợi chương trình dự đoán và xác minh kết quả');
        return;
    }

    const total = detailedStats.recentHistory.length;
    console.log(`📊 Tổng số dự đoán đã lưu: ${total}`);
    console.log(`📈 Tỷ lệ đúng: ${((stats.correct / Math.max(stats.total, 1)) * 100).toFixed(2)}% (${stats.correct}/${stats.total})`);
    console.log(`🏆 Chuỗi đúng tốt nhất: ${stats.best_streak}`);
    console.log(`📉 Chuỗi sai tệ nhất: ${stats.worst_streak}`);
    console.log(`📊 Chuỗi đúng hiện tại: ${stats.current_streak}`);

    console.log(`\n📋 20 DỰ ĐOÁN GẦN NHẤT:`);
    console.log('   ┌──────────┬────────────┬────────────┬──────────────────┬──────────┬────────────┐');
    console.log('   │ Phiên    │ Dự đoán    │ Thực tế    │ Loại cầu         │ Kết quả  │ Độ tin cậy │');
    console.log('   ├──────────┼────────────┼────────────┼──────────────────┼──────────┼────────────┤');

    detailedStats.recentHistory.slice(-20).reverse().forEach(item => {
        const result = item.correct ? '✅ ĐÚNG' : '❌ SAI';
        console.log(`   │ ${String(item.phien).padStart(8)} │ ${(item.prediction || '').padEnd(10)} │ ${(item.actual || '').padEnd(10)} │ ${(item.pattern || '').padEnd(16)} │ ${result.padEnd(8)} │ ${String(item.confidence || 0).padEnd(10)}% │`);
    });
    console.log('   └──────────┴────────────┴────────────┴──────────────────┴──────────┴────────────┘');

    console.log(`\n📊 THỐNG KÊ THEO LOẠI CẦU (Top 5):`);
    console.log('   ┌─────────────────────┬──────────┬──────────┬──────────┬──────────┐');
    console.log('   │ Loại cầu             │ Tổng     │ Đúng     │ Sai      │ Tỷ lệ %  │');
    console.log('   ├─────────────────────┼──────────┼──────────┼──────────┼──────────┤');

    const sortedPatterns = Object.entries(detailedStats.byPattern)
        .filter(([_, data]) => data.total > 0)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5);

    for (const [pattern, data] of sortedPatterns) {
        const rate = (data.correct / data.total * 100).toFixed(1);
        console.log(`   │ ${pattern.padEnd(19)} │ ${String(data.total).padStart(8)} │ ${String(data.correct).padStart(8)} │ ${String(data.wrong).padStart(8)} │ ${rate.padStart(8)} │`);
    }
    console.log('   └─────────────────────┴──────────┴──────────┴──────────┴──────────┘');
    console.log('\n═══════════════════════════════════════════\n');
}

function printDetailedStats() {
    console.log('\n📊 === THỐNG KÊ CHI TIẾT ===');
    console.log('═══════════════════════════════════════════');

    console.log(`\n📈 TỔNG QUAN:`);
    console.log(`   Tổng dự đoán: ${stats.total}`);
    console.log(`   Đúng: ${stats.correct} (${stats.total > 0 ? (stats.correct / stats.total * 100).toFixed(2) : 0}%)`);
    console.log(`   Sai: ${stats.wrong} (${stats.total > 0 ? (stats.wrong / stats.total * 100).toFixed(2) : 0}%)`);
    console.log(`   Chuỗi đúng hiện tại: ${stats.current_streak}`);
    console.log(`   Chuỗi đúng tốt nhất: ${stats.best_streak}`);
    console.log(`   Chuỗi sai tệ nhất: ${stats.worst_streak}`);

    console.log(`\n📊 THỐNG KÊ THEO LOẠI CẦU:`);
    console.log('   ┌─────────────────────┬──────────┬──────────┬──────────┬──────────┐');
    console.log('   │ Loại cầu             │ Tổng     │ Đúng     │ Sai      │ Tỷ lệ %  │');
    console.log('   ├─────────────────────┼──────────┼──────────┼──────────┼──────────┤');

    const sortedPatterns = Object.entries(detailedStats.byPattern)
        .filter(([_, data]) => data.total > 0)
        .sort((a, b) => b[1].total - a[1].total);

    for (const [pattern, data] of sortedPatterns) {
        const rate = (data.correct / data.total * 100).toFixed(1);
        console.log(`   │ ${pattern.padEnd(19)} │ ${String(data.total).padStart(8)} │ ${String(data.correct).padStart(8)} │ ${String(data.wrong).padStart(8)} │ ${rate.padStart(8)} │`);
    }
    console.log('   └─────────────────────┴──────────┴──────────┴──────────┴──────────┘');

    console.log(`\n📊 THỐNG KÊ THEO ĐỘ TIN CẬY:`);
    console.log('   ┌─────────────────────┬──────────┬──────────┬──────────┬──────────┐');
    console.log('   │ Độ tin cậy          │ Tổng     │ Đúng     │ Sai      │ Tỷ lệ %  │');
    console.log('   ├─────────────────────┼──────────┼──────────┼──────────┼──────────┤');

    for (const [range, data] of Object.entries(detailedStats.byConfidence)) {
        if (data.total > 0) {
            const rate = (data.correct / data.total * 100).toFixed(1);
            console.log(`   │ ${range.padEnd(19)} │ ${String(data.total).padStart(8)} │ ${String(data.correct).padStart(8)} │ ${String(data.wrong).padStart(8)} │ ${rate.padStart(8)} │`);
        }
    }
    console.log('   └─────────────────────┴──────────┴──────────┴──────────┴──────────┘');
    console.log('\n═══════════════════════════════════════════\n');
}

function setupCommandHandler() {
    console.log('\n💡 Gõ /dudoan để xem dự đoán');
    console.log('💡 Gõ /lichsu để xem lịch sử');
    console.log('💡 Gõ /stats để xem thống kê');
    console.log('💡 Gõ /help để xem hướng dẫn');
    console.log('💡 Gõ /thoat để thoát chương trình\n');

    rl.on('line', (input) => {
        const cmd = input.trim().toLowerCase();

        switch (cmd) {
            case '/dudoan':
            case '/du doan':
                showPrediction(globalHistory);
                break;

            case '/lichsu':
            case '/lich su':
                showHistory();
                break;

            case '/help':
            case '/h':
                console.log('\n📖 === HƯỚNG DẪN SỬ DỤNG ===');
                console.log('═══════════════════════════════════════════');
                console.log('  /dudoan   - Xem dự đoán phiên tiếp theo');
                console.log('  /lichsu   - Xem lịch sử dự đoán gần đây');
                console.log('  /stats    - Xem thống kê chi tiết');
                console.log('  /help     - Hiển thị hướng dẫn này');
                console.log('  /thoat    - Thoát chương trình');
                console.log('═══════════════════════════════════════════\n');
                break;

            case '/stats':
            case '/thongke':
                printDetailedStats();
                break;

            case '/thoat':
            case '/exit':
            case '/quit':
                console.log('\n🛑 Đang dừng chương trình...');
                saveStatsFile();
                saveDetailedStats();
                console.log('✅ Đã lưu thống kê!');
                rl.close();
                process.exit(0);
                break;

            default:
                if (cmd && !cmd.startsWith('/')) {
                    console.log(`❌ Lệnh không hợp lệ: "${cmd}"`);
                    console.log('💡 Gõ /help để xem danh sách lệnh');
                }
                break;
        }
    });
}

// ==================== MAIN ====================
async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('🎲 Sun.Win Tài Xỉu Data Stream (Node.js Full)');
    console.log('='.repeat(60));
    console.log(`👤 Token: ${TOKEN_DATA.username}`);
    console.log(`🆔 User ID: ${TOKEN_DATA.userId}`);
    console.log(`🌐 IP: ${TOKEN_DATA.ipAddress}`);
    console.log(`📡 Server HTTP: http://localhost:${PORT}`);
    console.log(`   Endpoints:`);
    console.log(`   - /api/tx      (Kết quả mới nhất)`);
    console.log(`   - /api/stats   (Thống kê)`);
    console.log(`   - /api/history (Lịch sử dự đoán)`);
    console.log('='.repeat(60));
    console.log('🔌 Kết nối WebSocket đến Sun.Win...\n');

    // Khởi động Express server
    app.listen(PORT, () => {
        console.log(`🚀 Express server đang chạy trên cổng ${PORT}`);
    });

    // Tải dữ liệu cũ (nếu có)
    globalHistory = loadHistory();
    console.log(`📚 Đã tải ${globalHistory.length} phiên dữ liệu từ file`);

    // Tải thống kê chi tiết
    detailedStats = loadDetailedStats();
    try {
        if (fs.existsSync(STATS_FILE)) {
            const saved = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
            stats = { ...stats, ...saved };
            if (stats.prediction_started) {
                console.log(`📈 Đã dự đoán ${stats.total_predictions_made}/${MAX_PREDICTIONS} phiên`);
                console.log(`📊 Tỷ lệ đúng: ${((stats.correct / Math.max(stats.total, 1)) * 100).toFixed(1)}% (${stats.correct}/${stats.total})`);
            }
        }
    } catch (e) {
        // ignore
    }

    // Kết nối WebSocket
    connectWebSocket();

    // Giao diện console
    setupCommandHandler();

    // Xử lý tín hiệu thoát
    process.on('SIGINT', () => {
        console.log('\n🛑 Đang dừng chương trình...');
        printDetailedStats();
        saveStatsFile();
        saveDetailedStats();
        rl.close();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        console.log('\n🛑 Đang dừng chương trình...');
        saveStatsFile();
        saveDetailedStats();
        rl.close();
        process.exit(0);
    });
}

// Chạy chương trình
main().catch(err => {
    console.error('❌ Lỗi nghiêm trọng:', err);
    process.exit(1);
});