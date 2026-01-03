/** AdLister: Extracts ad IDs from search results via DOM parsing and Network Interception */
import { Response } from 'playwright';
import { BaseScraper } from './BaseScraper.js';
import { ListingResult, ScraperConfig } from '../types.js';
import { BrowserPool } from './BrowserPool.js';

export class AdLister extends BaseScraper {
  constructor(config: ScraperConfig, pool?: BrowserPool) {
    super(config, pool);
  }

  async listAds(searchUrl: string, maxPages?: number): Promise<ListingResult> {
    const pagesToScrape = maxPages ?? this.config.maxPagesPerRun;
    const allAdIds = new Set<string>();

    // Hybrid Approach: Listen for API responses containing feed data
    const networkHandler = async (response: Response) => {
      try {
        if (!response.ok()) return;
        const contentType = response.headers()['content-type'];
        if (!contentType?.includes('application/json')) return;

        // Filter for likely feed endpoints to avoid parsing every image/resource
        const url = response.url();
        // Vehicles: api/feed, feed/get | Real Estate: realestate-feed
        if (!url.includes('api/feed') && !url.includes('feed/get') && !url.includes('realestate-feed')) return;

        const data = await response.json().catch(() => null);
        if (!data) return;

        // Extract items from common Yad2 API structures
        const items = data?.feed?.items || data?.data?.feed?.items || data?.items;
        if (Array.isArray(items)) {
          items.forEach((item: any) => {
            if (item.id) allAdIds.add(String(item.id));
          });
        }
      } catch (err) {
        // Ignore parsing errors from unrelated requests
      }
    };

    // Register the network handler
    this.onResponse('api', networkHandler);
    this.onResponse('feed', networkHandler);

    await this.navigateTo(searchUrl, 'domcontentloaded');
    await this.delay(2); // Wait for API responses to complete

    let currentPage = 1;

    // Get initial data from DOM (fallback/SSR data)
    const totalPages = await this.getTotalPages();
    const initialIds = await this.extractFromDom();
    initialIds.forEach(id => allAdIds.add(id));

    const effectivePages = Math.min(totalPages, pagesToScrape);

    // Paginate
    while (currentPage < effectivePages) {
      currentPage++;
      
      if (!await this.goToPage(currentPage)) break;
      
      await this.delay(1.5); // Wait for new data to load
      
      // Capture any new data from DOM updates (minimal fallback)
      const pageIds = await this.extractFromDom();
      const beforeSize = allAdIds.size;
      pageIds.forEach(id => allAdIds.add(id));
      
      // If no new ads found, stop early
      if (allAdIds.size === beforeSize && currentPage > 2) {
        break;
      }
    }

    if (allAdIds.size === 0) {
      console.log('⚠️ No ads found. Taking screenshot...');
      await this.getPage().screenshot({ path: 'debug_screenshot.png', fullPage: true });
    }

    // Cleanup handlers
    this.offResponse('api');
    this.offResponse('feed');

    return {
      adIds: [...allAdIds],
      totalPages,
      scrapedPages: currentPage,
    };
  }

  private async extractFromDom(): Promise<string[]> {
    // Minimal fallback: just grab links that look like items
    return this.getPage().evaluate(() => {
      return [...document.querySelectorAll('a[href*="/item/"]')]
        .map(a => (a as HTMLAnchorElement).href.match(/\/item\/([a-zA-Z0-9]+)/)?.[1])
        .filter((id): id is string => !!id);
    });
  }

  private async getTotalPages(): Promise<number> {
    return this.getPage().evaluate(() => {
      let max = 1;
      document.querySelectorAll('.pagination a, [class*="pagination"] a').forEach(el => {
        const n = parseInt(el.textContent?.trim() || '', 10);
        if (!isNaN(n) && n > max) max = n;
      });
      return max;
    });
  }

  private async goToPage(page: number): Promise<boolean> {
    try {
      const p = this.getPage();
      const url = new URL(p.url());
      url.searchParams.set('page', String(page));
      
      await p.goto(url.toString(), { 
        waitUntil: 'domcontentloaded', 
        timeout: 20000 
      });
      
      await p.waitForSelector('a[href*="/item/"]', { timeout: 10000 }).catch(() => {});
      
      return true;
    } catch (error) {
      return false;
    }
  }
}
