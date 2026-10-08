// /api/send - 即時轉發 API (Vercel Serverless Function)
// ---------------------------------------------------------------
// 設計原則:
// 1. 只寄往 data/districts.js 白名單內的區電郵,絕不接受任意收件地址(防濫用)。
// 2. 不儲存:無資料庫,不記郵件內容/附件/名單;成功只記一次「寄出X封」計數。
// 3. 經 Resend 發送,需設定環境變數 RESEND_API_KEY 及 FROM_EMAIL。
// ---------------------------------------------------------------
import { DISTRICTS } from "../data/districts.js";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ALLOWED_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "jpg", "jpeg", "png"];
const MAX_EACH = 1.5 * 1024 * 1024; // 單檔 1.5MB
const MAX_TOTAL = 4 * 1024 * 1024; // 合共 4MB(配合 Vercel 4.5MB 請求上限)

// 簡易 rate limit(每個 instance 記憶體內,盡力而為):每 IP 每小時最多 10 次轉發
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (arr.length >= 10) return true;
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "只接受 POST" });
  }

  try {
    const ip =
      (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    if (rateLimited(ip)) {
      return res.status(429).json({ ok: false, error: "太密啦,每小時最多轉發 10 次,請稍後再試。" });
    }

    const { districtIds, senderName, replyTo, subject, body, attachments = [] } = req.body || {};

    // ---- 基本驗證 ----
    if (!Array.isArray(districtIds) || !districtIds.length || districtIds.length > DISTRICTS.length) {
      return res.status(400).json({ ok: false, error: "請選擇至少一個區。" });
    }
    if (typeof senderName !== "string" || !senderName.trim() || senderName.length > 80) {
      return res.status(400).json({ ok: false, error: "寄件人姓名無效。" });
    }
    if (typeof replyTo !== "string" || !EMAIL_RE.test(replyTo.trim())) {
      return res.status(400).json({ ok: false, error: "回覆電郵格式無效。" });
    }
    if (typeof subject !== "string" || !subject.trim() || subject.length > 200) {
      return res.status(400).json({ ok: false, error: "主旨無效(1-200字)。" });
    }
    if (typeof body !== "string" || !body.trim() || body.length > 20000) {
      return res.status(400).json({ ok: false, error: "內文無效(上限20000字)。" });
    }

    // ---- 白名單:只接受名錄內的 id + 有電郵 ----
    const allow = new Map(DISTRICTS.filter((d) => EMAIL_RE.test(d.email || "")).map((d) => [d.id, d]));
    const targets = [];
    for (const id of new Set(districtIds)) {
      const d = allow.get(id);
      if (!d) return res.status(400).json({ ok: false, error: `區代碼無效或該區聯絡待補:${id}` });
      targets.push(d);
    }

    // ---- 附件驗證 ----
    if (!Array.isArray(attachments) || attachments.length > 5) {
      return res.status(400).json({ ok: false, error: "附件最多 5 個。" });
    }
    let total = 0;
    for (const a of attachments) {
      const ext = ((a.filename || "").split(".").pop() || "").toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) {
        return res.status(400).json({ ok: false, error: `不接受 .${ext} 格式,只接受:${ALLOWED_EXT.join(" / ")}` });
      }
      const buf = Buffer.from(a.data || "", "base64");
      if (!buf.length || buf.length > MAX_EACH) {
        return res.status(400).json({ ok: false, error: `附件 ${a.filename} 大小無效(上限1.5MB)。` });
      }
      total += buf.length;
    }
    if (total > MAX_TOTAL) {
      return res.status(400).json({ ok: false, error: "附件合共超過 4MB 上限。" });
    }

    // ---- 經 Resend 發送 ----
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL; // 例如: Scout 轉發中心 <notify@你的域名>
    if (!apiKey || !from) {
      return res.status(500).json({ ok: false, error: "後台未設定電郵服務(欠 RESEND_API_KEY / FROM_EMAIL)。" });
    }

    const notifiedList = targets.map((d) => `${d.district}`).join("、");
    const fullBody =
      `${body.trim()}\n\n` +
      `------------------------------\n` +
      `本通知經「專章訓練班跨區通知轉發中心」轉發,同時發送予以下 ${targets.length} 個區:${notifiedList}。\n` +
      `寄件人:${senderName.trim()} <${replyTo.trim()}>(回覆請直接按回覆本郵件)\n` +
      `轉發系統不儲存郵件內容及附件。`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [from.replace(/^.*<(.*)>.*$/, "$1") || from], // To 填自己,BCC 寄各區
        bcc: targets.map((d) => d.email),
        reply_to: replyTo.trim(),
        subject: subject.trim(),
        text: fullBody,
        attachments: attachments.map((a) => ({ filename: a.filename, content: a.data }))
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      // 不記內容,只記狀態碼
      console.error("resend_failed", r.status);
      return res.status(502).json({ ok: false, error: `電郵服務商拒收(${r.status}),請稍後再試或改用自己郵箱寄出。` });
    }

    console.log("forwarded", targets.length, "districts"); // 只記數量,不記內容
    return res.status(200).json({ ok: true, sent: targets.length, districts: targets.map((d) => `${d.district} <${d.email}>`) });
  } catch (err) {
    console.error("send_error");
    return res.status(500).json({ ok: false, error: "伺服器錯誤,請稍後再試。" });
  }
}
