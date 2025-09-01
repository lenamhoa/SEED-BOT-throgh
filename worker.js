// Cloudflare Worker for Telegram + Gemini (Google Generative Language API)
// - "seed ###" => preset
// - /start, /list, /debug (test Gemini)
// - Fallback: gọi Gemini (mặc định model gemini-1.5-flash)

const seedMap = {
  "101": "/optimize – Tối ưu Windows 10 (BIOS + hệ thống)",
  "110": `/win10ltsc – Windows 10 IoT Enterprise LTSC 2021
🧩 Version 21H2 – Build 19044.1288
✅ Nhẹ, không bloat, RAM thấp, không update nền
📎 ISO: https://drive.massgrave.dev/en-us_windows_10_iot_enterprise_ltsc_2021_x64_dvd_257ad90f.iso`,
};

const DEFAULT_GEMINI_MODEL = "gemini-1.5-flash";

function sysPrompt() {
  return `Bạn là trợ lý tiếng Việt, súc tích, lịch sự. Trả lời rõ ràng, không bịa link.`;
}

async function sendTelegram(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// --- Call Gemini REST API ---
async function callGemini(env, userText) {
  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const apiKey = env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      { role: "user", parts: [{ text: `${sysPrompt()}\n\nNgười dùng: ${userText}` }] }
    ],
    generationConfig: { temperature: 0.3 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let data = {};
  try { data = JSON.parse(raw); } catch {}
  const text =
    data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("")?.trim() ||
    (data?.error?.message ? `⚠️ Gemini lỗi: ${data.error.message}` : "");

  return { status: res.status, text: text || "", raw };
}

async function handleTelegramUpdate(request, env) {
  let update = {};
  try { update = await request.json(); } catch { return new Response("bad json", {status:200}); }

  const msg = update.message || update.edited_message || update.channel_post || {};
  const chatId = msg.chat?.id;
  const text = (msg.text || "").trim();
  if (!chatId || !text) return new Response("ok", { status: 200 });

  // /start, /help
  if (/^\/(start|help)\b/i.test(text)) {
    await sendTelegram(env.BOT_TOKEN, chatId,
      "👋 Xin chào!\n• Gõ: seed 110 → trả preset\n• Gõ câu bất kỳ → mình trả lời bằng Gemini\n• /list → xem seed\n• /debug → kiểm tra kết nối"
    );
    return new Response("ok");
  }

  // /list
  if (/^\/list\b/i.test(text)) {
    const lines = Object.keys(seedMap).sort((a,b)=>+a-+b).map(k => `• ${k} – ${seedMap[k].split(" – ")[0]}`);
    await sendTelegram(env.BOT_TOKEN, chatId, "📚 Danh sách seed:\n" + lines.join("\n"));
    return new Response("ok");
  }

  // /debug
  if (/^\/debug\b/i.test(text)) {
    const hasBot = !!env.BOT_TOKEN;
    const hasGem = !!env.GEMINI_API_KEY;
    let out = `hasBot=${hasBot} | hasGeminiKey=${hasGem}`;
    if (hasGem) {
      try {
        const r = await callGemini(env, "Hãy trả lời đúng 1 từ: pong");
        out += `\ngemini_status=${r.status}\n${r.raw.slice(0,300)}`;
      } catch (e) {
        out += `\ngemini_error=${String(e)}`;
      }
    }
    await sendTelegram(env.BOT_TOKEN, chatId, out);
    return new Response("ok");
  }

  // seed ### (vd: seed 110)
  const m = text.match(/^seed\s*(\d{3})$/i);
  if (m) {
    const code = m[1];
    const payload = seedMap[code] || `❌ Chưa có seed ${code}.`;
    await sendTelegram(env.BOT_TOKEN, chatId, `📦 Seed ${code}:\n${payload}`);
    return new Response("ok");
  }

  // Fallback → Gemini
  if (!env.GEMINI_API_KEY) {
    await sendTelegram(env.BOT_TOKEN, chatId, "⚠️ Chưa cấu hình GEMINI_API_KEY (Settings → Build → Variables & Secrets).");
    return new Response("ok");
  }

  try {
    const ai = await callGemini(env, text);
    const answer = ai.text || (ai.raw ? `⚠️ Gemini (${ai.status}): ${ai.raw.slice(0,200)}` : "Xin lỗi, mình chưa trả lời được.");
    await sendTelegram(env.BOT_TOKEN, chatId, answer);
  } catch {
    await sendTelegram(env.BOT_TOKEN, chatId, "⚠️ Lỗi khi gọi Gemini. Thử lại sau nhé.");
  }

  return new Response("ok");
}

export default {
  async fetch(request, env) {
    if (request.method === "POST") return handleTelegramUpdate(request, env);
    return new Response("✅ SeedBot (Gemini) OK", { status: 200 });
  },
};