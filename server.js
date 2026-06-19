const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const os = require('os');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3001;

// ==================== DỮ LIỆU CHÍNH ====================
let apiResponseData = {
    "Phien": null,
    "Xuc_xac_1": null,
    "Xuc_xac_2": null,
    "Xuc_xac_3": null,
    "Tong": null,
    "Ket_qua": "",
    "id": "@HuyDaiXuVN",
    "server_time": new Date().toISOString()
};

let currentSessionId = null;                 // ID phiên hiện tại (đang chờ kết quả)
const MAX_HISTORY = 100000;                 // Lưu tối đa 100.000 phiên
const patternHistory = [];                  // Lịch sử chi tiết {session, dice, total, result, timestamp}

// ==================== AI ENSEMBLE SIÊU VIP ====================
class EnsembleAI {
    constructor() {
        this.ORDER_MAX = 10;                 // Markov bậc cao nhất
        this.STREAK_THRESHOLD = 3;           // Ngưỡng phát hiện cầu
        this.RECENT_WINDOW = 100;            // Số phiên gần nhất để đánh giá hiệu suất mô hình

        // Markov Models: Map<bậc, Map<state, {T: count, X: count}>>
        this.markovModels = new Map();
        for (let i = 1; i <= this.ORDER_MAX; i++) {
            this.markovModels.set(i, new Map());
        }

        // Lịch sử kết quả dạng mảng ['T','X'] – dùng cho huấn luyện
        this.resultHistory = [];

        // Lưu trữ các dự đoán gần đây của từng mô hình (để tính accuracy)
        this.modelPredictions = new Map();   // bậc -> [{predict, actual, correct}]
        for (let i = 1; i <= this.ORDER_MAX; i++) {
            this.modelPredictions.set(i, []);
        }

        // Trọng số của từng mô hình (tổng = 1), cập nhật liên tục
        this.weights = new Map();
        this.initWeights();

        // Phát hiện cầu
        this.streakMode = null;             // 'bet_T', 'bet_X', 'one_one', 'two_one', null
        this.streakWeight = 0.25;           // Trọng số của thành phần cầu trong tổng hợp

        // Biến tạm lưu dự đoán từng mô hình trước khi có kết quả
        this.pendingModelPreds = null;
    }

    initWeights() {
        for (let i = 1; i <= this.ORDER_MAX; i++) {
            this.weights.set(i, 1 / this.ORDER_MAX);
        }
    }

    // Cập nhật toàn bộ hệ thống khi có kết quả thực tế (actualResult: 'T' hoặc 'X')
    update(actualResult) {
        // 1. Thêm vào lịch sử kết quả (giới hạn 100k)
        if (this.resultHistory.length >= MAX_HISTORY) {
            this.resultHistory.shift();
        }
        this.resultHistory.push(actualResult);

        // 2. Cập nhật tất cả mô hình Markov (bậc 1..ORDER_MAX)
        for (let order = 1; order <= this.ORDER_MAX; order++) {
            if (this.resultHistory.length > order) {
                // State là chuỗi ORDER phần tử trước đó
                const state = this.resultHistory.slice(-order - 1, -1).join('');
                const next = actualResult;
                const model = this.markovModels.get(order);
                if (!model.has(state)) {
                    model.set(state, { T: 0, X: 0 });
                }
                const counts = model.get(state);
                counts[next]++;
                model.set(state, counts);
            }
        }

        // 3. Đánh giá dự đoán trước đó (nếu có) và cập nhật điểm cho từng mô hình
        this.evaluatePreviousPredictions(actualResult);

        // 4. Cập nhật trọng số dựa trên độ chính xác gần đây
        this.updateAdaptiveWeights();

        // 5. Phát hiện cầu
        this.detectStreak();
    }

    // Dự đoán kết quả tiếp theo (trả về { prediction: 'Tài'|'Xỉu', confidence: % })
    predict() {
        // Lưu dự đoán của từng mô hình trước khi tổng hợp (để đánh giá sau)
        this.saveIndividualPredictions();

        // Nếu chưa đủ dữ liệu → ngẫu nhiên 50%
        if (this.resultHistory.length < this.ORDER_MAX) {
            const rand = Math.random() < 0.5 ? 'Tài' : 'Xỉu';
            return { prediction: rand, confidence: 50 };
        }

        // Tổng hợp phiếu bầu từ tất cả mô hình Markov
        const votes = { T: 0, X: 0 };
        for (let order = 1; order <= this.ORDER_MAX; order++) {
            const pred = this.predictMarkov(order);
            if (pred) {
                const weight = this.weights.get(order) || 0;
                votes[pred] += weight;
            }
        }

        // Thêm phiếu từ phát hiện cầu
        const streakPred = this.predictStreak();
        if (streakPred) {
            votes[streakPred] += this.streakWeight;
        }

        // Quyết định cuối cùng
        let prediction;
        let confidence;
        const totalWeight = votes.T + votes.X;
        if (totalWeight === 0) {
            prediction = Math.random() < 0.5 ? 'Tài' : 'Xỉu';
            confidence = 50;
        } else {
            if (votes.T > votes.X) {
                prediction = 'Tài';
                confidence = (votes.T / totalWeight) * 100;
            } else if (votes.X > votes.T) {
                prediction = 'Xỉu';
                confidence = (votes.X / totalWeight) * 100;
            } else {
                // Hoà → random nhưng vẫn tính confidence dựa trên cân bằng
                prediction = Math.random() < 0.5 ? 'Tài' : 'Xỉu';
                confidence = 50;
            }
        }

        return {
            prediction,
            confidence: Math.round(confidence * 100) / 100
        };
    }

    // Dự đoán từ Markov bậc `order` (có back-off)
    predictMarkov(order) {
        if (this.resultHistory.length < order) return null;
        let state = this.resultHistory.slice(-order).join('');
        const model = this.markovModels.get(order);
        // Back-off: thử bậc nhỏ hơn nếu không tìm thấy state
        for (let len = order; len >= 1; len--) {
            const subState = this.resultHistory.slice(-len).join('');
            if (model.has(subState)) {
                const counts = model.get(subState);
                if (counts.T + counts.X === 0) return null;
                if (counts.T > counts.X) return 'T';
                if (counts.X > counts.T) return 'X';
                return null; // hoà → không dự đoán
            }
        }
        return null;
    }

    // Phát hiện mẫu cầu và trả về dự đoán theo cầu (hoặc null)
    detectStreak() {
        const len = this.resultHistory.length;
        if (len < this.STREAK_THRESHOLD) {
            this.streakMode = null;
            return;
        }
        const last3 = this.resultHistory.slice(-3).join('');
        if (last3 === 'TTT') {
            this.streakMode = 'bet_T';
        } else if (last3 === 'XXX') {
            this.streakMode = 'bet_X';
        } else if (len >= 4 && this.resultHistory.slice(-4).join('') === 'TXTX') {
            this.streakMode = 'one_one';
        } else if (len >= 5) {
            const last5 = this.resultHistory.slice(-5).join('');
            if (last5 === 'TTXTT' || last5 === 'XXTXX') {
                this.streakMode = 'two_one';
            } else {
                this.streakMode = null;
            }
        } else {
            this.streakMode = null;
        }
    }

    predictStreak() {
        if (!this.streakMode) return null;
        const last = this.resultHistory[this.resultHistory.length - 1];
        switch (this.streakMode) {
            case 'bet_T': return 'T';
            case 'bet_X': return 'X';
            case 'one_one': return last === 'T' ? 'X' : 'T';
            case 'two_one': 
                // Mẫu 2-1: nếu vừa có X sau 2 T, khả năng cao quay lại T; và ngược lại
                // Đơn giản hoá: nếu chuỗi kết thúc bằng T thì dự đoán X (theo nhịp 2T-1X-2T...)
                // Ta lấy phần tử cuối: nếu last === 'T' dự đoán 'X', ngược lại 'T'
                return last === 'T' ? 'X' : 'T';
            default: return null;
        }
    }

    // Lưu dự đoán riêng của từng mô hình (sẽ được đánh giá khi có kết quả thực tế)
    saveIndividualPredictions() {
        this.pendingModelPreds = new Map();
        for (let order = 1; order <= this.ORDER_MAX; order++) {
            const pred = this.predictMarkov(order);
            if (pred) {
                this.pendingModelPreds.set(order, pred);
            }
        }
    }

    // Sau khi có kết quả, đánh giá các dự đoán đã lưu
    evaluatePreviousPredictions(actualResult) {
        if (!this.pendingModelPreds) return;
        for (let order = 1; order <= this.ORDER_MAX; order++) {
            if (this.pendingModelPreds.has(order)) {
                const pred = this.pendingModelPreds.get(order);
                const correct = (pred === actualResult);
                const scores = this.modelPredictions.get(order);
                scores.push({ predict: pred, actual: actualResult, correct });
                if (scores.length > this.RECENT_WINDOW) {
                    scores.shift();
                }
            }
        }
        this.pendingModelPreds = null; // đã xử lý xong
    }

    // Cập nhật trọng số dựa trên độ chính xác gần đây (cửa sổ RECENT_WINDOW phiên)
    updateAdaptiveWeights() {
        const accuracies = new Map();
        let totalAcc = 0;
        for (let order = 1; order <= this.ORDER_MAX; order++) {
            const scores = this.modelPredictions.get(order);
            if (scores.length === 0) {
                accuracies.set(order, 0);
            } else {
                const correct = scores.filter(s => s.correct).length;
                const acc = correct / scores.length;
                accuracies.set(order, acc);
                totalAcc += acc;
            }
        }
        if (totalAcc === 0) {
            this.initWeights();
        } else {
            for (let order = 1; order <= this.ORDER_MAX; order++) {
                const w = accuracies.get(order) / totalAcc;
                this.weights.set(order, w);
            }
        }
    }
}

// Khởi tạo AI toàn cục
const ai = new EnsembleAI();

// ==================== QUẢN LÝ DỰ ĐOÁN ====================
let pendingPrediction = null;              // Dự đoán cho phiên hiện tại (chưa có kết quả)
const predictions = [];                    // Lịch sử các dự đoán đã kiểm chứng

// ==================== WEBSOCKET ====================
const WEBSOCKET_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";
const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Origin": "https://play.sun.win"
};
const RECONNECT_DELAY = 2500;
const PING_INTERVAL = 15000;

const initialMessages = [
    [
        1, "MiniGame", "GM_apivopnhaan", "WangLin",
        {
            "info": "{\"ipAddress\":\"113.185.45.88\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJwbGFtYW1hIiwiYm90IjowLCJpc01lcmNoYW50IjpmYWxzZSwidmVyaWZpZWRCYW5rQWNjb3VudCI6ZmFsc2UsInBsYXlFdmVudExvYmJ5IjpmYWxzZSwiY3VzdG9tZXJJZCI6MzMxNDgxMTYyLCJhZmZJZCI6IkdFTVdJTiIsImJhbm5lZCI6ZmFsc2UsImJyYW5kIjoiZ2VtIiwidGltZXN0YW1wIjoxNzY2NDc0NzgwMDA2LCJsb2NrR2FtZXMiOltdLCJhbW91bnQiOjAsImxvY2tDaGF0IjpmYWxzZSwicGhvbmVWZXJpZmllZCI6ZmFsc2UsImlwQWRkcmVzcyI6IjExMy4xODUuNDUuODgiLCJtdXRlIjpmYWxzZSwiYXZhdGFyIjoiaHR0cHM6Ly9pbWFnZXMuc3dpbnNob3AubmV0L2ltYWdlcy9hdmF0YXIvYXZhdGFyXzE4LnBuZyIsInBsYXRmb3JtSWQiOjUsInVzZXJJZCI6IjZhOGI0ZDM4LTFlYzEtNDUxYi1hYTA1LWYyZDkwYWFhNGM1MCIsInJlZ1RpbWUiOjE3NjY0NzQ3NTEzOTEsInBob25lIjoiIiwiZGVwb3NpdCI6ZmFsc2UsInVzZXJuYW1lIjoiR01fYXBpdm9wbmhhYW4ifQ.YFOscbeojWNlRo7490BtlzkDGYmwVpnlgOoh04oCJy4\",\"locale\":\"vi\",\"userId\":\"6a8b4d38-1ec1-451b-aa05-f2d90aaa4c50\",\"username\":\"GM_apivopnhaan\",\"timestamp\":1766474780007,\"refreshToken\":\"63d5c9be0c494b74b53ba150d69039fd.7592f06d63974473b4aaa1ea849b2940\"}",
            "signature": "66772A1641AA8B18BD99207CE448EA00ECA6D8A4D457C1FF13AB092C22C8DECF0C0014971639A0FBA9984701A91FCCBE3056ABC1BE1541D1C198AA18AF3C45595AF6601F8B048947ADF8F48A9E3E074162F9BA3E6C0F7543D38BD54FD4C0A2C56D19716CC5353BBC73D12C3A92F78C833F4EFFDC4AB99E55C77AD2CDFA91E296"
        }
    ],
    [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
    [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
];

let ws = null;
let pingInterval = null;
let reconnectTimeout = null;

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]) {
            if (!iface.internal && iface.family === 'IPv4') {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function connectWebSocket() {
    if (ws) {
        ws.removeAllListeners();
        ws.close();
    }

    ws = new WebSocket(WEBSOCKET_URL, { headers: WS_HEADERS });

    ws.on('open', () => {
        console.log('[✅] WebSocket connected to Sun.Win');
        initialMessages.forEach((msg, i) => {
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(msg));
                }
            }, i * 600);
        });

        clearInterval(pingInterval);
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
        }, PING_INTERVAL);
    });

    ws.on('pong', () => {
        console.log('[📶] Ping OK');
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (!Array.isArray(data) || typeof data[1] !== 'object') return;

            const { cmd, sid, d1, d2, d3, gBB } = data[1];

            // --- PHIÊN MỚI ---
            if (cmd === 1008 && sid) {
                currentSessionId = parseInt(sid) || sid;
                console.log(`[🎮] Phiên mới: ${currentSessionId}`);

                // Tạo dự đoán cho chính phiên này (sẽ kiểm tra khi có kết quả)
                if (patternHistory.length > 0) {
                    // Lưu dự đoán riêng của từng model trước khi tổng hợp (để sau này đánh giá)
                    ai.saveIndividualPredictions();
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
                    // Chưa có lịch sử, dự đoán ngẫu nhiên
                    const randPred = Math.random() < 0.5 ? 'Tài' : 'Xỉu';
                    pendingPrediction = {
                        Phien_du_doan: currentSessionId,
                        Du_doan: randPred,
                        Do_tin_cay: 50,
                        Thoi_gian_du_doan: new Date().toISOString(),
                        Ket_qua_thuc_te: null,
                        Dung_hay_sai: null
                    };
                }
            }

            // --- KẾT QUẢ ---
            if (cmd === 1003 && gBB) {
                if (!d1 || !d2 || !d3) return;

                const total = d1 + d2 + d3;
                const result = (total > 10) ? "Tài" : "Xỉu";
                const sessionId = currentSessionId;

                // Cập nhật dữ liệu API
                apiResponseData = {
                    "Phien": sessionId,
                    "Xuc_xac_1": d1,
                    "Xuc_xac_2": d2,
                    "Xuc_xac_3": d3,
                    "Tong": total,
                    "Ket_qua": result,
                    "id": "@cskh_huydaixu",
                    "server_time": new Date().toISOString(),
                    "update_count": (apiResponseData.update_count || 0) + 1
                };

                console.log(`[🎲] Phiên ${sessionId}: ${d1}-${d2}-${d3} = ${total} (${result})`);

                // Lưu vào lịch sử chi tiết (giới hạn 100k)
                patternHistory.push({
                    session: sessionId,
                    dice: [d1, d2, d3],
                    total: total,
                    result: result,
                    timestamp: new Date().toISOString()
                });
                if (patternHistory.length > MAX_HISTORY) {
                    patternHistory.shift();
                }

                // Cập nhật AI với kết quả thực tế
                ai.update(result === 'Tài' ? 'T' : 'X');

                // Kiểm tra pending prediction
                if (pendingPrediction && pendingPrediction.Phien_du_doan === sessionId) {
                    pendingPrediction.Ket_qua_thuc_te = result;
                    pendingPrediction.Dung_hay_sai = (pendingPrediction.Du_doan === result);
                    predictions.push({ ...pendingPrediction });
                    pendingPrediction = null; // Đã giải quyết
                }

                // Reset phiên hiện tại
                currentSessionId = null;
            }
        } catch (e) {
            console.error('[❌] Lỗi xử lý message:', e.message);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[🔌] WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
        clearInterval(pingInterval);
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY);
    });

    ws.on('error', (err) => {
        console.error('[❌] WebSocket error:', err.message);
        ws.close();
    });
}

// ==================== ROUTES API ====================

app.get('/api/ditmemaysun', (req, res) => {
    res.json(apiResponseData);
});

// Lịch sử (hỗ trợ limit, all)
app.get('/api/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const all = req.query.all === 'true';
    const historySlice = all ? patternHistory : patternHistory.slice(-limit);
    res.json({
        current: apiResponseData,
        history: historySlice,
        total: patternHistory.length,
        max_storage: MAX_HISTORY
    });
});

// Lịch sử SunWin (format riêng)
app.get('/api/sunwin/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const all = req.query.all === 'true';
    const lastItems = all ? patternHistory : patternHistory.slice(-limit);
    const formatted = lastItems.map(item => ({
        "Ket_qua": item.result,
        "Phien": item.session,
        "Tong": item.total,
        "Xuc_xac_1": item.dice[0],
        "Xuc_xac_2": item.dice[1],
        "Xuc_xac_3": item.dice[2],
        "id": "@cskh_huydaixu"
    }));
    res.json(formatted);
});

// Dự đoán siêu VIP (dành cho phiên tiếp theo)
app.get('/api/sunwin/dudoan', (req, res) => {
    if (patternHistory.length === 0) {
        return res.json({ message: "Chưa có dữ liệu lịch sử để dự đoán." });
    }

    const latestSession = patternHistory[patternHistory.length - 1];
    const nextSession = latestSession.session + 1;

    // Dự đoán từ AI (không ảnh hưởng đến pendingPrediction của hệ thống)
    ai.saveIndividualPredictions();  // Lưu để đánh giá nếu cần (có thể bỏ qua vì không có kết quả ngay)
    const { prediction, confidence } = ai.predict();

    res.json({
        "Ket_qua": latestSession.result,
        "Phien": latestSession.session,
        "Xuc_xac_1": latestSession.dice[0],
        "Xuc_xac_2": latestSession.dice[1],
        "Xuc_xac_3": latestSession.dice[2],
        "Tong": latestSession.total,
        "Phien_hien_tai": nextSession,
        "Du_doan": prediction,
        "Do_tin_cay": confidence
    });
});

// Kiểm tra lịch sử dự đoán & thống kê đúng/sai
app.get('/api/check', (req, res) => {
    const total = predictions.length;
    const correct = predictions.filter(p => p.Dung_hay_sai === true).length;
    const accuracy = total > 0 ? ((correct / total) * 100).toFixed(2) : 0;

    res.json({
        predictions_history: predictions.map(p => ({
            Phien_du_doan: p.Phien_du_doan,
            Du_doan: p.Du_doan,
            Do_tin_cay: p.Do_tin_cay,
            Thoi_gian_du_doan: p.Thoi_gian_du_doan,
            Ket_qua_thuc_te: p.Ket_qua_thuc_te,
            Dung_hay_sai: p.Dung_hay_sai
        })),
        stats: {
            total_predictions: total,
            correct: correct,
            incorrect: total - correct,
            accuracy_percent: parseFloat(accuracy)
        },
        current_pending_prediction: pendingPrediction ? {
            Phien_du_doan: pendingPrediction.Phien_du_doan,
            Du_doan: pendingPrediction.Du_doan,
            Do_tin_cay: pendingPrediction.Do_tin_cay
        } : null
    });
});

// Thống kê Tài/Xỉu
app.get('/api/stats', (req, res) => {
    const taiCount = patternHistory.filter(item => item.result === "Tài").length;
    const xiuCount = patternHistory.filter(item => item.result === "Xỉu").length;
    const totalSessions = patternHistory.length;
    res.json({
        total_sessions: totalSessions,
        tai_count: taiCount,
        xiu_count: xiuCount,
        tai_percentage: totalSessions > 0 ? ((taiCount / totalSessions) * 100).toFixed(2) : 0,
        xiu_percentage: totalSessions > 0 ? ((xiuCount / totalSessions) * 100).toFixed(2) : 0,
        last_update: apiResponseData.server_time,
        server_uptime: process.uptime().toFixed(0) + 's'
    });
});

// Health check (thêm thông tin AI)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        websocket: ws ? ws.readyState === WebSocket.OPEN : false,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        history_count: patternHistory.length,
        ai_markov_states: Array.from(ai.markovModels.entries()).reduce((sum, entry) => sum + entry[1].size, 0),
        ai_streak_mode: ai.streakMode,
        predictions_made: predictions.length
    });
});

// Giao diện chính
app.get('/', (req, res) => {
    const localIP = getLocalIP();
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Sun.Win AI VIP - Worm GPT</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #0a0a0a; color: #00ff00; }
            .container { max-width: 1200px; margin: 0 auto; }
            .header { text-align: center; padding: 20px; background: #111; border-radius: 10px; margin-bottom: 20px; }
            .data-box { background: #111; padding: 20px; border-radius: 10px; margin: 10px 0; }
            .live-data { font-size: 2em; font-weight: bold; }
            .tai { color: #00ff00; } .xiu { color: #ff0000; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            a { color: #00ffff; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔴 Sun.Win Live Data - AI Ensemble VIP</h1>
                <p>Worm GPT Edition | Multi‑Markov + Streak | 100k phiên</p>
                <p>Server: ${localIP}:${PORT}</p>
            </div>
            <div class="grid">
                <div class="data-box">
                    <h2>🎲 Kết quả mới nhất</h2>
                    <div class="live-data ${apiResponseData.Ket_qua === 'Tài' ? 'tai' : 'xiu'}">
                        ${apiResponseData.Tong ? `${apiResponseData.Xuc_xac_1}-${apiResponseData.Xuc_xac_2}-${apiResponseData.Xuc_xac_3} = ${apiResponseData.Tong} (${apiResponseData.Ket_qua})` : 'Đang chờ...'}
                    </div>
                    <p>Phiên: ${apiResponseData.Phien || 'N/A'}</p>
                    <p>Time: ${apiResponseData.server_time || 'N/A'}</p>
                </div>
                <div class="data-box">
                    <h2>📡 API VIP</h2>
                    <ul>
                        <li><a href="/api/ditmemaysun">/api/ditmemaysun</a> - JSON mới nhất</li>
                        <li><a href="/api/sunwin/history?limit=20">/api/sunwin/history</a> - Lịch sử (tối đa 100k)</li>
                        <li><a href="/api/sunwin/dudoan">/api/sunwin/dudoan</a> - Dự đoán phiên kế tiếp</li>
                        <li><a href="/api/check">/api/check</a> - Kiểm tra dự đoán & thống kê</li>
                        <li><a href="/api/stats">/api/stats</a> - Thống kê Tài/Xỉu</li>
                        <li><a href="/api/health">/api/health</a> - Trạng thái server + AI</li>
                    </ul>
                </div>
            </div>
        </div>
        <script>
            setInterval(() => {
                fetch('/api/ditmemaysun')
                    .then(res => res.json())
                    .then(data => {
                        if(data.Tong) {
                            const div = document.querySelector('.live-data');
                            div.textContent = `${data.Xuc_xac_1}-${data.Xuc_xac_2}-${data.Xuc_xac_3} = ${data.Tong} (${data.Ket_qua})`;
                            div.className = `live-data ${data.Ket_qua === 'Tài' ? 'tai' : 'xiu'}`;
                        }
                    });
            }, 5000);
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// ==================== KHỞI ĐỘNG ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================`);
    console.log(`🚀 WORM GPT Sun.Win AI VIP Server`);
    console.log(`=========================================`);
    console.log(`📡 Server running on:`);
    console.log(`   Local: http://localhost:${PORT}`);
    console.log(`   Network: http://${getLocalIP()}:${PORT}`);
    console.log(`=========================================`);
    console.log(`🧠 AI Ensemble: Markov 1-10 + Streak + Adaptive Weights`);
    console.log(`📚 Learning from up to ${MAX_HISTORY} sessions`);
    console.log(`🔌 Connecting to Sun.Win WebSocket...`);
    console.log(`=========================================\n`);
    connectWebSocket();
});