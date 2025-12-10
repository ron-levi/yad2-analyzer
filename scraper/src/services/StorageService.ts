/** Storage service for scraped data */
import fs from 'fs/promises';
import path from 'path';
import { AdMetadata, AdCategory, RecommendationsData, VehicleItem, SearchParams } from '../types.js';

export class StorageService {
  constructor(private outputDir: string) {}

  private getDate = () => new Date().toISOString().split('T')[0];

  private generateDeduplicatedFileName(searchParams?: SearchParams): string {
    const date = this.getDate();
    
    if (!searchParams || Object.keys(searchParams).length === 0) {
      return `_deduplicated_${date}.json`;
    }

    const parts = Object.entries(searchParams)
      .map(([key, value]) => `${key}-${value}`)
      .join('_');

    return `_deduplicated_${parts}_${date}.json`;
  }

  getPath(adId: string, category: AdCategory, ext = 'html'): string {
    return path.join(this.outputDir, category, this.getDate(), `${adId}.${ext}`);
  }

  async saveHtml(html: string, meta: AdMetadata): Promise<string> {
    const filePath = this.getPath(meta.adId, meta.category);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, html, 'utf-8');
    await fs.writeFile(filePath.replace('.html', '.meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
    return filePath;
  }

  async saveJson(data: any, meta: AdMetadata): Promise<string> {
    const filePath = this.getPath(meta.adId, meta.category, 'json');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.writeFile(filePath.replace('.json', '.meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
    return filePath;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private matchesSearchParams(item: VehicleItem, searchParams?: SearchParams): boolean {
    if (!searchParams || Object.keys(searchParams).length === 0) return true;

    // Define filter rules: paramName -> { path, operator, parseAs }
    const filterRules: Record<string, { path: string; operator: 'max' | 'min' | 'eq'; parseAs: 'int' | 'float' | 'string' }> = {
      maxPrice: { path: 'price', operator: 'max', parseAs: 'int' },
      minPrice: { path: 'price', operator: 'min', parseAs: 'int' },
      minRooms: { path: 'additionalDetails.roomsCount', operator: 'min', parseAs: 'float' },
      maxRooms: { path: 'additionalDetails.roomsCount', operator: 'max', parseAs: 'float' },
      property: { path: 'additionalDetails.property.id', operator: 'eq', parseAs: 'int' },
      topArea: { path: 'address.topArea.id', operator: 'eq', parseAs: 'int' },
      area: { path: 'address.area.id', operator: 'eq', parseAs: 'int' },
      city: { path: 'address.city.id', operator: 'eq', parseAs: 'int' },
      neighborhood: { path: 'address.neighborhood.id', operator: 'eq', parseAs: 'int' },
      minSquareMeter: { path: 'additionalDetails.squareMeter', operator: 'min', parseAs: 'int' },
      maxSquareMeter: { path: 'additionalDetails.squareMeter', operator: 'max', parseAs: 'int' },
      minFloor: { path: 'address.house.floor', operator: 'min', parseAs: 'int' },
      maxFloor: { path: 'address.house.floor', operator: 'max', parseAs: 'int' },
    };

    // Apply all applicable filters
    for (const [paramKey, paramValue] of Object.entries(searchParams)) {
      const rule = filterRules[paramKey];
      if (!rule || !paramValue) continue; // Skip unknown params or undefined values

      const itemValue = this.getNestedValue(item, rule.path);
      if (itemValue === undefined || itemValue === null) {
        // If item doesn't have this property and filter is active, exclude it
        if (rule.operator === 'min' || rule.operator === 'max') return false;
        continue;
      }

      // Parse filter value
      let filterValue: number | string;
      if (rule.parseAs === 'int') filterValue = parseInt(paramValue);
      else if (rule.parseAs === 'float') filterValue = parseFloat(paramValue);
      else filterValue = paramValue;

      // Apply comparison
      if (rule.operator === 'max' && itemValue > filterValue) return false;
      if (rule.operator === 'min' && itemValue < filterValue) return false;
      if (rule.operator === 'eq' && itemValue !== filterValue) return false;
    }

    return true;
  }

  async saveRecommendations(data: RecommendationsData, meta: AdMetadata, searchParams?: SearchParams): Promise<string> {
    const filePath = this.getPath(meta.adId, meta.category, 'recommendations.json');
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Generate deduplicated filename from search params
    const dedupeFileName = this.generateDeduplicatedFileName(searchParams);
    const dedupeFilePath = path.join(
      this.outputDir, 
      meta.category, 
      this.getDate(), 
      dedupeFileName
    );

    let existingItems: VehicleItem[] = [];
    try {
      const existing = await fs.readFile(dedupeFilePath, 'utf-8');
      existingItems = JSON.parse(existing).items || [];
    } catch {
      // File doesn't exist yet, will be created
    }

    // Filter items based on search parameters
    const filteredItems = data.items.filter(item => this.matchesSearchParams(item, searchParams));

    // Merge and deduplicate by token
    const tokenMap = new Map<string, VehicleItem>();
    [...existingItems, ...filteredItems].forEach(item => {
      if (item.token) tokenMap.set(item.token, item);
    });

    const deduplicatedData = {
      totalUniqueItems: tokenMap.size,
      items: Array.from(tokenMap.values()),
      lastUpdated: new Date().toISOString(),
      sources: [data.sourceAdId] // Track which ads were used for recommendations
    };

    // Save individual recommendations file (unfiltered)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    
    // Save/update deduplicated master file (filtered)
    await fs.writeFile(dedupeFilePath, JSON.stringify(deduplicatedData, null, 2), 'utf-8');
    
    // Save metadata
    await fs.writeFile(filePath.replace('.recommendations.json', '.meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
    
    return filePath;
  }

  async isScrapedToday(adId: string, category: AdCategory): Promise<boolean> {
    try {
      // Check for HTML, JSON, or recommendations
      const htmlPath = this.getPath(adId, category, 'html');
      const jsonPath = this.getPath(adId, category, 'json');
      const recPath = this.getPath(adId, category, 'recommendations.json');
      
      try { await fs.access(htmlPath); return true; } catch {}
      try { await fs.access(jsonPath); return true; } catch {}
      try { await fs.access(recPath); return true; } catch {}
      
      return false;
    } catch {
      return false;
    }
  }

  async loadHtml(adId: string, category: AdCategory): Promise<string | null> {
    try {
      return await fs.readFile(this.getPath(adId, category), 'utf-8');
    } catch {
      return null;
    }
  }

  async listScrapedAds(category: AdCategory, date?: string): Promise<string[]> {
    try {
      const files = await fs.readdir(path.join(this.outputDir, category, date ?? this.getDate()));
      return files.filter(f => f.endsWith('.html')).map(f => f.replace('.html', ''));
    } catch {
      return [];
    }
  }

  async getStats(category: AdCategory, date?: string) {
    try {
      const files = await fs.readdir(path.join(this.outputDir, category, date ?? this.getDate()));
      return { total: files.filter(f => f.endsWith('.html')).length };
    } catch {
      return { total: 0 };
    }
  }

  async loadDeduplicated(category: AdCategory, date?: string, searchParams?: SearchParams): Promise<VehicleItem[]> {
    try {
      const dedupeFileName = this.generateDeduplicatedFileName(searchParams);
      const dedupeFilePath = path.join(
        this.outputDir, 
        category, 
        date ?? this.getDate(), 
        dedupeFileName
      );
      const data = await fs.readFile(dedupeFilePath, 'utf-8');
      const parsed = JSON.parse(data);
      return parsed.items || [];
    } catch {
      return [];
    }
  }

  async cleanupTemporaryFiles(category: AdCategory, date?: string, searchParams?: SearchParams): Promise<{ removed: number }> {
    const dirPath = path.join(this.outputDir, category, date ?? this.getDate());
    let removed = 0;

    try {
      const files = await fs.readdir(dirPath);
      const dedupeFileName = this.generateDeduplicatedFileName(searchParams);
      
      // Remove all .recommendations.json and .meta.json files
      // Also remove .html files where .recommendations.json exists (HTML is fallback only)
      for (const file of files) {
        if ((file.endsWith('.recommendations.json') || file.endsWith('.meta.json')) && 
            file !== dedupeFileName) {
          await fs.unlink(path.join(dirPath, file));
          removed++;
        }
        
        // Remove HTML fallback files if recommendations exist
        if (file.endsWith('.html')) {
          const adId = file.replace('.html', '');
          const recPath = path.join(dirPath, `${adId}.recommendations.json`);
          try {
            await fs.access(recPath);
            // Recommendations file exists, remove HTML fallback
            await fs.unlink(path.join(dirPath, file));
            removed++;
          } catch {
            // Recommendations don't exist, keep HTML
          }
        }
      }
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }

    return { removed };
  }
}
