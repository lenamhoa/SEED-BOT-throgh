export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return new Response("SeedBot OK", { status: 200 });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const TOKEN = env.BOT_TOKEN;
    const update = await request.json().catch(() => ({}));
    const msg = update.message || update.edited_message || {};
    const chat = msg.chat?.id;
    const text = (msg.text || "").trim();

    const m = text.match(/^seed\s*(\d{3})$/i);
    if (!m || !chat) return new Response(JSON.stringify({ ok: true }), { status: 200 });

    const num = Number(m[1]);

    const seedMap = {
      101: "/optimize – Tối ưu Windows 10 (BIOS + hệ thống)",
      102: "/servicemgm – Quản lý dịch vụ Windows (an toàn, nhẹ RAM)",
      103: "/netnvme – Tối ưu mạng + SSD NVMe + TCP stack",
      104: "/gametweak – Tối ưu chơi game bằng batch script",
      105: "/security – Registry Hardening cho Windows 10 (SAFE/OPTIONAL)",
      106: "/sound – Preset Realtek EQ cho loa Microlab M105/M108",
      107: "/boot – Boot USB và cài Win10 trên NVMe",
      108: "/gpt – Convert NVMe sang GPT và cài Windows",
      109: "/win10 – Tạo USB cài Windows 10 chuẩn GPT+UEFI+NTFS",
      110: `/win10ltsc – Windows 10 IoT Enterprise LTSC 2021
🧩 Version 21H2 – Build 19044.1288
✅ Nhẹ, không bloat, RAM thấp, không update nền
🔗 ISO: https://drive.massgrave.dev/en-us_windows_10_iot_enterprise_ltsc_2021_x64_dvd_257ad90f.iso`,
      111: "/win10driver – Driver tự động & thủ công cho Win10 LTSC",
      201: "/sp – Hướng dẫn xử lý đơn Shopee (mã vận đơn)",
      202: "/suco – Xử lý khi người nhận không bắt máy (AhaMove)",
      301: "/familylogic – Phân tích hành vi gia đình (preset logic)",
      302: "/camdo – Về cám dỗ và tỉnh thức nội tâm",
      303: "/10nam – Hồi phục sau 10 năm hôn nhân (không vội vàng)",
      401: "/i3 – Build i3-8100 + B365M Gaming HD (RAM dual + XMP)",
      402: "/i312100 – Build i3-12100F full phụ kiện (~10.5 triệu)",
      403: "/i5 – PC i5-4690 + Win10 LTSC (rẻ mà mượt)",
      405: "/xeon – Checklist Xeon E3-1275 v3 (lắp ráp & tối ưu)"
    };

    const payload = seedMap[num] || `❌ Không tìm thấy seed ${num}`;

    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: `📦 Seed ${num}:\n${payload}` })
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
};