import argparse
import asyncio
from pathlib import Path
from src.extractors.json_extractor import JSONExtractor
from src.database_manager import DatabaseManager
from src.embedding_service import EmbeddingService
from src.config import config
import hashlib

async def process_file(file_path: Path, city: str = None):
    print(f"📂 Processing {file_path}...")
    
    # 1. Extract
    extractor = JSONExtractor(file_path, metadata={"city": city})
    ads = extractor.extract()
    print(f"   ✅ Extracted {len(ads)} ads")
    
    if not ads:
        return

    # 2. Save to SQL
    db = DatabaseManager()
    # Ensure tables exist (if not using alembic for dev)
    # await db.create_tables() 
    
    # We need a segment ID. For now, we can create a dummy one or look it up.
    # In a real flow, this comes from the scraper metadata.
    # We'll skip segment_id for now or handle it in DatabaseManager if needed.
    
    print("   💾 Saving to SQL...")
    try:
        await db.save_ads(ads)
        print("   ✅ Saved to SQL")
    except Exception as e:
        print(f"   ❌ Error saving to SQL: {e}")
        return

    # 3. Generate Embeddings (Path A)
    print("   🧠 Generating Embeddings...")
    embed_service = EmbeddingService()
    
    count = 0
    for ad in ads:
        context_doc = ad['context_document']
        # Calculate hash
        doc_hash = hashlib.sha256(context_doc.encode()).hexdigest()
        
        # Check if we need to embed (optimization: check DB first)
        # For this script, we'll just do it (or you can implement the check)
        
        try:
            vector = await embed_service.generate_embedding(context_doc)
            
            metadata = {
                "price": ad['price'],
                "rooms": ad['rooms'],
                "city": ad['city']
            }
            
            await db.save_embedding(ad['id'], vector, doc_hash, metadata)
            count += 1
            if count % 10 == 0:
                print(f"      Processed {count} embeddings...")
                
        except Exception as e:
            print(f"      ❌ Error embedding ad {ad['id']}: {e}")

    print(f"   ✅ Generated {count} embeddings")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest Yad2 JSON data")
    parser.add_argument("file", help="Path to JSON file")
    parser.add_argument("--city", help="City name for metadata", default="Unknown")
    
    args = parser.parse_args()
    
    asyncio.run(process_file(Path(args.file), args.city))
