import { REGIONS, DISTRICTS } from "./data/districts.js";

// ---------- 預設主旨 / 內文範本 ----------
const DEFAULT_SUBJECT = "[專章訓練班/考驗合格通知] {訓練班名稱} — 敬知會貴區總監 (P174/2004)";

const DEFAULT_BODY = `敬啟者:

根據香港童軍總會通告 P174/2004《童軍專科徽章訓練班及考驗》,凡經批准舉辦之專章訓練班或考驗,各區均須予以認可;訓練班領導人/專章考驗負責人於完成考驗後,必須把獲得專章之成員名單以書面知會有關之區總監。

現附上本訓練班/考驗之合格成員名單,敬請貴區查收及認可。

訓練班/考驗名稱:
主辦單位(區/地域/總會):
舉行日期:
批准編號(如有):
附件:合格成員名單(共__人)

如有查詢,請回覆本電郵與本人聯絡。

順頌
台安

訓練班領導人/專章考驗負責人:
聯絡電話:
日期:`;

// ---------- 狀態 ----------
const selected = new Set(); // district id
const $ = (id) => document.getElementById(id);
const byId = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));
const regionName = Object.fromEntries(REGIONS.map((r) => [r.id, r.name]));
const hasEmail = (d) => d.email && d.email.includes("@");
const withEmail = DISTRICTS.filter(hasEmail);

// BCC 名單:主地址 + 有 alt 的舊地址(一併寄出)
function selectedEmails() {
  const out = [];
  for (const id of selected) {
    const d = byId[id];
    if (!d || !hasEmail(d)) continue;
    out.push(d.email);
    if (d.alt && d.alt.includes("@")) out.push(d.alt);
  }
  return out;
}

// ---------- 渲染:按地域分組的 checkbox ----------
function renderGroups(filter = "") {
  const q = filter.trim().toLowerCase();
  const box = $("districtGroups");
  box.innerHTML = "";
  for (const r of REGIONS) {
    const list = DISTRICTS.filter(
      (d) =>
        d.region === r.id &&
        (!q || d.district.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
    );
    if (!list.length) continue;
    const g = document.createElement("div");
    g.className = "group";
    const available = list.filter(hasEmail);
    g.innerHTML = `
      <div class="grouphead">
        <strong>${r.name}</strong><span class="tiny">${available.length}/${list.length} 區有電郵</span>
        <span class="spacer"></span>
        <button type="button" class="linkbtn" data-region="${r.id}">全選此地域</button>
      </div>
      <div class="checks"></div>`;
    const checks = g.querySelector(".checks");
    for (const d of list) {
      const lab = document.createElement("label");
      if (hasEmail(d)) {
        lab.className = "check";
        const alt = d.alt ? `<br>+ 舊地址:${d.alt}` : "";
        lab.innerHTML = `<input type="checkbox" data-id="${d.id}" ${selected.has(d.id) ? "checked" : ""}> <span>${d.district}<small>${d.email}${alt}</small></span>`;
      } else {
        lab.className = "check missing";
        const contact = [d.phone, d.website].filter(Boolean);
        lab.innerHTML = `<input type="checkbox" disabled> <span>${d.district}<small class="warn">⚠ 電郵待補${contact.length ? " — " + contact.map((c) => c.startsWith("http") ? `<a href="${c}" target="_blank" rel="noopener">區會網站</a>` : c).join(" ") : ""}</small></span>`;
      }
      checks.appendChild(lab);
    }
    box.appendChild(g);
  }
  if (!box.children.length) box.innerHTML = `<p class="hint">搵唔到相關嘅區,試下其他關鍵字。</p>`;
}

function refreshPreview() {
  const box = $("recipientPreview");
  const list = [...selected].map((id) => byId[id]).filter(Boolean);
  $("selCount").textContent = `已選 ${list.length} 個區`;
  if (!list.length) {
    box.innerHTML = `<span class="empty">尚未選擇任何區</span>`;
    return;
  }
  box.innerHTML = "";
  for (const d of list) {
    const s = document.createElement("span");
    s.className = "chip";
    const alt = d.alt ? ` <small>(+舊:${d.alt})</small>` : "";
    s.title = `${d.district} ${d.phone || ""} ${d.website || ""}`.trim();
    s.innerHTML = `${d.district} <small>${d.email}</small>${alt} <button type="button" data-un="${d.id}" title="移除">✕</button>`;
    box.appendChild(s);
  }
}

// ---------- 工具 ----------
async function copyText(t, okMsg) {
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  showResult("ok", okMsg);
}

function showResult(type, html) {
  const el = $("result");
  el.hidden = false;
  el.className = "result " + type;
  el.innerHTML = html;
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- 事件 ----------
$("districtGroups").addEventListener("change", (e) => {
  const id = e.target.dataset?.id;
  if (!id) return;
  e.target.checked ? selected.add(id) : selected.delete(id);
  refreshPreview();
});
$("districtGroups").addEventListener("click", (e) => {
  const r = e.target.dataset?.region;
  if (!r) return;
  DISTRICTS.filter((d) => d.region === r && hasEmail(d)).forEach((d) => selected.add(d.id));
  renderGroups($("search").value);
  refreshPreview();
});
$("recipientPreview").addEventListener("click", (e) => {
  const id = e.target.dataset?.un;
  if (!id) return;
  selected.delete(id);
  renderGroups($("search").value);
  refreshPreview();
});
$("search").addEventListener("input", (e) => renderGroups(e.target.value));
$("btnAll").addEventListener("click", () => {
  withEmail.forEach((d) => selected.add(d.id));
  renderGroups($("search").value);
  refreshPreview();
});
$("btnClear").addEventListener("click", () => {
  selected.clear();
  renderGroups($("search").value);
  refreshPreview();
});

$("btnCopyEmails").addEventListener("click", () => {
  const emails = selectedEmails();
  if (!emails.length) return showResult("err", "❌ 請先剔選至少一個有電郵嘅區。");
  copyText(emails.join("; "), `✅ 已複製 ${emails.length} 個電郵地址(以分號分隔,請貼上你郵件嘅 <strong>BCC</strong> 欄)。`);
});
$("btnCopySubject").addEventListener("click", () => copyText($("subject").value, "✅ 已複製主旨。"));
$("btnCopyBody").addEventListener("click", () => copyText($("body").value, "✅ 已複製內文。"));

$("btnMailto").addEventListener("click", () => {
  const emails = selectedEmails();
  if (!emails.length) return showResult("err", "❌ 請先剔選至少一個有電郵嘅區。");
  const url =
    "mailto:?bcc=" + encodeURIComponent(emails.join(";")) +
    "&subject=" + encodeURIComponent($("subject").value.trim()) +
    "&body=" + encodeURIComponent($("body").value.trim());
  if (url.length > 8000) {
    showResult("err", "⚠️ 內容太長,電郵程式未必食得晒。請改用上面嘅複製掣(BCC 名單 + 主旨 + 內文),手動貼去 Gmail / Outlook 寄出。");
    return;
  }
  location.href = url;
  showResult("info", `ℹ️ 已嘗試開啟電郵程式(${[...selected].length} 個區)。記得:<strong>加返合格名單附件</strong>、對返 checklists 先好寄。如無反應,請用複製掣手動寄。`);
});

// ---------- 初始化 ----------
$("subject").value = DEFAULT_SUBJECT;
$("body").value = DEFAULT_BODY;
renderGroups();
refreshPreview();
