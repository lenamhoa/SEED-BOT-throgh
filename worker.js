const seedMap = {
  "101": "/optimize – Tối ưu Windows 10 (BIOS + hệ thống)",
  "110": `/win10ltsc – Windows 10 IoT Enterprise LTSC 2021
🧩 Version 21H2 – Build 19044.1288
✅ Nhẹ, không bloat, RAM thấp, không update nền
📎 ISO: https://drive.massgrave.dev/en-us_windows_10_iot_enterprise_ltsc_2021_x64_dvd_257ad90f.iso`,
};

async function handleTelegramUpdate(request, env) {
  const data = await request.json();
  const message = data.message?.text || "";
  const chatId = data.message?.chat?.id;

  let responseText = "";

  // Seed pattern
  const seedMatch = message.match(/^seed\s*(\d{3})$/i);
  if (seedMatch) {
    const code = seedMatch[1];
    if (seedMap[code]) {
      responseText = `📦 Seed ${code}:\n${seedMap[code]}`;
    } else {
      responseText = `❓ Seed ${code} chưa được định nghĩa.`;
    }
  }

  // Fallback to GPT if no seed match
  if (!responseText && env.OPENAI_API_KEY) {
    const gptReply = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: message }],
      }),
    });

    const gptData = await gptReply.json();
    responseText = gptData?.choices?.[0]?.message?.content || "🤖 Không thể phản hồi ngay.";
  }

  // Send back to Telegram
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: responseText }),
  });

  return new Response("OK");
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      return await handleTelegramUpdate(request, env);
    }
    return new Response("✅ SeedBot OK");
  },
};