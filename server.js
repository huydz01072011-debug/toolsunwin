const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ========== CONFIG ==========
const PORT = process.env.PORT || 3000;                // Render cấp PORT
const DATA_FILE = "collected_data/sunwin_tx.json";
const STATS_FILE = "database/stats.json";
const DETAILED_STATS_FILE = "database/detailed_stats.json";

const MIN_DATA_FOR_PREDICTION = 10;
const MAX_PREDICTIONS = 100000;
const MAX_STORAGE = 1000000;

// ========== HELPER: THỜI GIAN VIỆT NAM ==========
const vnNow = () => {
    const d = new Date();
    return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString();
};

// ========== BIẾN TOÀN CỤC ==========
let globalHistory = [];   // lưu tất cả phiên

let stats = {
    total: 0, correct: 0, wrong: 0,
    last_prediction: null,
    start_time: vnNow(),
    history: [],
    total_predictions_made: 0,
    prediction_started: false,
    current_streak: 0,
    best_streak: 0,
    worst_streak: 0
};

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

// ========== LOGIC DỰ ĐOÁN (KHÔNG THAY ĐỔI) ==========
class TX_LogicPen_V4 {
    constructor() {
        this.error_streak = 0;
        this.last_prediction = null;
        this.history = [];
        this.last_pattern = null;
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
        return this.history.filter(s => s.tong != null).map(s => s.tong);
    }

    cauSap(arr) {
        if (arr.length < 2) return null;
        let length = 1;
        for (let i = 1; i < arr.length; i++) {
            if (arr[i] === arr[0]) length++; else break;
        }
        if (length >= 2 && length <= 5)
            return { pred: arr[0], conf: 72, type: "Đu Bệt", reason: `Bệt ${length} phiên` };
        if (length >= 6)
            return { pred: arr[0] === "TAI" ? "XIU" : "TAI", conf: 80, type: "Bẻ Bệt Rồng", reason: `Bệt dài ${length} → hồi` };
        return null;
    }

    cauNoi(arr) {
        if (arr.length < 5) return null;
        for (let i = 0; i < 4; i++) if (arr[i] === arr[i + 1]) return null;
        return { pred: arr[0] === "TAI" ? "XIU" : "TAI", conf: 82, type: "Cầu Nối 1-1", reason: "Nhịp 1-1 ổn định" };
    }

    cauDoi(arr) {
        if (arr.length < 4) return null;
        if (arr[0] === arr[1] && arr[2] === arr[3] && arr[0] !== arr[2])
            return { pred: arr[2], conf: 78, type: "Cầu 2-2", reason: "AABB → B" };
        if (arr.length >= 6 && arr[0] === arr[1] && arr[1] === arr[2] &&
            arr[3] === arr[4] && arr[4] === arr[5] && arr[0] !== arr[3])
            return { pred: arr[3], conf: 80, type: "Cầu 3-3", reason: "AAABBB → B" };
        return null;
    }

    cauGay(arr) {
        if (arr.length >= 5 && arr[0] === arr[1] && arr[1] === arr[2] && arr[2] !== arr[3] && arr[3] === arr[4])
            return { pred: arr[3], conf: 74, type: "Gãy 3-2", reason: "AAABB → B" };
        if (arr.length >= 5 && arr[0] === arr[1] && arr[1] !== arr[2] && arr[2] === arr[3] && arr[3] === arr[4])
            return { pred: arr[2], conf: 74, type: "Gãy 2-3", reason: "AABBB → B" };
        if (arr.length >= 4 && arr[0] !== arr[1] && arr[1] === arr[2] && arr[2] !== arr[3] && arr[0] === arr[3])
            return { pred: arr[1], conf: 72, type: "Gãy 1-2-1", reason: "ABBA → B" };
        return null;
    }

    phatHienMauLap(arr) {
        if (arr.length < 6) return null;
        for (let len = 2; len <= 4; len++) {
            let pattern = arr.slice(0, len);
            for (let i = len; i < arr.length - len; i++) {
                let sub = arr.slice(i, i + len);
                if (JSON.stringify(sub) === JSON.stringify(pattern) && arr[i - 1])
                    return { pred: arr[i - 1], conf: 88, type: "Mẫu Lặp", reason: `Mẫu "${pattern.join(',')}"` };
            }
        }
        return null;
    }

    duDoanVi() {
        const points = this._points();
        if (points.length < 5) return null;
        const last = points[0], prev = points[1];
        const avg = points.slice(0, 5).reduce((a, b) => a + b, 0) / 5;

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
        return this.phatHienMauLap(arr) || this.cauNoi(arr) || this.cauDoi(arr) ||
               this.cauGay(arr) || this.cauSap(arr) || this.duDoanVi() ||
               { pred: arr[0], conf: 55, type: "Theo", reason: "Bám phiên cuối" };
    }

    apDungDaoChieu(p) {
        if (!p || this.history.length < 1) return p;
        const current = this._arr()[0];
        if (this.error_streak >= 2 && this.last_prediction && this.last_prediction !== current) {
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
        let res = this.tongHopDuDoan() || { pred: this._arr()[0] || "TAI", conf: 50, type: "Theo", reason: "Không đủ dữ liệu" };
        res = this.apDungDaoChieu(res);
        this.last_prediction = res.pred;
        if (res.type) this.last_pattern = res.type;
        return res;
    }

    updateStatus(actual) {
        if (this.last_prediction) {
            const a = actual.toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI');
            this.error_streak = (this.last_prediction === a) ? 0 : this.error_streak + 1;
        }
    }
}

const predictor = new TX_LogicPen_V4();

// ========== IO FILE ==========
function loadHistory() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')).history || [];
        }
    } catch (e) { console.error("Lỗi load history:", e.message); }
    return [];
}

function loadDetailedStats() {
    try {
        if (fs.existsSync(DETAILED_STATS_FILE)) {
            return JSON.parse(fs.readFileSync(DETAILED_STATS_FILE, 'utf-8'));
        }
    } catch (e) {}
    return detailedStats;
}

function saveHistory(history) {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const limited = history.slice(-MAX_STORAGE);
    fs.writeFileSync(DATA_FILE, JSON.stringify({
        history: limited,
        total_sessions: limited.length,
        max_storage: MAX_STORAGE,
        last_updated: vnNow()
    }, null, 2));
}

function saveStatsFile() {
    const dir = path.dirname(STATS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify({
        ...stats,
        total_predictions_made: stats.total_predictions_made,
        max_predictions: MAX_PREDICTIONS,
        min_data_required: MIN_DATA_FOR_PREDICTION,
        max_storage: MAX_STORAGE,
        prediction_started: stats.prediction_started,
        current_streak: stats.current_streak,
        best_streak: stats.best_streak,
        worst_streak: stats.worst_streak,
        last_updated: vnNow()
    }, null, 2));
}

function saveDetailedStats() {
    const dir = path.dirname(DETAILED_STATS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    detailedStats.summary = {
        totalPredictions: stats.total,
        totalCorrect: stats.correct,
        totalWrong: stats.wrong,
        accuracy: stats.total > 0 ? (stats.correct / stats.total * 100) : 0,
        bestStreak: stats.best_streak,
        worstStreak: stats.worst_streak,
        currentStreak: stats.current_streak,
        lastUpdated: vnNow()
    };
    fs.writeFileSync(DETAILED_STATS_FILE, JSON.stringify(detailedStats, null, 2));
}

function updateDetailedStats(prediction, actual, pattern, confidence, correct) {
    if (pattern && detailedStats.byPattern[pattern]) {
        detailedStats.byPattern[pattern].total++;
        correct ? detailedStats.byPattern[pattern].correct++ : detailedStats.byPattern[pattern].wrong++;
    }
    let range = '0-50';
    if (confidence > 50 && confidence <= 60) range = '51-60';
    else if (confidence > 60 && confidence <= 70) range = '61-70';
    else if (confidence > 70 && confidence <= 80) range = '71-80';
    else if (confidence > 80 && confidence <= 90) range = '81-90';
    else if (confidence > 90) range = '91-100';
    detailedStats.byConfidence[range].total++;
    correct ? detailedStats.byConfidence[range].correct++ : detailedStats.byConfidence[range].wrong++;

    const predKey = prediction.toUpperCase();
    detailedStats.byPrediction[predKey].total++;
    correct ? detailedStats.byPrediction[predKey].correct++ : detailedStats.byPrediction[predKey].wrong++;

    detailedStats.recentHistory.push({
        phien: stats.last_prediction?.phien || 0,
        prediction, actual, pattern, confidence, correct,
        timestamp: vnNow()
    });
    if (detailedStats.recentHistory.length > 1000) detailedStats.recentHistory = detailedStats.recentHistory.slice(-1000);
    saveDetailedStats();
}

// ========== AUTO VERIFY & PREDICT (GIỮ NGUYÊN LOGIC) ==========
function autoVerify(history) {
    if (!stats.last_prediction || history.length === 0) return;
    const lp = stats.last_prediction;
    const latest = history[history.length - 1];
    if (latest.phien !== lp.phien) return;

    const actual = latest.ket_qua || '';
    if (!actual) return;

    stats.total++;
    const a = actual.toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI');
    const p = lp.prediction.toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI');
    const ok = p === a;

    if (ok) {
        stats.correct++;
        stats.current_streak++;
        if (stats.current_streak > stats.best_streak) stats.best_streak = stats.current_streak;
    } else {
        stats.wrong++;
        stats.current_streak = 0;
        let wrongCount = 0;
        for (let i = stats.history.length - 1; i >= 0; i--) {
            if (!stats.history[i].correct) wrongCount++; else break;
        }
        if (wrongCount > stats.worst_streak) stats.worst_streak = wrongCount;
    }

    predictor.updateStatus(actual);

    stats.history.push({
        phien: latest.phien,
        prediction: lp.prediction,
        actual,
        confidence: lp.confidence,
        pattern: lp.pattern || 'Unknown',
        correct: ok,
        timestamp: vnNow()
    });
    if (stats.history.length > 500) stats.history = stats.history.slice(-500);

    updateDetailedStats(lp.prediction, actual, lp.pattern || 'Unknown', lp.confidence, ok);

    const acc = (stats.correct / Math.max(stats.total, 1) * 100).toFixed(1);
    console.log(`🔍 VERIFY #${latest.phien}: ${ok ? '✅ ĐÚNG' : '❌ SAI'} | Tỷ lệ: ${acc}% (${stats.correct}/${stats.total}) | Streak: ${stats.current_streak}`);

    stats.last_prediction = null;
    saveStatsFile();
}

function autoPredict(history) {
    if (!stats.prediction_started) {
        if (history.length >= MIN_DATA_FOR_PREDICTION) {
            stats.prediction_started = true;
            console.log(`\n🎉 ĐÃ ĐỦ ${MIN_DATA_FOR_PREDICTION} PHIÊN! BẮT ĐẦU DỰ ĐOÁN...\n`);
        } else {
            console.log(`⏳ Thu thập: ${history.length}/${MIN_DATA_FOR_PREDICTION}`);
            return;
        }
    }
    if (stats.total_predictions_made >= MAX_PREDICTIONS) {
        console.log(`🏁 Đã đạt giới hạn ${MAX_PREDICTIONS} dự đoán.`);
        return;
    }
    if (history.length < 5) return;

    const r = predictor.predict(history);
    const cur = history[history.length - 1];
    let ph = cur.phien || 0;
    if (typeof ph === 'string') ph = parseInt(ph.replace('#', '')) || 0;
    const nextPhien = ph + 1;

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
}

// ========== WEBSOCKET CLIENT (LẤY DỮ LIỆU SUN.WIN) ==========
function loadTokenFromFile() {
    try {
        if (fs.existsSync('token.txt')) {
            const raw = fs.readFileSync('token.txt', 'utf8');
            const match = raw.match(/\{[^{}]*"ipAddress"[^{}]*\}/);
            if (match) return JSON.parse(match[0]);
        }
    } catch (e) {}
    return null;
}

function connectSunWebSocket() {
    const tokenData = loadTokenFromFile();
    if (!tokenData || !tokenData.wsToken) {
        console.error("❌ Không tìm thấy token hợp lệ trong token.txt");
        return;
    }

    const WS_URL = `wss://websocket.azhkthg1.net/websocket?token=${tokenData.wsToken}`;
    console.log(`🔌 Kết nối WebSocket: ${WS_URL}`);

    const ws = new WebSocket(WS_URL, {
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Origin": "https://play.sun.pw"
        }
    });

    ws.on('open', () => {
        console.log("✅ WebSocket đã kết nối đến Sun.Win");
        const messages = [
            [1, "MiniGame", tokenData.username || "GM_quapotjz", "quapit", {
                signature: "05915B436159B8F4E4DFF537639BD014D54EBEFA18CF62A8EB205B4074010AD72AEA9A780D5A8A4E1BD59BBBAFE03902C594B5DA56FD60D099F1FDDCCD48385FCC2760B5B0B4B8E75D39B8E40DF8CB7C01EA58DBEDA32805927473AB71FA9B798B0C2EDC445C3E36E47EF0AAFAD45601D99AAD1EC642FD2B63573A0401D6EC69",
                expireIn: tokenData.timestamp || 1774138177205,
                wsToken: tokenData.wsToken,
                accessToken: "7e9a9ecbff1b4a6393b48346f6d8b709",
                message: "Thành công",
                refreshToken: tokenData.refreshToken || "",
                info: tokenData
            }],
            [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
            [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
        ];
        messages.forEach((msg, i) => setTimeout(() => ws.send(JSON.stringify(msg)), i * 600));
    });

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (!Array.isArray(msg) || msg.length < 2) return;
            const body = msg[1];
            if (typeof body !== 'object' || !body) return;

            if (body.cmd === 1003 && body.gBB) {
                const d1 = body.d1, d2 = body.d2, d3 = body.d3;
                if (d1 == null || d2 == null || d3 == null) return;
                const total = d1 + d2 + d3;
                const result = total > 10 ? "Tài" : "Xỉu";
                const phien = body.sid || (globalHistory.length ? globalHistory[globalHistory.length - 1].phien + 1 : 1);

                const newSession = {
                    phien,
                    xuc_xac_1: d1,
                    xuc_xac_2: d2,
                    xuc_xac_3: d3,
                    tong: total,
                    ket_qua: result,
                    thoi_gian: vnNow()
                };

                const exists = globalHistory.some(h => h.phien === phien);
                if (!exists) {
                    globalHistory.push(newSession);
                    globalHistory.sort((a, b) => a.phien - b.phien);
                    if (globalHistory.length > MAX_STORAGE) globalHistory = globalHistory.slice(-MAX_STORAGE);
                    saveHistory(globalHistory);
                    console.log(`🎲 Phiên ${phien}: ${d1}-${d2}-${d3} = ${total} (${result})`);
                    autoVerify(globalHistory);
                    autoPredict(globalHistory);
                }
            } else if (body.cmd === 1008 && body.sid) {
                console.log(`[🎮] Phiên mới #${body.sid}`);
            }
        } catch (e) {
            console.error("Lỗi xử lý WS message:", e.message);
        }
    });

    ws.on('close', () => {
        console.log("⚠️ WebSocket mất kết nối, thử lại sau 3s...");
        setTimeout(connectSunWebSocket, 3000);
    });

    ws.on('error', (err) => {
        console.error("❌ WebSocket error:", err.message);
    });
}

// ========== EXPRESS SERVER & API ==========
const app = express();
app.use(express.json());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
});

// Trang chủ
app.get('/', (req, res) => {
    res.json({
        name: "Sun.Win Tài Xỉu Collector & Predictor",
        version: "1.0.0",
        endpoints: {
            "/api/tx": "Kết quả mới nhất",
            "/api/dudoan": "Dự đoán tiếp theo",
            "/api/lichsu": "Lịch sử dự đoán gần đây (50)",
            "/api/thongke": "Thống kê tổng hợp",
            "/api/stats": "Thống kê chi tiết đầy đủ"
        },
        current_time: vnNow()
    });
});

// API kết quả mới nhất
app.get('/api/tx', (req, res) => {
    const latest = globalHistory.length ? globalHistory[globalHistory.length - 1] : null;
    res.json(latest || { message: "Chưa có dữ liệu" });
});

// API dự đoán
app.get('/api/dudoan', (req, res) => {
    if (globalHistory.length < 5) {
        return res.status(400).json({ error: "Cần ít nhất 5 phiên để dự đoán", current_count: globalHistory.length });
    }
    const r = predictor.predict(globalHistory);
    const cur = globalHistory[globalHistory.length - 1];
    let nextPhien = (cur.phien || 0) + 1;
    res.json({
        next_phien: nextPhien,
        prediction: r.pred,
        confidence: r.conf,
        pattern: r.type,
        reason: r.reason,
        timestamp: vnNow()
    });
});

// API lịch sử
app.get('/api/lichsu', (req, res) => {
    const recent = detailedStats.recentHistory.slice(-50).reverse();
    res.json({
        total_predictions: detailedStats.recentHistory.length,
        history: recent,
        summary: detailedStats.summary
    });
});

// API thống kê tổng
app.get('/api/thongke', (req, res) => {
    res.json({
        total: stats.total,
        correct: stats.correct,
        wrong: stats.wrong,
        accuracy: stats.total > 0 ? (stats.correct / stats.total * 100).toFixed(2) + '%' : '0%',
        current_streak: stats.current_streak,
        best_streak: stats.best_streak,
        worst_streak: stats.worst_streak,
        prediction_started: stats.prediction_started,
        total_predictions_made: stats.total_predictions_made,
        last_updated: vnNow()
    });
});

// API thống kê chi tiết
app.get('/api/stats', (req, res) => {
    res.json(detailedStats);
});

// ========== KHỞI ĐỘNG HỆ THỐNG ==========
function init() {
    // Load dữ liệu cũ
    globalHistory = loadHistory();
    detailedStats = loadDetailedStats();
    if (fs.existsSync(STATS_FILE)) {
        try {
            const saved = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
            stats = { ...stats, ...saved };
        } catch (e) {}
    }
    console.log(`📚 Đã tải ${globalHistory.length} phiên lịch sử`);
    if (stats.prediction_started) {
        console.log(`📈 Tỷ lệ đúng: ${stats.total ? (stats.correct / stats.total * 100).toFixed(1) : 0}% (${stats.correct}/${stats.total})`);
    }

    // Mở WebSocket lấy dữ liệu real-time
    connectSunWebSocket();

    // Mở Express server (Render bắt buộc)
    app.listen(PORT, () => {
        console.log(`\n🌐 Server API đang chạy tại http://localhost:${PORT}`);
        console.log(`📡 Cổng ${PORT} đã mở - sẵn sàng deploy`);
    });

    // Console readline (vẫn giữ để test local)
    console.log('\n💡 Gõ /dudoan, /lichsu, /stats, /help, /thoat');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', (input) => {
        const cmd = input.trim().toLowerCase();
        if (cmd === '/dudoan' || cmd === '/du doan') {
            const r = predictor.predict(globalHistory);
            console.log(`Dự đoán: ${r.pred} (${r.conf}%) - ${r.type}`);
        } else if (cmd === '/lichsu' || cmd === '/lich su') {
            console.table(detailedStats.recentHistory.slice(-10));
        } else if (cmd === '/stats') {
            console.log(`Đúng: ${stats.correct}, Sai: ${stats.wrong}, Streak: ${stats.current_streak}`);
        } else if (cmd === '/help') {
            console.log('/dudoan, /lichsu, /stats, /thoat');
        } else if (cmd === '/thoat') {
            process.exit(0);
        }
    });
}

// Xử lý thoát an toàn
process.on('SIGINT', () => {
    saveStatsFile();
    saveDetailedStats();
    process.exit(0);
});
process.on('SIGTERM', () => {
    saveStatsFile();
    saveDetailedStats();
    process.exit(0);
});

init();