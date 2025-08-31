// Cloudflare Worker for Telegram + OpenAI
// - "seed ###" => trả preset
// - /start, /list, /debug
// - Fallback GPT (gpt-4o-mini)

const seedMap = {
  "101": "/optimize – Tối ưu Windows 10 (BIOS + hệ thống)",
  "110": `/win10ltsc – Windows 10 IoT Enterprise LTSC 2021
🧩 Version 21H2 – Build 19044.1288
✅ Nhẹ, không bloat, RAM thấp, không update nền
📎 ISO: https://drive.massgrave.dev/en-us_windows_10_iot_enterprise_ltsc_2021_x64_dvd_257ad90f.iso`,
};

function systemPrompt() {
  return `Bạn là trợ lý tiếng Việt, súc tích, lịch sự. Trả lời rõ ràng; không bịa link.`;
}

async function sendTelegram(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function callOpenAI(env, userText) {
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
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userText },
      ],
    }),
  });

  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  const answer = data?.choices?.[0]?.message?.content?.trim();
  return { status: res.status, raw: text, answer: answer || "" };
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
      "👋 Xin chào!\n• Gõ: seed 110 → trả preset\n• Gõ câu bất kỳ → AI trả lời\n• /list → xem seed\n• /debug → kiểm tra cấu hình"
    );
    return new Response("ok");
  }

  // /list
  if (/^\/list\b/i.test(text)) {
    const lines = Object.keys(seedMap).sort((a,b)=>+a-+b).map(k => `• ${k} – ${seedMap[k].split(" – ")[0]}`);
    await sendTelegram(env.BOT_TOKEN, chatId, "📚 Danh sách seed:\n" + lines.join("\n"));
    return new Response("ok");
  }

  // /debug (soi secrets + gọi GPT 'ping')
  if (/^\/debug\b/i.test(text)) {
    const hasBot = !!env.BOT_TOKEN;
    const hasKey = !!env.OPENAI_API_KEY;
    let out = `hasBot=${hasBot} | hasKey=${hasKey}`;
    if (hasKey) {
      try {
        const r = await callOpenAI(env, "Hãy trả lời đúng 1 từ: pong");
        out += `\nopenai_status=${r.status}\n${r.raw.slice(0,300)}`;
      } catch (e) {
        out += `\nopenai_error=${String(e)}`;
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

  // Fallback GPT
  if (!env.OPENAI_API_KEY) {
    await sendTelegram(env.BOT_TOKEN, chatId, "⚠️ Chưa cấu hình OPENAI_API_KEY trong Settings → Build → Variables & Secrets.");
    return new Response("ok");
  }

  try {
    const ai = await callOpenAI(env, text);
    const answer = ai.answer || (ai.raw ? `⚠️ AI (${ai.status}): ${ai.raw.slice(0,200)}` : "Xin lỗi, mình chưa trả lời được.");
    await sendTelegram(env.BOT_TOKEN, chatId, answer);
  } catch {
    await sendTelegram(env.BOT_TOKEN, chatId, "⚠️ Lỗi khi gọi AI. Thử lại sau nhé.");
  }

  return new Response("ok");
}

export default {
  async fetch(request, env) {
    if (request.method === "POST") return handleTelegramUpdate(request, env);
    return new Response("✅ SeedBot OK", { status: 200 });
  },
};