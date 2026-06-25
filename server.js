// server_vip.js
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const WebSocket = require('ws');
const express = require('express');

// ============================================================================
// 1. CẤU HÌNH HỆ THỐNG & TOKEN TỪ RAW DATA CỦA BẠN
// ============================================================================
const PORT = process.env.PORT || 1234;

const TOKEN_DATA = {
    ipAddress: "1.55.124.245",
    wsToken: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0",
    locale: "vi",
    userId: "a28a0f06-e88f-44b7-a268-5f6dad949fbf",
    username: "GM_quapotjz",
    timestamp: 1780029354479,
    refreshToken: "26b930ec6dc04d7db5c2b362a1baac87.7549ba6185d4467380ee447589380061"
};

// Signature lấy từ raw
const SIGNATURE = "05915B436159B8F4E4DFF537639BD014D54EBEFA18CF62A8EB205B4074010AD72AEA9A780D5A8A4E1BD59BBBAFE03902C594B5DA56FD60D099F1FDDCCD48385FCC2760B5B0B4B8E75D39B8E40DF8CB7C01EA58DBEDA32805927473AB71FA9B798B0C2EDC445C3E36E47EF0AAFAD45601D99AAD1EC642FD2B63573A0401D6EC69";
const ACCESS_TOKEN = "7e9a9ecbff1b4a6393b48346f6d8b709";

const DATA_FILE = "collected_data/sunwin_tx.json";
const STATS_FILE = "database/stats.json";
const DETAILED_STATS_FILE = "database/detailed_stats.json";

const MIN_DATA_FOR_PREDICTION = 10;
const MAX_PREDICTIONS = 100000;
const MAX_STORAGE = 1000000;

// ============================================================================
// 2. BIẾN TOÀN CỤC & UTILS
// ============================================================================
let current_result = {
    phien: null, xuc_xac_1: null, xuc_xac_2: null, xuc_xac_3: null, tong: null, ket_qua: "", thoi_gian: ""
};
let current_session_id = null;
let wsConnection = null;
let globalHistory = [];

const vnNow = () => new Date(new Date().getTime() + (7 * 60 * 60 * 1000)).toISOString();

// Định dạng thời gian cho API như bản Python cũ
const getVietnamTimeStr = () => {
    const d = new Date(new Date().getTime() + (7 * 60 * 60 * 1000));
    return d.toISOString().replace(/T/, ' ').replace(/\..+/, '') + " UTC+7";
};

const safeInt = (v, d = 0) => {
    const parsed = parseInt(v);
    return isNaN(parsed) ? d : parsed;
};

// ============================================================================
// 3. LOGIC PREDICTOR & THỐNG KÊ CHI TIẾT (TX_LogicPen_V4)
// ============================================================================
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
    summary: { totalPredictions: 0, totalCorrect: 0, totalWrong: 0, accuracy: 0, bestStreak: 0, worstStreak: 0, currentStreak: 0, lastUpdated: null }
};

let stats = {
    total: 0, correct: 0, wrong: 0, last_prediction: null, start_time: vnNow(), history: [], total_predictions_made: 0, prediction_started: false, current_streak: 0, best_streak: 0, worst_streak: 0
};

class TX_LogicPen_V4 {
    constructor() { this.error_streak = 0; this.last_prediction = null; this.history = []; this.last_pattern = null; }
    loadData(data) { this.history = [...data].sort((a, b) => (b.phien || 0) - (a.phien || 0)); }
    _arr() { return this.history.map(s => (s.ket_qua || '').toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI')); }
    _points() { return this.history.filter(s => s.tong !== undefined && s.tong !== null).map(s => s.tong); }

    cauSap(arr) {
        if (arr.length < 2) return null;
        let length = 1;
        for (let i = 1; i < arr.length; i++) {
            if (arr[i] === arr[0]) length++;
            else break;
        }
        if (length >= 2 && length <= 5) return { pred: arr[0], conf: 72, type: "Đu Bệt", reason: `Bệt ${length} phiên` };
        if (length >= 6) return { pred: arr[0] === "TAI" ? "XIU" : "TAI", conf: 80, type: "Bẻ Bệt Rồng", reason: `Bệt dài ${length} → hồi` };
        return null;
    }
    cauNoi(arr) {
        if (arr.length < 5) return null;
        for (let i = 0; i < 4; i++) if (arr[i] === arr[i + 1]) return null;
        return { pred: arr[0] === "TAI" ? "XIU" : "TAI", conf: 82, type: "Cầu Nối 1-1", reason: "Nhịp 1-1 ổn định" };
    }
    cauDoi(arr) {
        if (arr.length < 4) return null;
        if (arr[0] === arr[1] && arr[2] === arr[3] && arr[0] !== arr[2]) return { pred: arr[2], conf: 78, type: "Cầu 2-2", reason: "AABB → B" };
        if (arr.length >= 6 && arr[0] === arr[1] && arr[1] === arr[2] && arr[3] === arr[4] && arr[4] === arr[5] && arr[0] !== arr[3])
            return { pred: arr[3], conf: 80, type: "Cầu 3-3", reason: "AAABBB → B" };
        return null;
    }
    cauGay(arr) {
        if (arr.length >= 5 && arr[0] === arr[1] && arr[1] === arr[2] && arr[2] !== arr[3] && arr[3] === arr[4]) return { pred: arr[3], conf: 74, type: "Gãy 3-2", reason: "AAABB → B" };
        if (arr.length >= 5 && arr[0] === arr[1] && arr[1] !== arr[2] && arr[2] === arr[3] && arr[3] === arr[4]) return { pred: arr[2], conf: 74, type: "Gãy 2-3", reason: "AABBB → B" };
        if (arr.length >= 4 && arr[0] !== arr[1] && arr[1] === arr[2] && arr[2] !== arr[3] && arr[0] === arr[3]) return { pred: arr[1], conf: 72, type: "Gãy 1-2-1", reason: "ABBA → B" };
        return null;
    }
    phatHienMauLap(arr) {
        if (arr.length < 6) return null;
        for (let len = 2; len <= 4; len++) {
            let pattern = arr.slice(0, len);
            for (let i = len; i < arr.length - len; i++) {
                let sub = arr.slice(i, i + len);
                if (JSON.stringify(sub) === JSON.stringify(pattern) && arr[i - 1]) return { pred: arr[i - 1], conf: 88, type: "Mẫu Lặp", reason: `Mẫu "${pattern.join(',')}"` };
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
        const result = this.phatHienMauLap(arr) || this.cauNoi(arr) || this.cauDoi(arr) || this.cauGay(arr) || this.cauSap(arr) || this.duDoanVi() || { pred: arr[0], conf: 55, type: "Theo", reason: "Bám phiên cuối" };
        if (result) this.last_pattern = result.type;
        return result;
    }
    apDungDaoChieu(p) {
        if (!p || this.history.length < 1) return p;
        const currentResult = this._arr()[0];
        if (this.error_streak >= 2 && this.last_prediction && this.last_prediction !== currentResult) {
            return { ...p, pred: p.pred === "TAI" ? "XIU" : "TAI", conf: Math.min(88, p.conf + 10), reason: `🔄 Đảo: ${p.reason}` };
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

// ============================================================================
// 4. QUẢN LÝ DỮ LIỆU FILE HỆ THỐNG
// ============================================================================
function loadHistory() {
    try {
        if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')).history || [];
    } catch (e) { console.error(`Lỗi đọc file: ${e.message}`); }
    return [];
}

function loadDetailedStats() {
    try {
        if (fs.existsSync(DETAILED_STATS_FILE)) return JSON.parse(fs.readFileSync(DETAILED_STATS_FILE, 'utf-8'));
    } catch (e) { console.error(`Lỗi đọc file thống kê chi tiết: ${e.message}`); }
    return detailedStats;
}

function saveDetailedStats() {
    const dir = path.dirname(DETAILED_STATS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    detailedStats.summary = {
        totalPredictions: stats.total, totalCorrect: stats.correct, totalWrong: stats.wrong,
        accuracy: stats.total > 0 ? (stats.correct / stats.total * 100) : 0,
        bestStreak: stats.best_streak, worstStreak: stats.worst_streak, currentStreak: stats.current_streak, lastUpdated: vnNow()
    };
    fs.writeFileSync(DETAILED_STATS_FILE, JSON.stringify(detailedStats, null, 2));
}

function saveHistory(history) {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ 
        history: history, total_sessions: history.length, max_storage: MAX_STORAGE, last_updated: vnNow()
    }, null, 2));
}

function saveStatsFile() {
    const dir = path.dirname(STATS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify({
        ...stats, max_predictions: MAX_PREDICTIONS, min_data_required: MIN_DATA_FOR_PREDICTION,
        max_storage: MAX_STORAGE, last_updated: vnNow()
    }, null, 2));
}

function updateDetailedStats(prediction, actual, pattern, confidence, correct) {
    if (pattern && detailedStats.byPattern[pattern]) {
        detailedStats.byPattern[pattern].total++;
        if (correct) detailedStats.byPattern[pattern].correct++; else detailedStats.byPattern[pattern].wrong++;
    }
    let confRange = confidence > 90 ? '91-100' : confidence > 80 ? '81-90' : confidence > 70 ? '71-80' : confidence > 60 ? '61-70' : confidence > 50 ? '51-60' : '0-50';
    if (detailedStats.byConfidence[confRange]) {
        detailedStats.byConfidence[confRange].total++;
        if (correct) detailedStats.byConfidence[confRange].correct++; else detailedStats.byConfidence[confRange].wrong++;
    }
    const predKey = prediction.toUpperCase();
    if (detailedStats.byPrediction[predKey]) {
        detailedStats.byPrediction[predKey].total++;
        if (correct) detailedStats.byPrediction[predKey].correct++; else detailedStats.byPrediction[predKey].wrong++;
    }

    detailedStats.recentHistory.push({
        phien: stats.last_prediction?.phien || 0, prediction, actual, pattern, confidence, correct, timestamp: vnNow()
    });
    if (detailedStats.recentHistory.length > 1000) detailedStats.recentHistory = detailedStats.recentHistory.slice(-1000);
    saveDetailedStats();
}

// ============================================================================
// 5. TỰ ĐỘNG XÁC MINH & DỰ ĐOÁN
// ============================================================================
function autoVerify(history) {
    if (stats.last_prediction && history.length > 0) {
        const lp = stats.last_prediction;
        const latest = history[history.length - 1];
        
        if (latest.phien === lp.phien) {
            const actual = latest.ket_qua || '';
            if (actual) {
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
                stats.history.push({ phien: latest.phien, prediction: lp.prediction, actual, confidence: lp.confidence, pattern: lp.pattern || 'Unknown', correct: ok, timestamp: vnNow() });
                if (stats.history.length > 500) stats.history = stats.history.slice(-500);
                
                updateDetailedStats(lp.prediction, actual, lp.pattern || 'Unknown', lp.confidence, ok);
                
                const acc = ((stats.correct / Math.max(stats.total, 1)) * 100).toFixed(1);
                console.log(`🔍 VERIFY #${latest.phien}: ${ok ? '✅ ĐÚNG' : '❌ SAI'} | Tỷ lệ: ${acc}% (${stats.correct}/${stats.total}) | Streak: ${stats.current_streak}`);
                
                stats.last_prediction = null;
                saveStatsFile();
            }
        }
    }
}

function autoPredict(history) {
    if (!stats.prediction_started) {
        if (history.length >= MIN_DATA_FOR_PREDICTION) {
            stats.prediction_started = true;
            console.log(`\n🎉 ĐÃ ĐỦ ${MIN_DATA_FOR_PREDICTION} PHIÊN DỮ LIỆU! BẮT ĐẦU DỰ ĐOÁN...\n`);
        } else return;
    }
    
    if (stats.total_predictions_made >= MAX_PREDICTIONS) return;
    
    if (history.length >= 5) {
        try {
            const r = predictor.predict(history);
            const cur = history[history.length - 1];
            let ph = safeInt(String(cur.phien).replace('#', ''));
            const nextPhien = ph + 1;
            
            stats.last_prediction = { phien: nextPhien, prediction: r.pred, confidence: r.conf, pattern: r.type };
            stats.total_predictions_made++;
            
            console.log(`🎯 DỰ ĐOÁN #${nextPhien}: ${r.pred} | Độ tin cậy: ${r.conf}% | ${r.type} | Còn: ${MAX_PREDICTIONS - stats.total_predictions_made}/${MAX_PREDICTIONS}`);
            saveStatsFile();
        } catch (e) { console.error(`Lỗi dự đoán: ${e.message}`); }
    }
}

function processNewGameData(item) {
    const ph = safeInt(item.phien);
    if (ph <= 0) return;
    
    let existing = new Set(globalHistory.map(h => h.phien));
    if (existing.has(ph)) return; // Bỏ qua nếu phiên đã có

    const newItem = {
        phien: ph,
        ket_qua: String(item.ket_qua).toUpperCase().replace('XỈU', 'XIU').replace('TÀI', 'TAI'),
        tong: safeInt(item.tong),
        xuc_xac_1: safeInt(item.xuc_xac_1),
        xuc_xac_2: safeInt(item.xuc_xac_2),
        xuc_xac_3: safeInt(item.xuc_xac_3)
    };

    globalHistory.push(newItem);
    globalHistory.sort((a, b) => a.phien - b.phien);
    
    if (globalHistory.length > MAX_STORAGE) globalHistory = globalHistory.slice(-MAX_STORAGE);
    
    saveHistory(globalHistory);
    
    const latest = globalHistory[globalHistory.length - 1];
    console.log(`🎲 KQ #${latest.phien}: ${latest.ket_qua} | [${latest.xuc_xac_1},${latest.xuc_xac_2},${latest.xuc_xac_3}] = ${latest.tong} | Dữ liệu: ${globalHistory.length}/${MIN_DATA_FOR_PREDICTION}`);
    
    autoVerify(globalHistory);
    autoPredict(globalHistory);
}

// ============================================================================
// 6. GIAO DIỆN EXPRESS SERVER (Thay thế Flask)
// ============================================================================
const app = express();
// Middleware CORS cơ bản
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.get('/api/tx', (req, res) => res.json(current_result));
app.get('/', (req, res) => {
    res.json({
        "name": "Sun.Win VIP Data Stream & Predictor",
        "version": "2.0 (All in One)",
        "endpoints": { "/api/tx": "Lấy kết quả tài xỉu mới nhất" },
        "thoi_gian": getVietnamTimeStr(),
        "current_user": TOKEN_DATA.username || "Unknown"
    });
});
app.use((req, res) => res.status(404).json({ error: "Endpoint không tồn tại. Chỉ có /api/tx" }));

// ============================================================================
// 7. WEBSOCKET CLIENT (Kết nối nhận dữ liệu)
// ============================================================================
function connectWebSocket() {
    console.log("[🔄] Đang kết nối WebSocket tới Sun.Win...");
    const wsUrl = `wss://websocket.azhkthg1.net/websocket?token=${TOKEN_DATA.wsToken}`;
    
    wsConnection = new WebSocket(wsUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Origin": "https://play.sun.pw"
        }
    });

    wsConnection.on('open', () => {
        console.log("[✅] WebSocket connected to Sun.Win");
        
        const initial_messages = [
            [1, "MiniGame", TOKEN_DATA.username, "quapit", {
                signature: SIGNATURE,
                expireIn: TOKEN_DATA.timestamp,
                wsToken: TOKEN_DATA.wsToken,
                accessToken: ACCESS_TOKEN,
                message: "Thành công",
                refreshToken: TOKEN_DATA.refreshToken,
                info: TOKEN_DATA
            }],
            [6, "MiniGame", "taixiuPlugin", {"cmd": 1005}],
            [6, "MiniGame", "lobbyPlugin", {"cmd": 10001}]
        ];

        initial_messages.forEach((msg, i) => {
            setTimeout(() => {
                if (wsConnection.readyState === WebSocket.OPEN) wsConnection.send(JSON.stringify(msg));
            }, i * 600);
        });
    });

    wsConnection.on('message', (data) => {
        try {
            const parsed = JSON.parse(data);
            if (!Array.isArray(parsed) || parsed.length < 2) return;
            
            const cmdData = parsed[1];
            if (typeof cmdData === 'object') {
                const { cmd, sid, d1, d2, d3, gBB } = cmdData;

                if (cmd === 1008 && sid) {
                    current_session_id = sid;
                }

                if (cmd === 1003 && gBB) {
                    if (d1 === undefined || d2 === undefined || d3 === undefined) return;
                    
                    const total = d1 + d2 + d3;
                    const resultStr = total > 10 ? "Tài" : "Xỉu";
                    
                    current_result = {
                        phien: current_session_id || (globalHistory.length > 0 ? globalHistory[globalHistory.length-1].phien + 1 : 0),
                        xuc_xac_1: d1,
                        xuc_xac_2: d2,
                        xuc_xac_3: d3,
                        tong: total,
                        ket_qua: resultStr,
                        thoi_gian: getVietnamTimeStr()
                    };
                    
                    processNewGameData(current_result);
                    current_session_id = null;
                }
            }
        } catch (e) {
            // Lờ đi các message rác không phải JSON
        }
    });

    wsConnection.on('close', () => {
        console.log("[❌] WebSocket đóng, kết nối lại sau 2.5s...");
        setTimeout(connectWebSocket, 2500);
    });
    
    wsConnection.on('error', (err) => {
        console.log("[❌] Lỗi WebSocket: ", err.message);
    });
}

// ============================================================================
// 8. TÍNH NĂNG CLI & LỆNH CONSOLE
// ============================================================================
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

function showPrediction() {
    console.log('\n🎯 === DỰ ĐOÁN TIẾP THEO ===');
    if (!globalHistory || globalHistory.length < 5) return console.log('❌ Chưa đủ dữ liệu để dự đoán (cần ít nhất 5 phiên)');
    try {
        const r = predictor.predict(globalHistory);
        const cur = globalHistory[globalHistory.length - 1];
        const nextPhien = safeInt(String(cur.phien).replace('#', '')) + 1;
        console.log(`🔮 DỰ ĐOÁN PHIÊN #${nextPhien}:\n   🎯 Kết quả: ${r.pred}\n   📊 Độ tin cậy: ${r.conf}%\n   📌 Loại cầu: ${r.type}\n   💬 Lý do: ${r.reason}`);
    } catch (e) { console.error(`❌ Lỗi dự đoán: ${e.message}`); }
}

function showHistory() {
    console.log('\n📜 === LỊCH SỬ DỰ ĐOÁN ===');
    if (!detailedStats.recentHistory || detailedStats.recentHistory.length === 0) return console.log('❌ Chưa có lịch sử dự đoán nào');
    console.log(`📊 Tổng dự đoán: ${detailedStats.recentHistory.length} | 📈 Tỷ lệ đúng: ${((stats.correct/Math.max(stats.total,1))*100).toFixed(2)}%`);
    console.log('   ┌──────────┬────────────┬────────────┬──────────────────┬──────────┬────────────┐');
    console.log('   │ Phiên    │ Dự đoán    │ Thực tế    │ Loại cầu         │ Kết quả  │ Độ tin cậy │');
    console.log('   ├──────────┼────────────┼────────────┼──────────────────┼──────────┼────────────┤');
    detailedStats.recentHistory.slice(-10).reverse().forEach(item => {
        console.log(`   │ ${String(item.phien).padStart(8)} │ ${(item.prediction || '').padEnd(10)} │ ${(item.actual || '').padEnd(10)} │ ${(item.pattern || '').padEnd(16)} │ ${(item.correct ? '✅ ĐÚNG' : '❌ SAI').padEnd(8)} │ ${String(item.confidence || 0).padEnd(10)}% │`);
    });
    console.log('   └──────────┴────────────┴────────────┴──────────────────┴──────────┴────────────┘');
}

function setupCommandHandler() {
    console.log('\n💡 Gõ /dudoan để xem dự đoán');
    console.log('💡 Gõ /lichsu để xem lịch sử');
    console.log('💡 Gõ /help để xem hướng dẫn');
    console.log('💡 Gõ /thoat để tắt\n');

    rl.on('line', (input) => {
        const cmd = input.trim().toLowerCase();
        if (cmd === '/dudoan' || cmd === '/du doan') showPrediction();
        else if (cmd === '/lichsu' || cmd === '/lich su') showHistory();
        else if (cmd === '/help' || cmd === '/h') console.log('Lệnh: /dudoan, /lichsu, /thoat');
        else if (cmd === '/thoat' || cmd === '/exit') {
            console.log('\n🛑 Đang dừng chương trình...');
            saveStatsFile(); saveDetailedStats();
            process.exit(0);
        }
    });
}

// ============================================================================
// 9. KHỞI ĐỘNG HỆ THỐNG
// ============================================================================
async function startSystem() {
    console.log("===========================================================");
    console.log("🚀 SUNWIN VIP TX SYSTEM - ALL-IN-ONE KHỞI ĐỘNG");
    console.log(`👤 User: ${TOKEN_DATA.username} | 🌐 IP: ${TOKEN_DATA.ipAddress}`);
    console.log("===========================================================\n");

    // Khôi phục Database
    globalHistory = loadHistory();
    detailedStats = loadDetailedStats();
    try {
        if (fs.existsSync(STATS_FILE)) stats = { ...stats, ...JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')) };
    } catch (e) {}

    console.log(`📚 Đã tải ${globalHistory.length.toLocaleString()} phiên dữ liệu hiện có.`);
    if (stats.prediction_started) {
        console.log(`📈 Đã dự đoán ${stats.total_predictions_made.toLocaleString()} phiên | Tỷ lệ đúng: ${((stats.correct/Math.max(stats.total,1))*100).toFixed(1)}%\n`);
    }

    // Khởi động Express Server
    app.listen(PORT, () => console.log(`[🌐] Express API Server đang chạy tại: http://localhost:${PORT}`));

    // Kết nối Websocket
    connectWebSocket();

    // Bật giao diện console
    setupCommandHandler();
}

// Bắt các tín hiệu tắt để lưu db an toàn
process.on('SIGINT', () => { console.log("\n🛑 Đang dừng..."); saveStatsFile(); saveDetailedStats(); process.exit(); });
process.on('SIGTERM', () => { console.log("\n🛑 Đang dừng..."); saveStatsFile(); saveDetailedStats(); process.exit(); });
process.on('unhandledRejection', (error) => console.error('❌ Unhandled Rejection:', error));

// Chạy hệ thống
startSystem();
