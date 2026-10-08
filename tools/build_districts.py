#!/usr/bin/env python3
"""合併各區聯絡:scoutworld 現行名錄(區名/網站/電話/地址)
   + git 歷史電郵(0ee5c03) + 官網重核修正
   → data/districts.js + data/sources.json

手動跑(只需喺起步 / 大執時跑一次,平時季檢唔使跑):
    python3 tools/build_districts.py
環境變數 SCOUTWORLD_DIR 可指定 scoutworld repo 位置(預設係隔籬 ../scoutworld)。
"""
import json
import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCOUTWORLD = Path(os.environ.get("SCOUTWORLD_DIR", ROOT.parent / "scoutworld"))
OLD_COMMIT = "0ee5c03f5e85d3b18b961728b9297d5cee047de6"

# 官網重核結果:現行網站顯示的地址(優先);舊地址保留作 alt,一次過 BCC 晒兩個
OVERRIDE = {
    "HK-DIST-CW": ("admin@chaiwanscout.org.hk", "cw@hkirscout.org.hk"),   # 柴灣區官網 mailto
    "HK-DIST-LYM": ("lym@scout.org.hk", "lym@scouting.org.hk"),           # 鯉魚門區官網 mailto
    "HK-DIST-HKW": ("dchkw@scout.org.hk", ""),                            # 港島西區聯絡頁(歷史無)
}
# 喺官網首頁直接搵到、與歷史一致的(已核實)
SITE_VERIFIED = {"HK-DIST-SKC", "HK-DIST-TKO", "HK-DIST-TME", "HK-DIST-TWS",
                 "HK-DIST-STS", "HK-DIST-YT", "HK-DIST-SSPE", "HK-DIST-SSPW",
                 "HK-DIST-HKN", "HK-DIST-HKS", "HK-DIST-VIC", "HK-DIST-WTS"}

REGION_ID = {"港島地域": "HKIR", "九龍地域": "KR", "東九龍地域": "EKR",
             "新界地域": "NTR", "新界東地域": "NTER", "總部直轄": "HQ"}
ORDER = ["HKIR", "KR", "EKR", "NTR", "NTER", "HQ"]


def main():
    hk = json.loads((SCOUTWORLD / "data" / "local" / "HK.json").read_text())
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        tmp = f.name
    subprocess.run(["git", "-C", str(SCOUTWORLD), "show",
                    f"{OLD_COMMIT}:data/local/HK.json"],
                   stdout=open(tmp, "w"), check=True)
    old = {x["id"]: x.get("email", "") for x in json.loads(open(tmp).read())}

    dists = [x for x in hk if x.get("type") == "District"]
    dists.sort(key=lambda z: (ORDER.index(REGION_ID[z["subregion"]]), z["name"]))

    out, missing = [], []
    for d in dists:
        i = d["id"]
        if i in OVERRIDE:
            email, alt, src = OVERRIDE[i][0], OVERRIDE[i][1], "site:2026-10-08"
        else:
            email, alt = old.get(i, ""), ""
            src = "site:2026-10-08" if i in SITE_VERIFIED else "repo-history:0ee5c03"
        if not email:
            missing.append(i)
        out.append({"id": i, "region": REGION_ID[d["subregion"]], "district": d["name"],
                    "email": email, "alt": alt, "phone": d.get("phone", ""),
                    "website": d.get("website", ""), "address": d.get("address", ""), "src": src})

    js = """// 各區聯絡名錄(自動產生,唔好手改 — 改完跑 tools/build_districts.py 重gen)
// 來源:scoutworld/data/local/HK.json(區名/網站/電話/地址)
// 電郵:repo 歷史 0ee5c03 + 2026-10-08 官網重核(15區首頁直接命中,港島西區由聯絡頁補上)
// 覆蓋:44/44。alt = 舊地址(柴灣/鯉魚門官網轉咗新地址,舊的一併BCC,寄多好過寄唔到)。

export const REGIONS = [
  { id: "HKIR", name: "港島地域" },
  { id: "KR", name: "九龍地域" },
  { id: "EKR", name: "東九龍地域" },
  { id: "NTR", name: "新界地域" },
  { id: "NTER", name: "新界東地域" },
  { id: "HQ", name: "總部直轄" }
];

export const DISTRICTS = [
"""
    for o in out:
        js += ("  { id: %s, region: %s, district: %s, email: %s, alt: %s,\n"
               "    phone: %s, website: %s, address: %s, src: %s },\n" % (
            json.dumps(o["id"]), json.dumps(o["region"]), json.dumps(o["district"]),
            json.dumps(o["email"]), json.dumps(o["alt"]), json.dumps(o["phone"]),
            json.dumps(o["website"]), json.dumps(o["address"]), json.dumps(o["src"])))
    js += "];\n"
    (ROOT / "data" / "districts.js").write_text(js)

    sources = [{"id": o["id"], "name": o["district"], "website": o["website"]} for o in out]
    (ROOT / "data" / "sources.json").write_text(
        json.dumps(sources, ensure_ascii=False, indent=1) + "\n")

    print(f"wrote {len(out)} districts + sources.json, "
          f"missing email: {missing or 'NONE — 44/44 ✓'}")


if __name__ == "__main__":
    main()
