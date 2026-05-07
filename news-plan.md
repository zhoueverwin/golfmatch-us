# Golf News Feature — Implementation Plan

## Overview

Add a **ゴルフニュース (Golf News)** feature to the app: a dedicated screen showing aggregated golf news from major Japanese sources, accessible from the Home screen header. News articles are scraped by a Python script, stored in Supabase, and displayed in the app with tappable hyperlinks to original sources.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  Python Script (news/japan_golf_news.py)                       │
│  - Fetches from 6 sources (GDO, Yahoo, Alba, JGTO, JLPGA,     │
│    Golf Network)                                               │
│  - Cleans & deduplicates articles                              │
│  - Pushes structured data to Supabase via supabase-py          │
│  - Runs on schedule (GitHub Actions cron, every 4-6 hours)     │
└────────────────────────┬───────────────────────────────────────┘
                         │  INSERT into news_articles
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  Supabase: news_articles table                                 │
│  - Stores article metadata + source hyperlinks                 │
│  - RLS: read-only for authenticated users                      │
│  - Auto-cleanup of articles older than 30 days                 │
└────────────────────────┬───────────────────────────────────────┘
                         │  React Query fetch
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  React Native App                                              │
│  - HomeScreen header: [📰] news button                         │
│  - GolfNewsScreen: scrollable list of news cards               │
│  - Each card has tappable hyperlink to original article        │
└────────────────────────────────────────────────────────────────┘
```

---

## 1. Supabase Table Schema

### `news_articles`

```sql
CREATE TABLE news_articles (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title         TEXT NOT NULL,
  summary       TEXT DEFAULT '',
  thumbnail_url TEXT DEFAULT '',
  source_name   TEXT NOT NULL,          -- "GDO (Golf Digest Online)"
  source_url    TEXT NOT NULL,          -- "https://news.golfdigest.co.jp/"
  article_url   TEXT NOT NULL UNIQUE,   -- direct link to article (the hyperlink)
  category      TEXT DEFAULT 'general', -- "domestic", "international", "tournament", "gear", "lesson"
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),

  -- Prevent duplicate articles
  CONSTRAINT unique_article_url UNIQUE (article_url)
);

-- Index for efficient querying
CREATE INDEX idx_news_articles_published_at ON news_articles (published_at DESC);
CREATE INDEX idx_news_articles_source ON news_articles (source_name);

-- RLS: authenticated users can read only
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read news"
  ON news_articles FOR SELECT
  TO authenticated
  USING (true);
```

---

## 2. Python Script Output Format

### Current Article dataclass (existing)

```python
@dataclass
class Article:
    title: str
    url: str              # ← this becomes article_url (the hyperlink)
    source: str           # ← this becomes source_name
    source_url: str       # ← homepage of source
    published: Optional[datetime]
    summary: str
    tags: List[str]
```

### Target JSON for Supabase insert

Each article will be transformed to:

```json
{
  "title": "畑岡奈紗が2戦連続で首位スタート",
  "summary": "ホンダLPGAタイランド初日、畑岡が8バーディで首位発進...",
  "thumbnail_url": "",
  "source_name": "GDO (Golf Digest Online)",
  "source_url": "https://news.golfdigest.co.jp/",
  "article_url": "https://news.golfdigest.co.jp/news/lpga/article/188404/1/",
  "category": "international",
  "published_at": "2026-02-19T17:00:00+09:00"
}
```

### Script modifications needed

1. **Add `supabase-py` integration** — connect and upsert articles
2. **Filter navigation junk** — skip entries like "トーナメント", "GDO EYE", "ゴルフニュース" (title-only nav links)
3. **Truncate overly long titles** — GDO scrape fallback appends article body to title; cap at ~100 chars
4. **Exclude off-topic items** — filter Yahoo gear review URLs (`/golfgear/`)
5. **Auto-categorize** — parse category from title/URL patterns:
   - `海外男子`, `海外女子`, `PGA`, `LPGA` → "international"
   - `国内`, `JGTO`, `JLPGA` → "domestic"
   - `レッスン` → "lesson"
   - `ギア`, `ウェッジ`, `アイアン`, `パター` → "gear"
   - Default → "general"
6. **Upsert logic** — use `article_url` as conflict key to avoid duplicates
7. **Optional: extract `og:image`** — fetch article page and extract `<meta property="og:image">` for thumbnails (v2)

---

## 3. React Native — Screen Design

### Entry Point: HomeScreen Header Button

Add a news icon button to the left of the existing "add post" button:

```
┌──────────────────────────────────────────────────┐
│  [Logo]                        [📰]  [+ Post]    │
│  [おすすめ]  [フォロー中]                         │
└──────────────────────────────────────────────────┘
```

- Icon: `Ionicons "newspaper-outline"` (consistent with existing Ionicons usage)
- Tapping navigates to `GolfNews` screen via stack navigation

### GolfNewsScreen Layout

```
┌──────────────────────────────────────────────────┐
│  ←  ゴルフニュース                                │  ← header with back button
├──────────────────────────────────────────────────┤
│  [すべて] [国内] [海外] [ギア] [レッスン]         │  ← horizontal filter chips
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │                                            │  │
│  │  畑岡奈紗が8バーディで首位発進              │  │  ← title (bold, 16px)
│  │                                            │  │
│  │  ホンダLPGAタイランド初日、畑岡が           │  │  ← summary (gray, 14px)
│  │  8バーディで首位発進。山下美夢有は...       │  │
│  │                                            │  │
│  │  GDO (Golf Digest Online) で記事を読む →   │  │  ← tappable hyperlink (teal, 14px)
│  │                                  5時間前    │  │  ← relative timestamp
│  │                                            │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │                                            │  │
│  │  松山英樹は大会2勝目を目指す               │  │
│  │                                            │  │
│  │  ジェネシスインビテーショナルに出場する     │  │
│  │  松山英樹は前回王者として2勝目を...         │  │
│  │                                            │  │
│  │  Golf Network で記事を読む →               │  │
│  │                                  3時間前    │  │
│  │                                            │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  [Thumbnail Image]                         │  │  ← if thumbnail available (v2)
│  │                                            │  │
│  │  岩井明愛が世界ランク19位浮上              │  │
│  │                                            │  │
│  │  サウジ大会で2位フィニッシュした岩井が     │  │
│  │  世界ランキングで自己最高の19位に...        │  │
│  │                                            │  │
│  │  JLPGA で記事を読む →                      │  │
│  │                                  1日前      │  │
│  │                                            │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  (FlashList continues with infinite scroll...)   │
└──────────────────────────────────────────────────┘
```

### News Card Component Details

```
┌─ NewsCard ───────────────────────────────────────┐
│                                                  │
│  [category badge]                      [時間前]  │
│                                                  │
│  Title text (bold)                               │
│  Max 2 lines, ellipsis overflow                  │
│                                                  │
│  Summary text (gray, secondary)                  │
│  Max 3 lines, ellipsis overflow                  │
│                                                  │
│  🔗 {source_name} で記事を読む →                 │
│     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^             │
│     Tappable — opens article_url                 │
│     Color: Colors.primary (#20B2AA)              │
│     onPress: Linking.openURL(article_url)        │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Hyperlink Behavior

- **Article link** (`article_url`): Tapping "〇〇 で記事を読む →" opens the original article in the device's default browser via `Linking.openURL()`
- **Source link** (`source_url`): Optionally, tapping the source name badge could open the source homepage
- Both are rendered as teal-colored tappable text, underlined

---

## 4. Navigation Changes

### RootStackParamList addition

```typescript
// src/types/index.ts
export type RootStackParamList = {
  // ... existing routes
  GolfNews: undefined;  // ← new
};
```

### AppNavigator addition

```typescript
// src/navigation/AppNavigator.tsx
<Stack.Screen
  name="GolfNews"
  component={GolfNewsScreen}
  options={{ headerShown: false }}
/>
```

---

## 5. Data Layer

### React Query Hook: `useGolfNews`

```typescript
// src/hooks/queries/useGolfNews.ts
export function useGolfNews(category?: string) {
  return useInfiniteQuery({
    queryKey: ['golf-news', category],
    queryFn: ({ pageParam = 0 }) => fetchGolfNews({ page: pageParam, category }),
    getNextPageParam: (lastPage, pages) => lastPage.length === PAGE_SIZE ? pages.length : undefined,
    staleTime: 10 * 60 * 1000,    // 10 min
    gcTime: 60 * 60 * 1000,       // 1 hour
  });
}
```

### Supabase Query

```typescript
// src/services/supabase/newsService.ts
async function fetchGolfNews({ page, category, limit = 20 }) {
  let query = supabase
    .from('news_articles')
    .select('*')
    .order('published_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  return data ?? [];
}
```

---

## 6. New Files to Create

| File | Purpose |
|------|---------|
| `src/screens/GolfNewsScreen.tsx` | Main news screen with FlashList |
| `src/components/NewsCard.tsx` | Individual news article card |
| `src/hooks/queries/useGolfNews.ts` | React Query hook for fetching news |
| `src/services/supabase/newsService.ts` | Supabase queries for news_articles |

### Files to Modify

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `GolfNews` to `RootStackParamList` |
| `src/navigation/AppNavigator.tsx` | Add `GolfNews` screen to stack |
| `src/screens/HomeScreen.tsx` | Add news button to header |
| `news/japan_golf_news.py` | Add Supabase integration + data cleanup |
| `news/requirements.txt` | Add `supabase` dependency |

---

## 7. Python Script Scheduling

### Option A: GitHub Actions (Recommended)

```yaml
# .github/workflows/fetch-news.yml
name: Fetch Golf News
on:
  schedule:
    - cron: '0 */4 * * *'  # Every 4 hours
  workflow_dispatch:         # Manual trigger

jobs:
  fetch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r news/requirements.txt
      - run: python news/japan_golf_news.py --supabase
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```

### Option B: Local cron (for development)

```bash
# Run every 4 hours
0 */4 * * * cd /path/to/golfmatch/news && /path/to/venv/bin/python japan_golf_news.py --supabase
```

---

## 8. Implementation Order

| Step | Task | Dependencies |
|------|------|-------------|
| 1 | Create `news_articles` table in Supabase (migration) | None |
| 2 | Adapt Python script: cleanup + Supabase push | Step 1 |
| 3 | Run script to populate initial data | Step 2 |
| 4 | Create `newsService.ts` (Supabase queries) | Step 1 |
| 5 | Create `useGolfNews.ts` (React Query hook) | Step 4 |
| 6 | Create `NewsCard.tsx` component | None |
| 7 | Create `GolfNewsScreen.tsx` | Steps 5, 6 |
| 8 | Add navigation route + Home header button | Step 7 |
| 9 | Set up GitHub Actions cron schedule | Step 2 |
| 10 | Test end-to-end flow | All |

---

## 9. Future Enhancements (v2)

- **Thumbnail images**: Extract `og:image` meta tags from article pages
- **Push notifications**: Alert users of breaking golf news
- **Bookmarks**: Save articles for later reading
- **Social reactions**: Like/comment on news articles within the app
- **In-app WebView**: Read full articles without leaving the app
- **AI summaries**: Auto-generate Japanese summaries for articles that only have titles
