const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const URL_TRUYEN_THONG = "https://wtx.tele68.com/v1/tx/sessions";
const URL_MD5 = "https://wtxmd52.tele68.com/v1/txmd5/sessions";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "Accept": "application/json, text/plain, */*",
  "Referer": "https://tele68.com/",
  "Origin": "https://tele68.com",
  "Connection": "keep-alive"
};
const http = axios.create({ timeout: 10000, headers: HEADERS });

// ======== LƯU TRỮ 100K PHIÊN ========
const HISTORY_FILE = path.join(__dirname, "history_100k.json");
const MODEL_FILE = path.join(__dirname, "model_vip.json");
let historyAll = [];
let predictions = [];
let modelData = { transitionMatrix: {}, patternCache: {}, winRateHistory: [] };

if (fs.existsSync(HISTORY_FILE)) {
  try { historyAll = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch(e) { historyAll = []; }
}
if (fs.existsSync(MODEL_FILE)) {
  try { modelData = JSON.parse(fs.readFileSync(MODEL_FILE, "utf8")); } catch(e) { modelData = { transitionMatrix: {}, patternCache: {}, winRateHistory: [] }; }
}
function saveHistory() {
  if (historyAll.length > 100000) historyAll = historyAll.slice(-100000);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyAll, null, 2));
}
function saveModel() { fs.writeFileSync(MODEL_FILE, JSON.stringify(modelData, null, 2)); }

// ========== CAU BUSTER - BẮT ALL CẦU, BẺ TRỪ 212 ==========
class CauBuster {
  constructor() {
    this.cauDang = [];
    this.cauNhanDien = "";
    this.khuyenNghiB = false;
    this.lyDo = "";
    this.cauHienTai = "";
  }
  themKetQua(label) {
    this.cauDang.push(label);
    if (this.cauDang.length > 50) this.cauDang = this.cauDang.slice(-50);
    this._phanTichCau();
  }
  _phanTichCau() {
    if (this.cauDang.length < 3) {
      this.khuyenNghiB = false; this.lyDo = "Chưa đủ cầu"; this.cauHienTai = "N/A";
      return;
    }
    const gan = this.cauDang.slice(-10);
    let cauTimThay = null, doDai = 0;
    for (let len = 2; len <= 5; len++) {
      if (gan.length < len * 2) break;
      const mau = gan.slice(-len);
      const truoc = gan.slice(-len * 2, -len);
      let trung = true;
      for (let i = 0; i < len; i++) { if (truoc[i] !== mau[i]) { trung = false; break; } }
      if (trung) { cauTimThay = mau; doDai = len; break; }
    }
    if (cauTimThay) {
      const loaiCau = this._dinhDanhCau(cauTimThay);
      this.cauHienTai = loaiCau;
      if (loaiCau === "212") {
        this.khuyenNghiB = false;
        this.lyDo = "Cầu 212 - KHÔNG BẺ";
      } else {
        const soNhipChay = this._demNhipChay(gan, cauTimThay);
        if (soNhipChay >= 3) {
          this.khuyenNghiB = true;
          this.lyDo = `Bẻ cầu ${loaiCau} (${soNhipChay} nhịp)`;
        } else {
          this.khuyenNghiB = false;
          this.lyDo = `Cầu ${loaiCau} mới ${soNhipChay} nhịp, chưa bẻ`;
        }
      }
    } else {
      this.cauHienTai = "KHÔNG CẦU";
      this.khuyenNghiB = false;
      this.lyDo = "Không nhận diện cầu";
    }
  }
  _dinhDanhCau(mau) {
    const s = mau.join(',');
    if (s === "1,0,1" || s === "0,1,0") return "212";
    if (s === "1,1,1" || s === "0,0,0") return "BỆT";
    if (s === "1,0,1,0" || s === "0,1,0,1") return "LỆCH";
    if (s === "1,1,0,0" || s === "0,0,1,1") return "KÉP";
    if (s === "1,0,0,1" || s === "0,1,1,0") return "MỔ";
    if (s === "1,1,0,1" || s === "0,0,1,0") return "MỞ";
    if (s === "1,0,1,1" || s === "0,1,0,0") return "MỞ LỆCH";
    return "CẦU KHÁC";
  }
  _demNhipChay(gan, mau) {
    let dem = 0, len = mau.length;
    for (let i = gan.length - len; i >= 0; i -= len) {
      let match = true;
      for (let j = 0; j < len; j++) { if (gan[i+j] !== mau[j]) { match = false; break; } }
      if (match) dem++; else break;
    }
    return dem;
  }
  canBreak() { return { break: this.khuyenNghiB, reason: this.lyDo, cau: this.cauHienTai }; }
}

// ========== MARKOV VIP BẬC 4 + TỰ HỌC ĐỘNG ==========
class MarkovVIP {
  constructor(order = 4) {
    this.order = order;
    this.transitions = {};
    this.totalCounts = {};
    this.history = [];
    this.cauBuster = new CauBuster();
    this.winRateRecent = [];
    this.lastPred = null;
  }
  static classify(sum) { return sum >= 11 ? 1 : 0; }
  update(dices) {
    const sum = dices.reduce((a,b) => a+b, 0);
    const label = MarkovVIP.classify(sum);
    this.history.push(label);
    if (this.history.length > 1000) this.history = this.history.slice(-1000);
    this.cauBuster.themKetQua(label);
    // Xây dựng ma trận với trọng số thời gian
    if (this.history.length > this.order) {
      for (let o = 1; o <= this.order; o++) {
        for (let i = o; i < this.history.length; i++) {
          const state = this.history.slice(i - o, i).join(',');
          const next = this.history[i];
          if (!this.transitions[o]) this.transitions[o] = {};
          if (!this.transitions[o][state]) this.transitions[o][state] = {0:0, 1:0};
          const weight = 1 + (i / this.history.length) * 2;
          this.transitions[o][state][next] = (this.transitions[o][state][next] || 0) + weight;
          if (!this.totalCounts[o]) this.totalCounts[o] = {};
          this.totalCounts[o][state] = (this.totalCounts[o][state] || 0) + weight;
        }
      }
    }
  }
  predict() {
    if (this.history.length < this.order) return { label: 0, conf: 50, reason: "Chưa đủ dữ liệu" };
    let scores = {0:0, 1:0};
    for (let o = this.order; o >= 1; o--) {
      if (this.history.length >= o) {
        const state = this.history.slice(-o).join(',');
        const trans = this.transitions[o]?.[state];
        if (trans) {
          const total = trans[0] + trans[1] || 1;
          scores[0] += (trans[0] / total) * (o * 10);
          scores[1] += (trans[1] / total) * (o * 10);
          break;
        }
      }
    }
    const recent = this.history.slice(-10);
    const cnt0 = recent.filter(x=>x===0).length;
    const cnt1 = recent.filter(x=>x===1).length;
    scores[0] += cnt0 * 2;
    scores[1] += cnt1 * 2;
    if (this.winRateRecent.length > 20) {
      const winRate = this.winRateRecent.reduce((a,b)=>a+b,0) / this.winRateRecent.length;
      if (winRate < 0.4) {
        scores[0] *= 0.8; scores[1] *= 0.8;
        const rand = Math.random() > 0.5 ? 1 : 0;
        scores[rand] += 5;
      }
    }
    const total = scores[0] + scores[1] || 1;
    const prob0 = (scores[0] / total) * 100;
    const prob1 = (scores[1] / total) * 100;
    let label = prob1 >= prob0 ? 1 : 0;
    let conf = Math.max(prob0, prob1);
    let reason = `Bậc ${this.order} | T:${prob1.toFixed(1)}% X:${prob0.toFixed(1)}%`;
    const advice = this.cauBuster.canBreak();
    if (advice.break) {
      label = label === 1 ? 0 : 1;
      conf = 100 - conf;
      reason += ` | BẺ CẦU: ${advice.reason}`;
    } else {
      reason += ` | ${advice.reason}`;
    }
    this.lastPred = { label, conf, reason };
    return { label, conf, reason };
  }
  feedback(actualLabel) {
    if (this.lastPred) {
      const correct = (this.lastPred.label === actualLabel) ? 1 : 0;
      this.winRateRecent.push(correct);
      if (this.winRateRecent.length > 100) this.winRateRecent = this.winRateRecent.slice(-100);
      if (correct === 0 && this.history.length > 50) {
        // Giảm ảnh hưởng dữ liệu cũ bằng cách cắt bớt
        this.history = this.history.slice(-50);
        this.transitions = {};
        this.totalCounts = {};
        for (let i = this.order; i < this.history.length; i++) {
          for (let o = 1; o <= this.order; o++) {
            const state = this.history.slice(i - o, i).join(',');
            const next = this.history[i];
            if (!this.transitions[o]) this.transitions[o] = {};
            if (!this.transitions[o][state]) this.transitions[o][state] = {0:0, 1:0};
            const weight = 1 + (i / this.history.length) * 2;
            this.transitions[o][state][next] = (this.transitions[o][state][next] || 0) + weight;
            if (!this.totalCounts[o]) this.totalCounts[o] = {};
            this.totalCounts[o][state] = (this.totalCounts[o][state] || 0) + weight;
          }
        }
      }
    }
  }
}

const markov = new MarkovVIP(4);
historyAll.forEach(item => {
  if (item.dices && item.dices.length === 3) {
    markov.update(item.dices);
  }
});

// ======== HÀM LẤY DỮ LIỆU VÀ DỰ ĐOÁN ========
async function fetchData(url) {
  try { const res = await http.get(url); return res.data.list || []; } catch { return []; }
}

async function updateAll() {
  // Cập nhật từ cả hai nguồn để có nhiều dữ liệu
  const [normalList, md5List] = await Promise.all([fetchData(URL_TRUYEN_THONG), fetchData(URL_MD5)]);
  const allData = [...normalList, ...md5List];
  // Sắp xếp theo id giảm dần (mới nhất trước)
  allData.sort((a,b) => b.id - a.id);
  // Lấy các phiên mới chưa có
  for (let item of allData) {
    if (!item.dices || item.dices.length !== 3) continue;
    const existed = historyAll.find(h => h.phien === item.id);
    if (!existed) {
      const sum = item.dices.reduce((a,b)=>a+b,0);
      const label = sum >= 11 ? 1 : 0;
      const ketQua = sum >= 11 ? "TÀI" : "XỈU";
      historyAll.push({ phien: item.id, dices: item.dices, ketQua, sum, label });
      markov.update(item.dices);
      // Feedback cho dự đoán trước đó
      const lastPred = predictions.find(p => p.phien === item.id - 1);
      if (lastPred && lastPred.du_doan_label !== undefined) {
        markov.feedback(label);
      }
      // Dự đoán cho phiên tiếp theo
      const pred = markov.predict();
      const duDoanLabel = pred.label === 1 ? "TÀI" : "XỈU";
      predictions.push({
        phien: item.id + 1,
        du_doan: duDoanLabel,
        du_doan_label: pred.label,
        ket_qua: null,
        danh_gia: null,
        chi_tiet: pred,
        cau: markov.cauBuster.cauHienTai,
        be_cau: markov.cauBuster.khuyenNghiB,
        nguon: item.id % 2 === 0 ? "MD5" : "NORMAL" // tạm phân biệt
      });
      saveHistory();
      saveModel();
    } else {
      // Cập nhật đánh giá cho dự đoán
      const pred = predictions.find(p => p.phien === item.id);
      if (pred && !pred.ket_qua) {
        const sum = item.dices.reduce((a,b)=>a+b,0);
        const real = sum >= 11 ? "TÀI" : "XỈU";
        pred.ket_qua = real;
        pred.danh_gia = (pred.du_doan === real) ? "THẮNG" : "THUA";
        if (pred.danh_gia === "THẮNG") markov.winRateRecent.push(1); else markov.winRateRecent.push(0);
        if (markov.winRateRecent.length > 100) markov.winRateRecent = markov.winRateRecent.slice(-100);
      }
    }
  }
  if (predictions.length > 1000) predictions = predictions.slice(-1000);
}

setInterval(updateAll, 3000);
updateAll();

// ======== HÀM FORMAT ========
function formatResponse(list, source) {
  if (!list || list.length === 0) return null;
  const latest = list[0];
  const sum = latest.dices ? latest.dices.reduce((a,b)=>a+b,0) : 0;
  const real = sum >= 11 ? "TÀI" : "XỈU";
  const pred = markov.predict();
  const duDoan = pred.label === 1 ? "TÀI" : "XỈU";
  return {
    phien: latest.id,
    xuc_xac: latest.dices || [0,0,0],
    tong: sum,
    ket_qua_thuc_te: real,
    du_doan: duDoan,
    do_tin_cay: pred.conf.toFixed(2) + "%",
    ly_do: pred.reason,
    cau_hien_tai: markov.cauBuster.cauHienTai,
    da_be_cau: markov.cauBuster.khuyenNghiB,
    nguon: source,
    tong_phien_da_luu: historyAll.length,
    tong_du_doan: predictions.length
  };
}

// ======== API ========
app.get("/", (req, res) => res.send("VIP ULTIMATE - BẺ CẦU TRỪ 212 - CÓ MD5"));

app.get("/taixiu", async (req, res) => {
  try {
    const list = await fetchData(URL_TRUYEN_THONG);
    if (!list || list.length === 0) return res.json({ error: "Không có dữ liệu" });
    res.json(formatResponse(list, "NORMAL"));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/taixiumd5", async (req, res) => {
  try {
    const list = await fetchData(URL_MD5);
    if (!list || list.length === 0) return res.json({ error: "Không có dữ liệu MD5" });
    res.json(formatResponse(list, "MD5"));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/check", (req, res) => {
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CHECK VIP</title>
<style>body{background:#111;color:#0f0;font-family:Arial;padding:20px;}
table{border-collapse:collapse;width:100%;}th,td{border:1px solid #0f0;padding:5px;text-align:center;}
.win{color:#0f0;}.lose{color:#f00;}.break{background:#333;}</style></head><body>
<h1>📊 LỊCH SỬ DỰ ĐOÁN (NORMAL + MD5)</h1>
<p>Tổng lưu: ${historyAll.length} phiên | Dự đoán: ${predictions.length}</p>
<table><tr><th>Phiên</th><th>Nguồn</th><th>Dự đoán</th><th>Thực tế</th><th>KQ</th><th>Cầu</th><th>Bẻ?</th><th>Chi tiết</th></tr>`;
  const show = predictions.slice(-200).reverse();
  show.forEach(p => {
    const cls = p.danh_gia === "THẮNG" ? "win" : (p.danh_gia === "THUA" ? "lose" : "");
    const be = p.be_cau ? "✅" : "❌";
    html += `<tr class="${cls}"><td>${p.phien}</td><td>${p.nguon || "N/A"}</td><td>${p.du_doan}</td><td>${p.ket_qua || "..."}</td><td>${p.danh_gia || "..."}</td><td>${p.cau || "N/A"}</td><td>${be}</td><td>${p.chi_tiet?.reason || ""}</td></tr>`;
  });
  html += `</table><p><a href="/">Trang chủ</a> | <a href="/stats">Thống kê</a> | <a href="/checkmd5">Xem MD5</a></p></body></html>`;
  res.send(html);
});

app.get("/checkmd5", (req, res) => {
  // Lọc dự đoán có nguồn MD5 (nếu có), hoặc hiển thị tất cả
  const filtered = predictions.filter(p => p.nguon === "MD5");
  const data = filtered.length > 0 ? filtered : predictions; // fallback
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CHECK MD5 VIP</title>
<style>body{background:#111;color:#0f0;font-family:Arial;padding:20px;}
table{border-collapse:collapse;width:100%;}th,td{border:1px solid #0f0;padding:5px;text-align:center;}
.win{color:#0f0;}.lose{color:#f00;}</style></head><body>
<h1>📊 LỊCH SỬ DỰ ĐOÁN MD5</h1>
<p>Tổng dự đoán MD5: ${data.length}</p>
<table><tr><th>Phiên</th><th>Dự đoán</th><th>Thực tế</th><th>KQ</th><th>Cầu</th><th>Bẻ?</th></tr>`;
  const show = data.slice(-200).reverse();
  show.forEach(p => {
    const cls = p.danh_gia === "THẮNG" ? "win" : (p.danh_gia === "THUA" ? "lose" : "");
    const be = p.be_cau ? "✅" : "❌";
    html += `<tr class="${cls}"><td>${p.phien}</td><td>${p.du_doan}</td><td>${p.ket_qua || "..."}</td><td>${p.danh_gia || "..."}</td><td>${p.cau || "N/A"}</td><td>${be}</td></tr>`;
  });
  html += `</table><p><a href="/check">Quay lại Normal</a></p></body></html>`;
  res.send(html);
});

app.get("/stats", (req, res) => {
  const total = predictions.length;
  const win = predictions.filter(p => p.danh_gia === "THẮNG").length;
  const lose = predictions.filter(p => p.danh_gia === "THUA").length;
  const rate = total === 0 ? 0 : ((win/total)*100);
  const recent = predictions.slice(-50);
  const winRecent = recent.filter(p => p.danh_gia === "THẮNG").length;
  const rateRecent = recent.length === 0 ? 0 : ((winRecent/recent.length)*100);
  res.json({
    tong_du_doan: total, thang: win, thua: lose, ti_le: rate.toFixed(2)+"%",
    gan_day: { so_phiên: recent.length, thang: winRecent, ti_le: rateRecent.toFixed(2)+"%" },
    luu_tru: historyAll.length,
    win_rate_history: markov.winRateRecent.slice(-20)
  });
});

app.listen(PORT, () => console.log(`🚀 ULTIMATE VIP server chạy cổng ${PORT} - Địt mẹ đã có MD5, giờ bú ngon`));