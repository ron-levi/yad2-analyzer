# Yad2 Parser

Python-based HTML parser for extracting structured data from Yad2 listings.

## Setup

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On macOS/Linux
# or
venv\Scripts\activate  # On Windows
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Create `.env` file:
```bash
cp .env.example .env
```

## Usage

Parse all HTML files from scraper output:

```bash
python src/main.py
```

Parse specific category:

```bash
python src/main.py --category vehicles
```

Parse specific date:

```bash
python src/main.py --date 2025-12-03
```

Specify output file:

```bash
python src/main.py --output results.json
```

## Architecture

- **main.py** - CLI entry point and orchestrator
- **parser.py** - Base parser with common utilities
- **config.py** - Configuration loader
- **extractors/** - Category-specific parsers
  - **real_estate.py** - Real estate field extraction
  - **vehicles.py** - Vehicle field extraction

## Output Format

Parsed data is saved as JSON:

```json
[
  {
    "ad_id": "abc123",
    "category": "vehicles",
    "url": "https://www.yad2.co.il/item/abc123",
    "scraped_at": "2025-12-03T10:30:00Z",
    "attributes": {
      "title": "Mazda 3 2020",
      "price": 85000,
      "year": 2020,
      "km": 45000,
      "hand": 2,
      "transmission": "automatic",
      "color": "white"
    }
  }
]
```

## Adding New Extractors

To add a new category parser:

1. Create `src/extractors/your_category.py`
2. Inherit from `BaseParser`
3. Implement `parse()` method
4. Import in `src/extractors/__init__.py`
5. Update `main.py` to handle new category
