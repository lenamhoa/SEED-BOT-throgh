// == Telegram Bot Cloudflare Worker: Gemini + OpenAI fallback + seed ==

const seedMap = {
  "101": "/optimize – Tối ưu Windows 10 (BIOS + hệ thống)",
  "110": `/win10ltsc – Windows 10 IoT Enterprise LTSC 2021
🧩 Version 21H2 – Build 19044.1288
✅ Nhẹ, không bloat, RAM thấp, không update nền
📎 ISO: https://drive.massgrave.dev/en-us_windows_10_iot_enterprise_ltsc_2021_x64_dvd_257ad90f.iso`,
};

function sysPrompt() {
  return `Bạn là trợ lý tiếng Việt, súc tích, lịch sự. Trả lời rõ ràng, không bịa link.`;
}

async function sendMessage(chatId, text, env) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function callGemini(env, userText) {
  if (!env.GEMINI_API_KEY) return { status: 0, text: "", raw: "no_gemini_key" };

  const model = env.GEMINI_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: `${sysPrompt()}\n\n${userText}` }] }],
    generationConfig: { temperature: 0.3 },
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let data = {};
  try { data = JSON.parse(raw); } catch {}
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  return { status: res.status, text, raw };
}

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
      model: env.OPENAI_MODEL || "gpt-4o",
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
  const text = data?.choices?.[0]?.message?.content?.trim() || "";
  return { status: res.status, text, raw };
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("✅ Bot OK", { status: 200 });
    }

    const update = await request.json().catch(() => ({}));
    const msg = update.message || update.edited_message || {};
    const chatId = msg.chat?.id;
    const text = msg.text?.trim();
    if (!chatId || !text) return new Response("No message");

    // /start
    if (/^\/start\b/.test(text)) {
      await sendMessage(chatId, "👋 Xin chào! Gõ seed 110, hoặc nhắn gì đó để AI trả lời. Gõ /debug để kiểm tra API.", env);
      return new Response("ok");
    }

    // /list
    if (/^\/list\b/.test(text)) {
      const lines = Object.entries(seedMap).map(([k, v]) => `• ${k} – ${v.split(" – ")[0]}`);
      await sendMessage(chatId, "📚 Danh sách seed:\n" + lines.join("\n"), env);
      return new Response("ok");
    }

    // /debug
    if (/^\/debug\b/.test(text)) {
      const out = [
        `hasBot=${!!env.BOT_TOKEN}`,
        `hasGeminiKey=${!!env.GEMINI_API_KEY}`,
        `hasOpenAIKey=${!!env.OPENAI_API_KEY}`,
      ].join(" | ");
      await sendMessage(chatId, out, env);
      return new Response("ok");
    }

    // seed ###
    const match = text.match(/^seed\s*(\d{3})$/i);
    if (match) {
      const code = match[1];
      const reply = seedMap[code] || `❌ Chưa có seed ${code}.`;
      await sendMessage(chatId, `📦 Seed ${code}:\n${reply}`, env);
      return new Response("ok");
    }

    // === AI trả lời: ưu tiên Gemini → fallback OpenAI ===
    let reply = "";

    const gem = await callGemini(env, text);
    const geminiOK = gem.status >= 200 && gem.text;

    if (geminiOK) {
      reply = gem.text;
    } else {
      const oai = await callOpenAI(env, text);
      const openaiOK = oai.status >= 200 && oai.text;

      reply = openaiOK ? oai.text : "⚠️ Không thể phản hồi. Cả Gemini & OpenAI đều lỗi.";
    }

    await sendMessage(chatId, reply || "🤖 Lỗi không xác định.", env);
    return new Response("ok");
  },
};