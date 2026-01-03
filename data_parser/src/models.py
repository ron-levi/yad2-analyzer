from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text, Numeric, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
import uuid

Base = declarative_base()

class Segment(Base):
    __tablename__ = 'segments'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    search_url = Column(Text, unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    ads = relationship("Ad", back_populates="segment")

class Ad(Base):
    __tablename__ = 'ads'

    id = Column(String(50), primary_key=True)  # Yad2 Item ID (adNumber)
    segment_id = Column(UUID(as_uuid=True), ForeignKey('segments.id', ondelete='SET NULL'))
    first_seen = Column(DateTime(timezone=True), server_default=func.now())
    last_seen = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(20), default='active')  # active, sold, removed
    
    # Static/Slow-changing attributes
    title = Column(Text)
    description = Column(Text)  # searchText
    city = Column(String(100))
    neighborhood = Column(String(100))
    street = Column(String(100))
    property_type = Column(String(50))
    
    # Metadata
    original_data = Column(JSONB)  # Store raw JSON just in case

    segment = relationship("Segment", back_populates="ads")
    history = relationship("AdHistory", back_populates="ad", cascade="all, delete-orphan")
    embedding = relationship("AdEmbedding", back_populates="ad", uselist=False, cascade="all, delete-orphan")

class AdHistory(Base):
    __tablename__ = 'ad_history'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ad_id = Column(String(50), ForeignKey('ads.id', ondelete='CASCADE'), nullable=False)
    scraped_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Analytical Columns
    price = Column(Numeric(12, 2))
    rooms = Column(Numeric(4, 1))
    square_meters = Column(Integer)
    floor = Column(Integer)
    
    # Additional attributes stored as JSONB
    attributes = Column(JSONB)

    ad = relationship("Ad", back_populates="history")

class AdEmbedding(Base):
    __tablename__ = 'ad_embeddings'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ad_id = Column(String(50), ForeignKey('ads.id', ondelete='CASCADE'), nullable=False)
    
    # Vector data (1536 dimensions for text-embedding-3-small)
    embedding = Column(Vector(1536))
    
    # Hash to detect changes in content and avoid re-embedding
    context_hash = Column(String(64))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Metadata for filtering during vector search
    metadata_ = Column("metadata", JSONB)

    ad = relationship("Ad", back_populates="embedding")
