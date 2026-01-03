#!/bin/bash
# Example end-to-end workflow for Yad2 scraping and parsing

set -e  # Exit on error

# Configuration
SEARCH_URL="https://www.yad2.co.il/vehicles/cars?manufacturer=26"
SEGMENT_NAME="Mazda Cars"
CATEGORY="vehicles"
DATE=$(date +%Y-%m-%d)

echo "═══════════════════════════════════════════════════════════"
echo "Yad2 Market Intelligence - Full Workflow"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Segment: $SEGMENT_NAME"
echo "Category: $CATEGORY"
echo "Date: $DATE"
echo ""

# Step 1: Scrape
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1: Scraping listings..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd scraper
npm run dev "$SEARCH_URL"
cd ..

echo ""
echo "✅ Scraping complete!"
echo ""

# Step 2: Parse
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2: Parsing HTML files..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd data_parser
source venv/bin/activate
python -m src.main \
    --category "$CATEGORY" \
    --date "$DATE" \
    --output "results_${DATE}.json" \
    --db \
    --segment-name "$SEGMENT_NAME" \
    --search-url "$SEARCH_URL"
deactivate
cd ..

echo ""
echo "✅ Parsing complete!"
echo ""

# Step 3: Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "WORKFLOW COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Raw HTML: scraper/output/$CATEGORY/$DATE/"
echo "📄 Parsed JSON: data_parser/results_${DATE}.json"
echo "💾 Database: yad2_intelligence"
echo ""
echo "Next steps:"
echo "  - Run analytics queries on database"
echo "  - Check data_parser/results_${DATE}.json for parsed data"
echo "  - Schedule this script to run daily for tracking"
echo ""
