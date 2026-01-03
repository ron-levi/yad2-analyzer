import os
from typing import List
from langchain_openai import OpenAIEmbeddings
from .config import config

class EmbeddingService:
    def __init__(self):
        self.embeddings = OpenAIEmbeddings(
            model="text-embedding-3-small",
            openai_api_key=os.getenv("OPENAI_API_KEY")
        )

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        # Clean text/add prefix if needed
        text = f"Hebrew Real Estate: {text}"
        return await self.embeddings.aembed_query(text)

    async def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a batch of texts"""
        prefixed_texts = [f"Hebrew Real Estate: {t}" for t in texts]
        return await self.embeddings.aembed_documents(prefixed_texts)
