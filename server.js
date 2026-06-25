const express = require('express');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

// ============================================================
// Cấu hình & Khởi tạo
// ============================================================
const PORT = process.env.PORT || 3000;
const DATA_FILE = "collected_data/sunwin_tx.json";
const STATS_FILE = "database/stats.json";
const DETAILED_STATS_FILE = "database/detailed_stats.json";

const MIN_DATA_FOR_PREDICTION = 10;
const MAX_PREDICTIONS = 100000;
const MAX_STORAGE = 1000000;
const CHECK_INTERVAL = 5000; // dùng cho fallback nếu cần, nhưng WebSocket là real-time

const vnNow = () => {
    const d = new Date();
    return new Date(d.getTime() + (7 * 60 * 60 * 1000)).toISOString();
};

// ============================================================
// Biến toàn cục
// ============================================================
let current_result = {
    phien: null,
    xuc_xac_1: null,
    xuc_xac_2: null,
    xuc_xac_3: null,
    tong: null,
    ket_qua: "",
    thoi_gian: ""
};

let globalHistory = []; // lịch sử các phiên

let stats = {
    total: 0,
    correct: 0,
    wrong: 0,
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

// ============================================================
// Logic dự đoán (giữ nguyên từ code gốc)
// ============================================================
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

const predictor = new TX_LogicPen_V4();

// ============================================================
// Helper Functions (lưu file, thống kê)
// ============================================================
function loadHistory() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const content = fs.readFileSync(DATA_FILE, 'utf-8');
            const data = JSON.parse(content);
            return data.history || [];
        }
    } catch (e) {
        console.error(`Lỗi đọc file: ${e.message}`);
    }
    return [];
}

function loadDetailedStats() {
    try {
        if (fs.existsSync(DETAILED_STATS_FILE)) {
            const content = fs.readFileSync(DETAILED_STATS_FILE, 'utf-8');
            return JSON.parse(content);
        }
    } catch (e) {
        console.error(`Lỗi đọc file thống kê chi tiết: ${e.message}`);
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
    detailedStats.summary.lastUpdated = vnNow();

    fs.writeFileSync(DETAILED_STATS_FILE, JSON.stringify(detailedStats, null, 2));
}

function saveHistory(history) {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const limitedHistory = history.slice(-MAX_STORAGE);
    fs.writeFileSync(DATA_FILE, JSON.stringify({
        history: limitedHistory,
        total_sessions: limitedHistory.length,
        max_storage: MAX_STORAGE,
        last_updated: vnNow()
    }, null, 2));

    console.log(`💾 Đã lưu ${limitedHistory.length}/${MAX_STORAGE} phiên dữ liệu`);
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
        phien: stats.last_prediction?.phien || 0,
        prediction: prediction,
        actual: actual,
        pattern: pattern,
        confidence: confidence,
        correct: correct,
        timestamp: vnNow()
    });

    if (detailedStats.recentHistory.length > 1000) {
        detailedStats.recentHistory = detailedStats.recentHistory.slice(-1000);
    }

    saveDetailedStats();
}

// ============================================================
// Core logic: Auto Verify & Auto Predict (gọi khi có phiên mới)
// ============================================================
function autoVerify(history, newSession) {
    if (stats.last_prediction && newSession) {
        const lp = stats.last_prediction;
        const actual = newSession.ket_qua || '';
        if (actual && lp.phien === newSession.phien) { // so sánh phiên dự đoán với phiên thực
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
                let wrongStreak = 0;
                for (let i = stats.history.length - 1; i >= 0; i--) {
                    if (!stats.history[i].correct) wrongStreak++;
                    else break;
                }
                if (wrongStreak > stats.worst_streak) stats.worst_streak = wrongStreak;
            }

            predictor.updateStatus(actual);

            const historyEntry = {
                phien: newSession.phien,
                prediction: lp.prediction,
                actual: actual,
                confidence: lp.confidence,
                pattern: lp.pattern || 'Unknown',
                correct: ok,
                timestamp: vnNow()
            };
            stats.history.push(historyEntry);
            if (stats.history.length > 500) stats.history = stats.history.slice(-500);

            updateDetailedStats(lp.prediction, actual, lp.pattern || 'Unknown', lp.confidence, ok);

            const acc = ((stats.correct / Math.max(stats.total, 1)) * 100).toFixed(1);
            console.log(`🔍 VERIFY #${newSession.phien}: ${ok ? '✅ ĐÚNG' : '❌ SAI'} | Tỷ lệ: ${acc}% (${stats.correct}/${stats.total}) | Streak: ${stats.current_streak}`);

            stats.last_prediction = null; // reset để dự đoán tiếp
            saveStatsFile();
        }
    }
}

function autoPredict(history) {
    if (!stats.prediction_started) {
        if (history.length >= MIN_DATA_FOR_PREDICTION) {
            stats.prediction_started = true;
            console.log(`\n🎉 ĐÃ ĐỦ ${MIN_DATA_FOR_PREDICTION} PHIÊN DỮ LIỆU! BẮT ĐẦU DỰ ĐOÁN...\n`);
        } else {
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
        } catch (e) {
            console.error(`Lỗi dự đoán: ${e.message}`);
        }
    }
}

// Hàm xử lý khi có phiên mới từ WebSocket
function onNewSession(sessionData) {
    // Thêm vào globalHistory
    const exists = globalHistory.some(h => h.phien === sessionData.phien);
    if (!exists) {
        globalHistory.push(sessionData);
        globalHistory.sort((a, b) => a.phien - b.phien);
        if (globalHistory.length > MAX_STORAGE) {
            globalHistory = globalHistory.slice(-MAX_STORAGE);
        }
        saveHistory(globalHistory);
        console.log(`🎲 KQ #${sessionData.phien}: ${sessionData.ket_qua} | [${sessionData.xuc_xac_1},${sessionData.xuc_xac_2},${sessionData.xuc_xac_3}] = ${sessionData.tong}`);
        
        autoVerify(globalHistory, sessionData);
        autoPredict(globalHistory);
    }
}

// ============================================================
// WebSocket Client (kết nối Sun.Win)
// ============================================================
let wsClient = null;
let reconnectTimeout = null;

function connectSunWinWS() {
    // Load token từ file token.txt (giống Python)
    let TOKEN_DATA = null;
    try {
        const raw = fs.readFileSync('token.txt', 'utf-8').trim();
        // Parse token info từ file (đơn giản tìm JSON chứa ipAddress)
        const match = raw.match(/\{[^{}]*"ipAddress"[^{}]*\}/);
        if (match) {
            TOKEN_DATA = JSON.parse(match[0]);
            console.log("[✅] Đã load token từ token.txt");
        }
    } catch (e) {
        console.log("[⚠️] Không tìm thấy token.txt hoặc lỗi parse, dùng token mặc định.");
    }

    const defaultToken = {
        ipAddress: "2405:4802:4e42:4170:7104:b646:6789:8648",
        wsToken: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJsb2xtYW1heXN1MTIiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMzkxMDEyNTEsImFmZklkIjoiR0VNV0lOIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJnZW0iLCJlbWFpbCI6IiIsInRpbWVzdGFtcCI6MTc3NDEzODE3NzIwNCwibG9ja0dhbWVzIjpbXSwiYW1vdW50IjowLCJsb2NrQ2hhdCI6ZmFsc2UsInBob25lVmVyaWZpZWQiOmZhbHNlLCJpcEFkZHJlc3MiOiIyNDA1OjQ4MDI6NGU0Mjo0MTcwOjcxMDQ6YjY0Njo2Nzg5Ojg2NDgiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzA5LnBuZyIsInBsYXRmb3JtSWQiOjQsInVzZXJJZCI6ImEyOGEwZjA2LWU4OGYtNDRiNy1hMjY4LTVmNmRhZDk0OWZiZiIsImVtYWlsVmVyaWZpZWQiOm51bGwsInJlZ1RpbWUiOjE3NzMxMDY2NDkxOTksInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiR01fcXVhcG90anoifQ.3ycgvK1-PwRpBqANZJ3li00kpuzV6Ike6ZjYPthf3X0",
        username: "GM_quapotjz",
        userId: "a28a0f06-e88f-44b7-a268-5f6dad949fbf",
        timestamp: 1774138177205,
        refreshToken: "950f5b9974dd4f4c982a3681af9acbc7.f0d252e72ee64f07bd5819d6ca54bba1"
    };
    if (!TOKEN_DATA) TOKEN_DATA = defaultToken;

    const wsUrl = `wss://websocket.azhkthg1.net/websocket?token=${TOKEN_DATA.wsToken}`;
    console.log(`🔌 Kết nối WebSocket: ${wsUrl}`);

    wsClient = new WebSocket(wsUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Origin": "https://play.sun.pw"
        }
    });

    wsClient.on('open', () => {
        console.log("[✅] WebSocket connected to Sun.Win");
        // Gửi initial messages
        const initialMsgs = [
            [1, "MiniGame", TOKEN_DATA.username, "quapit", {
                signature: "05915B436159B8F4E4DFF537639BD014D54EBEFA18CF62A8EB205B4074010AD72AEA9A780D5A8A4E1BD59BBBAFE03902C594B5DA56FD60D099F1FDDCCD48385FCC2760B5B0B4B8E75D39B8E40DF8CB7C01EA58DBEDA32805927473AB71FA9B798B0C2EDC445C3E36E47EF0AAFAD45601D99AAD1EC642FD2B63573A0401D6EC69",
                expireIn: TOKEN_DATA.timestamp,
                wsToken: TOKEN_DATA.wsToken,
                accessToken: "7e9a9ecbff1b4a6393b48346f6d8b709",
                message: "Thành công",
                refreshToken: TOKEN_DATA.refreshToken,
                info: TOKEN_DATA
            }],
            [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
            [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
        ];
        initialMsgs.forEach((msg, i) => {
            setTimeout(() => wsClient.send(JSON.stringify(msg)), i * 600);
        });
    });

    wsClient.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (!Array.isArray(msg) || msg.length < 2) return;
            const body = msg[1];
            if (typeof body === 'object' && body.cmd === 1003 && body.gBB) {
                const d1 = body.d1, d2 = body.d2, d3 = body.d3;
                if (d1 === undefined || d2 === undefined || d3 === undefined) return;
                const total = d1 + d2 + d3;
                const result = total > 10 ? "Tài" : "Xỉu";
                const sessionId = body.sid || null;
                const newSession = {
                    phien: sessionId || (globalHistory.length > 0 ? globalHistory[globalHistory.length-1].phien + 1 : 1),
                    xuc_xac_1: d1,
                    xuc_xac_2: d2,
                    xuc_xac_3: d3,
                    tong: total,
                    ket_qua: result,
                    thoi_gian: vnNow()
                };
                current_result = newSession;
                console.log(`[🎲] Phiên ${newSession.phien}: ${d1}-${d2}-${d3} = ${total} (${result}) - ${newSession.thoi_gian}`);
                onNewSession(newSession);
            } else if (body && body.cmd === 1008 && body.sid) {
                // Phiên mới bắt đầu, lưu session id nếu cần
                // (có thể dùng để gán phien sau này)
            }
        } catch (e) {
            console.error("Lỗi xử lý WS message:", e);
        }
    });

    wsClient.on('close', () => {
        console.log("[⚠️] WebSocket disconnected. Reconnecting in 2.5s...");
        reconnectTimeout = setTimeout(connectSunWinWS, 2500);
    });

    wsClient.on('error', (err) => {
        console.error("[❌] WebSocket error:", err.message);
    });
}

// ============================================================
// Express Server & API Endpoints
// ============================================================
const app = express();
app.use(express.json());

// CORS đơn giản
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.get('/', (req, res) => {
    res.json({
        name: "Sun.Win Tài Xỉu Collector & Predictor Server",
        version: "1.0.0",
        endpoints: {
            "/api/tx": "Kết quả mới nhất",
            "/api/dudoan": "Dự đoán tiếp theo",
            "/api/lichsu": "Lịch sử dự đoán gần đây",
            "/api/thongke": "Thống kê tổng hợp",
            "/api/stats": "Thống kê chi tiết"
        },
        thoi_gian: vnNow()
    });
});

app.get('/api/tx', (req, res) => {
    res.json(current_result);
});

app.get('/api/dudoan', (req, res) => {
    if (globalHistory.length < 5) {
        return res.status(400).json({ error: "Chưa đủ dữ liệu (cần ít nhất 5 phiên)", count: globalHistory.length });
    }
    try {
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
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/lichsu', (req, res) => {
    const recent = detailedStats.recentHistory.slice(-50).reverse(); // 50 gần nhất
    res.json({
        total_predictions: detailedStats.recentHistory.length,
        history: recent,
        summary: detailedStats.summary
    });
});

app.get('/api/thongke', (req, res) => {
    res.json({
        total_predictions: stats.total,
        correct: stats.correct,
        wrong: stats.wrong,
        accuracy: stats.total > 0 ? (stats.correct / stats.total * 100).toFixed(2) + '%' : '0%',
        current_streak: stats.current_streak,
        best_streak: stats.best_streak,
        worst_streak: stats.worst_streak,
        total_predictions_made: stats.total_predictions_made,
        prediction_started: stats.prediction_started,
        last_updated: vnNow()
    });
});

app.get('/api/stats', (req, res) => {
    res.json({
        summary: detailedStats.summary,
        byPattern: detailedStats.byPattern,
        byConfidence: detailedStats.byConfidence,
        byPrediction: detailedStats.byPrediction,
        last_updated: vnNow()
    });
});

// ============================================================
// Console Readline Interface (giữ nguyên các lệnh)
// ============================================================
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
});

function showPredictionCLI() {
    console.log('\n🎯 === DỰ ĐOÁN TIẾP THEO ===');
    if (globalHistory.length < 5) {
        console.log('❌ Chưa đủ dữ liệu (cần ít nhất 5 phiên)');
        return;
    }
    try {
        const r = predictor.predict(globalHistory);
        const cur = globalHistory[globalHistory.length - 1];
        let ph = cur.phien || 0;
        if (typeof ph === 'string') ph = parseInt(ph.replace('#', '')) || 0;
        const nextPhien = ph + 1;
        console.log(`📋 DỰA TRÊN ${globalHistory.length} PHIÊN GẦN NHẤT:`);
        console.log(`\n🔮 DỰ ĐOÁN PHIÊN #${nextPhien}:`);
        console.log(`   🎯 Kết quả: ${r.pred}`);
        console.log(`   📊 Độ tin cậy: ${r.conf}%`);
        console.log(`   📌 Loại cầu: ${r.type}`);
        console.log(`   💬 Lý do: ${r.reason}`);
        // in 10 phiên gần nhất như cũ
    } catch (e) {
        console.error(`❌ Lỗi: ${e.message}`);
    }
}

function showHistoryCLI() {
    console.log('\n📜 === LỊCH SỬ DỰ ĐOÁN ===');
    const hist = detailedStats.recentHistory.slice(-20).reverse();
    console.table(hist.map(h => ({
        Phien: h.phien,
        'Dự đoán': h.prediction,
        'Thực tế': h.actual,
        'Loại cầu': h.pattern,
        'Kết quả': h.correct ? 'Đúng' : 'Sai',
        'Độ tin cậy': h.confidence + '%'
    })));
    console.log(`Tỷ lệ đúng: ${detailedStats.summary.accuracy.toFixed(2)}%`);
}

function printDetailedStatsCLI() {
    console.log('\n📊 === THỐNG KÊ CHI TIẾT ===');
    console.log(`Tổng dự đoán: ${stats.total} | Đúng: ${stats.correct} | Sai: ${stats.wrong}`);
    console.log(`Chuỗi đúng hiện tại: ${stats.current_streak} | Tốt nhất: ${stats.best_streak} | Tệ nhất: ${stats.worst_streak}`);
}

// Gắn lệnh console
console.log('\n💡 Gõ /dudoan, /lichsu, /stats, /help, /thoat');
rl.on('line', (input) => {
    const cmd = input.trim().toLowerCase();
    switch (cmd) {
        case '/dudoan': showPredictionCLI(); break;
        case '/lichsu': showHistoryCLI(); break;
        case '/stats': printDetailedStatsCLI(); break;
        case '/help':
            console.log('/dudoan, /lichsu, /stats, /thoat');
            break;
        case '/thoat':
            console.log('🛑 Đang thoát...');
            saveStatsFile();
            saveDetailedStats();
            rl.close();
            process.exit(0);
            break;
        default: if (cmd && !cmd.startsWith('/')) console.log('Lệnh không hợp lệ');
    }
});

// ============================================================
// Khởi động hệ thống
// ============================================================
function init() {
    // Tải dữ liệu cũ
    globalHistory = loadHistory();
    detailedStats = loadDetailedStats();
    if (fs.existsSync(STATS_FILE)) {
        try {
            const savedStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
            stats = { ...stats, ...savedStats };
        } catch (e) {}
    }
    console.log(`📚 Đã tải ${globalHistory.length} phiên dữ liệu`);
    if (stats.prediction_started) {
        console.log(`📈 Đã dự đoán ${stats.total_predictions_made}/${MAX_PREDICTIONS} phiên`);
        console.log(`📊 Tỷ lệ đúng: ${(stats.correct/Math.max(stats.total,1)*100).toFixed(1)}%`);
    }

    // Khởi động WebSocket client
    connectSunWinWS();

    // Khởi động Express server
    app.listen(PORT, () => {
        console.log(`🌐 Server API đang chạy tại http://localhost:${PORT}`);
    });

    // Fallback: Nếu WebSocket không có dữ liệu sau 30s, có thể báo lỗi (tùy chọn)
}

init();