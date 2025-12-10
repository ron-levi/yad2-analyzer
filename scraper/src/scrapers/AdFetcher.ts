/** AdFetcher: Fetches individual ad pages via Network Interception (preferred) or DOM */
import { Response } from 'playwright';
import { BaseScraper } from './BaseScraper.js';
import { BrowserPool } from './BrowserPool.js';
import { FetchResult, AdMetadata, AdCategory, ScraperConfig, ProxyConfig, SearchParams } from '../types.js';
import { StorageService } from '../services/StorageService.js';

export class AdFetcher extends BaseScraper {
  private storage: StorageService;
  private searchParams?: SearchParams;
  private category: AdCategory;

  constructor(config: ScraperConfig, pool?: BrowserPool, searchParams?: SearchParams) {
    super(config, pool);
    this.storage = new StorageService(config.outputDir);
    this.searchParams = searchParams;
    this.category = this.detectCategoryFromParams(searchParams);
  }

  private detectCategoryFromParams(searchParams?: SearchParams): AdCategory {
    // Check if search params contain real estate indicators
    if (searchParams?.property || searchParams?.topArea || searchParams?.rooms) {
      return 'real_estate';
    }
    // Default to vehicles
    return 'vehicles';
  }

  async fetch(adId: string, skipIfExists = true): Promise<FetchResult> {
    const page = this.getPage();

    try {
      // Skip if already scraped
      if (skipIfExists) {
        const exists = await this.storage.isScrapedToday(adId, 'vehicles') || 
                       await this.storage.isScrapedToday(adId, 'real_estate');
        if (exists) return { adId, success: true, skipped: true };
      }

      let capturedData: any = null;
      let responseCount = 0;
      let recommendationRequestSeen = false;

      // Network Handler: Capture recommendations data (40 similar vehicles)
      const networkHandler = async (response: Response) => {
        try {
          const url = response.url();
          responseCount++;
          
          // Log ALL yad2 API requests to see what's happening
          if (url.includes('gw.yad2.co.il')) {
            console.log(`   🌐 API Response #${responseCount}: ${url.substring(0, 100)}...`);
          }
          
          if ((url.includes('recommendations/items/vehicles')
          || url.includes('recommendations/items/realestate')) &&
              url.includes(`itemId=${adId}`)) {
            recommendationRequestSeen = true;
            console.log(`   ✅ Recommendations API found! Status: ${response.status()}`);
            
            if (response.status() === 200) {
              const rawData = await response.json().catch(() => null);
              if (rawData?.data && Array.isArray(rawData.data)) {
                // Flatten the two batches into single array
                capturedData = {
                  sourceAdId: adId,
                  items: rawData.data.flat(),
                  totalItems: rawData.data.flat().length,
                  scrapedAt: new Date().toISOString()
                };
                console.log(`   📦 Captured ${capturedData.totalItems} recommendations`);
              }
            }
          }
        } catch {}
      };

      console.log(`   🎯 Registering network handler for ${adId}...`);
      this.onResponse('gw.yad2.co.il', networkHandler);

      // Construct URL based on detected category
      const categoryPath = this.category === 'real_estate' ? 'realestate' : 'vehicles';
      const url = `https://www.yad2.co.il/${categoryPath}/item/${adId}`;
      
      // Try up to 2 times if network interception fails
      let retryAttempt = 0;
      while (!capturedData && retryAttempt < 2) {
        if (retryAttempt > 0) {
          console.log(`   🔄 Retry ${retryAttempt} for ${adId} (API didn't respond)`);
          await this.delay(3); // Longer delay before retry
        }
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait for API response with polling (up to 6 seconds)
        let pollAttempts = 0;
        while (!capturedData && pollAttempts < 12) {
          await this.delay(0.5);
          pollAttempts++;
        }
        
        retryAttempt++;
      }
      
      this.offResponse('gw.yad2.co.il');

      console.log(`   📊 Debug: ${responseCount} total API responses, recommendationRequestSeen=${recommendationRequestSeen}`);

      const metadata: AdMetadata = {
        adId,
        category: this.category,
        url: page.url(),
        scrapedAt: new Date(),
      };

      let filePath: string;
      if (capturedData && capturedData.items) {
        // Preferred: Save recommendations data (40 similar vehicles)
        filePath = await this.storage.saveRecommendations(capturedData, metadata, this.searchParams);
      } else {
        // Fallback: Save HTML if network interception failed
        if (!recommendationRequestSeen) {
          console.log(`   ⚠️  No recommendations API request made for ${adId} - Yad2 blocked it! Saving HTML fallback`);
        } else {
          console.log(`   ⚠️  Recommendations API called but returned no data for ${adId} - saving HTML fallback`);
        }
        await page.waitForSelector('.main_details, .item-details, [class*="details"]', { timeout: 5000 }).catch(() => {});
        const html = await page.content();
        filePath = await this.storage.saveHtml(html, metadata);
      }

      return { adId, success: true, filePath };
    } catch (error) {
      return { adId, success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async fetchMany(adIds: string[], skipIfExists = true): Promise<FetchResult[]> {
    const results: FetchResult[] = [];
    for (let i = 0; i < adIds.length; i++) {
      results.push(await this.fetch(adIds[i], skipIfExists));
      if (i < adIds.length - 1) await this.delay();
    }
    return results;
  }

  async cleanup(category?: AdCategory): Promise<{ removed: number }> {
    return await this.storage.cleanupTemporaryFiles(category ?? this.category, undefined, this.searchParams);
  }

  static async fetchManyConcurrent(
    adIds: string[],
    config: ScraperConfig,
    pool: BrowserPool,
    skipIfExists = true,
    proxies?: ProxyConfig[],
    searchParams?: SearchParams
  ): Promise<FetchResult[]> {
    const concurrency = config.concurrency ?? 3;
    const results: FetchResult[] = [];
    const queue = [...adIds];

    const worker = async (id: number) => {
      const proxy = proxies?.[id % proxies.length];
      while (queue.length > 0) {
        const adId = queue.shift();
        if (!adId) break;
        const fetcher = new AdFetcher(config, pool, searchParams);
        try {
          await fetcher.initialize(proxy);
          results.push(await fetcher.fetch(adId, skipIfExists));
        } catch (e) {
          results.push({ adId, success: false, error: e instanceof Error ? e.message : String(e) });
        } finally {
          await fetcher.close();
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
    return results;
  }

  private async detectCategory(): Promise<AdCategory> {
    const url = this.getPage().url();
    if (url.includes('/vehicles/') || url.includes('/car')) return 'vehicles';
    return 'real_estate';
  }
}
