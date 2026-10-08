// 對數:比較 tools/crawl_result.json(官網現況)vs data/districts.js(名錄)
// 產生 tools/audit/audit-<日期>.md + tools/last_audit.md
// 有 DRIFT(官網 mailto 同名錄唔同)→ exit 1,畀 GitHub Actions 開 Issue;否則 exit 0。
// 用法:node tools/check_drift.js [--date YYYY-MM-DD]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DISTRICTS } from "../data/districts.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dateArg = process.argv.indexOf("--date");
const DATE = dateArg > 0 ? process.argv[dateArg + 1] : new Date().toISOString().slice(0, 10);

const crawl = JSON.parse(readFileSync(join(ROOT, "tools/crawl_result.json"), "utf8"));

const ok = [], drift = [], review = [], down = [], none = [];
for (const d of DISTRICTS) {
  const c = crawl[d.id];
  const current = [d.email, d.alt].filter((e) => e && e.includes("@"));
  if (!c) { review.push({ d, note: "爬蟲無此區結果" }); continue; }
  if (c.status !== "ok") { down.push({ d, note: c.status }); continue; }
  const mailtos = c.emails.filter((e) => e.startsWith("mailto:")).map((e) => e.slice(7));
  const pages = c.emails.filter((e) => e.startsWith("page:")).map((e) => e.slice(5));
  const hit = (arr) => arr.some((e) => current.includes(e));
  if (mailtos.length && hit(mailtos)) ok.push(d);
  else if (mailtos.length) drift.push({ d, found: mailtos });
  else if (pages.length && hit(pages)) ok.push(d);
  else if (pages.length) review.push({ d, note: "內文搵到(非mailto): " + pages.join(", ") });
  else none.push(d);
}

const row = (d, extra) => `| ${d.district} | ${d.email}${d.alt ? `<br>舊:${d.alt}` : ""} | ${extra} |`;
let md = `# 區電郵季檢報告 — ${DATE}\n\n`;
md += `名錄 ${DISTRICTS.length} 區:✅一致 ${ok.length} · 🔴變動 ${drift.length} · 🟡待覆 ${review.length} · ⚫連唔到 ${down.length} · ⚪首頁無電郵 ${none.length}\n\n`;
md += `## 🔴 變動(官網 mailto 同名錄唔同)\n\n`;
md += drift.length
  ? `| 區 | 名錄現有 | 官網發現 |\n|---|---|---|\n${drift.map(({ d, found }) => row(d, found.join("<br>"))).join("\n")}\n\n👉 請人手核實後更新 \`tools/build_districts.py\` 的 OVERRIDE(或名錄),再重 gen。\n\n`
  : `無 🎉\n\n`;
md += `## 🟡 待覆(要人眼睇睇)\n\n`;
md += review.length
  ? `| 區 | 名錄現有 | 發現 |\n|---|---|---|\n${review.map(({ d, note }) => row(d, note)).join("\n")}\n\n`
  : `無 🎉\n\n`;
md += `## ⚫ 連唔到嘅網站\n\n`;
md += down.length
  ? `| 區 | 名錄現有 | 狀態 |\n|---|---|---|\n${down.map(({ d, note }) => row(d, note)).join("\n")}\n\n`
  : `無 🎉\n\n`;
md += `<details><summary>⚪ 首頁搵唔到電郵(${none.length} 區,正常,唔使理)</summary>\n\n${none.map((d) => d.district).join("、")}\n\n</details>\n`;

mkdirSync(join(ROOT, "tools/audit"), { recursive: true });
writeFileSync(join(ROOT, `tools/audit/audit-${DATE}.md`), md);
writeFileSync(join(ROOT, "tools/last_audit.md"), md);
console.log(`audit ${DATE}: ok=${ok.length} drift=${drift.length} review=${review.length} down=${down.length} none=${none.length}`);
if (drift.length) {
  console.log("DRIFT:", drift.map(({ d, found }) => `${d.district} [${d.email}] -> [${found.join(",")}]`).join("; "));
  process.exit(1);
}
