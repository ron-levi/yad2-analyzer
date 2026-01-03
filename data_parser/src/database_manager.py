from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.sql import func
from typing import List, Dict, Any
import os
import hashlib
from .models import Base, Ad, AdHistory, AdEmbedding, Segment
from .config import config

class DatabaseManager:
    def __init__(self, db_url: str = None):
        self.db_url = db_url or config.ASYNC_DATABASE_URL
        self.engine = create_async_engine(self.db_url)
        self.Session = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )

    async def create_tables(self):
        """Create tables if they don't exist (useful for dev/testing)"""
        async with self.engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.run_sync(Base.metadata.create_all)

    async def create_segment(self, search_url: str, name: str, category: str) -> str:
        """Create a new segment or return existing one"""
        async with self.Session() as session:
            try:
                # Check if exists
                stmt = select(Segment).where(Segment.search_url == search_url)
                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()
                
                if existing:
                    return str(existing.id)
                
                # Create new
                new_segment = Segment(search_url=search_url, name=name, category=category)
                session.add(new_segment)
                await session.commit()
                return str(new_segment.id)
            except Exception as e:
                await session.rollback()
                raise

    async def save_ads(self, ads_data: List[Dict[str, Any]], segment_id: str = None):
        """
        Upsert ads and insert history records.
        """
        async with self.Session() as session:
            try:
                for ad_data in ads_data:
                    await self._save_single_ad(session, ad_data, segment_id)
                await session.commit()
            except Exception as e:
                await session.rollback()
                print(f"Error saving ads batch: {e}")
                raise

    async def _save_single_ad(self, session: AsyncSession, ad_data: Dict[str, Any], segment_id: str):
        # 1. Upsert Ad
        stmt = insert(Ad).values(
            id=ad_data['id'],
            segment_id=segment_id,
            title=ad_data['title'],
            description=ad_data['description'],
            city=ad_data['city'],
            neighborhood=ad_data['neighborhood'],
            property_type=ad_data['property_type'],
            original_data=ad_data['original_data'],
            last_seen=func.now()
        ).on_conflict_do_update(
            index_elements=['id'],
            set_={
                'last_seen': func.now(),
                'title': ad_data['title'],
                'description': ad_data['description'],
                'original_data': ad_data['original_data']
            }
        )
        await session.execute(stmt)

        # 2. Insert History
        history = AdHistory(
            ad_id=ad_data['id'],
            price=ad_data['price'],
            rooms=ad_data['rooms'],
            square_meters=ad_data['square_meters'],
            floor=ad_data['floor'],
            attributes=ad_data['attributes']
        )
        session.add(history)

        # 3. Handle Embedding (Logic to be added later: check hash, generate if needed)
        # For now, we just prepare the placeholder or check if we need to queue it
        pass

    async def get_ads_without_embeddings(self, limit: int = 100):
        """Get ads that need embedding generation"""
        async with self.Session() as session:
            # Logic: Ads where context_hash doesn't match current content or no embedding exists
            # This is a simplified check
            subquery = select(AdEmbedding.ad_id)
            query = select(Ad).where(Ad.id.not_in(subquery)).limit(limit)
            result = await session.execute(query)
            return result.scalars().all()

    async def save_embedding(self, ad_id: str, vector: List[float], context_hash: str, metadata: Dict):
        async with self.Session() as session:
            try:
                stmt = insert(AdEmbedding).values(
                    ad_id=ad_id,
                    embedding=vector,
                    context_hash=context_hash,
                    metadata=metadata
                ).on_conflict_do_update(
                    index_elements=['ad_id'],
                    set_={
                        'embedding': vector,
                        'context_hash': context_hash,
                        'metadata': metadata,
                        'created_at': func.now()
                    }
                )
                await session.execute(stmt)
                await session.commit()
            except Exception as e:
                await session.rollback()
                raise

    async def search_vectors(self, embedding: List[float], limit: int = 5, filters: Dict = None) -> List[Dict]:
        """Search for similar ads using vector similarity with optional filters"""
        async with self.Session() as session:
            # Start building the query
            stmt = select(AdEmbedding, Ad).join(Ad)
            
            # Apply Filters
            if filters:
                # Filter by City (on Ad table)
                if city := filters.get('city'):
                    stmt = stmt.where(Ad.city == city)
                
                # Filter by Metadata (on AdEmbedding table)
                # Note: metadata_ is JSONB, so we cast to numeric for comparisons
                if min_price := filters.get('min_price'):
                    stmt = stmt.where(AdEmbedding.metadata_['price'].astext.cast(float) >= min_price)
                if max_price := filters.get('max_price'):
                    stmt = stmt.where(AdEmbedding.metadata_['price'].astext.cast(float) <= max_price)
                if min_rooms := filters.get('min_rooms'):
                    stmt = stmt.where(AdEmbedding.metadata_['rooms'].astext.cast(float) >= min_rooms)
                if max_rooms := filters.get('max_rooms'):
                    stmt = stmt.where(AdEmbedding.metadata_['rooms'].astext.cast(float) <= max_rooms)

            # Order by Similarity (Cosine Distance)
            stmt = stmt.order_by(AdEmbedding.embedding.cosine_distance(embedding)).limit(limit)
            
            result = await session.execute(stmt)
            matches = []
            for embedding_obj, ad_obj in result:
                matches.append({
                    "id": ad_obj.id,
                    "title": ad_obj.title,
                    "description": ad_obj.description,
                    "price": float(embedding_obj.metadata_.get('price', 0)) if embedding_obj.metadata_ else 0,
                    "city": ad_obj.city,
                    "rooms": float(embedding_obj.metadata_.get('rooms', 0)) if embedding_obj.metadata_ else 0,
                    "score": 0 
                })
            return matches
