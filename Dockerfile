FROM mcr.microsoft.com/playwright:v1.57.0-jammy

# Install Python and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3 /usr/bin/python

# Set working directory
WORKDIR /app

# Copy requirements first to leverage cache
COPY data_parser/requirements.txt data_parser/requirements.txt
COPY server/requirements.txt server/requirements.txt

# Install Python dependencies
RUN pip3 install --no-cache-dir -r data_parser/requirements.txt
RUN pip3 install --no-cache-dir -r server/requirements.txt

# Copy Scraper package.json
COPY scraper/package.json scraper/package.json
COPY scraper/tsconfig.json scraper/tsconfig.json

# Install Node dependencies
WORKDIR /app/scraper
RUN npm install

# Copy the rest of the application
WORKDIR /app
COPY . .

# Set environment variables
ENV PYTHONPATH=/app
ENV SCRAPER_DIR=/app/scraper
ENV LOCATIONS_FILE=/app/scraper/src/data/locations.json
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 8000

# Default command
CMD ["uvicorn", "server.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
