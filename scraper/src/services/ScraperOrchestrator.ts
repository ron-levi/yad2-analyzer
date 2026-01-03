/** Orchestrates the scraping workflow */
import { AdLister, AdFetcher, BrowserPool } from '../scrapers/index.js';
import { StorageService } from './StorageService.js';
import { ScraperConfig, ScrapingReport, RunOptions, ProxyConfig, FetchResult, ListingResult, SearchParams, AdCategory } from '../types.js';

export class ScraperOrchestrator {
  private pool: BrowserPool | null = null;
  private storage: StorageService;

  constructor(private config: ScraperConfig) {
    this.storage = new StorageService(config.outputDir);
  }

  private extractSearchParams(url: string): SearchParams {
    const params: SearchParams = {};
    try {
      const urlObj = new URL(url);
      urlObj.searchParams.forEach((value, key) => {
        params[key] = value;
      });
    } catch {}
    return params;
  }

  private detectCategory(searchParams: SearchParams): AdCategory {
    if (searchParams.property || searchParams.topArea || searchParams.rooms || searchParams.city || searchParams.multiCity) {
      return 'real_estate';
    }
    return 'vehicles';
  }

  async run(options: RunOptions): Promise<ScrapingReport> {
    const startedAt = new Date();
    const concurrency = options.concurrency ?? this.config.concurrency ?? 1;
    const useConcurrent = concurrency > 1;
    const searchParams = this.extractSearchParams(options.searchUrl);
    const category = this.detectCategory(searchParams);

    console.log(`\n🚀 Starting scrape: ${options.searchUrl}`);
    console.log(`   Pages: ${options.maxPages ?? this.config.maxPagesPerRun}, Concurrency: ${concurrency}\n`);

    try {
      if (useConcurrent) {
        this.pool = new BrowserPool(this.config);
        await this.pool.initialize();
      }

      // List ads
      const listing = await this.listAds(options);
      console.log(`\n✅ Found ${listing.adIds.length} ads (${listing.scrapedPages}/${listing.totalPages} pages)\n`);

      // Fetch ads
      const results = useConcurrent && this.pool
        ? await AdFetcher.fetchManyConcurrent(listing.adIds, this.config, this.pool, options.skipExisting ?? true, undefined, searchParams)
        : await this.fetchSequential(listing.adIds, options.skipExisting ?? true, searchParams);

      const successful = results.filter(r => r.success && !r.skipped).length;
      const skipped = results.filter(r => r.skipped).length;
      const failed = results.filter(r => !r.success).length;
      
      // Log errors for failed fetches
      const failedResults = results.filter(r => !r.success);
      if (failedResults.length > 0) {
        console.log('\n❌ Failed ads:');
        failedResults.forEach(r => console.log(`   ${r.adId}: ${r.error || 'Unknown error'}`));
      }

      // Cleanup temporary files (keep only deduplicated file)
      console.log('\n🧹 Cleaning up temporary files...');
      const fetcher = new AdFetcher(this.config, undefined, searchParams);
      const cleanup = await fetcher.cleanup(); // Will use category detected from searchParams
      console.log(`   Removed ${cleanup.removed} temporary files\n`);
      
      const duration = (Date.now() - startedAt.getTime()) / 1000;
      
      // Get output file path
      const outputFile = this.storage.getDeduplicatedFilePath(category, searchParams);

      console.log(`\n✅ Done: ${successful} fetched, ${skipped} skipped, ${failed} failed (${duration.toFixed(1)}s)\n`);

      return {
        searchUrl: options.searchUrl,
        totalAdsFound: listing.adIds.length,
        adsFetched: successful,
        adsSkipped: skipped,
        adsFailed: failed,
        pagesScraped: listing.scrapedPages,
        duration,
        startedAt,
        completedAt: new Date(),
        concurrency,
        outputFile,
      };
    } finally {
      await this.shutdown();
    }
  }

  private async listAds(options: RunOptions): Promise<ListingResult> {
    const lister = new AdLister(this.config, this.pool ?? undefined);
    try {
      await lister.initialize();
      return await lister.listAds(options.searchUrl, options.maxPages);
    } finally {
      await lister.close();
    }
  }

  private async fetchSequential(adIds: string[], skipExisting: boolean, searchParams?: SearchParams): Promise<FetchResult[]> {
    const RESTART_INTERVAL = 18; // Restart browser every 18 ads to avoid rate limiting
    const results: FetchResult[] = [];
    const totalBatches = Math.ceil(adIds.length / RESTART_INTERVAL);
    
    for (let i = 0; i < adIds.length; i += RESTART_INTERVAL) {
      const batch = adIds.slice(i, i + RESTART_INTERVAL);
      const batchNum = Math.floor(i / RESTART_INTERVAL) + 1;
      
      console.log(`\n🔄 Session ${batchNum}/${totalBatches}: Processing ${batch.length} ads (${i + 1}-${i + batch.length} of ${adIds.length})...`);
      
      const fetcher = new AdFetcher(this.config, this.pool ?? undefined, searchParams);
      try {
        await fetcher.initialize();
        const batchResults = await fetcher.fetchMany(batch, skipExisting);
        results.push(...batchResults);
      } finally {
        await fetcher.close();
        
        // Pause between batches to appear more human and allow rate limits to reset
        if (i + RESTART_INTERVAL < adIds.length) {
          const pauseTime = 5 + Math.random() * 5; // 5-10 seconds
          console.log(`   ⏸️  Session complete. Pausing ${pauseTime.toFixed(1)}s before starting fresh session...`);
          await new Promise(resolve => setTimeout(resolve, pauseTime * 1000));
        }
      }
    }
    
    return results;
  }

  async shutdown(): Promise<void> {
    await this.pool?.shutdown();
    this.pool = null;
  }

  async fetchOnly(adIds: string[], skipExisting = true): Promise<FetchResult[]> {
    const fetcher = new AdFetcher(this.config);
    try {
      await fetcher.initialize();
      return await fetcher.fetchMany(adIds, skipExisting);
    } finally {
      await fetcher.close();
    }
  }

  async fetchOnlyConcurrent(adIds: string[], skipExisting = true, proxies?: ProxyConfig[], searchParams?: SearchParams): Promise<FetchResult[]> {
    this.pool = new BrowserPool(this.config);
    try {
      await this.pool.initialize();
      return await AdFetcher.fetchManyConcurrent(adIds, this.config, this.pool, skipExisting, proxies, searchParams);
    } finally {
      await this.pool.shutdown();
      this.pool = null;
    }
  }
}
