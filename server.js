const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const os = require('os');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3001;

// ==================== CẤU HÌNH ====================
const WS_URL = 'wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0';
const WS_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': 'https://play.sun.win'
};
const INITIAL_MESSAGES = [
    [1, 'MiniGame', 'GM_apivopnhaan', 'WangLin', {
        info: '{"ipAddress":"113.185.45.88","wsToken":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJwbGFtYW1hIiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MzMxNDgxMTYyLCJhZmZJZCI6IkdFTVdJTiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzY2NDc0NzgwMDA2LCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjExMy4xODUuNDUuODgiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzE4LnBuZyIsInBsYXRmb3JtSWQiOjUsInVzZXJJZCI6IjZhOGI0ZDM4LTFlYzEtNDUxYi1hYTA1LWYyZDkwYWFhNGM1MCIsInJlZ1RpbWUiOjE3NjY0NzQ3NTEzOTEsInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiR01fYXBpdm9wbmhhYW4ifQ.YFOscbeojWNlRo7490BtlzkDGYmwVpnlgOoh04oCJy4","locale":"vi","userId":"6a8b4d38-1ec1-451b-aa05-f2d90aaa4c50","username":"GM_apivopnhaan","timestamp":1766474780007,"refreshToken":"63d5c9be0c494b74b53ba150d69039fd.7592f06d63974473b4aaa1ea849b2940"}',
        signature: '66772A1641AA8B18BD99207CE448EA00ECA6D8A4D457C1FF13AB092C22C8DECF0C0014971639A0FBA9984701A91FCCBE3056ABC1BE1541D1C198AA18AF3C45595AF6601F8B048947ADF8F48A9E3E074162F9BA3E6C0F7543D38BD54FD4C0A2C56D19716CC5353BBC73D12C3A92F78C833F4EFFDC4AB99E55C77AD2CDFA91E296'
    }],
    [6, 'MiniGame', 'taixiuPlugin', { cmd: 1005 }],
    [6, 'MiniGame', 'lobbyPlugin', { cmd: 10001 }]
];

// ==================== DỮ LIỆU CHÍNH ====================
let apiResponseData = {
    Phien: null, Xuc_xac_1: null, Xuc_xac_2: null, Xuc_xac_3: null,
    Tong: null, Ket_qua: '', id: '@HuyDaiXuVN',
    server_time: new Date().toISOString()
};
let currentSessionId = null;
const MAX_HISTORY = 100000;
const patternHistory = [];  // {session, dice, total, result, timestamp}

// ==================== AI ENSEMBLE SIÊU VIP ====================
class MarkovModel {
    constructor(order) {
        this.order = order;
        this.chain = new Map(); // state -> {T: count, X: count}
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
        // Back-off: thử bậc thấp hơn
        for (let len = this.order; len >= 1; len--) {
            const state = history.slice(-len).join('');
            if (this.chain.has(state)) {
                const counts = this.chain.get(state);
                if (counts.T > counts.X) return 'T';
                if (counts.X > counts.T) return 'X';
                return null; // hòa
            }
        }
        return null;
    }
}

class StreakDetector {
    constructor() {
        this.mode = null; // 'bet_T','bet_X','one_one','two_one'
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
        this.resultHistory = []; // mảng 'T'/'X'

        // Điểm số gần đây của từng mô hình (cửa sổ 100)
        this.modelScores = {
            markov: this.MARKOV_ORDERS.map(() => []), // mỗi mảng lưu {correct: bool}
            streak: [],
            trend: []
        };
        this.WINDOW = 100;
        this.pendingPreds = null; // lưu dự đoán trước khi có kết quả
    }

    update(actual) {
        // Thêm vào lịch sử
        if (this.resultHistory.length >= MAX_HISTORY) this.resultHistory.shift();
        this.resultHistory.push(actual);

        // Huấn luyện Markov
        for (const mm of this.markovModels) {
            mm.learn(this.resultHistory, actual);
        }

        // Phát hiện cầu
        this.streakDetector.detect(this.resultHistory);

        // Đánh giá các dự đoán trước đó (nếu có)
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
        // Lưu dự đoán của từng mô hình
        const markovPreds = this.markovModels.map(mm => mm.predict(this.resultHistory));
        const streakPred = this.streakDetector.predict(this.resultHistory);
        const trendPred = this.trendAnalyzer.predict(this.resultHistory);
        this.pendingPreds = {
            markov: markovPreds,
            streak: streakPred,
            trend: trendPred
        };

        // Tính trọng số dựa trên accuracy gần đây
        const weights = this.getWeights();

        // Bầu cử
        const votes = { T: 0, X: 0 };
        for (let i = 0; i < markovPreds.length; i++) {
            if (markovPreds[i]) votes[markovPreds[i]] += weights.markov[i];
        }
        if (streakPred) votes[streakPred] += weights.streak;
        if (trendPred) votes[trendPred] += weights.trend;

        let prediction;
        let confidence;
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

    getWeights() {
        // Tính accuracy cho từng model trong cửa sổ gần đây
        const calcAcc = (scores) => {
            if (scores.length === 0) return 0;
            return scores.filter(s => s.correct).length / scores.length;
        };
        const markovAcc = this.modelScores.markov.map(scores => calcAcc(scores));
        const streakAcc = calcAcc(this.modelScores.streak);
        const trendAcc = calcAcc(this.modelScores.trend);

        // Gán trọng số = accuracy (nếu tất cả =0 thì đều bằng 1)
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
        const weights = this.getWeights();
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
let pendingPrediction = null;  // dự đoán cho phiên hiện tại
const predictions = [];        // lịch sử dự đoán đã kiểm chứng

// ==================== WEBSOCKET CLIENT ====================
let ws = null;
let pingInterval = null;
let reconnectTimeout = null;
let reconnectAttempts = 0;

function getLocalIP() {
    const ifaces = os.networkInterfaces();
    for (const name in ifaces) {
        for (const iface of ifaces[name]) {
            if (!iface.internal && iface.family === 'IPv4') return iface.address;
        }
    }
    return '127.0.0.1';
}

function connectWebSocket() {
    if (ws) {
        ws.removeAllListeners();
        ws.close();
    }

    ws = new WebSocket(WS_URL, { headers: WS_HEADERS });

    ws.on('open', () => {
        console.log('[✅] WebSocket connected');
        reconnectAttempts = 0;
        // Gửi các message khởi tạo
        INITIAL_MESSAGES.forEach((msg, i) => {
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
            }, i * 600);
        });
        // Heartbeat ping
        clearInterval(pingInterval);
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.ping();
        }, 15000);
    });

    ws.on('pong', () => {}); // silent

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (!Array.isArray(data) || typeof data[1] !== 'object') return;
            const { cmd, sid, d1, d2, d3, gBB } = data[1];

            // Phiên mới
            if (cmd === 1008 && sid) {
                currentSessionId = parseInt(sid) || sid;
                console.log(`[🎮] Phiên mới: ${currentSessionId}`);
                // Tạo dự đoán cho phiên này
                if (patternHistory.length > 0) {
                    const { prediction, confidence } = ai.predict();
                    pendingPrediction = {
                        Phien_du_doan: currentSessionId,
                        Du_doan: prediction,
                        Do_tin_cay: confidence,
                        Thoi_gian_du_doan: new Date().toISOString(),
                        Ket_qua_thuc_te: null,
                        Dung_hay_sai: null
                    };
                } else {
                    pendingPrediction = {
                        Phien_du_doan: currentSessionId,
                        Du_doan: Math.random() < 0.5 ? 'Tài' : 'Xỉu',
                        Do_tin_cay: 50,
                        Thoi_gian_du_doan: new Date().toISOString(),
                        Ket_qua_thuc_te: null,
                        Dung_hay_sai: null
                    };
                }
            }

            // Kết quả phiên
            if (cmd === 1003 && gBB) {
                if (d1 === undefined || d2 === undefined || d3 === undefined) return;
                const total = d1 + d2 + d3;
                const result = total > 10 ? 'Tài' : 'Xỉu';
                const sessionId = currentSessionId;

                // Cập nhật API
                apiResponseData = {
                    Phien: sessionId,
                    Xuc_xac_1: d1,
                    Xuc_xac_2: d2,
                    Xuc_xac_3: d3,
                    Tong: total,
                    Ket_qua: result,
                    id: '@cskh_huydaixu',
                    server_time: new Date().toISOString(),
                    update_count: (apiResponseData.update_count || 0) + 1
                };

                console.log(`[🎲] Phiên ${sessionId}: ${d1}-${d2}-${d3} = ${total} (${result})`);

                // Lưu lịch sử
                patternHistory.push({
                    session: sessionId,
                    dice: [d1, d2, d3],
                    total,
                    result,
                    timestamp: new Date().toISOString()
                });
                if (patternHistory.length > MAX_HISTORY) patternHistory.shift();

                // Cập nhật AI
                ai.update(result === 'Tài' ? 'T' : 'X');

                // Kiểm tra dự đoán
                if (pendingPrediction && pendingPrediction.Phien_du_doan === sessionId) {
                    pendingPrediction.Ket_qua_thuc_te = result;
                    pendingPrediction.Dung_hay_sai = (pendingPrediction.Du_doan === result);
                    predictions.push({ ...pendingPrediction });
                    pendingPrediction = null;
                }

                currentSessionId = null;
            }
        } catch (e) {
            console.error('[❌] Message parse error:', e.message);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[🔌] Disconnected (${code}): ${reason}`);
        clearInterval(pingInterval);
        const delay = Math.min(30000, 2500 * Math.pow(2, reconnectAttempts));
        reconnectAttempts++;
        console.log(`[⏳] Reconnecting in ${delay/1000}s...`);
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectWebSocket, delay);
    });

    ws.on('error', (err) => {
        console.error('[❌] WebSocket error:', err.message);
        ws.close(); // sẽ kích hoạt close event
    });
}

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
    const next = latest.session + 1;
    const { prediction, confidence } = ai.predict();
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
        websocket: ws ? ws.readyState === WebSocket.OPEN : false,
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
    <title>Sun.Win AI Super VIP</title>
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
            <h1>🔴 Sun.Win AI Super VIP</h1>
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

// ==================== START ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log('=========================================');
    console.log('🚀 Sun.Win AI Super VIP Server');
    console.log('=========================================');
    console.log(`📡 http://${getLocalIP()}:${PORT}`);
    console.log('🧠 AI Ensemble: 10 Markov + Streak + Trend');
    console.log('=========================================');
    connectWebSocket();
});