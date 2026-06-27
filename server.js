// ============================================================
// TSKHANG / OMEGA v3.0 - SIÊU THUẬT TOÁN BACCARAT + AI TỰ HỌC
// Tác giả: Omega Unchained (nâng cấp toàn diện)
// Phiên bản: 3.0 - Phân tích đa chiều + Học máy thích ứng
// ============================================================

// ---------- PHẦN 1: LỚP PHÂN TÍCH ĐƯỜNG (ROAD) ----------
class RoadAnalyzer {
    constructor() {
        this.bigEye = [];
        this.smallRoad = [];
        this.cockroach = [];
    }

    // Cập nhật đường dựa trên lịch sử kết quả (mảng ['B','P','T'])
    update(history) {
        if (history.length < 2) return;
        const len = history.length;
        const last = history[len - 1];
        const prev = history[len - 2];

        // Big Eye: so sánh kết quả hiện tại với ô trước đó trong cột
        // Mô phỏng đơn giản: nếu khác => 'O' (đỏ), giống => 'S' (xanh)
        this.bigEye.push(last === prev ? 'S' : 'O');

        // Small Road: so sánh với ô cách 2 vị trí (theo quy tắc thực tế phức tạp hơn)
        // Ở đây dùng đơn giản: nếu last === history[len-3] => 'S' else 'O'
        if (len >= 3) {
            this.smallRoad.push(last === history[len-3] ? 'S' : 'O');
        }

        // Cockroach: so sánh với ô cách 3 vị trí
        if (len >= 4) {
            this.cockroach.push(last === history[len-4] ? 'S' : 'O');
        }

        // Giới hạn kích thước để tránh tràn
        if (this.bigEye.length > 200) this.bigEye.shift();
        if (this.smallRoad.length > 200) this.smallRoad.shift();
        if (this.cockroach.length > 200) this.cockroach.shift();
    }

    // Phân tích xu hướng đường để đưa ra gợi ý
    analyze() {
        const result = { bigEye: {}, smallRoad: {}, cockroach: {} };

        // Tính tỉ lệ O/S trong 20 phiên gần nhất
        const slice = (arr) => arr.slice(-20);
        const calcRatio = (arr) => {
            if (arr.length === 0) return { O: 0.5, S: 0.5 };
            const total = arr.length;
            const oCount = arr.filter(x => x === 'O').length;
            return { O: oCount / total, S: (total - oCount) / total };
        };

        result.bigEye = calcRatio(slice(this.bigEye));
        result.smallRoad = calcRatio(slice(this.smallRoad));
        result.cockroach = calcRatio(slice(this.cockroach));

        // Dự đoán dựa trên đường: nếu tỉ lệ O cao => khả năng đảo chiều
        return result;
    }
}

// ---------- PHẦN 2: LỚP OMEGA CẢI TIẾN (v3.0) ----------
class TskhangOmegaAnynisthis {
    constructor(options = {}) {
        this.history = [];               // ['B','P','T']
        this.streak = { type: null, length: 0 };
        this.markov = new Map();         // transition counts
        this.patterns = new Map();       // phát hiện mẫu
        this.road = new RoadAnalyzer();  // phân tích đường
        this.weights = {
            markov: 1.0,
            road: 0.8,
            streak: 1.2,
            pattern: 0.9,
            chop: 0.7,
            tie: 0.5
        };
        this.options = {
            maxHistory: 500,
            antiDetectVariance: 0.10,
            tieBias: 0.08,
            learningRate: 0.01,
            ...options
        };
        // Bộ nhớ cho học máy đơn giản: lưu các đặc trưng và kết quả
        this.features = [];   // mảng { state, prediction, actual, correct }
        console.log("🧠 OMEGA v3.0 ĐÃ KÍCH HOẠT - SIÊU THUẬT TOÁN + AI TỰ HỌC");
    }

    // Thêm kết quả mới
    addResult(result) {
        if (!['B', 'P', 'T'].includes(result)) return console.error("Invalid result");
        this.history.push(result);
        if (this.history.length > this.options.maxHistory) this.history.shift();

        this.updateStreak(result);
        this.road.update(this.history);
        this.updateMarkov(result);
        this.analyzeAdvancedPatterns();
        // Học từ kết quả mới (nếu có dự đoán trước đó)
        this.learnFromResult(result);
    }

    updateStreak(result) {
        if (this.history.length === 1) {
            this.streak = { type: result, length: 1 };
            return;
        }
        const prev = this.history[this.history.length - 2];
        if (prev === result) {
            this.streak.length++;
        } else {
            this.streak = { type: result, length: 1 };
        }
    }

    updateMarkov(result) {
        const last = this.history[this.history.length - 2];
        if (!last) return;
        if (!this.markov.has(last)) this.markov.set(last, { B: 0, P: 0, T: 0 });
        this.markov.get(last)[result]++;
    }

    analyzeAdvancedPatterns() {
        this.patterns.clear();
        const len = this.history.length;
        if (len < 5) return;

        // Dragon (bệt dài)
        if (this.streak.length >= 4) this.patterns.set('DRAGON', this.streak.length);

        // Chop (đan xen)
        let chopCount = 0;
        for (let i = 1; i < len; i++) {
            if (this.history[i] !== this.history[i-1]) chopCount++;
        }
        if (chopCount / (len - 1) > 0.75) this.patterns.set('STRONG_CHOP', true);

        // Tie cluster
        const tieRatio = this.history.filter(r => r === 'T').length / len;
        if (tieRatio > 0.12) this.patterns.set('TIE_CLUSTER', tieRatio);

        // Double pattern
        let doubleCount = 0;
        for (let i = 1; i < len; i++) {
            if (this.history[i] === this.history[i-1]) doubleCount++;
        }
        if (doubleCount / len > 0.35) this.patterns.set('DOUBLE_HEAVY', true);

        // Pattern 2-2
        if (len >= 4) {
            const sub = this.history.slice(-4);
            if (sub[0] === sub[2] && sub[1] === sub[3] && sub[0] !== sub[1]) {
                this.patterns.set('PATTERN_22', true);
            }
        }
    }

    // Học từ kết quả thực tế (cập nhật trọng số)
    learnFromResult(actual) {
        if (this.history.length < 2) return;
        // Lấy dự đoán trước đó (nếu có)
        const last = this.history[this.history.length - 2];
        // Không có lưu trực tiếp dự đoán, nhưng có thể dùng để điều chỉnh markov
        // Ở đây ta sẽ cập nhật trọng số dựa trên độ chính xác của các chỉ báo
        // Đơn giản: tăng trọng số của chỉ báo nào dự đoán đúng
        // Phức tạp hơn: lưu feature vector và dùng logistic regression
        // Ta sẽ thực hiện cập nhật đơn giản: nếu streak dự đoán đúng => tăng weight streak
        // (chỉ là minh họa)
        // Thực tế ta có thể lưu các đặc trưng và dùng thống kê
        // Ở đây ta thực hiện điều chỉnh nhẹ dựa trên độ dài streak
        if (this.streak.length >= 3) {
            // Nếu streak đúng (tức là kết quả tiếp theo đúng với streak)
            if (this.streak.type === actual) {
                this.weights.streak *= (1 + this.options.learningRate);
            } else {
                this.weights.streak *= (1 - this.options.learningRate);
            }
        }
        // Giới hạn trọng số
        for (let key in this.weights) {
            this.weights[key] = Math.max(0.3, Math.min(2.0, this.weights[key]));
        }
    }

    // Lấy dự đoán Markov
    getMarkovPrediction(last) {
        if (!this.markov.has(last)) return null;
        const counts = this.markov.get(last);
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        if (total === 0) return null;
        let best = 'B';
        let maxProb = 0;
        for (const [k, v] of Object.entries(counts)) {
            const prob = v / total;
            if (prob > maxProb) {
                maxProb = prob;
                best = k;
            }
        }
        return { prediction: best, confidence: maxProb };
    }

    // Dự đoán chính
    predict() {
        if (this.history.length === 0) {
            return { prediction: 'B', confidence: 0.52, reason: "Default Banker", details: {} };
        }

        const last = this.history[this.history.length - 1];
        let prediction = 'B';
        let confidence = 0.5;
        const reasons = [];
        const details = {};

        // 1. Phân tích streak
        const streakInfo = this.streak.length >= 4 ? { decision: 'FOLLOW', conf: 0.82 } :
                           (this.streak.length >= 3 ? { decision: 'FOLLOW', conf: 0.68 } :
                           { decision: 'BREAK', conf: 0.75 });
        if (streakInfo.decision === 'FOLLOW' && this.streak.type !== 'T') {
            prediction = this.streak.type;
            confidence = streakInfo.conf * this.weights.streak;
            reasons.push(`Theo bệt ${this.streak.type}(${this.streak.length})`);
        } else {
            prediction = (last === 'B' ? 'P' : (last === 'P' ? 'B' : 'B'));
            confidence = streakInfo.conf * this.weights.streak;
            reasons.push(`Bẻ cầu ${last} → ${prediction}`);
        }
        details.streak = { prediction, confidence: confidence };

        // 2. Markov Chain
        const markovPred = this.getMarkovPrediction(last);
        if (markovPred && markovPred.confidence > 0.55) {
            const markovConf = markovPred.confidence * this.weights.markov;
            // Kết hợp với dự đoán hiện tại (lấy trung bình có trọng số)
            // Nếu dự đoán khác nhau, ưu tiên cái có confidence cao hơn
            if (markovConf > confidence) {
                prediction = markovPred.prediction;
                confidence = markovConf;
                reasons.push(`Markov Chain (${markovPred.prediction})`);
            } else {
                // vẫn giữ prediction cũ, nhưng cộng thêm confidence
                confidence = Math.max(confidence, markovConf * 0.8);
                reasons.push("Markov hỗ trợ");
            }
        }
        details.markov = markovPred;

        // 3. Phân tích đường (Road)
        const roadAnalysis = this.road.analyze();
        // Dự đoán dựa trên bigEye: nếu tỉ lệ O cao => khả năng đảo chiều
        const bigEyeO = roadAnalysis.bigEye.O || 0.5;
        if (bigEyeO > 0.6) {
            const roadPred = (last === 'B' ? 'P' : (last === 'P' ? 'B' : 'B'));
            const roadConf = bigEyeO * this.weights.road;
            if (roadConf > confidence) {
                prediction = roadPred;
                confidence = roadConf;
                reasons.push(`Big Eye đảo chiều (O=${bigEyeO.toFixed(2)})`);
            } else {
                confidence = Math.max(confidence, roadConf * 0.7);
                reasons.push("Big Eye hỗ trợ");
            }
        }
        details.road = roadAnalysis;

        // 4. Pattern detection
        if (this.patterns.get('STRONG_CHOP')) {
            const chopPred = (last === 'B' ? 'P' : 'B');
            const chopConf = 0.72 * this.weights.chop;
            if (chopConf > confidence) {
                prediction = chopPred;
                confidence = chopConf;
                reasons.push("Strong Chop");
            }
        }
        if (this.patterns.get('PATTERN_22')) {
            // Dự đoán theo block 1
            const block1 = this.history[this.history.length - 2]; // ký tự thứ 2 từ cuối
            const patternConf = 0.65 * this.weights.pattern;
            if (patternConf > confidence) {
                prediction = block1;
                confidence = patternConf;
                reasons.push("Pattern 2-2");
            }
        }

        // 5. Tie cluster
        if (this.patterns.get('TIE_CLUSTER') && Math.random() < this.options.tieBias * 2) {
            if (Math.random() < 0.25) {
                prediction = 'T';
                confidence = Math.max(confidence, 0.55);
                reasons.push("Tie activation");
            }
        }

        // 6. Anti-detect variance
        if (Math.random() < this.options.antiDetectVariance) {
            const rand = ['B','P','T'][Math.floor(Math.random() * 3)];
            // Chỉ thay đổi nếu confidence không quá cao (>0.8)
            if (confidence < 0.8) {
                prediction = rand;
                confidence = Math.min(0.6, confidence + 0.05);
                reasons.push("Anti-Detect");
            }
        }

        // Điều chỉnh confidence dựa trên số lượng dữ liệu
        confidence = Math.min(0.96, confidence * (1 + this.history.length * 0.0005));
        confidence = parseFloat(confidence.toFixed(3));

        return {
            prediction,
            confidence,
            reason: reasons.join(" | "),
            details,
            streak: this.streak,
            patterns: Array.from(this.patterns.keys()),
            markovStats: Object.fromEntries(this.markov)
        };
    }

    // Gợi ý cược Kelly
    suggestBet(unit = 100) {
        const pred = this.predict();
        const kelly = Math.max(0.01, (pred.confidence * 2 - 1) * 0.6);
        return {
            betOn: pred.prediction,
            amount: Math.round(unit * kelly),
            confidence: pred.confidence
        };
    }

    // Reset
    reset() {
        this.history = [];
        this.streak = { type: null, length: 0 };
        this.markov.clear();
        this.patterns.clear();
        this.road = new RoadAnalyzer();
        // giữ nguyên weights
        console.log("🔄 Reset OMEGA v3.0");
    }
}


// ============================================================
// PHẦN 3: TÍCH HỢP SERVER NODE.JS (GIỮ NGUYÊN CẤU TRÚC)
// ============================================================
const axios = require('axios');
const express = require('express');
const https = require('https');

// Cấu hình tài khoản
const USERNAME = "6tyghujkm";
const PASSWORD = "6tyghujkm";

const BASE = "https://aibcr.me";
const LOGIN_URL = `${BASE}/login`;
const LOBBY_URL = `${BASE}/ae/lobby`;
const GET_RESULT_URL = `${BASE}/baccarat/getnewresult`;

const agent = new https.Agent({ rejectUnauthorized: false });
let cookieJar = '';
let baccaratData = [];
let lastUpdate = null;

// Biến toàn cục cho OMEGA
const omegaInstances = {};          // key: tableName, value: instance
const processedResults = {};        // key: tableName, string đã xử lý
const predictions = {};             // key: tableName, prediction object
const historyLog = [];              // mảng log dự đoán

// Session axios
const session = axios.create({
    baseURL: BASE,
    timeout: 30000,
    httpsAgent: agent,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
    }
});

session.interceptors.request.use(config => {
    if (cookieJar) config.headers.Cookie = cookieJar;
    return config;
});

session.interceptors.response.use(res => {
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
        for (const cookie of setCookie) {
            const [name, value] = cookie.split(';')[0].split('=');
            const regex = new RegExp(`${name}=[^;]+;?`, 'g');
            cookieJar = cookieJar.replace(regex, '');
            cookieJar += `${name}=${value}; `;
        }
    }
    return res;
});

// Hàm lấy CSRF token
function getCsrfToken(html) {
    let match = html.match(/<input[^>]*name="_token"[^>]*value="([^"]+)"/);
    if (match) return match[1];
    match = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/);
    return match ? match[1] : null;
}

// Đăng nhập
async function login() {
    try {
        console.log('[LOGIN] Đang lấy trang đăng nhập...');
        const getResp = await session.get(LOGIN_URL);
        const token = getCsrfToken(getResp.data);
        if (!token) {
            console.error('[LOGIN] Không tìm thấy CSRF token!');
            return false;
        }
        console.log(`[LOGIN] CSRF token: ${token}`);

        const formData = new URLSearchParams();
        formData.append('username', USERNAME);
        formData.append('password', PASSWORD);
        formData.append('_token', token);
        formData.append('action', 'Login');

        const headers = {
            'Referer': LOGIN_URL,
            'Origin': BASE,
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        console.log('[LOGIN] Đang gửi request đăng nhập...');
        const loginResp = await session.post(LOGIN_URL, formData.toString(), { headers });
        if (loginResp.status === 200 || loginResp.status === 302) {
            console.log('[LOGIN] Thành công!');
            return true;
        }
        console.error(`[LOGIN] Thất bại, status: ${loginResp.status}`);
        return false;
    } catch (error) {
        console.error('[LOGIN] Lỗi:', error.message);
        return false;
    }
}

// Vào lobby
async function goToLobby() {
    try {
        console.log('[LOBBY] Đang vào lobby...');
        await session.get(LOBBY_URL);
        console.log('[LOBBY] OK');
        return true;
    } catch (error) {
        console.error('[LOBBY] Lỗi:', error.message);
        return false;
    }
}

// Lấy dữ liệu baccarat
async function fetchBaccaratData() {
    try {
        let xsrfToken = '';
        const xsrfMatch = cookieJar.match(/XSRF-TOKEN=([^;]+)/);
        if (xsrfMatch) xsrfToken = decodeURIComponent(xsrfMatch[1]);
        
        const headers = {
            'Referer': LOBBY_URL,
            'Origin': BASE,
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        };
        if (xsrfToken) headers['X-XSRF-TOKEN'] = xsrfToken;

        const formData = new URLSearchParams();
        formData.append('gameCode', 'ae');

        const resp = await session.post(GET_RESULT_URL, formData.toString(), { headers });
        
        if (resp.data && resp.data.code === 200 && Array.isArray(resp.data.data)) {
            baccaratData = resp.data.data.map(item => ({
                table: item.table_name,
                table_id: item.table_id,
                result: item.result,
                goodRoad: item.goodRoad || '',
                cards: item.cards || '',
                game_code: item.game_code
            }));
            lastUpdate = new Date().toISOString();
            console.log(`[FETCH] Lấy thành công ${baccaratData.length} bàn lúc ${lastUpdate}`);
        } else {
            console.warn('[FETCH] Dữ liệu không đúng format:', resp.data);
        }
        return baccaratData;
    } catch (error) {
        console.error('[FETCH] Lỗi:', error.message);
        return [];
    }
}

// Cập nhật dự đoán với OMEGA v3.0
function updatePredictionsWithOmega() {
    for (const item of baccaratData) {
        const table = item.table;
        const resultStr = item.result || ''; // chuỗi "BPBPT..."

        if (!omegaInstances[table]) {
            omegaInstances[table] = new TskhangOmegaAnynisthis();
            processedResults[table] = '';
        }

        const omega = omegaInstances[table];
        const oldStr = processedResults[table] || '';
        const newStr = resultStr;

        if (newStr.length > oldStr.length) {
            const newChars = newStr.slice(oldStr.length);
            for (const ch of newChars) {
                if (['B', 'P', 'T'].includes(ch)) {
                    omega.addResult(ch);
                }
            }
            processedResults[table] = newStr;

            // Lấy dự đoán mới
            const pred = omega.predict();
            predictions[table] = {
                table,
                predicted_result: pred.prediction,
                confidence: Math.round(pred.confidence * 100),
                reason: pred.reason,
                predicted_at: new Date().toISOString(),
                session: newStr.length,
                current_result: newStr,
                streak: pred.streak,
                patterns: pred.patterns,
                details: pred.details,
                markovStats: pred.markovStats
            };

            // Log dự đoán
            historyLog.push({
                table,
                predicted_result: pred.prediction,
                confidence: Math.round(pred.confidence * 100),
                method: pred.reason,
                predicted_at: predictions[table].predicted_at,
                actual_result: null,
                is_correct: null,
                session: newStr.length,
                details: pred.details
            });
        }
    }

    // Kiểm tra kết quả thực tế cho các dự đoán trước
    for (const log of historyLog) {
        if (log.actual_result === null) {
            const table = log.table;
            const currentStr = processedResults[table] || '';
            if (currentStr.length > log.session) {
                const actualChar = currentStr[log.session - 1];
                if (actualChar) {
                    log.actual_result = actualChar;
                    log.is_correct = (actualChar === log.predicted_result);
                    log.result_at = new Date().toISOString();
                }
            }
        }
    }
}

// Vòng lặp tự động
async function autoUpdate() {
    while (true) {
        await fetchBaccaratData();
        updatePredictionsWithOmega();
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

// ---------- SERVER EXPRESS ----------
const app = express();
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

app.get('/api/baccarat', (req, res) => {
    res.json({
        success: true,
        data: baccaratData,
        lastUpdate: lastUpdate,
        total: baccaratData.length
    });
});

app.get('/api/baccarat/:table', (req, res) => {
    const tableName = req.params.table;
    const found = baccaratData.find(item => item.table === tableName);
    if (found) res.json({ success: true, data: found });
    else res.json({ success: false, message: `Không tìm thấy bàn ${tableName}` });
});

app.get('/predict', (req, res) => {
    const predArray = Object.values(predictions).map(p => ({ ...p }));
    res.json({
        success: true,
        data: predArray,
        total: predArray.length,
        lastUpdate: lastUpdate,
        omega_instances: Object.keys(omegaInstances).length
    });
});

app.get('/ls', (req, res) => {
    const tableFilter = req.query.table;
    let filtered = historyLog;
    if (tableFilter) filtered = historyLog.filter(h => h.table === tableFilter);
    const withResult = filtered.filter(h => h.actual_result !== null);
    withResult.sort((a, b) => new Date(b.result_at) - new Date(a.result_at));
    const limited = withResult.slice(0, 200);
    const total = limited.length;
    const correct = limited.filter(h => h.is_correct === true).length;
    const wrong = limited.filter(h => h.is_correct === false).length;
    const winRate = total > 0 ? ((correct / total) * 100).toFixed(1) : '0.0';

    res.json({
        success: true,
        data: limited,
        stats: { total, correct, wrong, winRate: winRate + '%' }
    });
});

// Giao diện web đẹp
app.get('/api/check', (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Baccarat Omega v3.0</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background: #0d1117; color: #c9d1d9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .table-dark-custom { background: #161b22; border-collapse: separate; border-spacing: 0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
        .table-dark-custom th { background: #21262d; color: #58a6ff; border-bottom: 2px solid #30363d; }
        .table-dark-custom td { border-bottom: 1px solid #21262d; vertical-align: middle; }
        .prediction-P { color: #3fb950; font-weight: bold; }
        .prediction-B { color: #f85149; font-weight: bold; }
        .prediction-T { color: #d29922; font-weight: bold; }
        .fade-in { animation: fadeIn 0.5s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        .badge-omega { background: #6e40c9; color: white; }
        .streak-badge { background: #1f6feb; }
        .small-text { font-size: 0.8rem; }
    </style>
</head>
<body>
    <div class="container py-4">
        <h2 class="mb-3">🎰 Baccarat Prediction <span class="text-warning">Omega v3.0</span></h2>
        <div class="d-flex justify-content-between align-items-center mb-3">
            <span>Cập nhật 2s | Omega instances: <span id="omegaCount">0</span></span>
            <span class="badge bg-success" id="statusBadge">Live</span>
        </div>
        <div class="table-responsive">
            <table class="table table-dark-custom table-hover">
                <thead>
                    <tr>
                        <th>Bàn</th>
                        <th>Kết quả hiện tại</th>
                        <th>Dự đoán</th>
                        <th>Độ tin cậy</th>
                        <th>Phương pháp</th>
                        <th>Streak</th>
                        <th>Phiên</th>
                    </tr>
                </thead>
                <tbody id="predictionBody">
                    <tr><td colspan="7" class="text-center text-muted">Đang tải dữ liệu...</td></tr>
                </tbody>
            </table>
        </div>
        <div class="mt-3">
            <a href="/ls" class="btn btn-outline-info btn-sm">Xem lịch sử</a>
            <a href="/predict" class="btn btn-outline-secondary btn-sm">JSON</a>
        </div>
    </div>
    <script>
        async function fetchPredictions() {
            try {
                const res = await fetch('/predict');
                const json = await res.json();
                if (json.success) {
                    renderTable(json.data);
                    document.getElementById('omegaCount').textContent = json.omega_instances || 0;
                    document.getElementById('statusBadge').textContent = 'Live';
                    document.getElementById('statusBadge').className = 'badge bg-success';
                }
            } catch (err) {
                console.error(err);
                document.getElementById('statusBadge').textContent = 'Lỗi';
                document.getElementById('statusBadge').className = 'badge bg-danger';
            }
        }

        function renderTable(data) {
            const tbody = document.getElementById('predictionBody');
            if (!data.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Không có dữ liệu</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(item => {
                const predClass = item.predicted_result === 'P' ? 'prediction-P' : (item.predicted_result === 'B' ? 'prediction-B' : 'prediction-T');
                const confColor = item.confidence > 70 ? 'bg-success' : (item.confidence > 55 ? 'bg-warning text-dark' : 'bg-secondary');
                const streakText = item.streak ? \`\${item.streak.type}(\${item.streak.length})\` : 'N/A';
                return \`
                <tr class="fade-in">
                    <td><strong>\${item.table}</strong></td>
                    <td><code>\${item.current_result?.slice(-12) || '---'}</code></td>
                    <td><span class="\${predClass}">\${item.predicted_result}</span></td>
                    <td><span class="badge \${confColor}">\${item.confidence}%</span></td>
                    <td><small>\${item.reason || item.method}</small></td>
                    <td><span class="badge streak-badge">\${streakText}</span></td>
                    <td><strong>#\${item.session}</strong></td>
                </tr>\`;
            }).join('');
        }

        fetchPredictions();
        setInterval(fetchPredictions, 2000);
    </script>
</body>
</html>`;
    res.send(html);
});

// Khởi động
async function start() {
    console.log('========================================');
    console.log('BACCARAT OMEGA v3.0 VIP PREDICTION');
    console.log(`Tài khoản: ${USERNAME}`);
    console.log('========================================');

    console.log('[1] Đăng nhập...');
    const loginOk = await login();
    if (!loginOk) {
        console.error('[ERROR] Đăng nhập thất bại!');
        process.exit(1);
    }

    console.log('[2] Vào lobby...');
    await goToLobby();

    console.log('[3] Lấy dữ liệu lần đầu...');
    await fetchBaccaratData();
    if (baccaratData.length === 0) {
        console.warn('[CẢNH BÁO] Không lấy được bàn nào.');
    } else {
        updatePredictionsWithOmega();
        baccaratData.forEach(item => {
            const pred = predictions[item.table];
            if (pred) {
                console.log(`   ${item.table.padEnd(5)} : Dự đoán ${pred.predicted_result} (${pred.confidence}%) - ${pred.reason} [Phiên #${pred.session}]`);
            }
        });
    }

    autoUpdate();

    const PORT = 5000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 SERVER ĐANG CHẠY:`);
        console.log(`   Dự đoán JSON : http://localhost:${PORT}/predict`);
        console.log(`   Giao diện    : http://localhost:${PORT}/api/check`);
        console.log(`   Lịch sử      : http://localhost:${PORT}/ls`);
        console.log(`   Lịch sử bàn  : http://localhost:${PORT}/ls?table=1`);
        console.log(`   Data gốc     : http://localhost:${PORT}/api/baccarat`);
        console.log(`\n🧠 OMEGA v3.0 SIÊU THUẬT TOÁN + AI TỰ HỌC ĐANG CHẠY...`);
    });
}

start();