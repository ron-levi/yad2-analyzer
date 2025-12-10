# Yad2 Scraper

TypeScript-based web scraper for Yad2 listings using Playwright.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install chromium
```

3. Create `.env` file:
```bash
cp .env.example .env
```

## Usage

Run the scraper with a Yad2 search URL:

```bash
npm run dev "https://www.yad2.co.il/vehicles/cars?manufacturer=26"
```

## Location Search

Find Yad2 location codes for building search URLs:

```bash
# Search using live Yad2 API (most accurate)
npm run find-location -- --online "תל אביב"
npm run find-location -- --online "ראשון לציון"

# Search using local cache
npm run find-location -- "רעננה"

# Build complete URLs for a city
npm run find-location -- --build-url "חיפה"

# List all available areas
npm run find-location -- --list-areas
```

### Location API

The `LocationResolver` service provides programmatic access:

```typescript
import { LocationResolver } from './services/LocationResolver.js';

const resolver = new LocationResolver();
await resolver.init();

// Online search (recommended - uses live API)
const results = await resolver.searchOnline('תל אביב');
// Returns: { type: 'city', codes: { topArea: 2, area: 1, city: 5000 }, ... }

// Build search URL
const url = resolver.buildSearchUrl(
  'https://www.yad2.co.il/realestate/forsale',
  'רעננה'
);
// Returns: https://www.yad2.co.il/realestate/forsale?topArea=2&area=4&city=7900
```

### Yad2 Location Hierarchy

- **topArea (מחוז)** - Region: מרכז=2, ירושלים=1, חיפה=25, צפון=24, דרום=41
- **area (אזור)** - District within region: תל אביב=1, השרון=4, ראשון לציון=9
- **city (עיר)** - City: תל אביב=5000, רעננה=7900, ראשון לציון=8300
- **neighborhood (שכונה)** - Neighborhood within city

## Configuration

Edit `.env` to adjust settings:

- `DELAY_MIN_MS` - Minimum delay between requests (default: 2000)
- `DELAY_MAX_MS` - Maximum delay between requests (default: 5000)
- `MAX_PAGES_PER_RUN` - Maximum pages to scrape per run (default: 10)
- `OUTPUT_DIR` - Directory for saved HTML files (default: ./output)

## Output Structure

HTML files are saved in the following structure:

```
output/
├── vehicles/
│   └── 2025-12-03/
│       ├── abc123.html
│       └── abc123.json
└── real_estate/
    └── 2025-12-03/
        ├── xyz789.html
        └── xyz789.json
```

## Architecture

- **index.ts** - CLI entry point
- **orchestrator.ts** - Main workflow coordinator
- **lister.ts** - Pagination and Ad ID extraction
- **fetcher.ts** - Individual ad page scraping
- **browser.ts** - Browser management with stealth
- **storage.ts** - File system operations
- **config.ts** - Configuration loader
- **LocationResolver.ts** - Location name to Yad2 code translation

## Anti-Bot Features

- Playwright stealth configuration
- Random delays between requests
- Human-like scrolling behavior
- Session cookie management
- Custom user agent
