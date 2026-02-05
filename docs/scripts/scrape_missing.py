#!/usr/bin/env python3
"""
Polite crawler for missing candidate websites.

Outputs one JSON file per candidate in assets/json/ by default.
Each JSON maps a sanitized URL key to extracted page text.
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from collections import deque
from urllib.parse import urljoin, urlparse, urldefrag
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup


DEFAULT_MAX_PAGES = 50
DEFAULT_DELAY_SECONDS = 1.0
DEFAULT_TIMEOUT = 20

SKIP_EXTENSIONS = {
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp",
    ".mp4", ".mp3", ".wav", ".zip", ".doc", ".docx", ".xls", ".xlsx",
    ".ppt", ".pptx", ".csv", ".json", ".xml"
}


def normalize_url(url):
    if not url:
        return None
    url = url.strip()
    if not url:
        return None
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    # strip fragments
    url, _ = urldefrag(url)
    return url


def safe_filename(person_id, person_name):
    name = person_name.strip().replace(" ", "_")
    name = re.sub(r"[^\w\-]+", "_", name, flags=re.U)
    name = name.strip("_")
    return f"{person_id}_{name}.json"


def url_key(url):
    key = re.sub(r"[^A-Za-z0-9]+", "_", url)
    return key.strip("_")


def is_same_domain(base, candidate):
    try:
        return urlparse(base).netloc.lower() == urlparse(candidate).netloc.lower()
    except Exception:
        return False


def should_skip_url(url):
    path = urlparse(url).path.lower()
    return any(path.endswith(ext) for ext in SKIP_EXTENSIONS)


def load_missing_candidates(candidates_csv, json_dirs):
    existing_ids = set()
    for d in json_dirs:
        if not os.path.isdir(d):
            continue
        for fn in os.listdir(d):
            if not fn.endswith(".json"):
                continue
            pid = fn.split("_", 1)[0]
            if pid:
                existing_ids.add(pid)

    missing = []
    with open(candidates_csv, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pid = str(row.get("person_id") or "").strip()
            if not pid:
                continue
            if pid not in existing_ids:
                missing.append(row)
    return missing


def load_exclude_list(path):
    if not path or not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip() and not line.startswith("#")]


def can_fetch_url(rp, user_agent, url):
    try:
        return rp.can_fetch(user_agent, url)
    except Exception:
        return False


def crawl_site(start_url, max_pages, delay, timeout, user_agent, respect_robots, exclude_patterns):
    parsed = urlparse(start_url)
    base = f"{parsed.scheme}://{parsed.netloc}"

    rp = None
    if respect_robots:
        rp = RobotFileParser()
        rp.set_url(urljoin(base, "/robots.txt"))
        try:
            rp.read()
        except Exception:
            rp = None

    session = requests.Session()
    session.headers.update({"User-Agent": user_agent})

    seen = set()
    queue = deque([start_url])
    results = {}
    last_request_time = 0.0

    while queue and len(results) < max_pages:
        url = queue.popleft()
        url = normalize_url(url)
        if not url or url in seen:
            continue
        seen.add(url)

        if should_skip_url(url):
            continue

        if not is_same_domain(start_url, url):
            continue

        if exclude_patterns and any(re.search(pat, url) for pat in exclude_patterns):
            continue

        if respect_robots and rp and not can_fetch_url(rp, user_agent, url):
            continue

        # polite delay per domain
        elapsed = time.time() - last_request_time
        if elapsed < delay:
            time.sleep(delay - elapsed)

        try:
            resp = session.get(url, timeout=timeout, allow_redirects=True)
            last_request_time = time.time()
        except requests.RequestException:
            continue

        if resp.status_code >= 400:
            continue

        content_type = resp.headers.get("Content-Type", "")
        if "text/html" not in content_type:
            continue

        soup = BeautifulSoup(resp.text, "html.parser")
        text = soup.get_text(separator=" ", strip=True)
        if text:
            results[url_key(url)] = text

        # enqueue links
        for a in soup.find_all("a", href=True):
            href = a.get("href")
            next_url = urljoin(url, href)
            next_url = normalize_url(next_url)
            if not next_url:
                continue
            if is_same_domain(start_url, next_url) and next_url not in seen:
                queue.append(next_url)

    return results


def main():
    parser = argparse.ArgumentParser(description="Polite scraper for missing candidate websites.")
    parser.add_argument("--candidates-csv", default="assets/data/candidates.csv")
    parser.add_argument("--json-dir", default="assets/json")
    parser.add_argument("--json-dirs", default="assets/json,assets/large_json",
                        help="Comma-separated dirs to check for existing JSON files.")
    parser.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES)
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SECONDS)
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    parser.add_argument("--user-agent", default="CandidateWebsiteScraper/1.0")
    parser.add_argument("--respect-robots", action="store_true", default=True)
    parser.add_argument("--ignore-robots", action="store_true")
    parser.add_argument("--exclude-file", default=None)
    parser.add_argument("--limit", type=int, default=None, help="Limit number of candidates to scrape.")

    args = parser.parse_args()

    respect_robots = args.respect_robots and not args.ignore_robots
    json_dirs = [d.strip() for d in args.json_dirs.split(",") if d.strip()]

    missing = load_missing_candidates(args.candidates_csv, json_dirs)
    if args.limit is not None:
        missing = missing[: args.limit]

    exclude_patterns = load_exclude_list(args.exclude_file)

    os.makedirs(args.json_dir, exist_ok=True)

    print(f"Missing candidates to scrape: {len(missing)}")
    for i, row in enumerate(missing, start=1):
        pid = str(row.get("person_id") or "").strip()
        name = row.get("person_name") or "unknown"
        homepage = normalize_url(row.get("homepage_url") or "")
        if not homepage:
            print(f"[{i}/{len(missing)}] Skipping {pid} {name}: no homepage_url")
            continue

        out_name = safe_filename(pid, name)
        out_path = os.path.join(args.json_dir, out_name)
        if os.path.exists(out_path):
            print(f"[{i}/{len(missing)}] Skipping {pid} {name}: already scraped")
            continue

        print(f"[{i}/{len(missing)}] Scraping {pid} {name} -> {homepage}")
        data = crawl_site(
            start_url=homepage,
            max_pages=args.max_pages,
            delay=args.delay,
            timeout=args.timeout,
            user_agent=args.user_agent,
            respect_robots=respect_robots,
            exclude_patterns=exclude_patterns,
        )

        if not data:
            print(f"  No pages scraped for {pid} {name}")
            continue

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    return 0


if __name__ == "__main__":
    sys.exit(main())
