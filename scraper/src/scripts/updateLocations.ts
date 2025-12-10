/**
 * Script to fetch and update location data from Yad2
 * 
 * Run with: npx ts-node src/scripts/updateLocations.ts
 * 
 * This script uses Playwright to navigate to Yad2, interact with the 
 * location dropdowns, and extract all location codes.
 */

import { chromium, Browser, Page } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TopArea {
  id: number;
  name: string;
  areas: Area[];
}

interface Area {
  id: number;
  name: string;
  cities: City[];
}

interface City {
  id: number;
  name: string;
  neighborhoods?: Neighborhood[];
}

interface Neighborhood {
  id: number;
  name: string;
}

interface LocationData {
  topAreas: TopArea[];
  lastUpdated: string;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchLocationsFromAPI(page: Page): Promise<LocationData | null> {
  try {
    // Yad2 loads location data via XHR when you interact with the search
    // We can intercept these requests or call them directly
    
    // Navigate to real estate search page
    await page.goto('https://www.yad2.co.il/realestate/forsale', {
      waitUntil: 'networkidle',
    });
    
    await delay(2000);
    
    // Try to extract location data from the page's JavaScript state
    const locationData = await page.evaluate(() => {
      // Yad2 stores data in window.__NEXT_DATA__ or similar
      const nextData = (window as any).__NEXT_DATA__;
      if (nextData?.props?.pageProps?.searchOptions?.topArea) {
        return nextData.props.pageProps.searchOptions;
      }
      
      // Alternative: check for other global variables
      const yad2Data = (window as any).yad2Data || (window as any).__YAD2_DATA__;
      if (yad2Data?.locations) {
        return yad2Data.locations;
      }
      
      return null;
    });
    
    if (locationData) {
      console.log('Found location data in page state');
      return processLocationData(locationData);
    }
    
    // If not found in state, try interacting with the UI
    return await extractLocationsFromUI(page);
    
  } catch (error) {
    console.error('Error fetching locations:', error);
    return null;
  }
}

async function extractLocationsFromUI(page: Page): Promise<LocationData | null> {
  console.log('Extracting locations from UI...');
  
  const topAreas: TopArea[] = [];
  
  try {
    // Click on the area/location filter to open the dropdown
    const areaButton = await page.$('[data-testid="area-filter"], .area-filter, [class*="area"]');
    if (areaButton) {
      await areaButton.click();
      await delay(1000);
    }
    
    // Extract the dropdown options
    // The exact selectors depend on Yad2's current HTML structure
    const options = await page.$$eval('[class*="option"], [class*="item"]', elements => {
      return elements.map(el => ({
        text: el.textContent?.trim() || '',
        value: el.getAttribute('data-value') || el.getAttribute('value') || '',
      }));
    });
    
    console.log('Found options:', options.slice(0, 10));
    
    // This is a simplified extraction - in reality you'd need to:
    // 1. Navigate through each topArea
    // 2. Then each area within it
    // 3. Then extract cities
    // 4. Optionally neighborhoods
    
  } catch (error) {
    console.error('Error extracting from UI:', error);
  }
  
  return null;
}

function processLocationData(rawData: any): LocationData {
  // Process the raw data from Yad2 into our format
  // This depends on the actual structure returned by Yad2
  const topAreas: TopArea[] = [];
  
  if (Array.isArray(rawData.topArea)) {
    for (const ta of rawData.topArea) {
      const topArea: TopArea = {
        id: parseInt(ta.id || ta.value, 10),
        name: ta.name || ta.label || ta.text,
        areas: [],
      };
      
      if (Array.isArray(ta.areas || ta.children)) {
        for (const a of (ta.areas || ta.children)) {
          const area: Area = {
            id: parseInt(a.id || a.value, 10),
            name: a.name || a.label || a.text,
            cities: [],
          };
          
          if (Array.isArray(a.cities || a.children)) {
            for (const c of (a.cities || a.children)) {
              area.cities.push({
                id: parseInt(c.id || c.value, 10),
                name: c.name || c.label || c.text,
              });
            }
          }
          
          topArea.areas.push(area);
        }
      }
      
      topAreas.push(topArea);
    }
  }
  
  return {
    topAreas,
    lastUpdated: new Date().toISOString(),
  };
}

async function main() {
  console.log('🔍 Fetching Yad2 location data...\n');
  
  const browser: Browser = await chromium.launch({
    headless: true,
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'he-IL',
  });
  
  const page = await context.newPage();
  
  try {
    const locationData = await fetchLocationsFromAPI(page);
    
    if (locationData && locationData.topAreas.length > 0) {
      // Save to cache file
      const cacheDir = path.join(__dirname, '../../cache');
      await fs.mkdir(cacheDir, { recursive: true });
      
      const cachePath = path.join(cacheDir, 'locations.json');
      await fs.writeFile(cachePath, JSON.stringify(locationData, null, 2), 'utf-8');
      
      console.log(`\n✅ Saved ${locationData.topAreas.length} top areas to ${cachePath}`);
    } else {
      console.log('\n⚠️  Could not extract location data automatically.');
      console.log('Using embedded location data instead.');
      console.log('\nTo add more locations, edit the getEmbeddedLocationData() method in LocationResolver.ts');
    }
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
