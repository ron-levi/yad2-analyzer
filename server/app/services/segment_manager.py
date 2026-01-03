import json
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any
from ..config import config
from .scraper_service import ScraperService

class LocationResolver:
    def __init__(self):
        self.locations_file = config.LOCATIONS_FILE
        self.city_map = self._load_locations()

    def _load_locations(self) -> Dict[str, int]:
        """Load locations.json and build a Name -> ID map"""
        if not self.locations_file.exists():
            print(f"⚠️ Locations file not found at {self.locations_file}")
            return {}
            
        with open(self.locations_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        mapping = {}
        for top_area in data.get('topAreas', []):
            for area in top_area.get('areas', []):
                for city in area.get('cities', []):
                    # Normalize: strip whitespace
                    name = city['name'].strip()
                    mapping[name] = city['id']
        return mapping

    def resolve_city(self, city_name: str) -> Optional[int]:
        """Find ID for a city name (exact match for now)"""
        return self.city_map.get(city_name.strip())

class SegmentManager:
    def __init__(self, db_manager):
        self.db = db_manager
        self.resolver = LocationResolver()
        self.scraper = ScraperService()

    async def create_segment(self, city: str, **kwargs) -> Dict[str, Any]:
        """
        Create a new tracking segment with flexible parameters.
        """
        city_id = self.resolver.resolve_city(city)
        if not city_id:
            return {"error": f"City '{city}' not found in database."}

        # Base params
        params = {
            "city": city_id,
            "multiCity": city_id  # Example used multiCity, adding both for safety
        }

        # Range Mappings
        # (kwarg_key, url_key)
        ranges = [
            ('min_rooms', 'minRooms'), ('max_rooms', 'maxRooms'),
            ('min_price', 'minPrice'), ('max_price', 'maxPrice'),
            ('min_floor', 'minFloor'), ('max_floor', 'maxFloor'),
            ('min_size', 'minSquaremeter'), ('max_size', 'maxSquaremeter')
        ]

        for k_key, u_key in ranges:
            if val := kwargs.get(k_key):
                params[u_key] = val

        # Boolean Mappings (Amenities)
        # (kwarg_key, url_key)
        bools = [
            ('parking', 'parking'),
            ('elevator', 'elevator'),
            ('balcony', 'balcony'),
            ('safe_room', 'mamad') # Assuming 'mamad' is the key, or 'shelter'
        ]
        
        for k_key, u_key in bools:
            if kwargs.get(k_key):
                params[u_key] = 1

        # Property Type Mapping
        # 1=Apartment, 2=Garden, 3=House, 6=Penthouse, 7=Duplex
        type_map = {
            "apartment": 1,
            "garden": 2,
            "house": 3,
            "villa": 3,
            "penthouse": 6,
            "duplex": 7,
            "studio": 10
        }
        if prop_type := kwargs.get('property_type'):
            if type_id := type_map.get(prop_type.lower()):
                params['property'] = type_id

        # Condition Mapping
        # 1=New(Dev), 6=New, 2=Renovated, 3=Good, 4=Fix
        cond_map = {
            "new": 6,
            "brand_new": 1,
            "renovated": 2,
            "good": 3,
            "fix": 4
        }
        if cond := kwargs.get('condition'):
            if cond_id := cond_map.get(cond.lower()):
                params['propertyCondition'] = cond_id

        # Build Query String
        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        url = f"https://www.yad2.co.il/realestate/forsale?{query_string}"
        
        # Generate readable name
        name_parts = [city]
        if kwargs.get('min_rooms'): name_parts.append(f"{kwargs['min_rooms']}+ rms")
        if kwargs.get('max_price'): name_parts.append(f"<{kwargs['max_price']/1000000}M")
        if kwargs.get('property_type'): name_parts.append(kwargs['property_type'])
        
        name = ", ".join(name_parts)

        try:
            segment_id = await self.db.create_segment(url, name, "real_estate")
            
            # Trigger scraper in background
            asyncio.create_task(self.scraper.trigger_scrape(url, name))
            
            return {
                "success": True,
                "segment_id": segment_id,
                "name": name,
                "url": url,
                "message": f"Started tracking: {name}"
            }
        except Exception as e:
            return {"error": f"Failed to create segment: {str(e)}"}
