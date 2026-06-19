const https = require('https');
const express = require('express');
const cors = require('cors');
const os = require('os');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3001;

// ==================== CẤU HÌNH ====================
const API_URL = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';
const POLL_INTERVAL = 3000; // 3 giây
const MAX_HISTORY = 100000;

// ==================== DỮ LIỆU CHÍNH ====================
let apiResponseData = {
    Phien: null,
    Xuc_xac_1: null,
    Xuc_xac_2: null,
    Xuc_xac_3: null,
    Tong: null,
    Ket_qua: '',
    id: '@HuyDaiXuVN',
    server_time: new Date().toISOString()
};
let latestSessionId = 0;
const patternHistory = [];          // { session, dice, total, result, timestamp }
const MAX_PREDICTIONS = 0;          // không giới hạn, lưu tất cả
const predictions = [];             // lịch sử dự đoán { Phien_du_doan, Du_doan, Do_tin_cay, Thoi_gian_du_doan, Ket_qua_thuc_te, Dung_hay_sai }
let pendingPrediction = null;       // dự đoán đang chờ kết quả

// ==================== AI ENSEMBLE SIÊU VIP ====================
class MarkovModel {
    constructor(order) {
        this.order = order;
        this.chain = new Map(); // state -> { T: count, X: count }
    }
    learn(history, result) {
        if (history.length < this.order) return;
        const state = history.slice(-this.order).join('');
        if (!this.chain.has(state)) this.chain.set(state, { T: 0, X: 0 });
        const counts = this.chain.get(state);
        counts[result]++;
    }
    predict(history) {
        if (history.length < this.order) return null;
        // Back-off: giảm bậc đến khi tìm thấy state
        for (let len = this.order; len >= 1; len--) {
            const state = history.slice(-len).join('');
            if (this.chain.has(state)) {
                const counts = this.chain.get(state);
                if (counts.T > counts.X) return 'T';
                if (counts.X > counts.T) return 'X';
                return null; // hoà
            }
        }
        return null;
    }
}

class StreakDetector {
    constructor() {
        this.mode = null; // 'bet_T', 'bet_X', 'one_one', 'two_one'
    }
    detect(history) {
        const len = history.length;
        if (len < 3) { this.mode = null; return; }
        const last3 = history.slice(-3).join('');
        if (last3 === 'TTT') this.mode = 'bet_T';
        else if (last3 === 'XXX') this.mode = 'bet_X';
        else if (len >= 4 && history.slice(-4).join('') === 'TXTX') this.mode = 'one_one';
        else if (len >= 5) {
            const last5 = history.slice(-5).join('');
            if (last5 === 'TTXTT' || last5 === 'XXTXX') this.mode = 'two_one';
            else this.mode = null;
        } else this.mode = null;
    }
    predict(history) {
        if (!this.mode) return null;
        const last = history[history.length - 1];
        switch (this.mode) {
            case 'bet_T': return 'T';
            case 'bet_X': return 'X';
            case 'one_one': return last === 'T' ? 'X' : 'T';
            case 'two_one': return last === 'T' ? 'X' : 'T'; // mẫu 2-1 đơn giản
            default: return null;
        }
    }
}

class RecentTrendAnalyzer {
    constructor(window = 20) {
        this.window = window;
    }
    predict(history) {
        if (history.length < this.window) return null;
        const recent = history.slice(-this.window);
        const tCount = recent.filter(x => x === 'T').length;
        const xCount = recent.length - tCount;
        if (tCount > xCount) return 'T';
        if (xCount > tCount) return 'X';
        return null;
    }
}

class EnsembleAI {
    constructor() {
        this.MARKOV_ORDERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        this.markovModels = this.MARKOV_ORDERS.map(order => new MarkovModel(order));
        this.streakDetector = new StreakDetector();
        this.trendAnalyzer = new RecentTrendAnalyzer(20);
        this.resultHistory = []; // mảng 'T' / 'X'

        // Lưu điểm số gần đây (cửa sổ 100)
        this.modelScores = {
            markov: this.MARKOV_ORDERS.map(() => []), // mỗi mảng { correct: bool }
            streak: [],
            trend: []
        };
        this.WINDOW = 100;
        this.pendingPreds = null; // lưu dự đoán của từng model trước khi có kết quả
    }

    update(actual) {
        if (this.resultHistory.length >= MAX_HISTORY) this.resultHistory.shift();
        this.resultHistory.push(actual);

        // Huấn luyện từng Markov model
        for (const mm of this.markovModels) {
            mm.learn(this.resultHistory, actual);
        }
        // Cập nhật streak detector
        this.streakDetector.detect(this.resultHistory);

        // Đánh giá dự đoán trước đó
        if (this.pendingPreds) {
            for (let i = 0; i < this.markovModels.length; i++) {
                const pred = this.pendingPreds.markov[i];
                if (pred) {
                    this.modelScores.markov[i].push({ correct: pred === actual });
                    if (this.modelScores.markov[i].length > this.WINDOW) this.modelScores.markov[i].shift();
                }
            }
            if (this.pendingPreds.streak) {
                this.modelScores.streak.push({ correct: this.pendingPreds.streak === actual });
                if (this.modelScores.streak.length > this.WINDOW) this.modelScores.streak.shift();
            }
            if (this.pendingPreds.trend) {
                this.modelScores.trend.push({ correct: this.pendingPreds.trend === actual });
                if (this.modelScores.trend.length > this.WINDOW) this.modelScores.trend.shift();
            }
        }
        this.pendingPreds = null;
    }

    predict() {
        // Dự đoán từ từng model
        const markovPreds = this.markovModels.map(mm => mm.predict(this.resultHistory));
        const streakPred = this.streakDetector.predict(this.resultHistory);
        const trendPred = this.trendAnalyzer.predict(this.resultHistory);
        this.pendingPreds = { markov: markovPreds, streak: streakPred, trend: trendPred };

        // Trọng số dựa trên accuracy gần đây
        const weights = this._getWeights();

        const votes = { T: 0, X: 0 };
        for (let i = 0; i < markovPreds.length; i++) {
            if (markovPreds[i]) votes[markovPreds[i]] += weights.markov[i];
        }
        if (streakPred) votes[streakPred] += weights.streak;
        if (trendPred) votes[trendPred] += weights.trend;

        let prediction, confidence;
        const total = votes.T + votes.X;
        if (total === 0) {
            prediction = Math.random() < 0.5 ? 'Tài' : 'Xỉu';
            confidence = 50;
        } else if (votes.T > votes.X) {
            prediction = 'Tài';
            confidence = (votes.T / total) * 100;
        } else if (votes.X > votes.T) {
            prediction = 'Xỉu';
            confidence = (votes.X / total) * 100;
        } else {
            prediction = Math.random() < 0.5 ? 'Tài' : 'Xỉu';
            confidence = 50;
        }
        return { prediction, confidence: Math.round(confidence * 100) / 100 };
    }

    _getWeights() {
        const calcAcc = (scores) => scores.length === 0 ? 0 : scores.filter(s => s.correct).length / scores.length;
        const markovAcc = this.modelScores.markov.map(scores => calcAcc(scores));
        const streakAcc = calcAcc(this.modelScores.streak);
        const trendAcc = calcAcc(this.modelScores.trend);
        const totalAcc = markovAcc.reduce((a, b) => a + b, 0) + streakAcc + trendAcc;
        if (totalAcc === 0) {
            return {
                markov: this.MARKOV_ORDERS.map(() => 1 / this.MARKOV_ORDERS.length),
                streak: 0.2,
                trend: 0.2
            };
        }
        return {
            markov: markovAcc.map(acc => acc / totalAcc),
            streak: streakAcc / totalAcc,
            trend: trendAcc / totalAcc
        };
    }

    getStatus() {
        const weights = this._getWeights();
        return {
            history_length: this.resultHistory.length,
            weights,
            markov_models: this.markovModels.map((mm, i) => ({
                order: mm.order,
                states: mm.chain.size,
                accuracy: this.modelScores.markov[i].length
                    ? (this.modelScores.markov[i].filter(s => s.correct).length / this.modelScores.markov[i].length).toFixed(2)
                    : 0
            })),
            streak_accuracy: this.modelScores.streak.length
                ? (this.modelScores.streak.filter(s => s.correct).length / this.modelScores.streak.length).toFixed(2)
                : 0,
            trend_accuracy: this.modelScores.trend.length
                ? (this.modelScores.trend.filter(s => s.correct).length / this.modelScores.trend.length).toFixed(2)
                : 0
        };
    }
}

const ai = new EnsembleAI();

// ==================== HÀM GỌI API ====================
function fetchSessions() {
    return new Promise((resolve, reject) => {
        https.get(API_URL, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.list || []);
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

// ==================== XỬ LÝ DỮ LIỆU MỚI ====================
async function processNewSessions(sessions) {
    // Lọc các phiên mới hơn latestSessionId, sắp xếp tăng dần
    const newSessions = sessions
        .filter(s => s.id > latestSessionId)
        .sort((a, b) => a.id - b.id);

    if (newSessions.length === 0) return;

    for (const s of newSessions) {
        const result = s.resultTruyenThong === 'TAI' ? 'Tài' : 'Xỉu';
        const total = s.point;
        const dice = s.dices;

        // Cập nhật dữ liệu mới nhất
        apiResponseData = {
            Phien: s.id,
            Xuc_xac_1: dice[0],
            Xuc_xac_2: dice[1],
            Xuc_xac_3: dice[2],
            Tong: total,
            Ket_qua: result,
            id: '@cskh_huydaixu',
            server_time: new Date().toISOString(),
            update_count: (apiResponseData.update_count || 0) + 1
        };

        // Thêm vào lịch sử chi tiết
        patternHistory.push({
            session: s.id,
            dice: dice,
            total: total,
            result: result,
            timestamp: new Date().toISOString()
        });
        if (patternHistory.length > MAX_HISTORY) patternHistory.shift();

        // Huấn luyện AI
        ai.update(result === 'Tài' ? 'T' : 'X');

        // Kiểm tra dự đoán đang chờ
        if (pendingPrediction && pendingPrediction.Phien_du_doan === s.id) {
            pendingPrediction.Ket_qua_thuc_te = result;
            pendingPrediction.Dung_hay_sai = (pendingPrediction.Du_doan === result);
            predictions.push({ ...pendingPrediction });
            pendingPrediction = null;
        } else if (pendingPrediction && pendingPrediction.Phien_du_doan < s.id) {
            // Phiên bị nhảy, dự đoán cũ không còn hợp lệ, hủy bỏ
            pendingPrediction = null;
        }

        latestSessionId = s.id;
    }

    // Tạo dự đoán mới cho phiên tiếp theo
    if (latestSessionId > 0) {
        const nextSession = latestSessionId + 1;
        const { prediction, confidence } = ai.predict();
        pendingPrediction = {
            Phien_du_doan: nextSession,
            Du_doan: prediction,
            Do_tin_cay: confidence,
            Thoi_gian_du_doan: new Date().toISOString(),
            Ket_qua_thuc_te: null,
            Dung_hay_sai: null
        };
    }
}

// ==================== KHỞI TẠO DỮ LIỆU BAN ĐẦU ====================
(async () => {
    try {
        const sessions = await fetchSessions();
        // Sắp xếp tăng dần để huấn luyện đúng thứ tự
        const sorted = sessions.sort((a, b) => a.id - b.id);
        for (const s of sorted) {
            const result = s.resultTruyenThong === 'TAI' ? 'Tài' : 'Xỉu';
            ai.update(result === 'Tài' ? 'T' : 'X'); // huấn luyện AI
            patternHistory.push({
                session: s.id,
                dice: s.dices,
                total: s.point,
                result: result,
                timestamp: new Date().toISOString()
            });
            if (patternHistory.length > MAX_HISTORY) patternHistory.shift();
        }
        if (sorted.length > 0) {
            latestSessionId = sorted[sorted.length - 1].id;
            const latest = sorted[sorted.length - 1];
            apiResponseData = {
                Phien: latest.id,
                Xuc_xac_1: latest.dices[0],
                Xuc_xac_2: latest.dices[1],
                Xuc_xac_3: latest.dices[2],
                Tong: latest.point,
                Ket_qua: latest.resultTruyenThong === 'TAI' ? 'Tài' : 'Xỉu',
                id: '@cskh_huydaixu',
                server_time: new Date().toISOString(),
                update_count: sorted.length
            };
            // Tạo dự đoán đầu tiên
            const nextSession = latestSessionId + 1;
            const { prediction, confidence } = ai.predict();
            pendingPrediction = {
                Phien_du_doan: nextSession,
                Du_doan: prediction,
                Do_tin_cay: confidence,
                Thoi_gian_du_doan: new Date().toISOString(),
                Ket_qua_thuc_te: null,
                Dung_hay_sai: null
            };
        }
        console.log(`[📚] Đã nạp ${sorted.length} phiên ban đầu. Phiên mới nhất: ${latestSessionId}`);
    } catch (e) {
        console.error('[❌] Lỗi khởi tạo:', e.message);
    }

    // Bắt đầu poll định kỳ mỗi 3 giây
    setInterval(async () => {
        try {
            const sessions = await fetchSessions();
            await processNewSessions(sessions);
        } catch (e) {
            console.error('[❌] Lỗi polling:', e.message);
        }
    }, POLL_INTERVAL);
})();

// ==================== ENDPOINTS ====================

app.get('/api/ditmemaysun', (req, res) => res.json(apiResponseData));

app.get('/api/sunwin/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const all = req.query.all === 'true';
    const items = all ? patternHistory : patternHistory.slice(-limit);
    const formatted = items.map(item => ({
        Ket_qua: item.result,
        Phien: item.session,
        Tong: item.total,
        Xuc_xac_1: item.dice[0],
        Xuc_xac_2: item.dice[1],
        Xuc_xac_3: item.dice[2],
        id: '@cskh_huydaixu'
    }));
    res.json(formatted);
});

app.get('/api/sunwin/dudoan', (req, res) => {
    if (patternHistory.length === 0) return res.json({ message: 'Chưa có dữ liệu' });
    const latest = patternHistory[patternHistory.length - 1];
    const next = latest.session + 1;
    // Tạo dự đoán mới (có thể trùng với pending nếu chưa có phiên mới)
    const { prediction, confidence } = ai.predict();
    // Cập nhật pending dự đoán mới
    pendingPrediction = {
        Phien_du_doan: next,
        Du_doan: prediction,
        Do_tin_cay: confidence,
        Thoi_gian_du_doan: new Date().toISOString(),
        Ket_qua_thuc_te: null,
        Dung_hay_sai: null
    };
    res.json({
        Ket_qua: latest.result,
        Phien: latest.session,
        Xuc_xac_1: latest.dice[0],
        Xuc_xac_2: latest.dice[1],
        Xuc_xac_3: latest.dice[2],
        Tong: latest.total,
        Phien_hien_tai: next,
        Du_doan: prediction,
        Do_tin_cay: confidence
    });
});

app.get('/api/check', (req, res) => {
    const total = predictions.length;
    const correct = predictions.filter(p => p.Dung_hay_sai === true).length;
    const accuracy = total > 0 ? ((correct / total) * 100).toFixed(2) : 0;
    res.json({
        predictions: predictions.map(p => ({
            Phien: p.Phien_du_doan,
            Du_doan: p.Du_doan,
            'Kết quả': p.Ket_qua_thuc_te,
            Đúng: p.Dung_hay_sai,
            'Độ tin cậy': p.Do_tin_cay,
            'Thời gian': p.Thoi_gian_du_doan
        })),
        stats: { total, correct, incorrect: total - correct, accuracy: parseFloat(accuracy) },
        pending: pendingPrediction ? {
            Phien: pendingPrediction.Phien_du_doan,
            Du_doan: pendingPrediction.Du_doan,
            'Độ tin cậy': pendingPrediction.Do_tin_cay
        } : null
    });
});

app.get('/api/ai/status', (req, res) => res.json(ai.getStatus()));

app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        data_source: 'REST',
        history_count: patternHistory.length,
        ai_enabled: true,
        uptime: process.uptime().toFixed(0) + 's'
    });
});

app.get('/', (req, res) => {
    const ip = getLocalIP();
    const resultHtml = apiResponseData.Tong
        ? `${apiResponseData.Xuc_xac_1}-${apiResponseData.Xuc_xac_2}-${apiResponseData.Xuc_xac_3} = ${apiResponseData.Tong} (${apiResponseData.Ket_qua})`
        : 'Đang chờ...';
    const resultClass = apiResponseData.Ket_qua === 'Tài' ? 'tai' : 'xiu';
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Sun.Win AI REST Super VIP</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; margin:20px; background:#0a0a0a; color:#0f0; }
        .container { max-width:1000px; margin:0 auto; }
        .header { background:#111; padding:20px; border-radius:10px; text-align:center; margin-bottom:20px; }
        .box { background:#111; padding:20px; border-radius:10px; margin:10px 0; }
        .live-data { font-size:2em; font-weight:bold; }
        .tai { color:#0f0; } .xiu { color:#f00; }
        a { color:#0ff; }
        .btn { display:inline-block; background:#222; padding:10px 20px; margin:5px; border-radius:5px; text-decoration:none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔴 Sun.Win AI REST Super VIP</h1>
            <p>Ensemble AI: 10 Markov + Streak + Trend | Tự học 100.000 phiên</p>
            <p>Server: ${ip}:${PORT}</p>
        </div>
        <div class="box">
            <h2>🎲 Kết quả mới nhất</h2>
            <div class="live-data ${resultClass}">${resultHtml}</div>
            <p>Phiên: ${apiResponseData.Phien || 'N/A'} | Cập nhật: ${apiResponseData.server_time || 'N/A'}</p>
        </div>
        <div class="box">
            <h2>📡 API VIP</h2>
            <a class="btn" href="/api/ditmemaysun" target="_blank">/api/ditmemaysun</a>
            <a class="btn" href="/api/sunwin/history?limit=20" target="_blank">/api/sunwin/history</a>
            <a class="btn" href="/api/sunwin/dudoan" target="_blank">/api/sunwin/dudoan</a>
            <a class="btn" href="/api/check" target="_blank">/api/check</a>
            <a class="btn" href="/api/ai/status" target="_blank">/api/ai/status</a>
            <a class="btn" href="/api/health" target="_blank">/api/health</a>
        </div>
        <div class="box">
            <h2>📊 Thống kê nhanh</h2>
            <p>Tổng phiên đã thu thập: <strong>${patternHistory.length}</strong> / ${MAX_HISTORY}</p>
            <p>Dự đoán đúng: <strong>${predictions.filter(p=>p.Dung_hay_sai).length}</strong> / ${predictions.length}</p>
            <p>Độ chính xác: <strong>${predictions.length ? (predictions.filter(p=>p.Dung_hay_sai).length/predictions.length*100).toFixed(2) : 0}%</strong></p>
        </div>
    </div>
    <script>
        setInterval(() => {
            fetch('/api/ditmemaysun')
                .then(r => r.json())
                .then(d => {
                    if(d.Tong) {
                        const el = document.querySelector('.live-data');
                        el.textContent = d.Xuc_xac_1 + '-' + d.Xuc_xac_2 + '-' + d.Xuc_xac_3 + ' = ' + d.Tong + ' (' + d.Ket_qua + ')';
                        el.className = 'live-data ' + (d.Ket_qua === 'Tài' ? 'tai' : 'xiu');
                    }
                });
        }, 5000);
    </script>
</body>
</html>`);
});

function getLocalIP() {
    const ifaces = os.networkInterfaces();
    for (const name in ifaces) {
        for (const iface of ifaces[name]) {
            if (!iface.internal && iface.family === 'IPv4') return iface.address;
        }
    }
    return '127.0.0.1';
}

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log('=========================================');
    console.log('🚀 Sun.Win AI REST Super VIP Server');
    console.log('=========================================');
    console.log(`📡 Địa chỉ: http://${getLocalIP()}:${PORT}`);
    console.log(`🔌 Nguồn dữ liệu: ${API_URL}`);
    console.log(`⏱️  Tự động reload mỗi ${POLL_INTERVAL/1000}s`);
    console.log('🧠 AI Ensemble: 10 Markov (1-10) + Streak + Trend + Adaptive Weights');
    console.log('=========================================');
});