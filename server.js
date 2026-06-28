const axios = require('axios');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const express = require('express');

// ========================= CẤU HÌNH =========================
const API_URL = process.env.API_URL || "https://various-collaborative-heights-sue.trycloudflare.com/api/tx";
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || "collected_data/sunwin_tx.json";
const STATS_FILE = process.env.STATS_FILE || "database/stats.json";
const DETAILED_STATS_FILE = process.env.DETAILED_STATS_FILE || "database/detailed_stats.json";

const MIN_DATA_FOR_PREDICTION = parseInt(process.env.MIN_DATA) || 10;
const MAX_PREDICTIONS = parseInt(process.env.MAX_PREDICTIONS) || 100000;
const MAX_STORAGE = parseInt(process.env.MAX_STORAGE) || 1000000;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL) || 5000;
const SELF_PING_INTERVAL = 60000; // 1 phút

// ========================= TIỆN ÍCH =========================
const vnNow = () => {
    const d = new Date();
    return new Date(d.getTime() + (7 * 60 * 60 * 1000)).toISOString();
};

function safeInt(v, d = 0) {
    const parsed = parseInt(v);
    return isNaN(parsed) ? d : parsed;
}

// ========================= THỐNG KÊ =========================
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

let stats = {
    total: 0, correct: 0, wrong: 0,
    last_prediction: null,
    start_time: vnNow(),
    history: [],
    total_predictions_made: 0,
    prediction_started: false,
    current_streak: 0,
    best_streak: 0,
    worst_streak: 0
};

// ========================= BỘ DỰ ĐOÁN =========================
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
            return { pred: arr[0], conf: 72, type: "Đu Bệt", reason: `Bệt ${length} phiên` };
        }
        if (length >= 6) {
            return { pred: arr[0] === "TAI" ? "XIU" : "TAI", conf: 80, type: "Bẻ Bệt Rồng", reason: `Bệt dài ${length} → hồi` };
        }
        return null;
    }

    cauNoi(arr) {
        if (arr.length < 5) return null;
        for (let i = 0; i < 4; i++) {
            if (arr[i] === arr[i + 1]) return null;
        }
        return { pred: arr[0] === "TAI" ? "XIU" : "TAI", conf: 82, type: "Cầu Nối 1-1", reason: "Nhịp 1-1 ổn định" };
    }

    cauDoi(arr) {
        if (arr.length < 4) return null;
        if (arr[0] === arr[1] && arr[2] === arr[3] && arr[0] !== arr[2]) {
            return { pred: arr[2], conf: 78, type: "Cầu 2-2", reason: "AABB → B" };
        }
        if (arr.length >= 6 && arr[0] === arr[1] && arr[1] === arr[2] && 
            arr[3] === arr[4] && arr[4] === arr[5] && arr[0] !== arr[3]) {
            return { pred: arr[3], conf: 80, type: "Cầu 3-3", reason: "AAABBB → B" };
        }
        return null;
    }

    cauGay(arr) {
        if (arr.length >= 5 && arr[0] === arr[1] && arr[1] === arr[2] && arr[2] !== arr[3] && arr[3] === arr[4]) {
            return { pred: arr[3], conf: 74, type: "Gãy 3-2", reason: "AAABB → B" };
        }
        if (arr.length >= 5 && arr[0] === arr[1] && arr[1] !== arr[2] && arr[2] === arr[3] && arr[3] === arr[4]) {
            return { pred: arr[2], conf: 74, type: "Gãy 2-3", reason: "AABBB → B" };
        }
        if (arr.length >= 4 && arr[0] !== arr[1] && arr[1] === arr[2] && arr[2] !== arr[3] && arr[0] === arr[3]) {
            return { pred: arr[1], conf: 72, type: "Gãy 1-2-1", reason: "ABBA → B" };
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
                    return { pred: arr[i - 1], conf: 88, type: "Mẫu Lặp", reason: `Mẫu "${pattern.join(',')}"` };
                }
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
        const result = this.phatHienMauLap(arr) || this.cauNoi(arr) || this.cauDoi(arr) ||
               this.cauGay(arr) || this.cauSap(arr) || this.duDoanVi() ||
               { pred: arr[0], conf: 55, type: "Theo", reason: "Bám phiên cuối" };
        
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
                pred: p.pred === "TAI" ? "XIU" : "TAI",
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

// ========================= HÀM LƯU TRỮ =========================
function loadHistory() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const content = fs.readFileSync(DATA_FILE, 'utf-8');
            const data = JSON.parse(content);
            return data.history || [];
        }
    } catch (e) {
        console.error(`Lỗi đọc file: ${e.message}`);
    }
    return [];
}

function loadDetailedStats() {
    try {
        if (fs.existsSync(DETAILED_STATS_FILE)) {
            const content = fs.readFileSync(DETAILED_STATS_FILE, 'utf-8');
            return JSON.parse(content);
        }
    } catch (e) {
        console.error(`Lỗi đọc file thống kê chi tiết: ${e.message}`);
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
    
    console.log(`💾 Đã lưu ${limitedHistory.length}/${MAX_STORAGE} phiên dữ liệu`);
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

// ========================= LỆNH TỪ CONSOLE =========================
let globalHistory = [];
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
});

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

function showHistory(history) {
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

function setupCommandHandler() {
    console.log('\n💡 Gõ /dudoan để xem dự đoán');
    console.log('💡 Gõ /lichsu để xem lịch sử');
    console.log('💡 Gõ /help để xem hướng dẫn');
    console.log('💡 Gõ /thoat để thoát chương trình\n');

    rl.on('line', (input) => {
        const cmd = input.trim().toLowerCase();
        
        switch(cmd) {
            case '/dudoan':
            case '/du doan':
                showPrediction(globalHistory);
                break;
                
            case '/lichsu':
            case '/lich su':
                showHistory(globalHistory);
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
                
            case '/stats':
            case '/thongke':
                printDetailedStats();
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
}

// ========================= XỬ LÝ DỰ ĐOÁN =========================
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

// ========================= WEB SERVER (Express) =========================
function startWebServer() {
    const app = express();

    // Route gốc hướng dẫn
    app.get('/', (req, res) => {
        res.send(`
            <h1>🚀 SUNWIN TX Collector</h1>
            <p>Chào mừng đến với API dự đoán Tài Xỉu.</p>
            <ul>
                <li><a href="/health">/health</a> - Kiểm tra sức khỏe</li>
                <li><a href="/dudoan">/dudoan</a> - Dự đoán phiên tiếp theo (JSON)</li>
                <li><a href="/stats">/stats</a> - Thống kê chi tiết (JSON)</li>
                <li><a href="/check">/check</a> - Xem lịch sử dự đoán (giao diện)</li>
            </ul>
            <p><small>Phiên bản V4 với tự động ping mỗi 1 phút.</small></p>
        `);
    });

    // Health check
    app.get('/health', (req, res) => {
        res.json({
            status: 'OK',
            total_sessions: globalHistory.length,
            predictions_made: stats.total_predictions_made,
            accuracy: stats.total > 0 ? (stats.correct / stats.total * 100).toFixed(2) : 0,
            uptime: process.uptime(),
            timestamp: vnNow()
        });
    });

    // Dự đoán JSON
    app.get('/dudoan', (req, res) => {
        if (!globalHistory || globalHistory.length < 5) {
            return res.json({ error: 'Chưa đủ dữ liệu (cần ít nhất 5 phiên)' });
        }
        try {
            const r = predictor.predict(globalHistory);
            const cur = globalHistory[globalHistory.length - 1];
            let ph = cur.phien || 0;
            if (typeof ph === 'string') {
                const cleaned = ph.replace('#', '');
                ph = !isNaN(cleaned) ? parseInt(cleaned) : 0;
            }
            const nextPhien = ph + 1;
            res.json({
                phien: nextPhien,
                prediction: r.pred,
                confidence: r.conf,
                type: r.type,
                reason: r.reason,
                based_on: globalHistory.length
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Thống kê JSON
    app.get('/stats', (req, res) => {
        res.json({
            summary: detailedStats.summary,
            byPattern: detailedStats.byPattern,
            byConfidence: detailedStats.byConfidence,
            byPrediction: detailedStats.byPrediction,
            recent: detailedStats.recentHistory.slice(-50)
        });
    });

    // Giao diện kiểm tra lịch sử dự đoán
    app.get('/check', (req, res) => {
        const history = detailedStats.recentHistory.slice(-100).reverse(); // 100 gần nhất
        let rows = '';
        for (const item of history) {
            const color = item.correct ? '#d4edda' : '#f8d7da';
            const statusText = item.correct ? '✅ Đúng' : '❌ Sai';
            rows += `<tr style="background-color:${color};">
                <td>${item.phien}</td>
                <td>${item.prediction}</td>
                <td>${item.actual}</td>
                <td>${item.pattern}</td>
                <td>${item.confidence}%</td>
                <td>${statusText}</td>
                <td>${new Date(item.timestamp).toLocaleString('vi-VN')}</td>
            </tr>`;
        }

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Kiểm tra dự đoán Tài Xỉu</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; background: #f4f4f4; }
                h1 { color: #333; }
                .summary { background: #fff; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                table { width: 100%; border-collapse: collapse; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                th { background: #007bff; color: white; padding: 10px; text-align: left; }
                td { padding: 8px; border-bottom: 1px solid #ddd; }
                tr:hover { background: #f1f1f1; }
                .refresh { margin-top: 20px; }
                .refresh a { background: #28a745; color: white; padding: 10px 15px; border-radius: 5px; text-decoration: none; }
                .refresh a:hover { background: #218838; }
                .stats-box { display: flex; gap: 20px; flex-wrap: wrap; }
                .stats-box div { background: #fff; padding: 10px 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .stats-box .correct { color: green; font-weight: bold; }
                .stats-box .wrong { color: red; font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>📊 Lịch sử dự đoán (100 gần nhất)</h1>
            <div class="summary">
                <div class="stats-box">
                    <div>Tổng dự đoán: <strong>${stats.total}</strong></div>
                    <div>Đúng: <span class="correct">${stats.correct}</span></div>
                    <div>Sai: <span class="wrong">${stats.wrong}</span></div>
                    <div>Tỷ lệ đúng: <strong>${stats.total > 0 ? (stats.correct / stats.total * 100).toFixed(2) : 0}%</strong></div>
                    <div>Chuỗi đúng hiện tại: <strong>${stats.current_streak}</strong></div>
                    <div>Chuỗi đúng tốt nhất: <strong>${stats.best_streak}</strong></div>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Phiên</th>
                        <th>Dự đoán</th>
                        <th>Thực tế</th>
                        <th>Loại cầu</th>
                        <th>Độ tin cậy</th>
                        <th>Kết quả</th>
                        <th>Thời gian</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="7">Chưa có dữ liệu dự đoán</td></tr>'}
                </tbody>
            </table>
            <div class="refresh">
                <a href="/check">🔄 Làm mới</a>
            </div>
            <p><a href="/">← Về trang chủ</a></p>
        </body>
        </html>
        `;
        res.send(html);
    });

    // Tự ping chính nó mỗi 1 phút (gọi /health nội bộ)
    setInterval(() => {
        const url = `http://localhost:${PORT}/health`;
        axios.get(url).catch(err => {
            // chỉ log lỗi nếu cần, không ảnh hưởng
        });
        console.log(`⏱️ Self-ping tại ${vnNow()}`);
    }, SELF_PING_INTERVAL);

    app.listen(PORT, () => {
        console.log(`🌐 Web server đang chạy trên cổng ${PORT}`);
        console.log(`   - Trang chủ: http://localhost:${PORT}/`);
        console.log(`   - Health: http://localhost:${PORT}/health`);
        console.log(`   - Dự đoán: http://localhost:${PORT}/dudoan`);
        console.log(`   - Thống kê: http://localhost:${PORT}/stats`);
        console.log(`   - Kiểm tra: http://localhost:${PORT}/check`);
    });
}

// ========================= VÒNG LẶP COLLECTOR =========================
async function collectorLoop() {
    let history = loadHistory();
    globalHistory = history;
    console.log(`📚 Đã tải ${history.length.toLocaleString()} phiên dữ liệu hiện có`);
    
    detailedStats = loadDetailedStats();
    
    try {
        if (fs.existsSync(STATS_FILE)) {
            const savedStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
            stats = { ...stats, ...savedStats };
            if (stats.prediction_started) {
                console.log(`📈 Đã dự đoán ${stats.total_predictions_made.toLocaleString()}/${MAX_PREDICTIONS.toLocaleString()} phiên`);
                console.log(`📊 Tỷ lệ đúng: ${((stats.correct/Math.max(stats.total,1))*100).toFixed(1)}% (${stats.correct}/${stats.total})`);
                console.log(`📈 Chuỗi đúng hiện tại: ${stats.current_streak}`);
                console.log(`🏆 Chuỗi đúng tốt nhất: ${stats.best_streak}\n`);
            }
        }
    } catch (e) {}
    
    let apiCallCount = 0;
    let errorCount = 0;
    
    while (true) {
        try {
            apiCallCount++;
            console.log(`\n🔄 Lần gọi API #${apiCallCount}...`);
            
            const response = await axios.get(API_URL, { 
                timeout: 15000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                }
            });
            
            if (response.status === 200) {
                errorCount = 0;
                
                let apiData = [];
                if (Array.isArray(response.data)) {
                    apiData = response.data;
                } else if (Array.isArray(response.data?.data)) {
                    apiData = response.data.data;
                } else if (Array.isArray(response.data?.history)) {
                    apiData = response.data.history;
                } else if (Array.isArray(response.data?.result)) {
                    apiData = response.data.result;
                } else if (response.data && typeof response.data === "object" && response.data.phien) {
                    apiData = [response.data];
                }
                
                console.log(`📥 Nhận được ${apiData.length} phiên từ API`);
                
                if (apiData.length > 0) {
                    let existing = new Set(history.map(h => h.phien));
                    let newSessions = [];

                    for (const item of apiData) {
                        const ph = safeInt(item.phien || item.Phien || item.id);
                        if (ph <= 0 || existing.has(ph)) continue;

                        const newItem = {
                            phien: ph,
                            ket_qua: String(item.ket_qua || item.Ket_qua || ""),
                            tong: safeInt(item.tong || item.Tong),
                            xuc_xac_1: safeInt(item.xuc_xac_1 || item.Xuc_xac_1),
                            xuc_xac_2: safeInt(item.xuc_xac_2 || item.Xuc_xac_2),
                            xuc_xac_3: safeInt(item.xuc_xac_3 || item.Xuc_xac_3)
                        };
                        
                        history.push(newItem);
                        existing.add(ph);
                        newSessions.push(newItem);
                    }

                    if (newSessions.length > 0) {
                        history.sort((a, b) => a.phien - b.phien);
                        globalHistory = history;
                        
                        if (history.length > MAX_STORAGE) {
                            history = history.slice(-MAX_STORAGE);
                            globalHistory = history;
                        }
                        
                        saveHistory(history);
                        
                        const latest = history[history.length - 1];
                        const progress = `${history.length.toLocaleString()}/${MIN_DATA_FOR_PREDICTION.toLocaleString()}`;
                        console.log(`🎲 KQ #${latest.phien}: ${latest.ket_qua} | [${latest.xuc_xac_1},${latest.xuc_xac_2},${latest.xuc_xac_3}] = ${latest.tong} | Tiến độ: ${progress}`);
                        
                        autoVerify(history);
                        autoPredict(history);
                        
                        if (stats.prediction_started && stats.total_predictions_made >= MAX_PREDICTIONS) {
                            console.log("\n🎯 ĐÃ ĐẠT GIỚI HẠN DỰ ĐOÁN!");
                            printDetailedStats();
                            console.log("\n🛑 Kết thúc chương trình...");
                            rl.close();
                            process.exit(0);
                        }
                    } else {
                        console.log(`ℹ️ Không có phiên mới. Đã có ${history.length} phiên.`);
                    }
                }
            } else {
                console.log(`⚠️ API trả về status: ${response.status}`);
                errorCount++;
            }
        } catch (e) {
            errorCount++;
            console.error(`❌ Lỗi kết nối API (lần ${errorCount}): ${e.message}`);
            if (e.response) {
                console.error(`   Status: ${e.response.status}`);
            }
            if (e.code === 'ECONNREFUSED') {
                console.error(`   💡 Server localhost chưa chạy hoặc cổng sai`);
                console.error(`   💡 Kiểm tra: ${API_URL}`);
            }
        }
        
        let waitTime = CHECK_INTERVAL;
        if (errorCount > 5) {
            waitTime = CHECK_INTERVAL * 3;
            console.log(`⚠️ Nhiều lỗi xảy ra, tăng thời gian chờ lên ${waitTime/1000} giây`);
        }
        
        console.log(`⏳ Chờ ${waitTime/1000} giây...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
}

// ========================= KHỞI ĐỘNG =========================
async function main() {
    console.log("🚀 SUNWIN TX COLLECTOR - KHỞI ĐỘNG");
    console.log("═══════════════════════════════════════════");
    console.log(`📊 Yêu cầu dữ liệu tối thiểu: ${MIN_DATA_FOR_PREDICTION.toLocaleString()} phiên`);
    console.log(`🎯 Giới hạn dự đoán: ${MAX_PREDICTIONS.toLocaleString()} phiên`);
    console.log(`💾 Giới hạn lưu trữ: ${MAX_STORAGE.toLocaleString()} phiên`);
    console.log(`🔗 API: ${API_URL}`);
    console.log(`🌐 Web server port: ${PORT}`);
    console.log(`⏱️ Tự động ping mỗi ${SELF_PING_INTERVAL/1000} giây`);
    console.log("═══════════════════════════════════════════\n");
    
    // Khởi động web server
    startWebServer();
    
    // Khởi động command handler
    setupCommandHandler();
    
    // Chạy collector loop (bất đồng bộ)
    collectorLoop().catch(console.error);
}

// Xử lý tắt chương trình
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

// Chạy chính
main().catch(console.error);