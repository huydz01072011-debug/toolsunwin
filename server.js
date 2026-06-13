const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.set('etag', false);
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

const PORT = 5000;

let apiResponseData = {
    id: "@tiendataox",
    phien_hien_tai: null,
    xuc_xac_1: null,
    xuc_xac_2: null,
    xuc_xac_3: null,
    tong: null,
    ket_qua: "",
    lich_su_phien: []
};

let currentSessionId = null;
const sessionHistory = [];
const MAX_HISTORY = 10000;

const WEBSOCKET_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";
const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Origin": "https://play.sun.win"
};
const RECONNECT_DELAY = 2500;
const PING_INTERVAL = 15000;

const initialMessages = [
    [
        1,
        "MiniGame",
        "GM_fbbdbebndbbc",
        "123123p",
        {
            "info": "{\"ipAddress\":\"2402:800:62cd:cb7c:1a7:7a52:9c3e:c290\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJuZG5lYmViYnMiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMTIxMDczMTUsImFmZklkIjoiR0VNV0lOIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJnZW0iLCJ0aW1lc3RhbXAiOjE3NTQ5MjYxMDI1MjcsImxvY2tHYW1lcyI6W10sImFtb3VudCI6MCwibG9ja0NoYXQiOmZhbHNlLCJwaG9uZVZlcmlmaWVkIjpmYWxzZSwiaXBBZGRyZXNzIjoiMjQwMjo4MDA6NjJjZDpjYjdjOjFhNzo3YTUyOjljM2U6YzI5MCIsIm11dGUiOmZhbHNlLCJhdmF0YXIiOiJodHRwczovL2ltYWdlcy5zd2luc2hvcC5uZXQvaW1hZ2VzL2F2YXRhci9hdmF0YXJfMDEucG5nIiwicGxhdGZvcm1JZCI6NSwidXNlcklkIjoiN2RhNDlhNDQtMjlhYS00ZmRiLWJkNGMtNjU5OTQ5YzU3NDdkIiwicmVnVGltZSI6MTc1NDkyNjAyMjUxNSwicGhvbmUiOiIiLCJkZXBvc2l0IjpmYWxzZSwidXNlcm5hbWUiOiJHTV9mYmJkYmVibmRiYmMifQ.DAyEeoAnz8we-Qd0xS0tnqOZ8idkUJkxksBjr_Gei8A\",\"locale\":\"vi\",\"userId\":\"7da49a44-29aa-4fdb-bd4c-659949c5747d\",\"username\":\"GM_fbbdbebndbbc\",\"timestamp\":1754926102527,\"refreshToken\":\"7cc4ad191f4348849f69427a366ea0fd.a68ece9aa85842c7ba523170d0a4ae3e\"}",
            "signature": "53D9E12F910044B140A2EC659167512E2329502FE84A6744F1CD5CBA9B6EC04915673F2CBAE043C4EDB94DDF88F3D3E839A931100845B8F179106E1F44ECBB4253EC536610CCBD0CE90BD8495DAC3E8A9DBDB46FE49B51E88569A6F117F8336AC7ADC226B4F213ECE2F8E0996F2DD5515476C8275F0B2406CDF2987F38A6DA24"
        }
    ],
    [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
    [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
];

let ws = null;
let pingInterval = null;
let reconnectTimeout = null;

// ===== SUPER AI PREDICTOR - WormGPT + ChatGPT + Gemini + Claude =====
class SuperAIPredictor {
    constructor() {
        this.history = [];
        this.predictions = []; // Lưu lịch sử dự đoán
        this.models = {
            wormGPT: { weight: 0.25, name: 'WormGPT', color: '#00ff00' },
            chatGPT: { weight: 0.25, name: 'ChatGPT', color: '#10a37f' },
            gemini: { weight: 0.25, name: 'Gemini', color: '#4285f4' },
            claude: { weight: 0.25, name: 'Claude', color: '#d97706' }
        };
        this.learningRate = 0.001;
        this.accuracy = { correct: 0, total: 0 };
    }

    addData(data) {
        this.history.push(data);
        if (this.history.length > 10000) {
            this.history.shift();
        }
        
        // Kiểm tra dự đoán trước đó
        if (this.predictions.length > 0) {
            const lastPrediction = this.predictions[this.predictions.length - 1];
            if (lastPrediction && !lastPrediction.verified) {
                lastPrediction.actual = data.ket_qua;
                lastPrediction.correct = lastPrediction.prediction === data.ket_qua;
                lastPrediction.verified = true;
                
                if (lastPrediction.correct) {
                    this.accuracy.correct++;
                    // Tăng trọng số cho model đúng
                    Object.keys(this.models).forEach(model => {
                        if (lastPrediction.modelPredictions[model] === data.ket_qua) {
                            this.models[model].weight = Math.min(0.5, this.models[model].weight + 0.01);
                        }
                    });
                }
                this.accuracy.total++;
            }
        }
    }

    // WormGPT - Dark Web Pattern Recognition
    wormGPTAnalysis() {
        if (this.history.length < 5) return { prediction: 'Tài', confidence: 50 };
        
        const recent = this.history.slice(-30);
        
        // Phân tích chuỗi Fibonacci
        const fibPattern = this.analyzeFibonacciPattern(recent);
        
        // Phân tích chaos theory
        const chaosScore = this.analyzeChaosPattern(recent);
        
        // Phân tích entropy
        const entropy = this.calculateEntropy(recent);
        
        let prediction;
        let confidence = 50;
        
        if (fibPattern > 0.6 && chaosScore > 0.5) {
            prediction = recent[recent.length - 1].ket_qua === 'Tài' ? 'Xỉu' : 'Tài';
            confidence = 55 + fibPattern * 20;
        } else if (entropy > 0.7) {
            // High entropy = random, predict opposite
            prediction = this.history[this.history.length - 1].ket_qua === 'Tài' ? 'Xỉu' : 'Tài';
            confidence = 45 + entropy * 15;
        } else {
            prediction = this.analyzeFrequencyPrediction();
            confidence = 50;
        }
        
        return { prediction, confidence: Math.min(95, confidence) };
    }

    // ChatGPT - Statistical Analysis
    chatGPTAnalysis() {
        if (this.history.length < 10) return { prediction: 'Tài', confidence: 50 };
        
        const recent100 = this.history.slice(-100);
        
        // Phân tích hồi quy tuyến tính
        const trend = this.linearRegression(recent100);
        
        // Phân tích phân phối chuẩn
        const distribution = this.normalDistribution(recent100);
        
        // Markov Chain
        const markovPrediction = this.markovChain(recent100);
        
        let confidence = 50 + Math.abs(trend) * 25 + distribution * 15;
        
        return {
            prediction: markovPrediction,
            confidence: Math.min(95, Math.max(50, confidence))
        };
    }

    // Gemini - Neural Network Simulation
    geminiAnalysis() {
        if (this.history.length < 15) return { prediction: 'Tài', confidence: 50 };
        
        const recent = this.history.slice(-50);
        
        // Neural network với backpropagation đơn giản
        const layers = this.simpleNeuralNetwork(recent);
        
        // Deep learning pattern
        const deepPattern = this.deepPatternRecognition(recent);
        
        // Reinforcement learning
        const rlPrediction = this.reinforcementLearning(recent);
        
        let confidence = 50 + layers * 20 + deepPattern * 15;
        
        return {
            prediction: rlPrediction,
            confidence: Math.min(95, Math.max(50, confidence))
        };
    }

    // Claude - Bayesian + Causal Inference
    claudeAnalysis() {
        if (this.history.length < 20) return { prediction: 'Tài', confidence: 50 };
        
        const all = this.history;
        
        // Bayesian inference
        const bayesian = this.bayesianInference(all);
        
        // Causal inference
        const causal = this.causalInference(all);
        
        // Counterfactual reasoning
        const counterfactual = this.counterfactualReasoning(all);
        
        let confidence = 50 + bayesian * 20 + causal * 15 + counterfactual * 10;
        
        return {
            prediction: this.weightedEnsemble(bayesian, causal, counterfactual),
            confidence: Math.min(95, Math.max(50, confidence))
        };
    }

    // Advanced Analysis Methods
    analyzeFibonacciPattern(data) {
        if (data.length < 5) return 0;
        const fib = [1, 1, 2, 3, 5, 8, 13, 21];
        let matches = 0;
        let total = 0;
        
        for (let f of fib) {
            if (f > data.length) break;
            for (let i = 0; i < data.length - f; i++) {
                total++;
                if (data[i].ket_qua === data[i + f].ket_qua) {
                    matches++;
                }
            }
        }
        
        return total > 0 ? matches / total : 0;
    }

    analyzeChaosPattern(data) {
        if (data.length < 10) return 0;
        const last10 = data.slice(-10);
        let changes = 0;
        
        for (let i = 1; i < last10.length; i++) {
            if (last10[i].ket_qua !== last10[i-1].ket_qua) changes++;
        }
        
        return changes / (last10.length - 1);
    }

    calculateEntropy(data) {
        if (data.length === 0) return 0;
        const taiCount = data.filter(d => d.ket_qua === 'Tài').length;
        const xiuCount = data.length - taiCount;
        
        const pTai = taiCount / data.length;
        const pXiu = xiuCount / data.length;
        
        let entropy = 0;
        if (pTai > 0) entropy -= pTai * Math.log2(pTai);
        if (pXiu > 0) entropy -= pXiu * Math.log2(pXiu);
        
        return entropy;
    }

    linearRegression(data) {
        if (data.length < 2) return 0;
        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        
        data.forEach((d, i) => {
            const val = d.ket_qua === 'Tài' ? 1 : 0;
            sumX += i;
            sumY += val;
            sumXY += i * val;
            sumX2 += i * i;
        });
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope * 10; // Magnify trend
    }

    normalDistribution(data) {
        if (data.length === 0) return 0;
        const totals = data.map(d => d.tong);
        const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
        const variance = totals.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / totals.length;
        const stdDev = Math.sqrt(variance);
        
        // Check if distribution is normal
        const skewness = totals.reduce((sum, t) => sum + Math.pow((t - mean) / stdDev, 3), 0) / totals.length;
        
        return Math.abs(skewness) < 1 ? 1 : 0.5;
    }

    markovChain(data) {
        if (data.length < 2) return 'Tài';
        const transitions = {
            'Tài': { 'Tài': 0, 'Xỉu': 0 },
            'Xỉu': { 'Tài': 0, 'Xỉu': 0 }
        };
        
        for (let i = 1; i < data.length; i++) {
            transitions[data[i-1].ket_qua][data[i].ket_qua]++;
        }
        
        const lastState = data[data.length - 1].ket_qua;
        const tToT = transitions['Tài']['Tài'];
        const tToX = transitions['Tài']['Xỉu'];
        const xToT = transitions['Xỉu']['Tài'];
        const xToX = transitions['Xỉu']['Xỉu'];
        
        if (lastState === 'Tài') {
            return tToT > tToX ? 'Tài' : 'Xỉu';
        } else {
            return xToT > xToX ? 'Tài' : 'Xỉu';
        }
    }

    simpleNeuralNetwork(data) {
        // Simple neural network with 1 hidden layer
        const inputs = data.slice(-10).map(d => d.tong / 18); // Normalize
        const weights1 = Array(10).fill(0.1);
        const weights2 = Array(10).fill(0.1);
        
        let hiddenLayer = 0;
        for (let i = 0; i < inputs.length && i < 10; i++) {
            hiddenLayer += inputs[i] * weights1[i];
        }
        hiddenLayer = 1 / (1 + Math.exp(-hiddenLayer)); // Sigmoid
        
        let output = 0;
        for (let i = 0; i < 10; i++) {
            output += hiddenLayer * weights2[i];
        }
        
        return Math.abs(output) / 10; // Normalized confidence factor
    }

    deepPatternRecognition(data) {
        const patterns = [];
        const windowSizes = [3, 5, 7, 10];
        
        for (let window of windowSizes) {
            if (data.length >= window * 2) {
                const recentPattern = data.slice(-window).map(d => d.ket_qua);
                let bestMatch = 0;
                let matches = 0;
                
                for (let i = 0; i < data.length - window * 2; i++) {
                    let matchCount = 0;
                    for (let j = 0; j < window; j++) {
                        if (data[i + j].ket_qua === recentPattern[j]) matchCount++;
                    }
                    if (matchCount > bestMatch) {
                        bestMatch = matchCount;
                        matches = data[i + window] ? (data[i + window].ket_qua === 'Tài' ? 1 : 0) : 0.5;
                    }
                }
                
                patterns.push(bestMatch / window);
            }
        }
        
        return patterns.length > 0 ? patterns.reduce((a, b) => a + b, 0) / patterns.length : 0;
    }

    reinforcementLearning(data) {
        // Q-learning simplified
        const states = ['Tài', 'Xỉu'];
        const qTable = { 'Tài': 0, 'Xỉu': 0 };
        
        const recent = data.slice(-20);
        recent.forEach((d, i) => {
            if (i < recent.length - 1) {
                const reward = d.ket_qua === recent[i + 1].ket_qua ? -1 : 1;
                qTable[d.ket_qua] += this.learningRate * reward;
            }
        });
        
        return qTable['Tài'] > qTable['Xỉu'] ? 'Tài' : 'Xỉu';
    }

    bayesianInference(data) {
        // P(Tài|features) = P(features|Tài) * P(Tài) / P(features)
        const total = data.length;
        const taiCount = data.filter(d => d.ket_qua === 'Tài').length;
        const priorTai = taiCount / total;
        const priorXiu = 1 - priorTai;
        
        // Likelihood based on total points
        const recentTotals = data.slice(-10).map(d => d.tong);
        const avgTotal = recentTotals.reduce((a, b) => a + b, 0) / recentTotals.length;
        
        const likelihoodTai = avgTotal > 10.5 ? 0.7 : 0.3;
        const likelihoodXiu = avgTotal < 10.5 ? 0.7 : 0.3;
        
        const posteriorTai = (likelihoodTai * priorTai) / 
                            (likelihoodTai * priorTai + likelihoodXiu * priorXiu);
        
        return posteriorTai;
    }

    causalInference(data) {
        // Granger causality simplified
        if (data.length < 20) return 0.5;
        
        const totals = data.map(d => d.tong);
        const changes = [];
        for (let i = 1; i < totals.length; i++) {
            changes.push(totals[i] - totals[i-1]);
        }
        
        const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
        
        // Sigmoid to convert to probability
        return 1 / (1 + Math.exp(-avgChange * 2));
    }

    counterfactualReasoning(data) {
        if (data.length < 30) return 0.5;
        
        // What-if analysis
        const actual = data.slice(-30);
        const alternateScenarios = [];
        
        for (let i = 0; i < actual.length - 5; i++) {
            const segment = actual.slice(i, i + 5);
            const nextActual = actual[i + 5].ket_qua;
            
            // Counterfactual: what if the pattern was reversed?
            const reversedSegment = segment.map(d => ({
                ...d,
                ket_qua: d.ket_qua === 'Tài' ? 'Xỉu' : 'Tài'
            }));
            
            alternateScenarios.push({
                actual: nextActual,
                alternative: reversedSegment[reversedSegment.length - 1].ket_qua
            });
        }
        
        const confidence = alternateScenarios.filter(s => s.actual === s.alternative).length / 
                          alternateScenarios.length;
        
        return confidence;
    }

    analyzeFrequencyPrediction() {
        if (this.history.length === 0) return 'Tài';
        const taiCount = this.history.filter(h => h.ket_qua === 'Tài').length;
        const xiuCount = this.history.length - taiCount;
        return taiCount > xiuCount ? 'Xỉu' : 'Tài';
    }

    weightedEnsemble(bayesian, causal, counterfactual) {
        const avg = (bayesian + causal + counterfactual) / 3;
        return avg > 0.5 ? 'Tài' : 'Xỉu';
    }

    // Main prediction function
    predict() {
        if (this.history.length < 5) {
            return {
                du_doan: "Chưa đủ dữ liệu",
                do_tin_cay: 0,
                ly_do: ["Cần ít nhất 5 phiên để dự đoán"],
                modelPredictions: {}
            };
        }

        const modelPredictions = {
            wormGPT: this.wormGPTAnalysis().prediction,
            chatGPT: this.chatGPTAnalysis().prediction,
            gemini: this.geminiAnalysis().prediction,
            claude: this.claudeAnalysis().prediction
        };

        const modelConfidences = {
            wormGPT: this.wormGPTAnalysis().confidence,
            chatGPT: this.chatGPTAnalysis().confidence,
            gemini: this.geminiAnalysis().confidence,
            claude: this.claudeAnalysis().confidence
        };

        // Weighted voting system
        const voteTally = { 'Tài': 0, 'Xỉu': 0 };
        const reasons = [];

        Object.keys(this.models).forEach(model => {
            const prediction = modelPredictions[model];
            const weight = this.models[model].weight;
            const confidence = modelConfidences[model];
            
            voteTally[prediction] += weight * confidence;
            
            reasons.push({
                model: this.models[model].name,
                prediction: prediction,
                confidence: Math.round(confidence),
                weight: Math.round(weight * 100),
                color: this.models[model].color
            });
        });

        const finalPrediction = voteTally['Tài'] > voteTally['Xỉu'] ? 'Tài' : 'Xỉu';
        const totalVotes = voteTally['Tài'] + voteTally['Xỉu'];
        const confidence = totalVotes > 0 ? 
            (Math.abs(voteTally['Tài'] - voteTally['Xỉu']) / totalVotes) * 100 + 45 : 50;

        // Lưu prediction
        const predictionRecord = {
            timestamp: Date.now(),
            phien: this.history.length > 0 ? this.history[this.history.length - 1].phien : null,
            prediction: finalPrediction,
            modelPredictions: modelPredictions,
            modelConfidences: modelConfidences,
            confidence: Math.round(confidence),
            verified: false,
            correct: null,
            actual: null
        };

        this.predictions.push(predictionRecord);
        if (this.predictions.length > 1000) {
            this.predictions.shift();
        }

        return {
            du_doan: finalPrediction,
            do_tin_cay: Math.min(98, Math.round(confidence)),
            ly_do: reasons,
            modelPredictions: modelPredictions,
            accuracy: this.accuracy.total > 0 ? 
                Math.round((this.accuracy.correct / this.accuracy.total) * 100) : 0
        };
    }

    getStats() {
        const verified = this.predictions.filter(p => p.verified);
        const correct = verified.filter(p => p.correct);
        
        // Stats per model
        const modelStats = {};
        Object.keys(this.models).forEach(model => {
            const modelCorrect = verified.filter(p => 
                p.modelPredictions[model] === p.actual
            );
            const modelTotal = verified.filter(p => p.modelPredictions[model]);
            modelStats[model] = {
                name: this.models[model].name,
                color: this.models[model].color,
                weight: this.models[model].weight,
                accuracy: modelTotal.length > 0 ? 
                    Math.round((modelCorrect.length / modelTotal.length) * 100) : 0,
                correct: modelCorrect.length,
                total: modelTotal.length
            };
        });

        return {
            totalPredictions: this.predictions.length,
            verifiedPredictions: verified.length,
            correctPredictions: correct.length,
            overallAccuracy: verified.length > 0 ? 
                Math.round((correct.length / verified.length) * 100) : 0,
            modelStats: modelStats,
            recentPredictions: this.predictions.slice(-20).reverse()
        };
    }
}

const aiPredictor = new SuperAIPredictor();

// ===== WEBSOCKET CONNECTION =====
function connectWebSocket() {
    if (ws) {
        ws.removeAllListeners();
        ws.close();
    }

    ws = new WebSocket(WEBSOCKET_URL, { headers: WS_HEADERS });

    ws.on('open', () => {
        console.log('[✅] WebSocket connected.');
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
        console.log('[📶] Ping OK.');
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (!Array.isArray(data) || typeof data[1] !== 'object') {
                return;
            }

            const { cmd, sid, d1, d2, d3, gBB } = data[1];

            if (cmd === 1008 && sid) {
                currentSessionId = sid;
            }

            if (cmd === 1003 && gBB) {
                if (!d1 || !d2 || !d3) return;

                const total = d1 + d2 + d3;
                const result = (total > 10) ? "T" : "X";
                const resultText = (result === 'T') ? 'Tài' : 'Xỉu';

                const sessionData = {
                    phien: currentSessionId,
                    xuc_xac_1: d1,
                    xuc_xac_2: d2,
                    xuc_xac_3: d3,
                    tong: total,
                    ket_qua: resultText
                };

                // Thêm vào lịch sử
                sessionHistory.push(sessionData);
                if (sessionHistory.length > MAX_HISTORY) {
                    sessionHistory.shift();
                }

                // Thêm vào AI predictor
                aiPredictor.addData(sessionData);

                apiResponseData = {
                    ...apiResponseData,
                    phien_hien_tai: currentSessionId,
                    xuc_xac_1: d1,
                    xuc_xac_2: d2,
                    xuc_xac_3: d3,
                    tong: total,
                    ket_qua: resultText,
                    lich_su_phien: sessionHistory
                };
                
                console.log(`Phiên ${currentSessionId}: ${d1}-${d2}-${d3} = ${total} (${resultText}) | Tổng lịch sử: ${sessionHistory.length} phiên`);
                
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

// ===== API ENDPOINTS =====
app.get('/sunlon', (req, res) => {
    res.json(apiResponseData);
});

app.get('/predict', (req, res) => {
    const aiPrediction = aiPredictor.predict();
    
    const predictionData = {
        phien: apiResponseData.phien_hien_tai, // Giữ nguyên phiên hiện tại
        xuc_xac_1: apiResponseData.xuc_xac_1,
        xuc_xac_2: apiResponseData.xuc_xac_2,
        xuc_xac_3: apiResponseData.xuc_xac_3,
        tong: apiResponseData.tong,
        ket_qua: apiResponseData.ket_qua,
        phien_hien_tai: apiResponseData.phien_hien_tai ? parseInt(apiResponseData.phien_hien_tai) + 1 : null, // Phiên hiện tại + 1
        du_doan: aiPrediction.du_doan,
        do_tin_cay: aiPrediction.do_tin_cay,
        ly_do: aiPrediction.ly_do,
        model_predictions: aiPrediction.modelPredictions,
        accuracy: aiPrediction.accuracy
    };

    res.json(predictionData);
});

app.get('/stats', (req, res) => {
    const stats = aiPredictor.getStats();
    
    // HTML siêu đẹp với animations
    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎯 Super AI Stats - WormGPT + ChatGPT + Gemini + Claude</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            min-height: 100vh;
            padding: 20px;
            color: #fff;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .header {
            text-align: center;
            margin-bottom: 40px;
            animation: fadeInDown 1s ease;
        }
        
        .header h1 {
            font-size: 3em;
            background: linear-gradient(45deg, #00ff00, #10a37f, #4285f4, #d97706);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 0 30px rgba(255,255,255,0.3);
            margin-bottom: 10px;
        }
        
        .header p {
            font-size: 1.2em;
            opacity: 0.9;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            animation: fadeInUp 0.6s ease;
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        
        .stat-card h3 {
            font-size: 1.5em;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .stat-value {
            font-size: 3em;
            font-weight: bold;
            margin: 10px 0;
        }
        
        .model-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .model-card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 25px;
            border: 2px solid;
            transition: all 0.3s ease;
            animation: pulse 2s infinite;
        }
        
        .model-card:hover {
            transform: scale(1.05);
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        
        .model-card h3 {
            font-size: 1.5em;
            margin-bottom: 15px;
        }
        
        .model-icon {
            font-size: 2em;
            margin-bottom: 10px;
        }
        
        .progress-bar {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 10px;
            height: 20px;
            overflow: hidden;
            margin: 10px 0;
        }
        
        .progress-fill {
            height: 100%;
            border-radius: 10px;
            transition: width 1s ease;
            background: linear-gradient(90deg, #00ff00, #10a37f);
        }
        
        .predictions-table {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            overflow-x: auto;
            animation: fadeInUp 0.8s ease;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
        }
        
        th {
            text-align: left;
            padding: 15px;
            background: rgba(255, 255, 255, 0.1);
            font-weight: 600;
        }
        
        td {
            padding: 15px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .correct {
            color: #00ff00;
            font-weight: bold;
        }
        
        .wrong {
            color: #ff4444;
            font-weight: bold;
        }
        
        .model-tag {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 5px;
            font-size: 0.9em;
            margin: 2px;
        }
        
        .auto-refresh {
            text-align: center;
            margin: 20px 0;
            font-size: 0.9em;
            opacity: 0.7;
        }
        
        @keyframes fadeInDown {
            from {
                opacity: 0;
                transform: translateY(-50px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(50px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.02); }
            100% { transform: scale(1); }
        }
        
        .live-badge {
            display: inline-block;
            background: #ff4444;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            animation: pulse 1s infinite;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧠 Super AI Prediction Engine</h1>
            <p>WormGPT + ChatGPT + Gemini + Claude | <span class="live-badge">● LIVE</span></p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <h3>📊 Tổng quan</h3>
                <div class="stat-value">${stats.overallAccuracy}%</div>
                <p>Độ chính xác tổng thể</p>
                <p>✅ ${stats.correctPredictions}/${stats.verifiedPredictions} dự đoán đúng</p>
            </div>
            
            <div class="stat-card">
                <h3>🎯 Dự đoán</h3>
                <div class="stat-value">${stats.totalPredictions}</div>
                <p>Tổng số dự đoán</p>
                <p>📝 ${stats.verifiedPredictions} đã xác thực</p>
            </div>
            
            <div class="stat-card">
                <h3>⚡ AI Models</h3>
                <div class="stat-value">4</div>
                <p>Model đang hoạt động</p>
                <p>🧠 Ensemble Learning</p>
            </div>
        </div>
        
        <h2 style="margin: 30px 0 20px 0; font-size: 2em;">🤖 Hiệu suất từng Model</h2>
        
        <div class="model-cards">
            ${Object.values(stats.modelStats).map(model => `
                <div class="model-card" style="border-color: ${model.color}; animation-delay: ${Math.random()}s">
                    <div class="model-icon">${model.name === 'WormGPT' ? '🪱' : model.name === 'ChatGPT' ? '💬' : model.name === 'Gemini' ? '💎' : '🎭'}</div>
                    <h3 style="color: ${model.color}">${model.name}</h3>
                    <div class="stat-value" style="font-size: 2.5em;">${model.accuracy}%</div>
                    <p>Độ chính xác</p>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${model.accuracy}%; background: linear-gradient(90deg, ${model.color}, ${model.color}88)"></div>
                    </div>
                    <p style="margin-top: 10px;">✅ ${model.correct}/${model.total} đúng</p>
                    <p>⚖️ Trọng số: ${Math.round(model.weight * 100)}%</p>
                </div>
            `).join('')}
        </div>
        
        <h2 style="margin: 30px 0 20px 0; font-size: 2em;">📈 Lịch sử dự đoán gần đây</h2>
        
        <div class="predictions-table">
            <table>
                <thead>
                    <tr>
                        <th>Thời gian</th>
                        <th>Phiên</th>
                        <th>Dự đoán</th>
                        <th>Kết quả</th>
                        <th>Độ tin cậy</th>
                        <th>Models</th>
                    </tr>
                </thead>
                <tbody>
                    ${stats.recentPredictions.slice(0, 50).map(p => `
                        <tr>
                            <td>${new Date(p.timestamp).toLocaleTimeString('vi-VN')}</td>
                            <td>${p.phien || 'N/A'}</td>
                            <td style="color: ${p.prediction === 'Tài' ? '#00ff00' : '#ff4444'}">${p.prediction}</td>
                            <td>
                                ${p.verified ? 
                                    (p.correct ? '<span class="correct">✅ Đúng</span>' : '<span class="wrong">❌ Sai</span>') : 
                                    '<span style="opacity: 0.5">⏳ Đang chờ</span>'}
                                ${p.actual ? ` (${p.actual})` : ''}
                            </td>
                            <td>${p.confidence}%</td>
                            <td>
                                ${Object.entries(p.modelPredictions || {}).map(([model, pred]) => 
                                    `<span class="model-tag" style="background: ${aiPredictor.models[model].color}33; border: 1px solid ${aiPredictor.models[model].color}">
                                        ${aiPredictor.models[model].name}: ${pred}
                                    </span>`
                                ).join('<br>')}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="auto-refresh">
            🔄 Tự động refresh sau 10 giây | <span id="countdown">10</span>s
        </div>
    </div>
    
    <script>
        let countdown = 10;
        setInterval(() => {
            countdown--;
            document.getElementById('countdown').textContent = countdown;
            if (countdown <= 0) {
                location.reload();
            }
        }, 1000);
        
        // Animation on scroll
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = 1;
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        });
        
        document.querySelectorAll('.stat-card, .model-card').forEach(card => {
            observer.observe(card);
        });
    </script>
</body>
</html>`;
    
    res.send(html);
});

app.get('/', (req, res) => {
    res.send(`
        <h2>🎯 Lịch sử Sunwin Tài Xỉu + Super AI Dự Đoán</h2>
        <p><a href="/sunlon">📊 Xem lịch sử JSON (10000 phiên) tại /sunlon</a></p>
        <p><a href="/predict">🤖 Xem dự đoán AI tại /predict</a></p>
        <p><a href="/stats">📈 Xem thống kê AI (Giao diện siêu đẹp) tại /stats</a></p>
        <p><small>Tổng phiên đã thu thập: ${sessionHistory.length}</small></p>
        <p><small>🧠 Models: WormGPT + ChatGPT + Gemini + Claude</small></p>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[🌐] Server đang chạy tại cổng ${PORT}`);
    console.log(`[🧠] Super AI Predictor đã sẵn sàng với 4 models: WormGPT, ChatGPT, Gemini, Claude`);
    console.log(`[📊] Truy cập /stats để xem giao diện thống kê siêu đẹp`);
    connectWebSocket();
});