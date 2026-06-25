const fs = require('fs');
const path = require('path');
const readline = require('readline');
const WebSocket = require('ws');
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 1234;

const TOKEN_FILE = 'token.txt';
const DATA_FILE = 'collected_data/sunwin_tx.json';
const STATS_FILE = 'database/stats.json';
const DETAILED_STATS_FILE = 'database/detailed_stats.json';

const MIN_DATA_FOR_PREDICTION = 10;
const MAX_PREDICTIONS = 100000;
const MAX_STORAGE = 1000000;
const CHECK_INTERVAL = 5000;

let globalHistory = [];
let wsConnection = null;
let currentResult = {
    phien: null,
    xuc_xac_1: null,
    xuc_xac_2: null,
    xuc_xac_3: null,
    tong: null,
    ket_qua: '',
    thoi_gian: ''
};
let currentSessionId = null;
let reconnectDelay = 2500;

function vnNow() {
    const d = new Date();
    return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString();
}

function loadToken() {
    try {
        const raw = fs.readFileSync(TOKEN_FILE, 'utf-8');
        let match = raw.match(/"info"\x07([^"]+?)"?/);
        if (match) {
            let infoStr = match[1].replace(/[\x04\x05\x06\x07]/g, '');
            return JSON.parse(infoStr);
        }
        match = raw.match(/\{[^{}]*"ipAddress"[^{}]*\}/);
        if (match) return JSON.parse(match[0]);
        return null;
    } catch (e) {
        console.error('[❌] Lỗi đọc token:', e.message);
        return null;
    }
}

const TOKEN = loadToken();
if (!TOKEN) {
    console.error('[❌] Không load được token, thoát.');
    process.exit(1);
}

const WS_URL = `wss://websocket.azhkthg1.net/websocket?token=${TOKEN.wsToken}`;
const WS_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Origin': 'https://play.sun.pw'
};

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

// ===================== TX_LogicPen_V4 (full từ sunphhuy.js) =====================
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
            return { pred: arr[0], conf: 72, type: 'Đu Bệt', reason: `Bệt ${length} phiên` };
        }
        if (length >= 6) {
            return { pred: arr[0] === 'TAI' ? 'XIU' : 'TAI', conf: 80, type: 'Bẻ Bệt Rồng', reason: `Bệt dài ${length} → hồi` };
        }
        return null;
    }

    cauNoi(arr) {
        if (arr.length < 5) return null;
        for (let i = 0; i < 4; i++) {
            if (arr[i] === arr[i + 1]) return null;
        }
        return { pred: arr[0] === 'TAI' ? 'XIU' : 'TAI', conf: 82, type: 'Cầu Nối 1-1', reason: 'Nhịp 1-1 ổn định' };
    }

    cauDoi(arr) {
        if (arr.length < 4) return null;
        if (arr[0] === arr[1] && arr[2] === arr[3] && arr[0] !== arr[2]) {
            return { pred: arr[2], conf: 78, type: 'Cầu 2-2', reason: 'AABB → B' };
        }
        if (arr.length >= 6 && arr[0] === arr[1] && arr[1] === arr[2] &&
            arr[3] === arr[4] && arr[4] === arr[5] && arr[0] !== arr[3]) {
            return { pred: arr[3], conf: 80, type: 'Cầu 3-3', reason: 'AAABBB → B' };
        }
        return null;
    }

    cauGay(arr) {
        if (arr.length >= 5 && arr[0] === arr[1] && arr[1] === arr[2] && arr[2] !== arr[3] && arr[3] === arr[4]) {
            return { pred: arr[3], conf: 74, type: 'Gãy 3-2', reason: 'AAABB → B' };
        }
        if (arr.length >= 5 && arr[0] === arr[1] && arr[1] !== arr[2] && arr[2] === arr[3] && arr[3] === arr[4]) {
            return { pred: arr[2], conf: 74, type: 'Gãy 2-3', reason: 'AABBB → B' };
        }
        if (arr.length >= 4 && arr[0] !== arr[1] && arr[1] === arr[2] && arr[2] !== arr[3] && arr[0] === arr[3]) {
            return { pred: arr[1], conf: 72, type: 'Gãy 1-2-1', reason: 'ABBA → B' };
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
                    return { pred: arr[i - 1], conf: 88, type: 'Mẫu Lặp', reason: `Mẫu "${pattern.join(',')}"` };
                }
            }
        }
        return null;
    }

    duDoanVi() {
        const points = this._points();
        if (points.length < 5) return null;
        const last = points[0],
            prev = points[1];
        const slice = points.slice(0, 5);
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length;

        if (last >= 15) return { pred: 'XIU', conf: 75, type: 'Vị cực đại', reason: `Điểm ${last} → hồi Xỉu` };
        if (last <= 5) return { pred: 'TAI', conf: 75, type: 'Vị cực tiểu', reason: `Điểm ${last} → hồi Tài` };
        if (avg > 11 && last > prev) return { pred: 'XIU', conf: 68, type: 'Vị bão hòa', reason: 'Đà tăng chạm ngưỡng' };
        if (avg < 10 && last < prev) return { pred: 'TAI', conf: 68, type: 'Vị cạn kiệt', reason: 'Đà giảm chạm đáy' };
        if (avg >= 11 && last >= 11 && last <= 13) return { pred: 'TAI', conf: 65, type: 'Vị ổn định', reason: 'Duy trì Tài nhẹ' };
        if (avg <= 9 && last >= 7 && last <= 9) return { pred: 'XIU', conf: 65, type: 'Vị ổn định', reason: 'Duy trì Xỉu nhẹ' };
        return null;
    }

    tongHopDuDoan() {
        const arr = this._arr();
        if (arr.length < 2) return null;
        const result = this.phatHienMauLap(arr) || this.cauNoi(arr) || this.cauDoi(arr) ||
            this.cauGay(arr) || this.cauSap(arr) || this.duDoanVi() ||
            { pred: arr[0], conf: 55, type: 'Theo', reason: 'Bám phiên cuối' };

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
                pred: p.pred === 'TAI' ? 'XIU' : 'TAI',
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
        else result = { pred: this._arr()[0] || 'TAI', conf: 50, type: 'Theo', reason: 'Không đủ dữ liệu' };

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

// ===================== Lưu trữ & thống kê =====================
function loadHistory() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const content = fs.readFileSync(DATA_FILE, 'utf-8');
            const data = JSON.parse(content);
            return data.history || [];
        }
    } catch (e) {
        console.error('Lỗi đọc file history:', e.message);
    }
    return [];
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
}

function loadDetailedStats() {
    try {
        if (fs.existsSync(DETAILED_STATS_FILE)) {
            const content = fs.readFileSync(DETAILED_STATS_FILE, 'utf-8');
            return JSON.parse(content);
        }
    } catch (e) {
        console.error('Lỗi đọc file thống kê chi tiết:', e.message);
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

function loadStats() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            const savedStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
            stats = { ...stats, ...savedStats };
        }
    } catch (e) {
        console.error('Lỗi load stats:', e.message);
    }
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

// ===================== Auto Verify & Predict =====================
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
                    if (stats.current_streak > stats.best_streak) {
                        stats.best_streak = stats.current_streak;
                    }
                } else {
                    stats.wrong++;
                    stats.current_streak = 0;
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
                    timestamp: vnNow()
                };

                stats.history.push(historyEntry);
                if (stats.history.length > 500) stats.history = stats.history.slice(-500);

                updateDetailedStats(
                    lp.prediction,
                    actual,
                    lp.pattern || 'Unknown',
                    lp.confidence,
                    ok
                );

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
            let ph = cur.phien || 0;
            if (typeof ph === 'string') {
                const cleaned = ph.replace('#', '');
                ph = !isNaN(cleaned) ? parseInt(cleaned) : 0;
            }

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

// ===================== WebSocket Client (get.py) =====================
function initWebSocket() {
    const ws = new WebSocket(WS_URL, { headers: WS_HEADERS });

    ws.on('open', () => {
        console.log('[✅] WebSocket connected to Sun.Win');

        const initMsg = [
            1,
            'MiniGame',
            TOKEN.username || 'GM_quapotjz',
            'quapit',
            {
                signature: '05915B436159B8F4E4DFF537639BD014D54EBEFA18CF62A8EB205B4074010AD72AEA9A780D5A8A4E1BD59BBBAFE03902C594B5DA56FD60D099F1FDDCCD48385FCC2760B5B0B4B8E75D39B8E40DF8CB7C01EA58DBEDA32805927473AB71FA9B798B0C2EDC445C3E36E47EF0AAFAD45601D99AAD1EC642FD2B63573A0401D6EC69',
                expireIn: TOKEN.timestamp || 1774138177205,
                wsToken: TOKEN.wsToken,
                accessToken: '7e9a9ecbff1b4a6393b48346f6d8b709',
                message: 'Thành công',
                refreshToken: TOKEN.refreshToken || '',
                info: TOKEN
            }
        ];
        ws.send(JSON.stringify(initMsg));

        setTimeout(() => {
            ws.send(JSON.stringify([6, 'MiniGame', 'taixiuPlugin', { cmd: 1005 }]));
        }, 600);

        setTimeout(() => {
            ws.send(JSON.stringify([6, 'MiniGame', 'lobbyPlugin', { cmd: 10001 }]));
        }, 1200);
    });

    ws.on('message', (data) => {
        try {
            const parsed = JSON.parse(data);
            if (!Array.isArray(parsed) || parsed.length < 2) return;

            const body = parsed[1];
            if (typeof body !== 'object') return;

            const cmd = body.cmd;
            if (cmd === 1008 && body.sid) {
                currentSessionId = body.sid;
                console.log(`[🎮] Phiên mới: ${currentSessionId}`);
            }

            if (cmd === 1003 && body.gBB) {
                const d1 = body.d1,
                    d2 = body.d2,
                    d3 = body.d3;
                if (d1 === undefined || d2 === undefined || d3 === undefined) return;

                const total = d1 + d2 + d3;
                const result = total > 10 ? 'Tài' : 'Xỉu';

                currentResult = {
                    phien: currentSessionId,
                    xuc_xac_1: d1,
                    xuc_xac_2: d2,
                    xuc_xac_3: d3,
                    tong: total,
                    ket_qua: result,
                    thoi_gian: vnNow()
                };

                console.log(`[🎲] Phiên ${currentResult.phien}: ${d1}-${d2}-${d3} = ${total} (${result}) - ${currentResult.thoi_gian}`);

                const newItem = {
                    phien: currentResult.phien,
                    ket_qua: currentResult.ket_qua,
                    tong: currentResult.tong,
                    xuc_xac_1: currentResult.xuc_xac_1,
                    xuc_xac_2: currentResult.xuc_xac_2,
                    xuc_xac_3: currentResult.xuc_xac_3
                };

                globalHistory.push(newItem);
                if (globalHistory.length > MAX_STORAGE) globalHistory = globalHistory.slice(-MAX_STORAGE);
                saveHistory(globalHistory);

                autoVerify(globalHistory);
                autoPredict(globalHistory);

                currentSessionId = null;
            }
        } catch (e) {
            console.error('[❌] Lỗi xử lý message WS:', e.message);
        }
    });

    ws.on('error', (err) => {
        console.error('[❌] Lỗi WebSocket:', err.message);
    });

    ws.on('close', () => {
        console.log('[⚠️] WebSocket đóng, thử kết nối lại sau 2.5s');
        setTimeout(initWebSocket, reconnectDelay);
    });

    wsConnection = ws;
}

// ===================== Express API (thay thế Flask) =====================
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

app.get('/api/tx', (req, res) => {
    res.json(currentResult);
});

app.get('/api/history', (req, res) => {
    res.json(globalHistory.slice(-100));
});

app.get('/api/stats', (req, res) => {
    res.json({ stats, detailedStats: detailedStats.summary });
});

app.get('/', (req, res) => {
    res.json({
        name: 'Sun.Win Tài Xỉu Data Stream & Predictor',
        version: '1.0',
        author: 'HuyDaiXuVN',
        endpoints: {
            '/api/tx': 'Kết quả mới nhất',
            '/api/history': 'Lịch sử 100 phiên gần nhất',
            '/api/stats': 'Thống kê tổng hợp'
        },
        current_user: TOKEN.username || 'Unknown',
        thoi_gian: vnNow()
    });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint không tồn tại. Chỉ có /api/tx, /api/history, /api/stats' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server chạy trên cổng ${PORT}`);
    console.log(`🔗 http://localhost:${PORT}`);
    console.log(`👤 Token của: ${TOKEN.username}`);
});

// ===================== Console Commands =====================
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
        let ph = cur.phien || 0;
        if (typeof ph === 'string') {
            const cleaned = ph.replace('#', '');
            ph = !isNaN(cleaned) ? parseInt(cleaned) : 0;
        }
        const nextPhien = ph + 1;

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
        const recent = history.slice(-10).reverse();
        for (const item of recent) {
            const dice = `${item.xuc_xac_1||0},${item.xuc_xac_2||0},${item.xuc_xac_3||0}`;
            console.log(`   │ ${String(item.phien).padStart(8)} │ ${(item.ket_qua || '').padEnd(10)} │ ${String(item.tong || 0).padStart(10)} │ ${dice.padEnd(11)} │`);
        }
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
    console.log(`📈 Tỷ lệ đúng: ${((stats.correct/Math.max(stats.total,1))*100).toFixed(2)}% (${stats.correct}/${stats.total})`);
    console.log(`🏆 Chuỗi đúng tốt nhất: ${stats.best_streak}`);
    console.log(`📉 Chuỗi sai tệ nhất: ${stats.worst_streak}`);
    console.log(`📊 Chuỗi đúng hiện tại: ${stats.current_streak}`);

    console.log(`\n📋 20 DỰ ĐOÁN GẦN NHẤT:`);
    console.log('   ┌──────────┬────────────┬────────────┬──────────────────┬──────────┬────────────┐');
    console.log('   │ Phiên    │ Dự đoán    │ Thực tế    │ Loại cầu         │ Kết quả  │ Độ tin cậy │');
    console.log('   ├──────────┼────────────┼────────────┼──────────────────┼──────────┼────────────┤');

    const recent = detailedStats.recentHistory.slice(-20).reverse();
    for (const item of recent) {
        const result = item.correct ? '✅ ĐÚNG' : '❌ SAI';
        console.log(`   │ ${String(item.phien).padStart(8)} │ ${(item.prediction || '').padEnd(10)} │ ${(item.actual || '').padEnd(10)} │ ${(item.pattern || '').padEnd(16)} │ ${result.padEnd(8)} │ ${String(item.confidence || 0).padEnd(10)}% │`);
    }
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
    console.log(`   Đúng: ${stats.correct} (${stats.total > 0 ? (stats.correct/stats.total*100).toFixed(2) : 0}%)`);
    console.log(`   Sai: ${stats.wrong} (${stats.total > 0 ? (stats.wrong/stats.total*100).toFixed(2) : 0}%)`);
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

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
});

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
        case '/stats':
        case '/thongke':
            printDetailedStats();
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

// ===================== Khởi tạo và chạy =====================
globalHistory = loadHistory();
detailedStats = loadDetailedStats();
loadStats();

console.log(`📚 Đã tải ${globalHistory.length} phiên dữ liệu hiện có`);
if (stats.prediction_started) {
    console.log(`📈 Đã dự đoán ${stats.total_predictions_made.toLocaleString()}/${MAX_PREDICTIONS.toLocaleString()} phiên`);
    console.log(`📊 Tỷ lệ đúng: ${((stats.correct/Math.max(stats.total,1))*100).toFixed(1)}% (${stats.correct}/${stats.total})`);
    console.log(`📈 Chuỗi đúng hiện tại: ${stats.current_streak}`);
    console.log(`🏆 Chuỗi đúng tốt nhất: ${stats.best_streak}\n`);
}

console.log('\n💡 Gõ /dudoan để xem dự đoán');
console.log('💡 Gõ /lichsu để xem lịch sử');
console.log('💡 Gõ /help để xem hướng dẫn');
console.log('💡 Gõ /thoat để thoát chương trình\n');

initWebSocket();

process.on('SIGINT', () => {
    console.log("\n🛑 Đang dừng chương trình...");
    printDetailedStats();
    saveStatsFile();
    saveDetailedStats();
    console.log("✅ Đã lưu thống kê!");
    rl.close();
    process.exit();
});

process.on('SIGTERM', () => {
    console.log("\n🛑 Đang dừng chương trình...");
    saveStatsFile();
    saveDetailedStats();
    console.log("✅ Đã lưu thống kê!");
    rl.close();
    process.exit();
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
});