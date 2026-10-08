#!/usr/bin/env python3
"""去各區官網首頁搵公開 mailto / 電郵地址。

讀取: data/sources.json (id / name / website)
寫入: tools/crawl_result.json

手動跑:  python3 tools/crawl_emails.py   (喺 project 根目錄跑)
自動跑:  GitHub Actions 每 3 個月跑一次 (.github/workflows/email-audit.yml)
"""
import json
import re
import ssl
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "data" / "sources.json"
OUT = ROOT / "tools" / "crawl_result.json"

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
CTX = ssl._create_unverified_context()
MAILTO_RE = re.compile(r"mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})", re.I)
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
BAD_EXT = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".css", ".js", ".webp", ".ico")
BAD = ("example.com", "email.com", "domain.com", "sentry", "wixpress", "schema.org")


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=12, context=CTX) as r:
            if "text" not in (r.headers.get("Content-Type", "") + "html"):
                return "", "non-html"
            return r.read(800_000).decode("utf-8", "ignore"), "ok"
    except Exception as e:
        return "", f"ERR {type(e).__name__}: {e}"[:100]


def harvest(entry):
    did, name, url = entry["id"], entry["name"], entry.get("website", "")
    if not url or "facebook.com" in url:
        return did, name, url, [], "skip-social"
    html, status = fetch(url)
    if not html:
        return did, name, url, [], status
    found, seen = [], set()
    for m in MAILTO_RE.findall(html):
        e = m.lower().rstrip(".")
        if e not in seen and not e.endswith(BAD_EXT) and not any(b in e for b in BAD):
            seen.add(e)
            found.append("mailto:" + e)
    if not found:  # 無 mailto 先用全文 regex(雜訊多,只留頭 5 個)
        for m in EMAIL_RE.findall(html):
            e = m.lower().rstrip(".")
            if e not in seen and not e.endswith(BAD_EXT) and not any(b in e for b in BAD):
                seen.add(e)
                found.append("page:" + e)
                if len(found) >= 5:
                    break
    return did, name, url, found, status


def main():
    sources = json.loads(SOURCES.read_text())
    print(f"crawling {len(sources)} district sites...")
    out = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        for did, name, url, found, status in ex.map(harvest, sources):
            out[did] = {"name": name, "website": url, "emails": found, "status": status}
            print(f"{did} | {name} | {status} | {found}")
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    n = sum(1 for v in out.values() if v["emails"])
    print(f"\nDONE: {n}/{len(sources)} sites yielded emails -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
