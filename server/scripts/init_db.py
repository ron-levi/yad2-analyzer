import asyncio
import sys
import os

# Add root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from data_parser.src.database_manager import DatabaseManager

async def main():
    print("Creating tables...")
    try:
        db = DatabaseManager()
        await db.create_tables()
        print("✅ Tables created successfully.")
    except Exception as e:
        print(f"❌ Error creating tables: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
