# 📮 專章訓練班跨區通知轉發中心 (P174/2004)

## 背景
總會通告 **P174/2004**《童軍專科徽章訓練班及考驗》規定:訓練班領導人/專章考驗負責人於完成考驗後,**必須把獲得專章之成員名單以書面知會有關之區總監**。
但總會並無交代跨區聯繫方法——本工具就是補上呢一忽。

## 定位:名錄 + 轉發助手,唔做寄件人
- 訓練班領導人喺網頁 tick 區 → 攞齊收件名單(BCC) → 用**自己郵箱**寄出(內容、附件全部自己搞)。
- 本系統**唔經手寄件、唔儲存任何嘢**:無後台、無資料庫、無 API Key、無電郵服務要維護。
- 點解唔代寄?見下文「寄件身份」。

## 名錄覆蓋:44/44 ✅
- 區名/網站/電話/地址:嚟自 `scoutworld` 資料庫 `data/local/HK.json`(現行版)。
- 電郵:嚟自 scoutworld git 歷史(`0ee5c03`,當時 43 區有電郵,後來因政策被清空),再於 **2026-10-08** 逐個去官網重核:
  - 15 區喺官網首頁直接命中,與歷史一致;
  - 柴灣、鯉魚門官網已轉新地址 → 新舊兩個一併 BCC(寄多好過寄唔到);
  - 港島西區歷史無收錄 → 由其官網聯絡頁補上 `dchkw@scout.org.hk`。
- 地域總部電郵亦喺歷史搵得返(`enquiry@krscout.org`、`ntr@`、`nter@`、`ekr@`、`hkir@scout.org.hk`),P174 只需通知「區總監」所以暫時唔用,留返日後。

## 檔案結構(純靜態,零依賴)
```
scout-forward/
├── index.html          前台(一頁式)
├── app.js              前台邏輯
├── styles.css          樣式
├── data/
│   ├── districts.js    名錄(自動產生,見 tools/build_districts.py)
│   └── sources.json    爬蟲用:各區官網網址(同上,一併產生)
├── tools/
│   ├── crawl_emails.py     季檢爬蟲:掃44個官網首頁
│   ├── check_drift.js      對數:比較官網現況 vs 名錄,出報告
│   ├── build_districts.py  起步/大執用:合併名錄(平時唔使跑)
│   ├── crawl_result.json   上次爬蟲原始結果
│   ├── last_audit.md       上次季檢報告
│   └── audit/              歷次季檢報告存檔
└── .github/workflows/email-audit.yml  每3個月自動季檢
```

## 季檢:每 3 個月自動跑一次 🤖
- GitHub Actions 定時跑(每年 1/4/7/10 月 1 號 HKT 17:00),唔使理佢。
- 流程:爬 44 個官網首頁 → 同名錄對數 → 結果自動 commit 存檔。
- **官網 mailto 同名錄唔同** → 自動開 Issue(`email-audit` label)通知你,人手核實後更新 `tools/build_districts.py` 的 OVERRIDE 再重 gen。
- 想即刻試跑:去 repo 嘅 Actions →「區電郵季檢」→ Run workflow。
- 注意:要 push 上 GitHub 預設分支先會生效;Actions 要開住(預設開)。

## 部署(2 分鐘,零設定)
純靜態網頁,任揀一種:
- **Vercel**:push 上 GitHub → Import → Deploy,搞掂(唔使設環境變數)。
- **GitHub Pages / Netlify / Cloudflare Pages**:一樣直推即用。
- 本地預覽:`cd scout-forward && python3 -m http.server 8000`

## 更新名錄
- 轉電郵是常事。定期重跑 `tools/crawl_emails.py` 去官網首頁掃一次,對一對有無變。
- 改嘢只需改 `data/districts.js`(或改 `tools/build_districts.py` 的 override 再重 gen),push 即自動部署。

## 附:寄件身份四個 idea(點解最後揀「用戶自己寄」)
1. **用戶自己郵箱寄(mailto/copy,BCC)** ✅採用 — 寄件人 = 訓練班領導人本人,同 P174「領導人親自書面知會」原意最夾;零成本、零維護、零濫用、零私隱包袱。
2. **系統經 Resend/自家域名代寄** — 要買域名+做 SPF/DKIM 驗證+長期維護;寄件人變成個系統,區總監見到陌生寄件人,身份尷尬;仲要防濫用、 رسیدگی退信。重手,唔值。
3. **Gmail/Outlook OAuth 代寄** — 每個用戶要授權,技術複雜,唔適合一次過通知多區的場景。
4. **總會/地域官方郵箱發出** — 最正統,但要官方配合,唔係民間工具搞得掂。

一句講:「我剩係比個位佢轉發」——呢個位就係名錄 + 範本 + 一鍵開郵箱,寄件身份留返畀用戶自己。
