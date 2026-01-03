const fs = require('fs');
const path = require('path');

const content = `/**
 * LocationResolver - Translates location names to Yad2 numeric codes
 * 
 * Yad2 uses a hierarchical location system:
 * - topArea (מחוז) - e.g., "מרכז" = 2
 * - area (אזור) - e.g., "השרון" = 4
 * - city (עיר) - e.g., "רעננה" = 7900
 * - neighborhood (שכונה) - e.g., 755
 * 
 * The autocomplete API is: https://gw.yad2.co.il/address-autocomplete/realestate/v2?text=...
 */

import fs from 'fs/promises';
import path from 'path';

export interface LocationData {
  topAreas: TopArea[];
  lastUpdated: string;
}

export interface TopArea {
  id: number;
  name: string;
  areas: Area[];
}

export interface Area {
  id: number;
  name: string;
  cities: City[];
}

export interface City {
  id: number | string;  // Can be string like "412P" for regional councils
  name: string;
  neighborhoods?: Neighborhood[];
}

export interface Neighborhood {
  id: number | string;
  name: string;
}

export interface LocationCodes {
  topArea?: number;
  area?: number;
  city?: number | string;
  neighborhood?: number | string;
  street?: string;
}

export interface LocationSearchResult {
  type: 'topArea' | 'area' | 'city' | 'neighborhood' | 'street';
  id: number | string;
  name: string;
  path: string; // Full path like "מרכז > השרון > רעננה"
  codes: LocationCodes;
}

/** API response structure from Yad2 autocomplete */
export interface AutocompleteResponse {
  hoods: Array<{
    fullTitleText: string;
    cityId: string;
    hoodId: string;
    areaId: string;
    topAreaId: string;
  }>;
  cities: Array<{
    fullTitleText: string;
    cityId: string;
    areaId: string;
    topAreaId: string;
  }>;
  areas: Array<{
    fullTitleText: string;
    areaId: string;
    topAreaId: string;
  }>;
  topAreas: Array<{
    fullTitleText: string;
    topAreaId: string;
  }>;
  streets: Array<{
    fullTitleText: string;
    streetId: string;
    cityId: string;
    areaId: string;
    topAreaId: string;
  }>;
}

export class LocationResolver {
  private data: LocationData | null = null;
  private cacheFile: string;
  private readonly YAD2_LOCATIONS_URL = 'https://www.yad2.co.il/api/locations';
  private readonly CACHE_TTL_DAYS = 30;

  constructor(cacheDir: string = './cache') {
    this.cacheFile = path.join(cacheDir, 'locations.json');
  }

  private async loadDefaultData(): Promise<LocationData> {
    try {
      const dataPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../data/locations.json');
      const content = await fs.readFile(dataPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to load default location data:', error);
      throw new Error('Could not load default location data');
    }
  }

  /**
   * Initialize the resolver - load from cache or fetch fresh data
   */
  async init(): Promise<void> {
    try {
      // Try loading from cache first
      const cached = await this.loadFromCache();
      if (cached && !this.isCacheExpired(cached.lastUpdated)) {
        this.data = cached;
        console.log('📍 Location data loaded from cache');
        return;
      }
    } catch {
      // Cache doesn't exist or is invalid
    }

    // If no valid cache, use default data
    console.log('📍 Loading default location data...');
    this.data = await this.loadDefaultData();
    await this.saveToCache();
  }

  /**
   * Search for locations by name (supports partial matching and Hebrew)
   */
  search(query: string): LocationSearchResult[] {
    if (!this.data) {
      throw new Error('LocationResolver not initialized. Call init() first.');
    }

    const results: LocationSearchResult[] = [];
    const normalizedQuery = this.normalizeText(query);

    for (const topArea of this.data.topAreas) {
      // Search in topArea
      if (this.matches(topArea.name, normalizedQuery)) {
        results.push({
          type: 'topArea',
          id: topArea.id,
          name: topArea.name,
          path: topArea.name,
          codes: { topArea: topArea.id },
        });
      }

      for (const area of topArea.areas) {
        // Search in area
        if (this.matches(area.name, normalizedQuery)) {
          results.push({
            type: 'area',
            id: area.id,
            name: area.name,
            path: \`\${topArea.name} > \${area.name}\`,
            codes: { topArea: topArea.id, area: area.id },
          });
        }

        for (const city of area.cities) {
          // Search in city
          if (this.matches(city.name, normalizedQuery)) {
            results.push({
              type: 'city',
              id: city.id,
              name: city.name,
              path: \`\${topArea.name} > \${area.name} > \${city.name}\`,
              codes: { topArea: topArea.id, area: area.id, city: city.id },
            });
          }

          // Search in neighborhoods
          if (city.neighborhoods) {
            for (const neighborhood of city.neighborhoods) {
              if (this.matches(neighborhood.name, normalizedQuery)) {
                results.push({
                  type: 'neighborhood',
                  id: neighborhood.id,
                  name: neighborhood.name,
                  path: \`\${topArea.name} > \${area.name} > \${city.name} > \${neighborhood.name}\`,
                  codes: {
                    topArea: topArea.id,
                    area: area.id,
                    city: city.id,
                    neighborhood: neighborhood.id,
                  },
                });
              }
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Get location codes by exact city name
   */
  getCityByName(cityName: string): LocationSearchResult | null {
    const results = this.search(cityName);
    return results.find(r => r.type === 'city' && this.normalizeText(r.name) === this.normalizeText(cityName)) || null;
  }

  /**
   * Build URL parameters from location codes
   */
  buildUrlParams(codes: LocationCodes): URLSearchParams {
    const params = new URLSearchParams();
    if (codes.topArea) params.set('topArea', codes.topArea.toString());
    if (codes.area) params.set('area', codes.area.toString());
    if (codes.city) params.set('city', codes.city.toString());
    if (codes.neighborhood) params.set('neighborhood', codes.neighborhood.toString());
    return params;
  }

  /**
   * Build a complete search URL with location
   */
  buildSearchUrl(
    baseUrl: string,
    locationQuery: string,
    additionalParams?: Record<string, string>
  ): string | null {
    const location = this.getCityByName(locationQuery);
    if (!location) {
      // Try partial match
      const results = this.search(locationQuery);
      if (results.length === 0) return null;
      // Use the first result
      const locationParams = this.buildUrlParams(results[0].codes);
      const url = new URL(baseUrl);
      locationParams.forEach((value, key) => url.searchParams.set(key, value));
      if (additionalParams) {
        Object.entries(additionalParams).forEach(([key, value]) => 
          url.searchParams.set(key, value)
        );
      }
      return url.toString();
    }

    const url = new URL(baseUrl);
    const locationParams = this.buildUrlParams(location.codes);
    locationParams.forEach((value, key) => url.searchParams.set(key, value));
    if (additionalParams) {
      Object.entries(additionalParams).forEach(([key, value]) => 
        url.searchParams.set(key, value)
      );
    }
    return url.toString();
  }

  /**
   * List all top areas
   */
  getTopAreas(): { id: number; name: string }[] {
    if (!this.data) {
      throw new Error('LocationResolver not initialized. Call init() first.');
    }
    return this.data.topAreas.map(ta => ({ id: ta.id, name: ta.name }));
  }

  /**
   * List areas within a top area
   */
  getAreas(topAreaId: number): { id: number; name: string }[] {
    if (!this.data) {
      throw new Error('LocationResolver not initialized. Call init() first.');
    }
    const topArea = this.data.topAreas.find(ta => ta.id === topAreaId);
    return topArea?.areas.map(a => ({ id: a.id, name: a.name })) || [];
  }

  /**
   * List cities within an area
   */
  getCities(topAreaId: number, areaId: number): { id: number | string; name: string }[] {
    if (!this.data) {
      throw new Error('LocationResolver not initialized. Call init() first.');
    }
    const topArea = this.data.topAreas.find(ta => ta.id === topAreaId);
    const area = topArea?.areas.find(a => a.id === areaId);
    return area?.cities.map(c => ({ id: c.id, name: c.name })) || [];
  }

  /**
   * Search locations using Yad2's autocomplete API (live search)
   * This provides the most accurate and up-to-date location data
   */
  async searchOnline(query: string): Promise<LocationSearchResult[]> {
    const url = \`https://gw.yad2.co.il/address-autocomplete/realestate/v2?text=\${encodeURIComponent(query)}\`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(\`Autocomplete API returned \${response.status}, falling back to cache\`);
        return this.search(query);
      }
      
      const data: AutocompleteResponse = await response.json();
      const results: LocationSearchResult[] = [];
      
      // Process top areas
      for (const ta of data.topAreas) {
        results.push({
          type: 'topArea',
          id: parseInt(ta.topAreaId, 10),
          name: ta.fullTitleText,
          path: ta.fullTitleText,
          codes: { topArea: parseInt(ta.topAreaId, 10) },
        });
      }
      
      // Process areas
      for (const area of data.areas) {
        results.push({
          type: 'area',
          id: parseInt(area.areaId, 10),
          name: area.fullTitleText,
          path: area.fullTitleText,
          codes: { 
            topArea: parseInt(area.topAreaId, 10),
            area: parseInt(area.areaId, 10),
          },
        });
      }
      
      // Process cities
      for (const city of data.cities) {
        const cityId = /^\d+$/.test(city.cityId) ? parseInt(city.cityId, 10) : city.cityId;
        results.push({
          type: 'city',
          id: cityId,
          name: city.fullTitleText,
          path: city.fullTitleText,
          codes: {
            topArea: parseInt(city.topAreaId, 10),
            area: parseInt(city.areaId, 10),
            city: cityId,
          },
        });
      }
      
      // Process neighborhoods
      for (const hood of data.hoods) {
        const cityId = /^\d+$/.test(hood.cityId) ? parseInt(hood.cityId, 10) : hood.cityId;
        const hoodId = /^\d+$/.test(hood.hoodId) ? parseInt(hood.hoodId, 10) : hood.hoodId;
        results.push({
          type: 'neighborhood',
          id: hoodId,
          name: hood.fullTitleText,
          path: hood.fullTitleText,
          codes: {
            topArea: parseInt(hood.topAreaId, 10),
            area: parseInt(hood.areaId, 10),
            city: cityId,
            neighborhood: hoodId,
          },
        });
      }
      
      // Process streets
      for (const street of data.streets) {
        const cityId = /^\d+$/.test(street.cityId) ? parseInt(street.cityId, 10) : street.cityId;
        results.push({
          type: 'street',
          id: street.streetId,
          name: street.fullTitleText,
          path: street.fullTitleText,
          codes: {
            topArea: parseInt(street.topAreaId, 10),
            area: parseInt(street.areaId, 10),
            city: cityId,
            street: street.streetId,
          },
        });
      }
      
      return results;
    } catch (error) {
      console.warn('Autocomplete API failed, falling back to cache:', error);
      return this.search(query);
    }
  }

  // ============ Private Methods ============

  private normalizeText(text: string): string {
    return text.trim().toLowerCase();
  }

  private matches(name: string, query: string): boolean {
    const normalizedName = this.normalizeText(name);
    return normalizedName.includes(query) || query.includes(normalizedName);
  }

  private async loadFromCache(): Promise<LocationData | null> {
    try {
      const content = await fs.readFile(this.cacheFile, 'utf-8');
      return JSON.parse(content) as LocationData;
    } catch {
      return null;
    }
  }

  private async saveToCache(): Promise<void> {
    if (!this.data) return;
    try {
      await fs.mkdir(path.dirname(this.cacheFile), { recursive: true });
      await fs.writeFile(this.cacheFile, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.warn('Failed to save location cache:', error);
    }
  }

  private isCacheExpired(lastUpdated: string): boolean {
    const cacheDate = new Date(lastUpdated);
    const now = new Date();
    const diffDays = (now.getTime() - cacheDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > this.CACHE_TTL_DAYS;
  }
}

export default LocationResolver;
`;

fs.writeFileSync(path.join(process.cwd(), 'src/services/LocationResolver.ts'), content);
console.log('File updated successfully');
