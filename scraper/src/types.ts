/** Shared types for the scraper */

export type AdCategory = 'vehicles' | 'real_estate';

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export interface ScraperConfig {
  delayMinMs: number;
  delayMaxMs: number;
  maxPagesPerRun: number;
  outputDir: string;
  headless?: boolean;
  userAgent?: string;
  viewport?: { width: number; height: number };
  proxy?: ProxyConfig;
  concurrency?: number;
}

export interface AdMetadata {
  adId: string;
  category: AdCategory;
  url: string;
  scrapedAt: Date;
}

export interface VehicleItem {
  token: string;
  [key: string]: any; // Allow other properties from Yad2 API
}

export interface SearchParams {
  [key: string]: string | undefined;
}

export interface RecommendationsData {
  sourceAdId: string;
  items: VehicleItem[];
  totalItems: number;
  scrapedAt: string;
}

export interface ListingResult {
  adIds: string[];
  totalPages: number;
  scrapedPages: number;
}

export interface FetchResult {
  adId: string;
  success: boolean;
  filePath?: string;
  error?: string;
  skipped?: boolean;
}

export interface ScrapingReport {
  searchUrl: string;
  totalAdsFound: number;
  adsFetched: number;
  adsSkipped: number;
  adsFailed: number;
  pagesScraped: number;
  duration: number;
  startedAt: Date;
  completedAt: Date;
  concurrency: number;
  outputFile?: string;
}

export interface RunOptions {
  searchUrl: string;
  maxPages?: number;
  skipExisting?: boolean;
  concurrency?: number;
}
