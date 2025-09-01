// Telegram + Gemini with OpenAI fallback (Cloudflare Workers)
// - seed ###, /start, /list, /debug
// - Trả lời bằng Gemini; nếu Gemini lỗi/hết quota -> fallback OpenAI

const seedMap = {
  "101": "/optimize – Tối ưu Windows 10 (BIOS + hệ thống)",
  "110": `/win10ltsc – Windows 10 IoT Enterprise LTSC 2021
🧩 Version 21H2 – Build 19044.1288
✅ Nhẹ, không bloat, RAM thấp, không update nền
📎 ISO: https://drive.massgrave.dev/en-us_windows_10_iot_enterprise_ltsc_2021_x64_dvd_257ad90f.iso`,
};

const DEFAULT_GEMINI_MODEL = "gemini-1.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

function sysPrompt() {
  return `Bạn là trợ lý tiếng Việt, súc tích, lịch sự. Trả lời rõ ràng theo từng bước khi cần, không bịa link.`;
}

async function sendTelegram(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

/* ---------- Gemini ---------- */
async function callGemini(env, userText) {
  if (!env.GEMINI_API_KEY) return { status: 0, text: "", raw: "no_gemini_key" };

  const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: `${sysPrompt()}\n\nNgười dùng: ${userText}` }] }],
    generationConfig: { temperature: 0.3 },
    // nới safety (vẫn tuân chính sách)
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HARASSMENT",         threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH",         threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUAL_CONTENT",      threshold: "BLOCK_NONE" }
    ]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
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

/* ---------- OpenAI (fallback) ---------- */
async function callOpenAI(env, userText) {
  if (!env.OPENAI_API_KEY) return { status: 0, text: "", raw: "no_openai_key" };

  const headers = {
    "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (env.OPENAI_PROJECT) headers["OpenAI-Project"] = env.OPENAI_PROJECT;
  if (env.OPENAI_ORG) headers["OpenAI-Organization"] = env.OPENAI_ORG;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: sysPrompt() },
        { role: "user", content: userText },
      ],
    }),
  });

  const raw = await res.text();
  let data = {};
  try { data = JSON.parse(raw); } catch {}
  const text = data?.choices?.[0]?.message?.content?.trim() || (data?.error?.message ? `⚠️ OpenAI lỗi: ${data.error.message}` : "");
  return { status: res.status, text: text || "", raw };
}

/* ---------- Handle Telegram ---------- */
async function handleTelegramUpdate(request, env) {
  let update = {};
  try { update = await request.json(); } catch {}
  const msg = update.message || update.edited_message || update.channel_post || {};
  const chatId = msg.chat?.id;
  const text = (msg.text || "").trim();
  if (!chatId || !text) return new Response("ok", { status: 200 });

  // /start, /help
  if (/^\/(start|help)\b/i.test(text)) {
    await sendTelegram(env.BOT_TOKEN, chatId,
      "👋 Xin chào!\n• Gõ: seed 110 → trả preset\n• Gõ câu bất kỳ → AI (Gemini, hết quota sẽ tự chuyển OpenAI)\n• /list → xem seed\n• /debug → kiểm tra kết nối");
    return new Response("ok");
  }

  // /list
  if (/^\/list\b/i.test(text)) {
    const lines = Object.keys(seedMap).sort((a,b)=>+a-+b).map(k => `• ${k} – ${seedMap[k].split(" – ")[0]}`);
    await sendTelegram(env.BOT_TOKEN, chatId, "📚 Danh sách seed:\n" + lines.join("\n"));
    return new Response("ok");
  }

  // /debug — soi keys & gọi ping 2 bên
  if (/^\/debug\b/i.test(text)) {
    const hasBot = !!env.BOT_TOKEN;
    const hasGem = !!env.GEMINI_API_KEY;
    const hasOai = !!env.OPENAI_API_KEY;

    let out = `hasBot=${hasBot} | hasGeminiKey=${hasGem} | hasOpenAIKey=${hasOai}`;

    if (hasGem) {
      const r = await callGemini(env, "Hãy trả lời đúng 1 từ: pong");
      out += `\nGemini status=${r.status} | ${r.raw.slice(0,160)}`;
    }
    if (hasOai) {
      const r2 = await callOpenAI(env, "Hãy trả lời đúng 1 từ: pong");
      out += `\nOpenAI status=${r2.status} | ${r2.raw.slice(0,160)}`;
    }

    await sendTelegram(env.BOT_TOKEN, chatId, out);
    return new Response("ok");
  }

  // seed ###
  const m = text.match(/^seed\s*(\d{3})$/i);
  if (m) {
    const code = m[1];
    const payload = seedMap[code] || `❌ Chưa có seed ${code}.`;
    await sendTelegram(env.BOT_TOKEN, chatId, `📦 Seed ${code}:\n${payload}`);
    return new Response("ok");
  }

  // === Trả lời AI: Gemini trước, fail -> OpenAI ===
  let reply = "";
  let first = await callGemini(env, text);

  // Gemini OK nếu status 2xx và có nội dung không phải lỗi
  const geminiOk = first.status >= 200 && first.status < 300 && first.text && !/^⚠️ Gemini lỗi/.test(first.text);

  if (geminiOk) {
    reply = first.text;
  } else {
    // Thử OpenAI fallback nếu có key
    const second = await callOpenAI(env, text);
    const openaiOk = second.status >= 200 && second.status < 300 && second.text && !/^⚠️ OpenAI lỗi/.test(second.text);

    if (openaiOk) {
      reply = second.text;
    } else {
      // Thông báo thân thiện theo tình huống
      if (first.status === 429) {
        reply = "⚠️ Gemini đã đạt giới hạn sử dụng hôm nay. Thử lại sau hoặc bật OpenAI fallback.";
      } else if (second.status === 429) {
        reply = "⚠️ OpenAI đang vượt giới hạn/quota. Thử lại sau nhé.";
      } else {
        reply = first.text || second.text || "⚠️ Hiện chưa trả lời được. Thử lại sau hoặc gõ /debug để kiểm tra.";
      }
    }
  }

  await sendTelegram(env.BOT_TOKEN, chatId, reply || "Xin lỗi, chưa có câu trả lời.");
  return new Response("ok");
}

export default {
  async fetch(request, env) {
    if (request.method === "POST") return handleTelegramUpdate(request, env);
    return new Response("✅ Bot Gemini + OpenAI fallback OK", { status: 200 });
  },
};