const axios = require('axios');
const express = require('express');
const https = require('https');

// ======================
// CẤU HÌNH TÀI KHOẢN
// ======================
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

// ======================
// BIẾN TOÀN CỤC CHO AI
// ======================
const aiModel = {};                              // key: state, value: { follow: {success,total}, break: {success,total} }
const AI_THRESHOLD = 5;                          // số mẫu tối thiểu để dùng AI
let predictions = {};
let previousResults = {};
let history = [];                                // lịch sử dự đoán
let aiTrainingCount = 0;                         // đếm số phiên đã học (giới hạn 1000)

// ======================
// SESSION AXIOS
// ======================
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

// ======================
// CSRF TOKEN
// ======================
function getCsrfToken(html) {
    let match = html.match(/<input[^>]*name="_token"[^>]*value="([^"]+)"/);
    if (match) return match[1];
    match = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/);
    return match ? match[1] : null;
}

// ======================
// ĐĂNG NHẬP
// ======================
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

// ======================
// VÀO LOBBY
// ======================
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

// ======================
// LẤY DỮ LIỆU BACCARAT
// ======================
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

// ======================
// CÁC HÀM HỖ TRỢ AI
// ======================
function filterT(str) {
    return (str || '').replace(/T/gi, '');
}

function parseGoodRoad(goodRoad) {
    if (!goodRoad) return null;
    const low = goodRoad.toLowerCase();
    if (low.includes('bệt')) return { type: 'streak' };
    if (low.includes('1-1') || low.includes('so le')) return { type: 'alternating', step: 1 };
    if (low.includes('2-2')) return { type: 'pattern', step: 2 };
    return null;
}

// Tạo state cho AI từ chuỗi kết quả (đã lọc T) và goodRoad
function getAIState(resultNoT, goodRoad) {
    const roadInfo = parseGoodRoad(goodRoad);
    const roadType = roadInfo ? roadInfo.type : 'none';
    
    // Lấy 3 kết quả cuối cùng, nếu ít hơn thì thêm 'X'
    let last3 = resultNoT.slice(-3);
    if (last3.length < 3) {
        last3 = ('XXX' + last3).slice(-3);   // pad đầu bằng X
    }
    return `${last3}_${roadType}`;
}

// Cập nhật mô hình AI: state, action ('follow'/'break'), correct (boolean)
function updateAIModel(state, action, correct) {
    if (!aiModel[state]) {
        aiModel[state] = {
            follow: { success: 0, total: 0 },
            break: { success: 0, total: 0 }
        };
    }
    const entry = aiModel[state][action];
    entry.total++;
    if (correct) entry.success++;
    aiTrainingCount++;
    
    // Giới hạn tổng số phiên học là 1000 để tránh quá tải
    // (có thể xóa bớt các state cũ nếu vượt quá – tạm thời không cần)
}

// Lấy dự đoán từ AI cho một state, trả về {action, confidence} hoặc null nếu không đủ dữ liệu
function getAIPrediction(state) {
    const entry = aiModel[state];
    if (!entry) return null;
    
    const followTotal = entry.follow.total;
    const breakTotal = entry.break.total;
    const total = followTotal + breakTotal;
    
    if (total < AI_THRESHOLD) return null;   // chưa đủ mẫu
    
    const followRate = followTotal > 0 ? entry.follow.success / followTotal : 0;
    const breakRate = breakTotal > 0 ? entry.break.success / breakTotal : 0;
    
    // Chọn action có tỉ lệ thắng cao hơn
    if (followRate > breakRate) {
        return { action: 'follow', confidence: Math.round(followRate * 100) };
    } else if (breakRate > followRate) {
        return { action: 'break', confidence: Math.round(breakRate * 100) };
    } else {
        // tỉ lệ bằng nhau -> chọn theo dữ liệu nhiều hơn hoặc ngẫu nhiên
        if (followTotal >= breakTotal) {
            return { action: 'follow', confidence: Math.round(followRate * 100) };
        } else {
            return { action: 'break', confidence: Math.round(breakRate * 100) };
        }
    }
}

// ======================
// HÀM DỰ ĐOÁN CHÍNH (KẾT HỢP AI + LUẬT)
// ======================
function predictNext(resultNoT, goodRoad) {
    if (!resultNoT || resultNoT.length === 0) {
        return {
            prediction: 'P',
            confidence: 50,
            method: 'Mặc định (P)',
            ai_used: false
        };
    }

    const recent = resultNoT.slice(-30);
    const lastChar = recent[recent.length - 1];

    // ---- 1. Thử dùng AI ----
    const state = getAIState(resultNoT, goodRoad);
    const aiResult = getAIPrediction(state);

    if (aiResult) {
        const nextResult = aiResult.action === 'follow' ? lastChar : (lastChar === 'P' ? 'B' : 'P');
        return {
            prediction: nextResult,
            confidence: aiResult.confidence,
            method: `AI (${aiResult.action}) - state: ${state}`,
            ai_used: true,
            ai_state: state,
            ai_action: aiResult.action
        };
    }

    // ---- 2. Fallback: luật thủ công VIP ----
    const roadInfo = parseGoodRoad(goodRoad);

    // Bệt mạnh
    function checkStreak(str) {
        if (!str) return { char: null, len: 0 };
        const last = str[str.length - 1];
        let count = 0;
        for (let i = str.length - 1; i >= 0; i--) {
            if (str[i] === last) count++;
            else break;
        }
        return { char: last, len: count };
    }
    const streak = checkStreak(recent);
    if (streak.len >= 4) {
        return {
            prediction: streak.char,
            confidence: Math.min(90, 60 + streak.len * 5),
            method: `Bệt ${streak.len}`,
            ai_used: false
        };
    }

    // Cầu 1-1
    function isAlternating(str) {
        if (str.length < 4) return false;
        for (let i = 1; i < str.length; i++) {
            if (str[i] === str[i - 1]) return false;
        }
        return true;
    }
    if (isAlternating(recent)) {
        return {
            prediction: lastChar === 'P' ? 'B' : 'P',
            confidence: 70,
            method: 'Cầu 1-1',
            ai_used: false
        };
    }

    // Cầu 2-2 (pattern)
    function isPattern2(str) {
        if (str.length < 4) return false;
        const sub = str.slice(-4);
        return sub[0] === sub[2] && sub[1] === sub[3] && sub[0] !== sub[1];
    }
    if (isPattern2(recent)) {
        // dự đoán theo block 1
        const next = recent.slice(-2, -1); // ký tự thứ 2 từ dưới lên (block1)
        return {
            prediction: next,
            confidence: 65,
            method: 'Cầu 2-2',
            ai_used: false
        };
    }

    // Nghiêng P/B
    const countP = (recent.match(/P/g) || []).length;
    const countB = (recent.match(/B/g) || []).length;
    if (countP - countB > 2) return { prediction: 'P', confidence: 60, method: 'Nghiêng P', ai_used: false };
    if (countB - countP > 2) return { prediction: 'B', confidence: 60, method: 'Nghiêng B', ai_used: false };

    // Bẻ cầu nếu bệt 3
    if (streak.len === 3) {
        return {
            prediction: lastChar === 'P' ? 'B' : 'P',
            confidence: 55,
            method: 'Bẻ cầu 3',
            ai_used: false
        };
    }

    // Mặc định theo last
    return {
        prediction: lastChar,
        confidence: 50,
        method: 'Theo kết quả cuối',
        ai_used: false
    };
}

// ======================
// CẬP NHẬT DỰ ĐOÁN & KIỂM TRA KẾT QUẢ (CÓ HỌC AI)
// ======================
function updatePredictionsAndCheckResults() {
    for (const item of baccaratData) {
        const table = item.table;
        const rawResult = item.result || '';
        const goodRoad = item.goodRoad || '';
        const resultNoT = filterT(rawResult);

        // Lần đầu thấy bàn -> khởi tạo
        if (!previousResults.hasOwnProperty(table)) {
            previousResults[table] = resultNoT;
            const pred = predictNext(resultNoT, goodRoad);
            predictions[table] = {
                table,
                predicted_result: pred.prediction,
                confidence: pred.confidence,
                method: pred.method,
                predicted_at: new Date().toISOString(),
                session: resultNoT.length + 1,
                current_result: resultNoT,
                ai_state: pred.ai_state || null,
                ai_action: pred.ai_action || null
            };
            // Thêm vào history (chờ kết quả)
            history.push({
                table,
                predicted_result: pred.prediction,
                confidence: pred.confidence,
                method: pred.method,
                predicted_at: predictions[table].predicted_at,
                actual_result: null,
                is_correct: null,
                session: resultNoT.length + 1,
                ai_state: pred.ai_state || null,
                ai_action: pred.ai_action || null
            });
            continue;
        }

        // So sánh với kết quả cũ
        const oldResult = previousResults[table];
        if (resultNoT.length > oldResult.length) {
            // Có kết quả mới
            const newChars = resultNoT.slice(oldResult.length);
            const actual = newChars[0]; // phiên vừa kết thúc

            // Tìm dự đoán đang chờ cho bàn này
            const pendingIdx = history.findIndex(
                h => h.table === table && h.actual_result === null
            );
            if (pendingIdx !== -1) {
                const pending = history[pendingIdx];
                // Cập nhật kết quả thực tế
                pending.actual_result = actual;
                pending.is_correct = (actual === pending.predicted_result);
                pending.result_at = new Date().toISOString();

                // === HỌC AI ===
                if (pending.ai_state && pending.ai_action) {
                    updateAIModel(pending.ai_state, pending.ai_action, pending.is_correct);
                }
            }

            // Cập nhật previousResults
            previousResults[table] = resultNoT;

            // Tạo dự đoán mới cho phiên tiếp theo
            const pred = predictNext(resultNoT, goodRoad);
            predictions[table] = {
                table,
                predicted_result: pred.prediction,
                confidence: pred.confidence,
                method: pred.method,
                predicted_at: new Date().toISOString(),
                session: resultNoT.length + 1,
                current_result: resultNoT,
                ai_state: pred.ai_state || null,
                ai_action: pred.ai_action || null
            };
            history.push({
                table,
                predicted_result: pred.prediction,
                confidence: pred.confidence,
                method: pred.method,
                predicted_at: predictions[table].predicted_at,
                actual_result: null,
                is_correct: null,
                session: resultNoT.length + 1,
                ai_state: pred.ai_state || null,
                ai_action: pred.ai_action || null
            });
        } else {
            // Không có kết quả mới, chỉ cập nhật lại dự đoán (goodRoad có thể đổi)
            const pred = predictNext(resultNoT, goodRoad);
            predictions[table] = {
                table,
                predicted_result: pred.prediction,
                confidence: pred.confidence,
                method: pred.method,
                predicted_at: new Date().toISOString(),
                session: resultNoT.length + 1,
                current_result: resultNoT,
                ai_state: pred.ai_state || null,
                ai_action: pred.ai_action || null
            };
            // Không thêm history mới
        }
    }
}

// ======================
// VÒNG LẶP TỰ ĐỘNG
// ======================
async function autoUpdate() {
    while (true) {
        await fetchBaccaratData();
        updatePredictionsAndCheckResults();
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

// ======================
// API SERVER (Express)
// ======================
const app = express();
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

// Endpoint tất cả bàn
app.get('/api/baccarat', (req, res) => {
    res.json({
        success: true,
        data: baccaratData,
        lastUpdate: lastUpdate,
        total: baccaratData.length
    });
});

// Endpoint theo tên bàn
app.get('/api/baccarat/:table', (req, res) => {
    const tableName = req.params.table;
    const found = baccaratData.find(item => item.table === tableName);
    if (found) res.json({ success: true, data: found });
    else res.json({ success: false, message: `Không tìm thấy bàn ${tableName}` });
});

// Endpoint dự đoán (JSON) – hiện rõ AI state nếu dùng AI
app.get('/predict', (req, res) => {
    const predArray = Object.values(predictions).map(p => ({
        ...p,
        next_session: p.session,
        ai: p.ai_used ? {
            state: p.ai_state,
            action: p.ai_action,
        } : null
    }));
    res.json({
        success: true,
        data: predArray,
        total: predArray.length,
        lastUpdate: lastUpdate,
        ai_model_size: Object.keys(aiModel).length,
        ai_training_sessions: aiTrainingCount
    });
});

// Endpoint giao diện realtime đẹp (có hiển thị AI)
app.get('/api/check', (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Baccarat AI VIP Prediction</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background: #0d1117; color: #c9d1d9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .table-dark-custom { background: #161b22; border-collapse: separate; border-spacing: 0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
        .table-dark-custom th { background: #21262d; color: #58a6ff; border-bottom: 2px solid #30363d; }
        .table-dark-custom td { border-bottom: 1px solid #21262d; vertical-align: middle; }
        .prediction-P { color: #3fb950; font-weight: bold; }
        .prediction-B { color: #f85149; font-weight: bold; }
        .ai-badge { background: #6e40c9; color: white; font-size: 0.7rem; border-radius: 4px; padding: 2px 5px; }
        .fade-in { animation: fadeIn 0.5s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body>
    <div class="container py-4">
        <h2 class="mb-3">🎰 Baccarat Prediction <span class="text-warning">AI VIP</span></h2>
        <div class="d-flex justify-content-between align-items-center mb-3">
            <span class="refresh-time">Cập nhật 2s | AI đã học: <span id="aiCount">0</span> phiên</span>
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
                        <th>Phiên tiếp</th>
                    </tr>
                </thead>
                <tbody id="predictionBody">
                    <tr><td colspan="6" class="text-center text-muted">Đang tải dữ liệu...</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <script>
        async function fetchPredictions() {
            try {
                const res = await fetch('/predict');
                const json = await res.json();
                if (json.success) {
                    renderTable(json.data);
                    document.getElementById('aiCount').textContent = json.ai_training_sessions || 0;
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
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Không có dữ liệu</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(item => {
                const predClass = item.predicted_result === 'P' ? 'prediction-P' : (item.predicted_result === 'B' ? 'prediction-B' : '');
                const confColor = item.confidence > 70 ? 'bg-success' : (item.confidence > 55 ? 'bg-warning text-dark' : 'bg-secondary');
                let methodHtml = item.method;
                if (item.ai) {
                    methodHtml += \` <span class="ai-badge">AI \${item.ai.action}</span>\`;
                }
                return \`
                <tr class="fade-in">
                    <td><strong>\${item.table}</strong></td>
                    <td><code>\${item.current_result?.slice(-12) || '---'}</code></td>
                    <td><span class="\${predClass}">\${item.predicted_result}</span></td>
                    <td><span class="badge \${confColor}">\${item.confidence}%</span></td>
                    <td><small>\${methodHtml}</small></td>
                    <td><strong>#\${item.next_session}</strong></td>
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

// Endpoint lịch sử dự đoán (có thống kê AI)
app.get('/ls', (req, res) => {
    const tableFilter = req.query.table;
    let filtered = history;
    if (tableFilter) {
        filtered = history.filter(h => h.table === tableFilter);
    }
    const withResult = filtered.filter(h => h.actual_result !== null);
    withResult.sort((a, b) => new Date(b.result_at) - new Date(a.result_at));
    const limited = withResult.slice(0, 200);
    
    const total = limited.length;
    const correct = limited.filter(h => h.is_correct === true).length;
    const wrong = limited.filter(h => h.is_correct === false).length;
    const winRate = total > 0 ? ((correct / total) * 100).toFixed(1) : '0.0';
    
    // Đếm tỉ lệ thắng của AI vs luật
    const aiPredictions = limited.filter(h => h.ai_state);
    const aiCorrect = aiPredictions.filter(h => h.is_correct).length;
    const aiWinRate = aiPredictions.length > 0 ? ((aiCorrect / aiPredictions.length) * 100).toFixed(1) : 'N/A';

    res.json({
        success: true,
        data: limited,
        stats: {
            total,
            correct,
            wrong,
            winRate: winRate + '%',
            ai_predictions: aiPredictions.length,
            ai_winRate: aiWinRate + '%'
        }
    });
});

// ======================
// KHỞI ĐỘNG
// ======================
async function start() {
    console.log('========================================');
    console.log('BACCARAT AI VIP PREDICTION SERVER');
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
        updatePredictionsAndCheckResults();
        baccaratData.forEach(item => {
            const pred = predictions[item.table];
            if (pred) {
                const aiTag = pred.ai_state ? ' [AI]' : '';
                console.log(`   ${item.table.padEnd(5)} : Dự đoán ${pred.predicted_result} (${pred.confidence}%) - ${pred.method} [Phiên #${pred.session}]${aiTag}`);
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
        console.log(`\n🧠 AI tự học trên 1000 phiên gần nhất – đang chạy...`);
    });
}

start();