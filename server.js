const https = require('https');
const express = require('express');
const cors = require('cors');
const os = require('os');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3001;

// ==================== CẤU HÌNH ====================
const API_URL = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';
const POLL_INTERVAL = 2500; // 2.5 giây
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
let latestSessionId = 0;                     // ID lớn nhất đã thấy
const patternHistory = [];                   // { session, dice, total, result, timestamp }

// ==================== AI ENSEMBLE (giữ nguyên từ phiên bản trước) ====================
class MarkovModel {
    constructor(order) {
        this.order = order;
        this.chain = new Map();
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
        for (let len = this.order; len >= 1; len--) {
            const state = history.slice(-len).join('');
            if (this.chain.has(state)) {
                const counts = this.chain.get(state);
                if (counts.T > counts.X) return 'T';
                if (counts.X > counts.T) return 'X';
                return null;
            }
        }
        return null;
    }
}

class StreakDetector {
    constructor() {
        this.mode = null;
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
            case 'two_one': return last === 'T' ? 'X' : 'T';
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
        this.MARKOV_ORDERS = [1,2,3,4,5,6,7,8,9,10];
        this.markovModels = this.MARKOV_ORDERS.map(order => new MarkovModel(order));
        this.streakDetector = new StreakDetector();
        this.trendAnalyzer = new RecentTrendAnalyzer(20);
        this.resultHistory = [];
        this.modelScores = {
            markov: this.MARKOV_ORDERS.map(() => []),
            streak: [],
            trend: []
        };
        this.WINDOW = 100;
        this.pendingPreds = null;
    }

    update(actual) {
        if (this.resultHistory.length >= MAX_HISTORY) this.resultHistory.shift();
        this.resultHistory.push(actual);

        for (const mm of this.markovModels) {
            mm.learn(this.resultHistory, actual);
        }
        this.streakDetector.detect(this.resultHistory);

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
        const markovPreds = this.markovModels.map(mm => mm.predict(this.resultHistory));
        const streakPred = this.streakDetector.predict(this.resultHistory);
        const trendPred = this.trendAnalyzer.predict(this.resultHistory);
        this.pendingPreds = { markov: markovPreds, streak: streakPred, trend: trendPred };

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
        const totalAcc = markovAcc.reduce((a,b)=>a+b,0) + streakAcc + trendAcc;
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
                accuracy: this.modelScores.markov[i].length ?
                    (this.modelScores.markov[i].filter(s => s.correct).length / this.modelScores.markov[i].length).toFixed(2) : 0
            })),
            streak_accuracy: this.modelScores.streak.length ?
                (this.modelScores.streak.filter(s => s.correct).length / this.modelScores.streak.length).toFixed(2) : 0,
            trend_accuracy: this.modelScores.trend.length ?
                (this.modelScores.trend.filter(s => s.correct).length / this.modelScores.trend.length).toFixed(2) : 0
        };
    }
}

const ai = new EnsembleAI();
let pendingPrediction = null;   // { Phien_du_doan, Du_doan, Do_tin_cay, Thoi_gian_du_doan, Ket_qua_thuc_te, Dung_hay_sai }
const predictions = [];         // lịch sử các dự đoán đã kiểm chứng

// ==================== THU THẬP DỮ LIỆU TỪ REST API ====================
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

async function pollData() {
    try {
        const sessions = await fetchSessions();
        // Lọc các phiên mới (id > latestSessionId), sắp xếp tăng dần theo id
        const newSessions = sessions
            .filter(s => s.id > latestSessionId)
            .sort((a, b) => a.id - b.id);

        if (newSessions.length === 0) return;

        for (const s of newSessions) {
            const result = s.resultTruyenThong === 'TAI' ? 'Tài' : 'Xỉu';
            const total = s.point;
            const dice = s.dices;

            // Cập nhật API response
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

            // Lưu lịch sử
            patternHistory.push({
                session: s.id,
                dice: dice,
                total: total,
                result: result,
                timestamp: new Date().toISOString()
            });
            if (patternHistory.length > MAX_HISTORY) patternHistory.shift();

            // Cập nhật AI
            ai.update(result === 'Tài' ? 'T' : 'X');

            // Kiểm tra pending prediction
            if (pendingPrediction && pendingPrediction.Phien_du_doan === s.id) {
                pendingPrediction.Ket_qua_thuc_te = result;
                pendingPrediction.Dung_hay_sai = (pendingPrediction.Du_doan === result);
                predictions.push({ ...pendingPrediction });
                pendingPrediction = null;
            }

            latestSessionId = s.id;
        }
        console.log(`[📡] Đã cập nhật ${newSessions.length} phiên mới. Phiên mới nhất: ${latestSessionId}`);
    } catch (err) {
        console.error('[❌] Lỗi fetch API:', err.message);
    }
}

// ==================== KHỞI ĐỘNG LẤY DỮ LIỆU BAN ĐẦU ====================
(async () => {
    // Lấy toàn bộ phiên lần đầu (tối đa 105) và huấn luyện AI
    try {
        const sessions = await fetchSessions();
        if (sessions.length > 0) {
            const sorted = sessions.sort((a, b) => a.id - b.id);
            // Huấn luyện tuần tự
            for (const s of sorted) {
                const result = s.resultTruyenThong === 'TAI' ? 'Tài' : 'Xỉu';
                ai.update(result === 'Tài' ? 'T' : 'X'); // chỉ cập nhật AI, không lưu history ở đây để tránh trùng
            }
            // Lưu lịch sử chi tiết
            sorted.forEach(s => {
                patternHistory.push({
                    session: s.id,
                    dice: s.dices,
                    total: s.point,
                    result: s.resultTruyenThong === 'TAI' ? 'Tài' : 'Xỉu',
                    timestamp: new Date().toISOString()
                });
            });
            // Cập nhật latestSessionId và API response
            const latest = sorted[sorted.length - 1];
            latestSessionId = latest.id;
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
            console.log(`[📚] Đã nạp ${sorted.length} phiên ban đầu.`);
        }
    } catch (e) {
        console.error('[❌] Lỗi khởi tạo dữ liệu:', e);
    }
    // Bắt đầu poll định kỳ
    setInterval(pollData, POLL_INTERVAL);
})();

// ==================== API ENDPOINTS ====================
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
    if (patternHistory.length === 0) return res.json({ message: 'Chưa có dữ liệu.' });
    const latest = patternHistory[patternHistory.length - 1];
    const nextSession = latest.session + 1;

    // Tạo dự đoán mới
    const { prediction, confidence } = ai.predict();
    pendingPrediction = {
        Phien_du_doan: nextSession,
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
        Phien_hien_tai: nextSession,
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
            'Độ tin cậy': p.Do_tin_cay
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
        uptime: process.uptime()
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
    <title>Sun.Win AI REST VIP</title>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial; margin:20px; background:#0a0a0a; color:#0f0; }
        .container { max-width:1000px; margin:0 auto; }
        .header { background:#111; padding:20px; border-radius:10px; text-align:center; margin-bottom:20px; }
        .box { background:#111; padding:20px; border-radius:10px; margin:10px 0; }
        .live-data { font-size:2em; font-weight:bold; }
        .tai { color:#0f0; } .xiu { color:#f00; }
        a { color:#0ff; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔴 Sun.Win AI REST Super VIP</h1>
            <p>Ensemble Markov + Streak + Trend | 100k phiên</p>
            <p>Server: ${ip}:${PORT}</p>
        </div>
        <div class="box">
            <h2>🎲 Kết quả mới nhất</h2>
            <div class="live-data ${resultClass}">${resultHtml}</div>
            <p>Phiên: ${apiResponseData.Phien || 'N/A'}</p>
        </div>
        <div class="box">
            <h2>📡 API VIP</h2>
            <ul>
                <li><a href="/api/ditmemaysun">/api/ditmemaysun</a> - JSON mới nhất</li>
                <li><a href="/api/sunwin/history?limit=20">/api/sunwin/history</a> - Lịch sử (100k)</li>
                <li><a href="/api/sunwin/dudoan">/api/sunwin/dudoan</a> - Dự đoán phiên kế tiếp</li>
                <li><a href="/api/check">/api/check</a> - Kiểm tra dự đoán đúng/sai</li>
                <li><a href="/api/ai/status">/api/ai/status</a> - Trạng thái AI</li>
                <li><a href="/api/health">/api/health</a> - Health check</li>
            </ul>
        </div>
    </div>
    <script>
        setInterval(()=>{
            fetch('/api/ditmemaysun')
                .then(r=>r.json())
                .then(d=>{
                    if(d.Tong){
                        const el=document.querySelector('.live-data');
                        el.textContent = d.Xuc_xac_1+'-'+d.Xuc_xac_2+'-'+d.Xuc_xac_3+' = '+d.Tong+' ('+d.Ket_qua+')';
                        el.className = 'live-data '+(d.Ket_qua==='Tài'?'tai':'xiu');
                    }
                });
        },5000);
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

app.listen(PORT, '0.0.0.0', () => {
    console.log('=========================================');
    console.log('🚀 Sun.Win AI REST Super VIP Server');
    console.log('=========================================');
    console.log(`📡 http://${getLocalIP()}:${PORT}`);
    console.log(`🔌 Nguồn dữ liệu: ${API_URL}`);
    console.log('🧠 AI Ensemble: 10 Markov + Streak + Trend');
    console.log('=========================================');
});