import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Server configuration"""
    
    DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://localhost:5432/yad2_intelligence')
    ASYNC_DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://')
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    
    # Path to scraper locations file
    # Resolve relative to this file: server/app/config.py -> ../../scraper
    _base_dir = Path(__file__).parent.parent.parent
    LOCATIONS_FILE = Path(os.getenv('LOCATIONS_FILE', _base_dir / 'scraper/src/data/locations.json'))
    SCRAPER_DIR = Path(os.getenv('SCRAPER_DIR', _base_dir / 'scraper'))
    
    # Scraper trigger command
    SCRAPER_CMD = "npm run scrape"

config = Config()
