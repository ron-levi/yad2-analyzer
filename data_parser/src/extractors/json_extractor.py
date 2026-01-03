import json
from typing import List, Dict, Any, Optional
from pathlib import Path

class JSONExtractor:
    def __init__(self, file_path: Path, metadata: Dict[str, Any] = None):
        self.file_path = file_path
        self.metadata = metadata or {}

    def extract(self) -> List[Dict[str, Any]]:
        """
        Parse the JSON file and return a list of structured ad dictionaries.
        """
        if not self.file_path.exists():
            print(f"File not found: {self.file_path}")
            return []

        with open(self.file_path, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError as e:
                print(f"Error decoding JSON {self.file_path}: {e}")
                return []
        
        items = data.get('items', [])
        extracted_ads = []
        
        for item in items:
            ad_data = self._process_item(item)
            if ad_data:
                extracted_ads.append(ad_data)
                
        return extracted_ads

    def _process_item(self, item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            # Basic Info
            ad_id = str(item.get('adNumber'))
            if not ad_id:
                return None
                
            # Additional Details
            details = item.get('additionalDetails', {})
            
            # Extract text fields
            search_text = item.get('searchText', '').strip()
            property_type = details.get('property', {}).get('text', '')
            condition = details.get('propertyCondition', {}).get('text', '')
            
            # Construct Context Document for Embedding
            # This document represents the semantic meaning of the ad
            context_parts = [
                f"Type: {property_type}",
                f"Condition: {condition}",
                f"Description: {search_text}"
            ]
            
            # Add amenities
            in_property = item.get('inProperty', {})
            amenities = [k.replace('include', '') for k, v in in_property.items() if v]
            if amenities:
                context_parts.append(f"Amenities: {', '.join(amenities)}")
            
            # Add location context if available in metadata
            if self.metadata.get('city'):
                context_parts.insert(0, f"City: {self.metadata['city']}")
                
            context_doc = "\n".join(context_parts)
            
            # Map to our internal schema
            return {
                "id": ad_id,
                "status": "active",
                "title": search_text[:100] + "..." if len(search_text) > 100 else search_text,
                "description": search_text,
                "property_type": property_type,
                "city": self.metadata.get('city'),
                "neighborhood": self.metadata.get('neighborhood'), # Might be None
                "original_data": item,
                "context_document": context_doc,
                
                # Analytical Data
                "price": item.get('price'),
                "rooms": details.get('roomsCount'),
                "square_meters": details.get('squareMeter'),
                "floor": details.get('floor') or details.get('buildingTopFloor'),
                "attributes": details
            }
            
        except Exception as e:
            print(f"Error processing item {item.get('adNumber', 'unknown')}: {e}")
            return None
