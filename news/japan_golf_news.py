#!/usr/bin/env python3
"""
Japan Golf News Daily Digest Fetcher

Fetches golf news from major Japanese sources and generates
a Markdown-formatted daily digest.

Sources:
  - GDO (Golf Digest Online Japan)
  - Yahoo Japan Sports Golf
  - Alba Golf
  - JGTO (Japan Golf Tour Organization)
  - JLPGA (Japan Ladies Professional Golfers' Association)
  - Golf Network Japan

Usage:
  python japan_golf_news.py                     # Fetch from all sources, print to stdout
  python japan_golf_news.py --output digest.md  # Save to file
  python japan_golf_news.py --sources gdo alba  # Fetch specific sources only
  python japan_golf_news.py --days 3            # Look back 3 days instead of 1
  python japan_golf_news.py --max-per-source 10 # Limit articles per source
"""

import argparse
import logging
import re
import sys
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from urllib.parse import urljoin

import feedparser
import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

JST = timezone(timedelta(hours=9))

DEFAULT_HEADERS = {
    "User-Agent": (
        "JapanGolfNewsBot/1.0 "
        "(+https://github.com/your-org/japan-golf-news; contact@example.com)"
    ),
    "Accept-Language": "ja,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

REQUEST_TIMEOUT = 15  # seconds
DELAY_BETWEEN_REQUESTS = 1.5  # seconds — be polite

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("golf_news")


# ---------------------------------------------------------------------------
# Article model
# ---------------------------------------------------------------------------

@dataclass
class Article:
    title: str          # Original Japanese title — never translated
    url: str            # Direct link to the article
    source: str         # Source display name (e.g. "GDO (Golf Digest Online)")
    source_url: str = ""  # Homepage URL of the source site
    published: Optional[datetime] = None
    summary: str = ""
    tags: List[str] = field(default_factory=list)

    def __post_init__(self):
        # Normalize whitespace in title/summary
        self.title = " ".join(self.title.split())
        self.summary = " ".join(self.summary.split())


# ---------------------------------------------------------------------------
# Base fetcher
# ---------------------------------------------------------------------------

class BaseFetcher(ABC):
    """Abstract base for all news source fetchers."""

    name: str = "Unknown"
    key: str = "unknown"

    def __init__(self, days: int = 1, max_articles: int = 15):
        self.days = days
        self.max_articles = max_articles
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self.cutoff = datetime.now(JST) - timedelta(days=days)

    @abstractmethod
    def fetch(self) -> List[Article]:
        ...

    def _get(self, url: str) -> requests.Response:
        """GET with timeout, raise on bad status."""
        resp = self.session.get(url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return resp

    def _soup(self, url: str, encoding: Optional[str] = None) -> BeautifulSoup:
        resp = self._get(url)
        if encoding:
            resp.encoding = encoding
        return BeautifulSoup(resp.text, "lxml")

    def _is_recent(self, dt: Optional[datetime]) -> bool:
        if dt is None:
            return True  # include if we can't determine date
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=JST)
        return dt >= self.cutoff


# ---------------------------------------------------------------------------
# GDO (Golf Digest Online) — RSS-based
# ---------------------------------------------------------------------------

class GDOFetcher(BaseFetcher):
    name = "GDO (Golf Digest Online)"
    key = "gdo"
    home_url = "https://news.golfdigest.co.jp/"

    RSS_URLS = [
        "https://news.golfdigest.co.jp/rss/index.rdf",
        "https://www.golfdigest.co.jp/rss/news.rdf",
    ]

    FALLBACK_URL = "https://news.golfdigest.co.jp/"

    def fetch(self) -> List[Article]:
        articles = self._try_rss()
        if not articles:
            logger.info("GDO RSS unavailable, falling back to scrape")
            articles = self._scrape_fallback()
        return articles[: self.max_articles]

    def _try_rss(self) -> List[Article]:
        for rss_url in self.RSS_URLS:
            try:
                feed = feedparser.parse(rss_url)
                if feed.entries:
                    return self._parse_feed(feed)
            except Exception:
                continue
        return []

    def _parse_feed(self, feed) -> List[Article]:
        articles = []
        for entry in feed.entries:
            published = None
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                published = datetime(*entry.published_parsed[:6], tzinfo=JST)
            elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
                published = datetime(*entry.updated_parsed[:6], tzinfo=JST)

            if not self._is_recent(published):
                continue

            summary = ""
            if hasattr(entry, "summary"):
                summary = BeautifulSoup(entry.summary, "lxml").get_text(strip=True)

            articles.append(
                Article(
                    title=entry.get("title", ""),
                    url=entry.get("link", ""),
                    source=self.name,
                    source_url=self.home_url,
                    published=published,
                    summary=summary[:200],
                )
            )
        return articles

    def _scrape_fallback(self) -> List[Article]:
        articles = []
        try:
            soup = self._soup(self.FALLBACK_URL, encoding="utf-8")
            # Look for news article links on the page
            for a_tag in soup.select("a[href*='/news/']"):
                title = a_tag.get_text(strip=True)
                href = a_tag.get("href", "")
                if not title or len(title) < 5:
                    continue
                url = urljoin(self.FALLBACK_URL, href)
                articles.append(
                    Article(title=title, url=url, source=self.name, source_url=self.home_url)
                )
        except Exception as e:
            logger.warning(f"GDO scrape fallback failed: {e}")
        return articles


# ---------------------------------------------------------------------------
# Yahoo Japan Sports Golf
# ---------------------------------------------------------------------------

class YahooGolfFetcher(BaseFetcher):
    name = "Yahoo Japan Sports Golf"
    key = "yahoo"
    home_url = "https://sports.yahoo.co.jp/golf/"

    NEWS_URL = "https://news.yahoo.co.jp/topics/sports/golf"
    SPORTS_URL = "https://sports.yahoo.co.jp/golf/"

    def fetch(self) -> List[Article]:
        articles = []
        # Try the Yahoo News topics page
        try:
            articles.extend(self._scrape_news_topics())
        except Exception as e:
            logger.warning(f"Yahoo News topics scrape failed: {e}")

        # Also try the sports page
        if len(articles) < 3:
            try:
                articles.extend(self._scrape_sports())
            except Exception as e:
                logger.warning(f"Yahoo Sports scrape failed: {e}")

        return articles[: self.max_articles]

    def _scrape_news_topics(self) -> List[Article]:
        articles = []
        soup = self._soup(self.NEWS_URL, encoding="utf-8")
        for a_tag in soup.select("a"):
            href = a_tag.get("href", "")
            title = a_tag.get_text(strip=True)
            if not title or len(title) < 5:
                continue
            if "news.yahoo.co.jp" in href or "sports.yahoo.co.jp" in href:
                articles.append(
                    Article(
                        title=title,
                        url=href,
                        source=self.name,
                        source_url=self.home_url,
                    )
                )
        return articles

    def _scrape_sports(self) -> List[Article]:
        articles = []
        soup = self._soup(self.SPORTS_URL, encoding="utf-8")
        for a_tag in soup.select("a"):
            href = a_tag.get("href", "")
            title = a_tag.get_text(strip=True)
            if not title or len(title) < 8:
                continue
            if "/golf/" in href or "/column/" in href:
                url = urljoin(self.SPORTS_URL, href)
                articles.append(
                    Article(title=title, url=url, source=self.name, source_url=self.home_url)
                )
        return articles


# ---------------------------------------------------------------------------
# Alba Golf
# ---------------------------------------------------------------------------

class AlbaFetcher(BaseFetcher):
    name = "Alba Golf"
    key = "alba"
    home_url = "https://www.alba.co.jp/"

    NEWS_URL = "https://www.alba.co.jp/tour/news/"

    def fetch(self) -> List[Article]:
        articles = []
        try:
            soup = self._soup(self.NEWS_URL, encoding="utf-8")
            # Alba typically has news items in list/card layout
            for a_tag in soup.select("a[href*='/tour/news/']"):
                title = a_tag.get_text(strip=True)
                href = a_tag.get("href", "")
                if not title or len(title) < 5:
                    continue
                url = urljoin(self.NEWS_URL, href)
                if url == self.NEWS_URL:
                    continue
                articles.append(
                    Article(title=title, url=url, source=self.name, source_url=self.home_url)
                )
        except Exception as e:
            logger.warning(f"Alba scrape failed: {e}")
        return articles[: self.max_articles]


# ---------------------------------------------------------------------------
# JGTO (Japan Golf Tour Organization)
# ---------------------------------------------------------------------------

class JGTOFetcher(BaseFetcher):
    name = "JGTO"
    key = "jgto"
    home_url = "https://www.jgto.org/"

    NEWS_URL = "https://www.jgto.org/tour-tournament/news"

    def fetch(self) -> List[Article]:
        articles = []
        try:
            soup = self._soup(self.NEWS_URL, encoding="utf-8")
            for a_tag in soup.select("a[href*='news'], a[href*='article']"):
                title = a_tag.get_text(strip=True)
                href = a_tag.get("href", "")
                if not title or len(title) < 5:
                    continue
                url = urljoin("https://www.jgto.org/", href)
                articles.append(
                    Article(title=title, url=url, source=self.name, source_url=self.home_url)
                )
        except Exception as e:
            logger.warning(f"JGTO scrape failed: {e}")
        return articles[: self.max_articles]


# ---------------------------------------------------------------------------
# JLPGA (Japan Ladies Professional Golfers' Association)
# ---------------------------------------------------------------------------

class JLPGAFetcher(BaseFetcher):
    name = "JLPGA"
    key = "jlpga"
    home_url = "https://www.lpga.or.jp/"

    NEWS_URL = "https://www.lpga.or.jp/news"

    def fetch(self) -> List[Article]:
        articles = []
        try:
            soup = self._soup(self.NEWS_URL, encoding="utf-8")
            for a_tag in soup.select("a[href*='news'], a[href*='/article']"):
                title = a_tag.get_text(strip=True)
                href = a_tag.get("href", "")
                if not title or len(title) < 5:
                    continue
                url = urljoin("https://www.lpga.or.jp/", href)
                articles.append(
                    Article(title=title, url=url, source=self.name, source_url=self.home_url)
                )
        except Exception as e:
            logger.warning(f"JLPGA scrape failed: {e}")
        return articles[: self.max_articles]


# ---------------------------------------------------------------------------
# Golf Network Japan
# ---------------------------------------------------------------------------

class GolfNetworkFetcher(BaseFetcher):
    name = "Golf Network"
    key = "golfnetwork"
    home_url = "https://www.golfnetwork.co.jp/"

    NEWS_URL = "https://www.golfnetwork.co.jp/news/"

    def fetch(self) -> List[Article]:
        articles = []
        try:
            soup = self._soup(self.NEWS_URL, encoding="utf-8")
            for a_tag in soup.select("a[href*='news']"):
                title = a_tag.get_text(strip=True)
                href = a_tag.get("href", "")
                if not title or len(title) < 5:
                    continue
                url = urljoin("https://www.golfnetwork.co.jp/", href)
                if url == self.NEWS_URL:
                    continue
                articles.append(
                    Article(title=title, url=url, source=self.name, source_url=self.home_url)
                )
        except Exception as e:
            logger.warning(f"Golf Network scrape failed: {e}")
        return articles[: self.max_articles]


# ---------------------------------------------------------------------------
# All fetchers registry
# ---------------------------------------------------------------------------

ALL_FETCHERS = {
    "gdo": GDOFetcher,
    "yahoo": YahooGolfFetcher,
    "alba": AlbaFetcher,
    "jgto": JGTOFetcher,
    "jlpga": JLPGAFetcher,
    "golfnetwork": GolfNetworkFetcher,
}


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    """Lowercase, strip punctuation for comparison."""
    return re.sub(r"[^\w]", "", text.lower())


def deduplicate(articles: List[Article]) -> List[Article]:
    """Remove articles with very similar titles."""
    seen = set()
    unique = []
    for art in articles:
        norm = _normalize(art.title)
        # Skip very short normalized titles (likely navigation noise)
        if len(norm) < 6:
            continue
        # Check for near-duplicates: if 80%+ of the chars overlap with a seen title
        is_dup = False
        for s in seen:
            overlap = len(set(norm) & set(s)) / max(len(set(norm)), 1)
            if overlap > 0.85 and abs(len(norm) - len(s)) < 5:
                is_dup = True
                break
        if not is_dup:
            seen.add(norm)
            unique.append(art)
    return unique


# ---------------------------------------------------------------------------
# Digest generation
# ---------------------------------------------------------------------------

def generate_digest(
    articles_by_source: dict[str, List[Article]],
    date_str: Optional[str] = None,
) -> str:
    """Generate a Markdown-formatted daily digest."""
    if date_str is None:
        date_str = datetime.now(JST).strftime("%Y-%m-%d")

    lines = [
        f"# 日本ゴルフニュース — {date_str}",
        "",
    ]

    total = sum(len(arts) for arts in articles_by_source.values())
    if total == 0:
        lines.append("この期間のゴルフニュース記事は見つかりませんでした。")
        return "\n".join(lines)

    lines.append(f"*{len(articles_by_source)}ソースから{total}件の記事を収集*\n")

    for source_name, articles in articles_by_source.items():
        if not articles:
            continue
        # Use source_url from first article for the section header link
        source_link = articles[0].source_url if articles[0].source_url else ""
        if source_link:
            lines.append(f"## [{source_name}]({source_link})")
        else:
            lines.append(f"## {source_name}")
        lines.append("")
        for art in articles:
            date_info = ""
            if art.published:
                date_info = f" ({art.published.strftime('%m/%d %H:%M')})"
            summary_info = ""
            if art.summary:
                summary_info = f" — {art.summary[:120]}"
            # Source attribution with link on every article
            source_tag = f" `[{art.source}]({art.source_url})`" if art.source_url else f" `{art.source}`"
            lines.append(f"- [{art.title}]({art.url}){date_info}{summary_info} — 出典:{source_tag}")
        lines.append("")

    # Sources summary at the bottom
    lines.append("---")
    lines.append("### ソース一覧")
    lines.append("")
    seen_sources = {}
    for articles in articles_by_source.values():
        for art in articles:
            if art.source not in seen_sources and art.source_url:
                seen_sources[art.source] = art.source_url
    for name, url in seen_sources.items():
        lines.append(f"- [{name}]({url})")
    lines.append("")
    lines.append(
        f"*{datetime.now(JST).strftime('%Y-%m-%d %H:%M JST')} に生成*"
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(
    source_keys: Optional[List[str]] = None,
    days: int = 1,
    max_per_source: int = 15,
) -> str:
    """
    Run the news fetcher and return the digest as a string.

    Args:
        source_keys: List of source keys to fetch (None = all).
        days: How many days back to look.
        max_per_source: Max articles per source.

    Returns:
        Markdown-formatted digest string.
    """
    if source_keys is None:
        source_keys = list(ALL_FETCHERS.keys())

    articles_by_source: dict[str, List[Article]] = {}

    for key in source_keys:
        fetcher_cls = ALL_FETCHERS.get(key)
        if fetcher_cls is None:
            logger.warning(f"Unknown source key: {key}")
            continue

        fetcher = fetcher_cls(days=days, max_articles=max_per_source)
        logger.info(f"Fetching from {fetcher.name}...")

        try:
            articles = fetcher.fetch()
            articles = deduplicate(articles)
            articles_by_source[fetcher.name] = articles
            logger.info(f"  → {len(articles)} articles from {fetcher.name}")
        except Exception as e:
            logger.error(f"  ✗ Failed to fetch from {fetcher.name}: {e}")
            articles_by_source[fetcher.name] = []

        # Polite delay between sources
        time.sleep(DELAY_BETWEEN_REQUESTS)

    return generate_digest(articles_by_source)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch daily golf news from Japanese sources.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"Available sources: {', '.join(ALL_FETCHERS.keys())}",
    )
    parser.add_argument(
        "--sources",
        nargs="+",
        choices=list(ALL_FETCHERS.keys()),
        default=None,
        help="Specific sources to fetch (default: all)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=1,
        help="Number of days to look back (default: 1)",
    )
    parser.add_argument(
        "--max-per-source",
        type=int,
        default=15,
        help="Maximum articles per source (default: 15)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output file path (default: print to stdout)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress log messages",
    )

    args = parser.parse_args()

    if args.quiet:
        logging.getLogger("golf_news").setLevel(logging.WARNING)

    digest = run(
        source_keys=args.sources,
        days=args.days,
        max_per_source=args.max_per_source,
    )

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(digest)
        logger.info(f"Digest saved to {args.output}")
    else:
        print(digest)


if __name__ == "__main__":
    main()
