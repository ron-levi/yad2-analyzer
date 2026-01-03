"""
Main parser orchestrator
"""
import asyncio
import json
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime
import argparse
import sys
import os

# Fix imports to work with the module execution
from .config import config
from .database_manager import DatabaseManager
from .embedding_service import EmbeddingService

class ParserOrchestrator:
    def __init__(self):
        self.db_manager = DatabaseManager()
        self.embed_service = EmbeddingService()

    async def ingest_json_file(self, json_path: Path, segment_name: str, search_url: str):
        """Ingest ads from a scraper JSON output file"""
        print(f"📥 Ingesting JSON: {json_path}")
        
        if not json_path.exists():
            print(f"❌ File not found: {json_path}")
            return

        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        items = data.get('items', [])
        if not items:
            print("⚠️ No items found in JSON")
            return

        ads_to_save = []
        
        # Create segment if needed
        category = 'real_estate' if 'real_estate' in str(json_path) else 'vehicles'
        try:
            segment_id = await self.db_manager.create_segment(search_url, segment_name, category)
            print(f"Processing {len(items)} items for segment {segment_name} ({segment_id})")
        except Exception as e:
            print(f"❌ Failed to create/get segment: {e}")
            return

        for item in items:
            ad_id = str(item.get('id') or item.get('token'))
            if not ad_id: continue

            # Extract attributes
            price_raw = item.get('price')
            price = 0
            if price_raw:
                try:
                    price = int(str(price_raw).replace('₪', '').replace(',', '').strip())
                except:
                    pass
            
            title = item.get('title_1') or item.get('title') or "No Title"
            description = item.get('search_text') or ""
            city = item.get('city_text') or item.get('city') or ""
            neighborhood = item.get('neighborhood') or ""
            
            # Property Type
            prop_type = item.get('asset_type_text') or "unknown"

            # Attributes
            rooms = 0
            sqm = 0
            floor = 0
            
            if 'additionalDetails' in item:
                try:
                    rooms = float(item['additionalDetails'].get('roomsCount') or 0)
                    sqm = int(item['additionalDetails'].get('squareMeter') or 0)
                    floor = int(item['additionalDetails'].get('floor') or 0)
                except:
                    pass
            
            # Construct Ad Data
            ad_data = {
                'id': ad_id,
                'title': title,
                'description': description,
                'city': city,
                'neighborhood': neighborhood,
                'property_type': prop_type,
                'price': price,
                'rooms': rooms,
                'square_meters': sqm,
                'floor': floor,
                'attributes': item, # Store full JSON
                'original_data': item
            }
            ads_to_save.append(ad_data)

        # Save to DB
        if ads_to_save:
            try:
                await self.db_manager.save_ads(ads_to_save, segment_id)
                print(f"✅ Saved {len(ads_to_save)} ads to database")
                
                # Generate Embeddings
                print("Generating embeddings...")
                for ad in ads_to_save:
                    text_to_embed = f"{ad['title']} {ad['description']} {ad['city']} {ad['neighborhood']} {ad['property_type']} {ad['rooms']} rooms {ad['price']} NIS"
                    try:
                        vector = await self.embed_service.generate_embedding(text_to_embed)
                        
                        metadata = {
                            'price': ad['price'],
                            'rooms': ad['rooms'],
                            'sqm': ad['square_meters'],
                            'city': ad['city']
                        }
                        
                        await self.db_manager.save_embedding(ad['id'], vector, "hash_placeholder", metadata)
                    except Exception as e:
                        print(f"⚠️ Failed to generate embedding for {ad['id']}: {e}")
                        
                print("✅ Embeddings generated")
            except Exception as e:
                print(f"❌ Failed to save ads: {e}")

async def main_async():
    parser = argparse.ArgumentParser(description='Parse Yad2 scraped HTML files')
    parser.add_argument('--ingest-json', help='Ingest from scraper JSON output file')
    parser.add_argument('--db', action='store_true', help='Save to database')
    parser.add_argument('--segment-name', help='Segment name')
    parser.add_argument('--search-url', help='Search URL')
    
    # Legacy args to prevent errors if passed
    parser.add_argument('--category', help='Filter by category')
    parser.add_argument('--date', help='Filter by date')
    parser.add_argument('--output', help='Output JSON file')

    args = parser.parse_args()
    
    if args.ingest_json and args.db:
        orchestrator = ParserOrchestrator()
        await orchestrator.ingest_json_file(Path(args.ingest_json), args.segment_name, args.search_url)
    else:
        print("Only --ingest-json with --db is currently supported in this fix.")

def main():
    asyncio.run(main_async())

if __name__ == '__main__':
    main()
