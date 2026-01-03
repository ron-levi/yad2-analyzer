import sys
import os
from typing import List, Optional
from langchain.tools import tool
from langchain_core.pydantic_v1 import BaseModel, Field

# Add parser to path
# sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../parser")))

# from src.database_manager import DatabaseManager
from data_parser.src.database_manager import DatabaseManager
from data_parser.src.embedding_service import EmbeddingService
from ..services.segment_manager import SegmentManager

# Initialize services
db = DatabaseManager()
embed_service = EmbeddingService()
segment_manager = SegmentManager(db)

class SearchInput(BaseModel):
    query: str = Field(description="The user's search query for real estate")
    min_price: Optional[int] = Field(None, description="Minimum price")
    max_price: Optional[int] = Field(None, description="Maximum price")
    min_rooms: Optional[float] = Field(None, description="Minimum rooms")
    max_rooms: Optional[float] = Field(None, description="Maximum rooms")
    city: Optional[str] = Field(None, description="City to filter by")

@tool("real_estate_search", args_schema=SearchInput)
async def real_estate_search(
    query: str, 
    min_price: Optional[int] = None, 
    max_price: Optional[int] = None,
    min_rooms: Optional[float] = None,
    max_rooms: Optional[float] = None,
    city: Optional[str] = None
):
    """
    Search for real estate ads using semantic search with optional filters.
    Use this when the user asks to find apartments, houses, or specific property features.
    """
    # Generate embedding
    vector = await embed_service.generate_embedding(query)
    
    # Prepare metadata filters
    filters = {}
    if min_price: filters['min_price'] = min_price
    if max_price: filters['max_price'] = max_price
    if min_rooms: filters['min_rooms'] = min_rooms
    if max_rooms: filters['max_rooms'] = max_rooms
    if city: filters['city'] = city

    # Search DB
    results = await db.search_vectors(vector, limit=5, filters=filters)
    
    # Format results
    response = "Found the following ads:\n"
    for ad in results:
        response += f"- {ad['title']} in {ad['city']} (Price: {ad['price']}, Rooms: {ad['rooms']})\n"
        
    return response

class SegmentInput(BaseModel):
    city: str = Field(description="City name to track")
    min_rooms: Optional[float] = Field(None, description="Minimum number of rooms")
    max_rooms: Optional[float] = Field(None, description="Maximum number of rooms")
    min_price: Optional[int] = Field(None, description="Minimum price")
    max_price: Optional[int] = Field(None, description="Maximum price")
    min_floor: Optional[int] = Field(None, description="Minimum floor")
    max_floor: Optional[int] = Field(None, description="Maximum floor")
    min_size: Optional[int] = Field(None, description="Minimum square meters")
    max_size: Optional[int] = Field(None, description="Maximum square meters")
    property_type: Optional[str] = Field(None, description="Type: apartment, garden, house, penthouse, duplex")
    condition: Optional[str] = Field(None, description="Condition: new, renovated, good, fix")
    parking: Optional[bool] = Field(None, description="Has parking")
    elevator: Optional[bool] = Field(None, description="Has elevator")
    balcony: Optional[bool] = Field(None, description="Has balcony")
    safe_room: Optional[bool] = Field(None, description="Has safe room (mamad)")

@tool("create_tracking_segment", args_schema=SegmentInput)
async def create_tracking_segment(city: str, **kwargs):
    """
    Start tracking a new real estate segment.
    Use this when the user wants to monitor or track specific criteria (e.g., "Let me know about new ads in Tel Aviv").
    """
    result = await segment_manager.create_segment(city, **kwargs)
    if "error" in result:
        return f"Error: {result['error']}"
    return f"Successfully started tracking: {result['message']}"

tools = [real_estate_search, create_tracking_segment]
