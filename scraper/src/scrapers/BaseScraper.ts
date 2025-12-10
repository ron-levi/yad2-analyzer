/** Base scraper with browser management and utilities */
import { Browser, BrowserContext, Page, Response } from 'playwright';
import { ScraperConfig, ProxyConfig } from '../types.js';
import { BrowserPool, PooledContext } from './BrowserPool.js';

const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
const BROWSER_ARGS = ['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox'];

export type ResponseHandler = (response: Response) => Promise<void>;

export abstract class BaseScraper {
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected config: ScraperConfig;
  protected pool: BrowserPool | null;
  protected pooledContext: PooledContext | null = null;
  protected responseHandlers = new Map<string, ResponseHandler>();
  private initialized = false;

  constructor(config: ScraperConfig, pool?: BrowserPool) {
    this.config = config;
    this.pool = pool ?? null;
  }

  async initialize(proxy?: ProxyConfig): Promise<void> {
    if (this.initialized) return;

    if (this.pool) {
      this.pooledContext = await this.pool.acquire(proxy);
      this.context = this.pooledContext.context;
      this.page = this.pooledContext.page;
    } else {
      const { chromium } = await import('playwright');
      this.browser = await chromium.launch({ headless: this.config.headless ?? true, args: BROWSER_ARGS });
      
      const effectiveProxy = proxy ?? this.config.proxy;
      this.context = await this.browser.newContext({
        viewport: this.config.viewport ?? { width: 1920, height: 1080 },
        userAgent: this.config.userAgent ?? DEFAULT_UA,
        locale: 'he-IL',
        timezoneId: 'Asia/Jerusalem',
        ...(effectiveProxy && { proxy: effectiveProxy }),
      });

      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
      this.page = await this.context.newPage();
    }

    this.page!.on('response', async (r: Response) => {
      for (const [pattern, handler] of this.responseHandlers) {
        if (r.url().includes(pattern)) await handler(r).catch(console.error);
      }
    });

    this.initialized = true;
  }

  async close(): Promise<void> {
    this.responseHandlers.clear();
    if (this.pooledContext && this.pool) {
      this.pool.release(this.pooledContext);
    } else {
      await this.page?.close();
      await this.context?.close();
      await this.browser?.close();
    }
    this.page = this.context = this.browser = this.pooledContext = null;
    this.initialized = false;
  }

  protected onResponse(pattern: string, handler: ResponseHandler) { this.responseHandlers.set(pattern, handler); }
  protected offResponse(pattern: string) { this.responseHandlers.delete(pattern); }

  protected async parseJson<T>(response: Response): Promise<T | null> {
    try {
      return JSON.parse(await response.text()) as T;
    } catch {
      return null;
    }
  }

  protected getPage(): Page {
    if (!this.page) throw new Error('Scraper not initialized');
    return this.page;
  }

  protected randomDelay(): number {
    const { delayMinMs, delayMaxMs } = this.config;
    return Math.floor(Math.random() * (delayMaxMs - delayMinMs + 1)) + delayMinMs;
  }

  protected async delay(mult = 1): Promise<void> {
    await new Promise(r => setTimeout(r, this.randomDelay() * mult));
  }

  protected async humanScroll(): Promise<void> {
    await this.getPage().evaluate(async () => {
      const h = document.documentElement.scrollHeight;
      for (let i = 0; i < 3; i++) {
        window.scrollBy(0, h / 3);
        await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
      }
      window.scrollTo(0, 0);
    });
  }

  protected async navigateTo(url: string, waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit' = 'domcontentloaded'): Promise<void> {
    await this.getPage().goto(url, { waitUntil, timeout: 30000 });
  }
}
