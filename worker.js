// === SeedBot Hybrid (Cloudflare Workers + Telegram + OpenAI) ===
// - "seed ###"  -> trả preset (rule-based)
// - Không khớp -> fallback AI (GPT)
// - /start, /list, /debug (kiểm tra secrets + gọi GPT test)
// ---------------------------------------------------------------

/** ====== 1) SEED PRESET ====== **/
const seedMap = {
  "101": "/optimize – Tối ưu Windows 10 (BIOS + hệ thống)",
  "110": `/win10ltsc – Windows 10 IoT Enterprise LTSC 2021
🧩 Version 21H2 – Build 19044.1288
✅ Nhẹ, không bloat, RAM thấp, không update nền
📎 ISO: https://drive.massgrave.dev/en-us_windows_10_iot_enterprise_ltsc_2021_x64_dvd_257ad90f.iso`,
  // Thêm seed khác ở đây...
};

/** ====== 2) SYSTEM PROMPT CHO GPT ====== **/
function systemPrompt() {
  return `
Bạn là trợ lý tiếng Việt, súc tích, lịch sự, giải thích rõ ràng theo từng bước khi phù hợp.
Nếu câu hỏi mơ hồ, hỏi lại 1 câu để làm rõ rồi trả lời ngắn gọn.
Không bịa link. Dùng bullet khi cần. Ngắn gọn vừa đủ.
`.trim();
}

/** ====== 3) TIỆN ÍCH GỬI TELEGRAM ====== **/
async function sendTelegram(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = { chat_id: chatId, text };
  await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body),
  });
}

/** ====== 4) GỌI OPENAI (HỖ TRỢ sk-... & sk-proj-... ) ====== **/
async function callOpenAI(env, userText) {
  const headers = {
    "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };
  // Nếu bạn dùng project-level key (sk-proj-...), có thể bổ sung 2 biến sau trong Build:
  // OPENAI_PROJECT (ID) và/hoặc OPENAI_ORG (ID). Không bắt buộc.
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
        { role: "user", content: userText }
      ]
    }),
  });

  const data = await res.json().catch(() => ({}));
  let answer =
    data?.choices?.[0]?.message?.content?.trim() ||
    (data?.error?.message ? `⚠️ AI lỗi: ${data.error.message}` : "");

  // Nếu rỗng, trả thông báo mặc định
  if (!answer) answer = "Xin lỗi, mình chưa trả lời được. Hãy thử diễn đạt khác hoặc gõ /debug.";
  return { status: res.status, text: answer, raw: data };
}

/** ====== 5) XỬ LÝ TELEGRAM UPDATE ====== **/
async function handleTelegramUpdate(request, env) {
  let update = {};
  try { update = await request.json(); } catch { /* ignore */ }
  const msg = update.message || update.edited_message || update.channel_post || {};
  const chatId = msg.chat?.id;
  const text = (msg.text || "").trim();

  if (!chatId || !text) return new Response("ok", { status: 200 });

  // /start, /help
  if (/^\/start\b/i.test(text) || /^\/help\b/i.test(text)) {
    await sendTelegram(env.BOT_TOKEN, chatId,
      "👋 Xin chào!\n• Gõ: seed 110 → trả preset\n" +
      "• Gõ câu bất kỳ → mình trả lời bằng AI\n" +
      "• /list → xem danh sách seed\n" +
      "• /debug → kiểm tra kết nối GPT"
    );
    return new Response("ok");
  }

  // /list
  if (/^\/list\b/i.test(text)) {
    const keys = Object.keys(seedMap).sort((a,b)=>Number(a)-Number(b));
    const lines = keys.map(k => `• ${k} – ${seedMap[k].split(" – ")[0]}`);
    await sendTelegram(env.BOT_TOKEN, chatId, "📚 Danh sách seed:\n" + lines.join("\n"));
    return new Response("ok");
  }

  // /debug — kiểm tra secrets + gọi GPT ping
  if (/^\/debug\b/i.test(text)) {
    const hasBot = !!env.BOT_TOKEN;
    const hasKey = !!env.OPENAI_API_KEY;
    let line = `hasBot=${hasBot} | hasKey=${hasKey}`;
    if (hasKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
            ...(env.OPENAI_PROJECT ? {"OpenAI-Project": env.OPENAI_PROJECT} : {}),
            ...(env.OPENAI_ORG ? {"OpenAI-Organization": env.OPENAI_ORG} : {}),
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.1,
            messages: [
              { role: "system", content: "Trả lời đúng 1 từ: pong" },
              { role: "user", content: "ping" }
            ]
          }),
        });
        const body = await res.text();
        line += `\nopenai_status=${res.status}\n${body.slice(0,300)}`;
      } catch (e) {
        line += `\nopenai_error=${String(e)}`;
      }
    }
    await sendTelegram(env.BOT_TOKEN, chatId, line);
    return new Response("ok");
  }

  // seed ### (ví dụ: seed 110)
  const m = text.match(/^seed\s*(\d{3})$/i);
  if (m) {
    const code = m[1];
    const payload = seedMap[code] || `❌ Chưa có seed ${code}.`;
    await sendTelegram(env.BOT_TOKEN, chatId, `📦 Seed ${code}:\n${payload}`);
    return new Response("ok");
  }

  // Fallback AI
  if (!env.OPENAI_API_KEY) {
    await sendTelegram(env.BOT_TOKEN, chatId, "⚠️ Chưa cấu hình OPENAI_API_KEY trong Build → Variables & Secrets.");
    return new Response("ok");
  }

  try {
    const ai = await callOpenAI(env, text);
    await sendTelegram(env.BOT_TOKEN, chatId, ai.text);
  } catch (e) {
    await sendTelegram(env.BOT_TOKEN, chatId, "⚠️ Lỗi khi gọi AI. Thử lại sau nhé.");
  }

  return new Response("ok");
}

/** ====== 6) WORKER ENTRY ====== **/
export default {
  async fetch(request, env) {
    if (request.method === "POST") return handleTelegramUpdate(request, env);
    return new Response("✅ SeedBot OK", { status: 200 });
  },
};