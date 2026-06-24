import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import requests
import hashlib
import json
import websocket
import threading
import time

BASE_API = "https://apifo88daigia.tele68.com/api"
WS_URL = "wss://wtxmd52.tele68.com/txmd5/?EIO=4&transport=websocket"

class WormApp:
    def __init__(self, root):
        self.root = root
        self.root.title("VIP BY HUYDAIXU")
        self.root.geometry("520x750")
        self.root.resizable(False, False)
        self.root.configure(bg="#0d0d1a")
        self.session_key = ""
        self.access_token = ""
        self.balance = 0
        self.ws = None
        self.choice = "tai"
        self.amount = 1000
        self.bet_locked = False
        self.build_login()

    def md5(self, text):
        return hashlib.md5(text.encode("utf-8")).hexdigest()

    def build_login(self):
        for widget in self.root.winfo_children():
            widget.destroy()
        main = tk.Frame(self.root, bg="#0d0d1a")
        main.pack(fill=tk.BOTH, expand=True, padx=30, pady=40)
        tk.Label(main, text="VIP BY HUYDAIXU", font=("Segoe UI", 22, "bold"), fg="#f1c40f", bg="#0d0d1a").pack(pady=(0,30))
        tk.Label(main, text="Đăng nhập", font=("Segoe UI", 14), fg="#cccccc", bg="#0d0d1a").pack(anchor=tk.W)
        tk.Label(main, text="Tài khoản", fg="#aaaaaa", bg="#0d0d1a", font=("Segoe UI", 10)).pack(anchor=tk.W, pady=(15,2))
        self.entry_user = tk.Entry(main, font=("Segoe UI", 12), bg="#1e1e2e", fg="white", insertbackground="white", relief=tk.FLAT)
        self.entry_user.pack(fill=tk.X, pady=(0,10), ipady=8)
        self.entry_user.insert(0, "GiaHuyNhoNguyet")
        tk.Label(main, text="Mật khẩu", fg="#aaaaaa", bg="#0d0d1a", font=("Segoe UI", 10)).pack(anchor=tk.W, pady=(5,2))
        self.entry_pass = tk.Entry(main, font=("Segoe UI", 12), bg="#1e1e2e", fg="white", insertbackground="white", show="*", relief=tk.FLAT)
        self.entry_pass.pack(fill=tk.X, pady=(0,20), ipady=8)
        self.entry_pass.insert(0, "123456")
        self.btn_login = tk.Button(main, text="Đăng nhập", font=("Segoe UI", 14, "bold"), bg="#e67e22", fg="white", relief=tk.FLAT, command=self.do_login)
        self.btn_login.pack(fill=tk.X, ipady=10, pady=10)
        self.status = tk.Label(main, text="", fg="#f39c12", bg="#0d0d1a", font=("Segoe UI", 10))
        self.status.pack()

    def do_login(self):
        un = self.entry_user.get().strip()
        pw = self.entry_pass.get().strip()
        if not un or not pw:
            messagebox.showerror("Lỗi", "Điền hết đi thằng ngu")
            return
        self.status.config(text="Đang xác thực...")
        self.btn_login.config(state=tk.DISABLED)
        threading.Thread(target=self.login_thread, args=(un, pw), daemon=True).start()

    def login_thread(self, un, pw):
        try:
            params = {"c":"3","un":un,"pw":self.md5(pw),"cp":"R","cl":"R","pf":"web","at":""}
            resp = requests.get(BASE_API, params=params, headers={"User-Agent":"Mozilla/5.0"}, timeout=10)
            data = resp.json()
            if data.get("success"):
                self.session_key = data.get("sessionKey","")
                self.access_token = data.get("accessToken","")
                self.balance = data.get("vinTotal",0)
                self.root.after(0, self.build_bet_ui)
            else:
                self.root.after(0, lambda: self.status.config(text="Thất bại: " + str(data.get("errorCode","???"))))
        except Exception as e:
            self.root.after(0, lambda: self.status.config(text="Lỗi: " + str(e)))
        finally:
            self.root.after(0, lambda: self.btn_login.config(state=tk.NORMAL))

    def build_bet_ui(self):
        for widget in self.root.winfo_children():
            widget.destroy()
        main = tk.Frame(self.root, bg="#0d0d1a")
        main.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)
        header = tk.Frame(main, bg="#0d0d1a")
        header.pack(fill=tk.X)
        tk.Label(header, text="VIP BY HUYDAIXU", font=("Segoe UI", 16, "bold"), fg="#f1c40f", bg="#0d0d1a").pack(side=tk.LEFT)
        tk.Label(header, text="VIP 4", font=("Segoe UI", 10), fg="#888", bg="#0d0d1a").pack(side=tk.RIGHT)
        bal_frame = tk.Frame(main, bg="#1a1a2e", pady=12)
        bal_frame.pack(fill=tk.X, pady=(10,20))
        tk.Label(bal_frame, text="💰 Số dư:", font=("Segoe UI", 12), fg="#ccc", bg="#1a1a2e").pack(side=tk.LEFT, padx=15)
        self.balance_label = tk.Label(bal_frame, text=f"{self.balance:,}", font=("Segoe UI", 14, "bold"), fg="#f1c40f", bg="#1a1a2e")
        self.balance_label.pack(side=tk.RIGHT, padx=15)
        tk.Label(main, text="Chọn cửa", font=("Segoe UI", 11), fg="#aaa", bg="#0d0d1a").pack(anchor=tk.W, pady=(0,5))
        cf = tk.Frame(main, bg="#0d0d1a")
        cf.pack(fill=tk.X)
        self.btn_tai = tk.Button(cf, text="TÀI", font=("Segoe UI", 12, "bold"), bg="#2ecc71", fg="white", relief=tk.FLAT, command=lambda: self.set_choice("tai"))
        self.btn_tai.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=2)
        self.btn_xiu = tk.Button(cf, text="XỈU", font=("Segoe UI", 12, "bold"), bg="#e74c3c", fg="white", relief=tk.FLAT, command=lambda: self.set_choice("xiu"))
        self.btn_xiu.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=2)
        self.set_choice("tai")
        tk.Label(main, text="Chọn tiền cược", font=("Segoe UI", 11), fg="#aaa", bg="#0d0d1a").pack(anchor=tk.W, pady=(15,5))
        mg = tk.Frame(main, bg="#0d0d1a")
        mg.pack(fill=tk.X)
        amounts = [1000,10000,50000,100000,500000,1000000,10000000,50000000]
        self.money_btns = []
        for i, amt in enumerate(amounts):
            btn = tk.Button(mg, text=self.fmt(amt), font=("Segoe UI", 9), bg="#252540", fg="white", relief=tk.FLAT, command=lambda a=amt: self.set_amount(a))
            btn.grid(row=i//4, column=i%4, sticky=tk.W+tk.E, padx=3, pady=3, ipady=4)
            self.money_btns.append(btn)
        self.set_amount(1000)
        act = tk.Frame(main, bg="#0d0d1a")
        act.pack(fill=tk.X, pady=(20,10))
        self.bet_btn = tk.Button(act, text="ĐẶT CƯỢC", font=("Segoe UI", 16, "bold"), bg="#3498db", fg="white", relief=tk.FLAT, command=self.place_bet)
        self.bet_btn.pack(fill=tk.X, ipady=12)
        self.log_area = scrolledtext.ScrolledText(main, height=9, bg="#12121c", fg="#ddd", font=("Courier New", 9), relief=tk.FLAT)
        self.log_area.pack(fill=tk.BOTH, expand=True, pady=(10,0))
        self.log("⚡ Kết nối WebSocket...")
        self.connect_ws()

    def fmt(self, n):
        if n >= 1000000:
            return f"{n//1000000}M"
        elif n >= 1000:
            return f"{n//1000}K"
        return str(n)

    def set_choice(self, c):
        self.choice = c
        self.btn_tai.config(bg="#2ecc71" if c=="tai" else "#3d3d5c")
        self.btn_xiu.config(bg="#e74c3c" if c=="xiu" else "#3d3d5c")

    def set_amount(self, a):
        self.amount = a
        for btn in self.money_btns:
            btn.config(bg="#252540")
        for btn in self.money_btns:
            if btn.cget("text") == self.fmt(a):
                btn.config(bg="#e67e22")

    def log(self, msg):
        self.log_area.insert(tk.END, msg + "\n")
        self.log_area.see(tk.END)

    def connect_ws(self):
        def on_open(ws):
            self.log("🔓 WebSocket mở, gửi auth...")
            auth = {"action":"auth","token":self.session_key,"game":"taixiu_md5"}
            ws.send(json.dumps(auth))
            self.log(f"📤 Auth: {auth}")

        def on_message(ws, msg):
            self.log(f"📥 {msg[:200]}")
            try:
                data = json.loads(msg)
                if data.get("code") == 0:
                    self.log("✅ Auth thành công, sẵn sàng đặt cược")
                elif data.get("code") == 3:
                    self.log("❌ Bad request – thử gửi access_token")
                    auth2 = {"action":"auth","token":self.access_token,"game":"taixiu_md5"}
                    ws.send(json.dumps(auth2))
                elif "bet" in str(data):
                    self.log("🎯 Kết quả cược: " + json.dumps(data))
            except:
                pass

        def on_error(ws, err):
            self.log(f"⚠️ Lỗi WS: {err}")

        def on_close(ws, a, b):
            self.log("🔌 WS đóng, kết nối lại sau 5s")
            self.root.after(5000, self.connect_ws)

        self.ws = websocket.WebSocketApp(WS_URL, on_open=on_open, on_message=on_message, on_error=on_error, on_close=on_close)
        threading.Thread(target=self.ws.run_forever, daemon=True).start()

    def place_bet(self):
        if self.bet_locked:
            self.log("⏳ Đang xử lý cược trước, chờ tí")
            return
        if not self.ws or not self.ws.sock:
            self.log("⚠️ Chưa kết nối WS, đang kết nối lại...")
            self.connect_ws()
            return
        if self.balance < self.amount:
            messagebox.showerror("Lỗi", "Đéo đủ tiền")
            return
        self.bet_locked = True
        self.bet_btn.config(state=tk.DISABLED, text="ĐANG XỬ LÝ...")
        bet_cmd = {"action":"bet","game":"taixiu_md5","choice":self.choice,"amount":self.amount,"session":self.session_key}
        try:
            self.ws.send(json.dumps(bet_cmd))
            self.log(f"📤 Đặt cược: {bet_cmd}")
            self.balance -= self.amount
            self.balance_label.config(text=f"{self.balance:,}")
        except Exception as e:
            self.log(f"❌ Lỗi gửi: {e}")
        self.root.after(1000, lambda: self.bet_btn.config(state=tk.NORMAL, text="ĐẶT CƯỢC"))
        self.root.after(1000, lambda: setattr(self, 'bet_locked', False))

if __name__ == "__main__":
    root = tk.Tk()
    app = WormApp(root)
    root.mainloop()