"""
Configuration loader for parser
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Parser configuration"""
    
    INPUT_DIR = Path(os.getenv('INPUT_DIR', '../scraper/output'))
    DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://localhost:5432/yad2_intelligence')
    ASYNC_DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://')
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

config = Config()
