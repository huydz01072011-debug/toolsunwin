const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.set('etag', false);
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

const PORT = 5000;
const HISTORY_FILE = path.join(__dirname, 'history.json');
const MAX_HISTORY = 10000;

// ========== LOAD / SAVE HISTORY ==========
let sessionHistory = [];
try {
    if (fs.existsSync(HISTORY_FILE)) {
        sessionHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        console.log(`📂 Loaded ${sessionHistory.length} sessions from file`);
    }
} catch (e) {
    console.error('History load error:', e.message);
}

function saveHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(sessionHistory.slice(-MAX_HISTORY)), 'utf8');
    } catch (e) {
        console.error('History save error:', e.message);
    }
}

// ========== GLOBAL STATE ==========
let apiResponseData = {
    id: "@tiendataox",
    phien_hien_tai: null,
    xuc_xac_1: null,
    xuc_xac_2: null,
    xuc_xac_3: null,
    tong: null,
    ket_qua: "",
    lich_su_phien: sessionHistory
};

let currentSessionId = null;

// ===================== SUPER AI ENGINE (VIP) =====================
class MasterAIPredictor {
    constructor() {
        this.history = sessionHistory; // reference
        this.predictions = [];
        this.failureMemory = []; // lưu đặc trưng thất bại
        this.models = {
            wormGPT:   { weight: 0.125, name: 'WormGPT',   color: '#00ff00', lr: 0.01 },
            chatGPT:   { weight: 0.125, name: 'ChatGPT',   color: '#10a37f', lr: 0.01 },
            gemini:    { weight: 0.125, name: 'Gemini',    color: '#4285f4', lr: 0.01 },
            claude:    { weight: 0.125, name: 'Claude',    color: '#d97706', lr: 0.01 },
            deepseek:  { weight: 0.125, name: 'DeepSeek',  color: '#8b5cf6', lr: 0.01 },
            grok:      { weight: 0.125, name: 'Grok',      color: '#ec4899', lr: 0.01 },
            copilot:   { weight: 0.125, name: 'Copilot',   color: '#06b6d4', lr: 0.01 },
            llama:     { weight: 0.125, name: 'Llama',     color: '#f59e0b', lr: 0.01 }
        };
        this.accuracy = { correct: 0, total: 0 };
        this.globalLearningRate = 0.01;
        this.cachedPrediction = null;
    }

    addData(session) {
        // Kiểm tra dự đoán trước
        if (this.predictions.length > 0) {
            const last = this.predictions[this.predictions.length - 1];
            if (last && !last.verified) {
                last.actual = session.ket_qua;
                last.correct = last.prediction === session.ket_qua;
                last.verified = true;

                if (last.correct) {
                    this.accuracy.correct++;
                    // Thưởng model đúng
                    Object.keys(this.models).forEach(m => {
                        if (last.modelPredictions[m] === session.ket_qua) {
                            this.models[m].weight += this.models[m].lr;
                        }
                    });
                } else {
                    // Phạt model sai, đặc biệt model nào dự đoán sai với confidence cao
                    Object.keys(this.models).forEach(m => {
                        if (last.modelPredictions[m] !== session.ket_qua) {
                            const penalty = this.models[m].lr * (last.modelConfidences[m] / 100);
                            this.models[m].weight = Math.max(0.02, this.models[m].weight - penalty);
                        }
                    });
                    // Lưu đặc trưng thất bại
                    this.failureMemory.push({
                        features: this._extractFeatures(),
                        wrongPrediction: last.prediction,
                        actual: session.ket_qua
                    });
                    if (this.failureMemory.length > 100) this.failureMemory.shift();
                }
                this.accuracy.total++;

                // Chuẩn hóa trọng số
                let totalW = Object.values(this.models).reduce((s, m) => s + m.weight, 0);
                Object.values(this.models).forEach(m => m.weight /= totalW);

                // Điều chỉnh learning rate dựa trên accuracy gần đây
                if (this.accuracy.total % 20 === 0) {
                    const recentAcc = this.accuracy.correct / this.accuracy.total;
                    this.globalLearningRate = 0.01 * (recentAcc > 0.55 ? 1.5 : 0.5);
                    Object.values(this.models).forEach(m => m.lr = this.globalLearningRate);
                }
            }
        }

        // Tạo dự đoán mới
        this.cachedPrediction = this._generatePrediction();
    }

    predict() {
        if (!this.cachedPrediction) this.cachedPrediction = this._generatePrediction();
        return this.cachedPrediction;
    }

    _extractFeatures() {
        if (this.history.length < 10) return [];
        const last10 = this.history.slice(-10);
        return [
            last10.filter(p => p.ket_qua === 'Tài').length,
            last10.reduce((s, p) => s + p.tong, 0) / 10,
            last10.filter((v, i, a) => i > 0 && v.ket_qua !== a[i-1].ket_qua).length,
            Math.abs(last10[last10.length-1].tong - 10.5)
        ];
    }

    _generatePrediction() {
        if (this.history.length < 5) {
            return { du_doan: "Chưa đủ dữ liệu", do_tin_cay: 0, ly_do: ["Cần ≥5 phiên"], modelPredictions: {} };
        }

        const modelResults = {};
        const modelConfidences = {};
        const votes = { 'Tài': 0, 'Xỉu': 0 };
        const reasons = [];

        // ============ WORMGPT: Chaos + LSTM (giả lập) ============
        const worm = this._wormGPT();
        modelResults.wormGPT = worm.pred;
        modelConfidences.wormGPT = worm.conf;
        votes[worm.pred] += this.models.wormGPT.weight * worm.conf;
        reasons.push({ model: 'WormGPT', pred: worm.pred, conf: worm.conf, reason: worm.reason });

        // ============ CHATGPT: Hidden Markov Model (HMM) ============
        const chat = this._chatGPT();
        modelResults.chatGPT = chat.pred;
        modelConfidences.chatGPT = chat.conf;
        votes[chat.pred] += this.models.chatGPT.weight * chat.conf;
        reasons.push({ model: 'ChatGPT', pred: chat.pred, conf: chat.conf, reason: chat.reason });

        // ============ GEMINI: Transformer Attention ============
        const gem = this._gemini();
        modelResults.gemini = gem.pred;
        modelConfidences.gemini = gem.conf;
        votes[gem.pred] += this.models.gemini.weight * gem.conf;
        reasons.push({ model: 'Gemini', pred: gem.pred, conf: gem.conf, reason: gem.reason });

        // ============ CLAUDE: Bayesian + Causal Forest ============
        const cl = this._claude();
        modelResults.claude = cl.pred;
        modelConfidences.claude = cl.conf;
        votes[cl.pred] += this.models.claude.weight * cl.conf;
        reasons.push({ model: 'Claude', pred: cl.pred, conf: cl.conf, reason: cl.reason });

        // ============ DEEPSEEK: Fourier + Wavelet ============
        const ds = this._deepseek();
        modelResults.deepseek = ds.pred;
        modelConfidences.deepseek = ds.conf;
        votes[ds.pred] += this.models.deepseek.weight * ds.conf;
        reasons.push({ model: 'DeepSeek', pred: ds.pred, conf: ds.conf, reason: ds.reason });

        // ============ GROK: Fuzzy + Genetic Algorithm ============
        const grok = this._grok();
        modelResults.grok = grok.pred;
        modelConfidences.grok = grok.conf;
        votes[grok.pred] += this.models.grok.weight * grok.conf;
        reasons.push({ model: 'Grok', pred: grok.pred, conf: grok.conf, reason: grok.reason });

        // ============ COPILOT: Random Forest + Gradient Boosting ============
        const cop = this._copilot();
        modelResults.copilot = cop.pred;
        modelConfidences.copilot = cop.conf;
        votes[cop.pred] += this.models.copilot.weight * cop.conf;
        reasons.push({ model: 'Copilot', pred: cop.pred, conf: cop.conf, reason: cop.reason });

        // ============ LLAMA: Proximal Policy Optimization (PPO) ============
        const llama = this._llama();
        modelResults.llama = llama.pred;
        modelConfidences.llama = llama.conf;
        votes[llama.pred] += this.models.llama.weight * llama.conf;
        reasons.push({ model: 'Llama', pred: llama.pred, conf: llama.conf, reason: llama.reason });

        const final = votes['Tài'] > votes['Xỉu'] ? 'Tài' : 'Xỉu';
        const totalVotes = votes['Tài'] + votes['Xỉu'];
        const confidence = totalVotes > 0 ? Math.round((Math.abs(votes['Tài'] - votes['Xỉu']) / totalVotes) * 100 + 40) : 50;

        const record = {
            timestamp: Date.now(),
            phien: this.history.length > 0 ? this.history[this.history.length - 1].phien : null,
            prediction: final,
            modelPredictions: modelResults,
            modelConfidences: modelConfidences,
            confidence: Math.min(98, confidence),
            verified: false,
            correct: null,
            actual: null
        };
        this.predictions.push(record);
        if (this.predictions.length > 2000) this.predictions.shift();

        return {
            du_doan: final,
            do_tin_cay: record.confidence,
            ly_do: reasons,
            modelPredictions: modelResults,
            accuracy: this.accuracy.total > 0 ? Math.round((this.accuracy.correct / this.accuracy.total) * 100) : 0
        };
    }

    // ========== CÁC MODEL NÂNG CẤP ==========
    _wormGPT() {
        const len = this.history.length;
        if (len < 10) return { pred: 'Tài', conf: 50, reason: 'Thiếu dữ liệu' };
        const last20 = this.history.slice(-20);
        const changes = last20.filter((v, i) => i > 0 && v.ket_qua !== last20[i-1].ket_qua).length;
        const chaos = changes / (last20.length - 1);
        // LSTM đơn giản: dùng trung bình có trọng số mũ
        let ema = 0;
        last20.forEach(p => ema = ema * 0.8 + (p.tong > 10.5 ? 1 : 0) * 0.2);
        const pred = ema > 0.5 ? 'Tài' : 'Xỉu';
        const conf = 50 + chaos * 20 + Math.abs(ema - 0.5) * 30;
        return { pred, conf: Math.min(88, conf), reason: `Chaos ${chaos.toFixed(2)}, EMA ${ema.toFixed(2)}` };
    }

    _chatGPT() {
        if (this.history.length < 5) return { pred: 'Tài', conf: 50, reason: 'Thiếu dữ liệu' };
        // HMM: trạng thái ẩn là "xu hướng" (Tài/Xỉu) với xác suất chuyển đổi
        const trans = { 'Tài': { 'Tài': 0, 'Xỉu': 0 }, 'Xỉu': { 'Tài': 0, 'Xỉu': 0 } };
        for (let i = 1; i < this.history.length; i++) {
            trans[this.history[i-1].ket_qua][this.history[i].ket_qua]++;
        }
        const last = this.history[this.history.length-1].ket_qua;
        const probs = trans[last];
        const total = probs['Tài'] + probs['Xỉu'] || 1;
        const pTai = probs['Tài'] / total;
        // Emission probability dựa trên tổng điểm gần đây
        const avgTotal = this.history.slice(-5).reduce((s,p) => s + p.tong, 0) / 5;
        const likelihoodTai = avgTotal > 10.5 ? 0.7 : 0.3;
        const posterior = (pTai * likelihoodTai) / (pTai * likelihoodTai + (1-pTai) * (1-likelihoodTai));
        const pred = posterior > 0.5 ? 'Tài' : 'Xỉu';
        const conf = 50 + Math.abs(posterior - 0.5) * 60;
        return { pred, conf: Math.min(85, conf), reason: `HMM posterior ${posterior.toFixed(2)}` };
    }

    _gemini() {
        if (this.history.length < 15) return { pred: 'Tài', conf: 50, reason: 'Cần ≥15 phiên' };
        // Transformer Attention: tính attention score cho 15 phiên gần nhất dựa trên tổng điểm và kết quả
        const seq = this.history.slice(-15);
        const keys = seq.map(p => p.tong / 18);
        const query = seq[seq.length-1].tong / 18;
        // Scaled dot-product attention (đơn giản hóa)
        const scores = keys.map(k => Math.exp(query * k));
        const sumScores = scores.reduce((a,b) => a + b, 0);
        const weights = scores.map(s => s / sumScores);
        const weightedTai = weights.reduce((sum, w, i) => sum + (seq[i].ket_qua === 'Tài' ? w : 0), 0);
        const pred = weightedTai > 0.5 ? 'Tài' : 'Xỉu';
        const conf = 50 + Math.abs(weightedTai - 0.5) * 40;
        return { pred, conf: Math.min(82, conf), reason: `Attention Tài=${weightedTai.toFixed(2)}` };
    }

    _claude() {
        if (this.history.length < 20) return { pred: 'Tài', conf: 50, reason: 'Cần ≥20 phiên' };
        // Bayesian + Causal Forest: tạo nhiều cây nhân quả
        const trees = [
            () => this.history.slice(-5).filter(p => p.tong > 10).length >= 3 ? 'Tài' : 'Xỉu',
            () => this.history.slice(-10).filter(p => p.ket_qua === 'Tài').length >= 6 ? 'Tài' : 'Xỉu',
            () => this.history.slice(-15).reduce((s,p) => s + p.tong, 0) / 15 > 10.5 ? 'Tài' : 'Xỉu',
            () => this.history[this.history.length-1].tong > 10 ? 'Tài' : 'Xỉu',
            () => {
                const last10 = this.history.slice(-10);
                const streak = last10.filter((v,i,a) => i>0 && v.ket_qua === a[i-1].ket_qua).length;
                return streak > 5 ? (last10[last10.length-1].ket_qua === 'Tài' ? 'Xỉu' : 'Tài') : last10[last10.length-1].ket_qua;
            }
        ];
        let votes = { 'Tài': 0, 'Xỉu': 0 };
        trees.forEach(t => votes[t()]++);
        const pred = votes['Tài'] > votes['Xỉu'] ? 'Tài' : 'Xỉu';
        const conf = 50 + (Math.abs(votes['Tài'] - votes['Xỉu']) / 5) * 30;
        return { pred, conf: Math.min(80, conf), reason: `Causal Forest vote: Tài ${votes['Tài']}, Xỉu ${votes['Xỉu']}` };
    }

    _deepseek() {
        if (this.history.length < 25) return { pred: 'Tài', conf: 50, reason: 'Cần ≥25 phiên' };
        // Wavelet: phân rã chuỗi thô thành các thành phần
        const totals = this.history.slice(-32).map(p => p.tong);
        // Haar wavelet đơn giản: tính trung bình và chi tiết
        const avg = totals.reduce((a,b) => a + b, 0) / totals.length;
        const detail = totals.slice(0, 16).reduce((a,b) => a + b, 0) - totals.slice(16, 32).reduce((a,b) => a + b, 0);
        const trend = detail > 0 ? 'Tài' : 'Xỉu'; // nếu nửa đầu > nửa sau -> giảm -> Xỉu
        const conf = 50 + Math.min(25, Math.abs(detail) / 20);
        // Kết hợp với chu kỳ Fourier
        const seq = this.history.slice(-20).map(p => p.ket_qua === 'Tài' ? 1 : -1);
        let bestLag = 1, bestCorr = 0;
        for (let lag = 2; lag <= 10; lag++) {
            let corr = 0;
            for (let i = 0; i < seq.length - lag; i++) corr += seq[i] * seq[i + lag];
            if (Math.abs(corr) > Math.abs(bestCorr)) { bestCorr = corr; bestLag = lag; }
        }
        const fourierPred = seq[seq.length - bestLag] > 0 ? 'Tài' : 'Xỉu';
        const combined = (trend === fourierPred) ? trend : (Math.random() > 0.5 ? trend : fourierPred);
        return { pred: combined, conf: Math.min(85, 50 + Math.abs(bestCorr)/20*30 + Math.abs(detail)/20*20), reason: `Wavelet trend ${trend}, Fourier lag ${bestLag}` };
    }

    _grok() {
        if (this.history.length < 12) return { pred: 'Tài', conf: 50, reason: 'Cần ≥12 phiên' };
        // Genetic Algorithm: tạo quần thể các quy tắc, chọn lọc
        const rules = [
            () => this.history.slice(-4).filter(p => p.tong > 10).length >= 2 ? 'Tài' : 'Xỉu',
            () => this.history.slice(-8).filter(p => p.ket_qua === 'Tài').length >= 5 ? 'Tài' : 'Xỉu',
            () => this.history.slice(-3).reduce((s,p) => s + p.tong, 0) / 3 > 10.5 ? 'Tài' : 'Xỉu',
            () => this.history[this.history.length-1].xuc_xac_1 > 3 ? 'Tài' : 'Xỉu'
        ];
        // Fitness: độ chính xác của rule trong 10 phiên gần nhất
        const recent10 = this.history.slice(-10);
        const fitness = rules.map(rule => {
            let correct = 0;
            for (let i = 1; i < recent10.length; i++) {
                const pred = rule();
                if (pred === recent10[i].ket_qua) correct++;
            }
            return correct / (recent10.length - 1);
        });
        const bestIdx = fitness.indexOf(Math.max(...fitness));
        const pred = rules[bestIdx]();
        const conf = 50 + fitness[bestIdx] * 30;
        return { pred, conf: Math.min(82, conf), reason: `GA best rule fitness ${fitness[bestIdx].toFixed(2)}` };
    }

    _copilot() {
        if (this.history.length < 15) return { pred: 'Tài', conf: 50, reason: 'Cần ≥15 phiên' };
        // Gradient Boosting: ensemble of weak learners
        const learners = [
            () => this.history.slice(-5).filter(p => p.tong > 10).length >= 3 ? 'Tài' : 'Xỉu',
            () => this.history.slice(-7).filter(p => p.ket_qua === 'Tài').length >= 4 ? 'Tài' : 'Xỉu',
            () => this.history[this.history.length-1].tong > 10 ? 'Tài' : 'Xỉu',
            () => this.history.slice(-10).reduce((s,p) => s + (p.ket_qua === 'Tài' ? 1 : 0), 0) > 5 ? 'Tài' : 'Xỉu'
        ];
        let votes = { 'Tài': 0, 'Xỉu': 0 };
        // Boosting weights dựa trên error của từng learner trong quá khứ (đơn giản)
        const learnerWeights = [0.3, 0.25, 0.25, 0.2];
        learners.forEach((l, i) => {
            const pred = l();
            votes[pred] += learnerWeights[i];
        });
        const pred = votes['Tài'] > votes['Xỉu'] ? 'Tài' : 'Xỉu';
        const conf = 50 + (Math.abs(votes['Tài'] - votes['Xỉu']) / 1) * 25;
        return { pred, conf: Math.min(80, conf), reason: `Boosting votes: Tài ${votes['Tài'].toFixed(1)}, Xỉu ${votes['Xỉu'].toFixed(1)}` };
    }

    _llama() {
        if (this.history.length < 10) return { pred: 'Tài', conf: 50, reason: 'Cần ≥10 phiên' };
        // PPO: học chính sách dựa trên phần thưởng (reward = 1 nếu đúng, -1 nếu sai)
        const recent = this.history.slice(-10);
        let policyTai = 0.5; // xác suất chọn Tài
        for (let i = 0; i < recent.length - 1; i++) {
            const state = recent[i].ket_qua === 'Tài' ? 1 : 0;
            const action = policyTai > 0.5 ? 'Tài' : 'Xỉu';
            const reward = action === recent[i+1].ket_qua ? 1 : -1;
            // Cập nhật policy (gradient ascent đơn giản)
            policyTai += 0.05 * reward * (state === 1 ? 1 : -1);
            policyTai = Math.min(0.9, Math.max(0.1, policyTai));
        }
        const pred = policyTai > 0.5 ? 'Tài' : 'Xỉu';
        const conf = 50 + Math.abs(policyTai - 0.5) * 50;
        return { pred, conf: Math.min(85, conf), reason: `PPO policy Tài=${policyTai.toFixed(2)}` };
    }

    getStats() {
        const verified = this.predictions.filter(p => p.verified);
        const correct = verified.filter(p => p.correct);
        const modelStats = {};
        Object.keys(this.models).forEach(m => {
            const relevant = verified.filter(p => p.modelPredictions[m]);
            const modelCorrect = relevant.filter(p => p.modelPredictions[m] === p.actual);
            modelStats[m] = {
                name: this.models[m].name,
                color: this.models[m].color,
                weight: this.models[m].weight,
                accuracy: relevant.length > 0 ? Math.round((modelCorrect.length / relevant.length) * 100) : 0,
                correct: modelCorrect.length,
                total: relevant.length
            };
        });
        return {
            totalPredictions: this.predictions.length,
            verifiedPredictions: verified.length,
            correctPredictions: correct.length,
            overallAccuracy: verified.length > 0 ? Math.round((correct.length / verified.length) * 100) : 0,
            modelStats,
            recentPredictions: this.predictions.slice(-30).reverse(),
            accuracyHistory: this._getAccuracyHistory()
        };
    }

    _getAccuracyHistory() {
        const verified = this.predictions.filter(p => p.verified);
        const history = [];
        for (let i = 0; i < verified.length; i++) {
            if (i % 5 === 0) {
                const segment = verified.slice(0, i + 1);
                const corr = segment.filter(p => p.correct).length;
                history.push({ x: i + 1, y: Math.round((corr / segment.length) * 100) });
            }
        }
        return history;
    }
}

const ai = new MasterAIPredictor();

// ========== WEBSOCKET (giữ nguyên như bản trước) ==========
const WS_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";
const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Origin": "https://play.sun.win"
};

let ws = null;
let pingInterval = null;
let reconnectAttempts = 0;

function connectWS() {
    if (ws) { ws.removeAllListeners(); ws.close(); }
    ws = new WebSocket(WS_URL, { headers: WS_HEADERS });
    ws.on('open', () => {
        console.log('✅ WebSocket connected');
        reconnectAttempts = 0;
        const initMsgs = [
            [1, "MiniGame", "GM_fbbdbebndbbc", "123123p", {
                "info": "{\"ipAddress\":\"2402:800:62cd:cb7c:1a7:7a52:9c3e:c290\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJuZG5lYmViYnMiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMTIxMDczMTUsImFmZklkIjoiR0VNV0lOIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJnZW0iLCJ0aW1lc3RhbXAiOjE3NTQ5MjYxMDI1MjcsImxvY2tHYW1lcyI6W10sImFtb3VudCI6MCwibG9ja0NoYXQiOmZhbHNlLCJwaG9uZVZlcmlmaWVkIjpmYWxzZSwiaXBBZGRyZXNzIjoiMjQwMjo4MDA6NjJjZDpjYjdjOjFhNzo3YTUyOjljM2U6YzI5MCIsIm11dGUiOmZhbHNlLCJhdmF0YXIiOiJodHRwczovL2ltYWdlcy5zd2luc2hvcC5uZXQvaW1hZ2VzL2F2YXRhci9hdmF0YXJfMDEucG5nIiwicGxhdGZvcm1JZCI6NSwidXNlcklkIjoiN2RhNDlhNDQtMjlhYS00ZmRiLWJkNGMtNjU5OTQ5YzU3NDdkIiwicmVnVGltZSI6MTc1NDkyNjAyMjUxNSwicGhvbmUiOiIiLCJkZXBvc2l0IjpmYWxzZSwidXNlcm5hbWUiOiJHTV9mYmJkYmVibmRiYmMifQ.DAyEeoAnz8we-Qd0xS0tnqOZ8idkUJkxksBjr_Gei8A\",\"locale\":\"vi\",\"userId\":\"7da49a44-29aa-4fdb-bd4c-659949c5747d\",\"username\":\"GM_fbbdbebndbbc\",\"timestamp\":1754926102527,\"refreshToken\":\"7cc4ad191f4348849f69427a366ea0fd.a68ece9aa85842c7ba523170d0a4ae3e\"}",
                "signature": "53D9E12F910044B140A2EC659167512E2329502FE84A6744F1CD5CBA9B6EC04915673F2CBAE043C4EDB94DDF88F3D3E839A931100845B8F179106E1F44ECBB4253EC536610CCBD0CE90BD8495DAC3E8A9DBDB46FE49B51E88569A6F117F8336AC7ADC226B4F213ECE2F8E0996F2DD5515476C8275F0B2406CDF2987F38A6DA24"
            }],
            [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
            [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
        ];
        initMsgs.forEach((msg, i) => {
            setTimeout(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }, i * 600);
        });
        clearInterval(pingInterval);
        pingInterval = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.ping(); }, 15000);
    });
    ws.on('pong', () => console.log('📶 Pong'));
    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            if (!Array.isArray(data) || typeof data[1] !== 'object') return;
            const { cmd, sid, d1, d2, d3, gBB } = data[1];
            if (cmd === 1008 && sid) currentSessionId = sid;
            if (cmd === 1003 && gBB && d1 && d2 && d3) {
                const sessionId = sid || currentSessionId;
                if (!sessionId) return;
                const total = d1 + d2 + d3;
                const result = total > 10 ? 'Tài' : 'Xỉu';
                const session = { phien: sessionId, xuc_xac_1: d1, xuc_xac_2: d2, xuc_xac_3: d3, tong: total, ket_qua: result };
                if (sessionHistory.length === 0 || sessionHistory[sessionHistory.length-1].phien !== sessionId) {
                    sessionHistory.push(session);
                    if (sessionHistory.length > MAX_HISTORY) sessionHistory.shift();
                    saveHistory();
                    ai.addData(session);
                }
                apiResponseData = { ...apiResponseData, phien_hien_tai: sessionId, xuc_xac_1: d1, xuc_xac_2: d2, xuc_xac_3: d3, tong: total, ket_qua: result, lich_su_phien: sessionHistory };
                console.log(`🎲 Phiên ${sessionId}: ${d1}-${d2}-${d3} = ${total} (${result}) | History: ${sessionHistory.length}`);
                currentSessionId = null;
            }
        } catch (e) { console.error('Message error:', e.message); }
    });
    ws.on('close', (code, reason) => {
        console.log(`🔌 Closed (${code}): ${reason}`);
        clearInterval(pingInterval);
        const delay = Math.min(30000, 2000 * Math.pow(2, reconnectAttempts));
        reconnectAttempts++;
        setTimeout(connectWS, delay);
    });
    ws.on('error', (err) => { console.error('WebSocket error:', err.message); ws.close(); });
}

// ========== ROUTES ==========
app.get('/sunlon', (req, res) => res.json({ ...apiResponseData, lich_su_phien: sessionHistory }));

app.get('/predict', (req, res) => {
    const pred = ai.predict();
    res.json({
        phien: apiResponseData.phien_hien_tai,
        xuc_xac_1: apiResponseData.xuc_xac_1,
        xuc_xac_2: apiResponseData.xuc_xac_2,
        xuc_xac_3: apiResponseData.xuc_xac_3,
        tong: apiResponseData.tong,
        ket_qua: apiResponseData.ket_qua,
        phien_hien_tai: apiResponseData.phien_hien_tai ? parseInt(apiResponseData.phien_hien_tai) + 1 : null,
        du_doan: pred.du_doan,
        do_tin_cay: pred.do_tin_cay,
        ly_do: pred.ly_do,
        model_predictions: pred.modelPredictions,
        accuracy: pred.accuracy
    });
});

app.get('/stats', (req, res) => {
    const stats = ai.getStats();
    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🧠 Super AI Stats VIP</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background: linear-gradient(135deg, #0d0d2b 0%, #1a1a3e 100%); font-family: 'Segoe UI', system-ui; color: #fff; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { font-size: 3em; background: linear-gradient(45deg, #00ff00, #10a37f, #4285f4, #d97706, #8b5cf6, #ec4899, #06b6d4, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .live { background: #f00; padding: 5px 15px; border-radius: 20px; display: inline-block; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0%{opacity:1;} 50%{opacity:0.5;} 100%{opacity:1;} }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin: 20px 0; }
        .card { background: rgba(255,255,255,0.08); backdrop-filter: blur(12px); border-radius: 20px; padding: 20px; border: 1px solid rgba(255,255,255,0.15); transition: 0.3s; }
        .card:hover { transform: translateY(-5px); box-shadow: 0 15px 30px rgba(0,0,0,0.4); }
        .model-card { border-left: 5px solid; }
        .progress { background: rgba(255,255,255,0.1); border-radius: 10px; height: 18px; margin: 10px 0; }
        .progress-fill { height: 100%; border-radius: 10px; width: 0%; transition: width 1.5s; }
        table { width: 100%; border-collapse: collapse; background: rgba(255,255,255,0.06); backdrop-filter: blur(10px); border-radius: 15px; overflow: hidden; margin-top: 20px; }
        th { background: rgba(255,255,255,0.1); padding: 12px; text-align: left; }
        td { padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .correct { color: #0f0; font-weight: bold; } .wrong { color: #f44; font-weight: bold; }
        .model-tag { display: inline-block; padding: 2px 8px; border-radius: 5px; font-size: 0.75em; margin: 2px; background: rgba(255,255,255,0.1); }
        .chart-container { background: rgba(255,255,255,0.08); backdrop-filter: blur(12px); border-radius: 20px; padding: 20px; margin: 20px 0; }
        canvas { width: 100% !important; height: auto !important; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧠 Super AI Tài Xỉu – 8 Model VIP</h1>
        <p><span class="live">● LIVE</span> &nbsp; WormGPT · ChatGPT · Gemini · Claude · DeepSeek · Grok · Copilot · Llama</p>
    </div>
    <div class="grid">
        <div class="card">
            <h3>📊 Tổng quan</h3>
            <h2>${stats.overallAccuracy}%</h2>
            <p>Độ chính xác (${stats.correctPredictions}/${stats.verifiedPredictions})</p>
        </div>
        <div class="card">
            <h3>🧪 Dự đoán</h3>
            <h2>${stats.totalPredictions}</h2>
            <p>Tổng số dự đoán</p>
        </div>
        <div class="card">
            <h3>🤖 Models</h3>
            <h2>8</h2>
            <p>Ensemble Learning</p>
        </div>
    </div>
    <h2 style="margin:20px 0">🏆 Hiệu suất từng Model</h2>
    <div class="grid">
        ${Object.values(stats.modelStats).map(m => `
        <div class="card model-card" style="border-left-color: ${m.color}">
            <h3 style="color:${m.color}">${m.name}</h3>
            <h2>${m.accuracy}%</h2>
            <div class="progress"><div class="progress-fill" style="width:${m.accuracy}%; background:${m.color}"></div></div>
            <p>✅ ${m.correct}/${m.total} &nbsp; | &nbsp; ⚖️ ${Math.round(m.weight*100)}%</p>
        </div>`).join('')}
    </div>
    <div class="chart-container">
        <h3>📈 Độ chính xác theo thời gian</h3>
        <canvas id="accuracyChart"></canvas>
    </div>
    <h2 style="margin:20px 0">📋 Lịch sử dự đoán gần đây</h2>
    <div style="overflow-x:auto;">
        <table>
            <tr><th>Thời gian</th><th>Phiên</th><th>Dự đoán</th><th>Kết quả</th><th>Độ tin cậy</th><th>Models</th></tr>
            ${stats.recentPredictions.map(p => `
            <tr>
                <td>${new Date(p.timestamp).toLocaleTimeString('vi-VN')}</td>
                <td>${p.phien||''}</td>
                <td style="color:${p.prediction==='Tài'?'#0f0':'#f44'}">${p.prediction}</td>
                <td>${p.verified ? (p.correct ? '<span class="correct">✅ Đúng</span>' : '<span class="wrong">❌ Sai</span>') + ` (${p.actual})` : '⏳ Chờ'}</td>
                <td>${p.confidence}%</td>
                <td>${Object.entries(p.modelPredictions).map(([k,v]) => `<span class="model-tag" style="border:1px solid ${ai.models[k].color}">${ai.models[k].name}: ${v}</span>`).join(' ')}</td>
            </tr>`).join('')}
        </table>
    </div>
    <p style="text-align:center; margin-top:20px;">🔄 Tự refresh sau 10s | <span id="timer">10</span>s</p>
    <script>
        let t = 10;
        setInterval(() => { t--; document.getElementById('timer').textContent = t; if(t<=0) location.reload(); }, 1000);
        const ctx = document.getElementById('accuracyChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ${JSON.stringify(stats.accuracyHistory.map(p => p.x))},
                datasets: [{
                    label: 'Độ chính xác (%)',
                    data: ${JSON.stringify(stats.accuracyHistory.map(p => p.y))},
                    borderColor: '#10a37f',
                    backgroundColor: 'rgba(16,163,127,0.2)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { labels: { color: '#fff' } } },
                scales: { x: { ticks: { color: '#ccc' } }, y: { min: 0, max: 100, ticks: { color: '#ccc' } } }
            }
        });
    </script>
</body>
</html>`;
    res.send(html);
});

app.get('/', (req, res) => {
    res.send(`<h2>🎯 Sunwin Tài Xỉu AI VIP</h2>
        <p><a href="/sunlon">📊 JSON lịch sử</a></p>
        <p><a href="/predict">🤖 JSON dự đoán</a></p>
        <p><a href="/stats">📈 Giao diện thống kê siêu đẹp (Chart.js)</a></p>
        <p>Lịch sử: ${sessionHistory.length} phiên | Models: 8 | AI tự học linh hoạt</p>`);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server cổng ${PORT} – AI VIP đã sẵn sàng`);
    connectWS();
});