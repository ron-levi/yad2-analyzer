# Yad2 Market Intelligence System

> Transform raw Yad2 listings into actionable economic insights for purchasing decisions.

## Overview

The Yad2 Market Intelligence System is a data pipeline that scrapes listings from [Yad2](https://www.yad2.co.il/), extracts structured data, and generates market analytics to help users make informed purchasing decisions for real estate and vehicles.

## Core Concept

Users define a **Segment** (e.g., "Mazda 3, 2018-2022" or "Apartments, Tel Aviv, 3 rooms"), and the system continuously tracks listings to provide:

- Current market pricing (averages, medians, distributions)
- Price trends and history tracking
- Deal scoring and negotiation insights

## System Components

| Service | Role | Technology |
|---------|------|------------|
| **Scraper** | Crawls listings, stores raw HTML | TypeScript, Playwright |
| **Parser** | Extracts structured data from HTML | Python, BeautifulSoup |

| **Database** | Stores time-series data | PostgreSQL with JSONB |
| **Analyzer** | Generates metrics and insights | Python, Pandas (Phase 2) |

## Installation

See [SETUP.md](SETUP.md) for complete installation instructions.

## Quick Start

### 1. Scraper (TypeScript + Playwright)

```bash
cd scraper
npm install
npx playwright install chromium
cp .env.example .env
npm run dev "https://www.yad2.co.il/vehicles/cars?manufacturer=26"
```

### 2. Parser (Python + BeautifulSoup)

```bash
cd parser
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python src/main.py --category vehicles
```

### 3. Database (PostgreSQL)

```bash
cd database
createdb yad2_intelligence
psql -d yad2_intelligence -f schema.sql
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — System design and data flow
- [Roadmap](docs/ROADMAP.md) — Product phases and feature rollout
- [Schema](docs/SCHEMA.md) — Database structure and field definitions
- [Anti-Bot Strategy](docs/ANTI_BOT_STRATEGY.md) — Stealth and proxy techniques
- [Development Guide](docs/DEVELOPMENT_GUIDE.md) — Getting started guide

## Component READMEs

- [Scraper](scraper/README.md) — TypeScript scraper setup and usage
- [Parser](parser/README.md) — Python parser setup and usage
- [Database](database/README.md) — PostgreSQL schema and queries

## Project Status

✅ **Phase 1 (MVP)** — Core Implementation Complete

- ✅ Scraper with pagination and HTML capture
- ✅ Parser with category-specific extractors
- ✅ Database schema with time-series support
- ⏳ Integration testing and deployment

**Next:** Database integration and automated workflows