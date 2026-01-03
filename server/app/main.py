import sys
import os
from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from .api import routes
from .config import config

# Add parser to path (hack for now)
# sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../parser")))

app = FastAPI(title="Yad2 Analyzer API")

app.include_router(routes.router, prefix="/api/v1")

@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
