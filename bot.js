import express from "express";
import TelegramBot from "node-telegram-bot-api";

const TOKEN = process.env.BOT_TOKEN;               // đặt ở Render/Railway, KHÔNG commit token
const PUBLIC_URL = process.env.WEBHOOK_URL;        // ví dụ https://seedbot.onrender.com
const PORT = process.env.PORT || 3000;

// Seed mapping tối thiểu, thêm dần sau
const seedMap = {
  110: `/win10ltsc – Windows 10 IoT Enterprise LTSC 2021
🧩 Version 21H2 – Build 19044.1288
✅ Nhẹ, không bloat, RAM thấp, không update nền
🔗 ISO: https://drive.massgrave.dev/en-us_windows_10_iot_enterprise_ltsc_2021_x64_dvd_257ad90f.iso`,
  105: `/security – Registry Hardening (SAFE & OPTIONAL)`,
  104: `/gametweak – Batch tối ưu gaming (safe)`
};

const app = express();
app.use(express.json());

const bot = new TelegramBot(TOKEN, { polling: false });

// endpoint webhook Telegram sẽ gọi
app.post(`/telegram/${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// xử lý tin nhắn: "seed 110"
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const m = text.match(/^seed\s*(\d{3})$/i);
  if (!m) return;

  const num = Number(m[1]);
  const payload = seedMap[num];
  if (payload) bot.sendMessage(chatId, `📦 Seed ${num}:\n${payload}`);
  else bot.sendMessage(chatId, `❌ Không tìm thấy seed ${num}`);
});

app.get("/", (_req, res) => res.send("SeedBot OK"));
app.listen(PORT, async () => {
  console.log("Server listening", PORT);
  // đăng ký webhook mỗi lần khởi động (idempotent)
  const url = `${PUBLIC_URL}/telegram/${TOKEN}`;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    console.log("setWebhook:", await resp.text());
  } catch (e) { console.error(e); }
});
