/** Browser pool for concurrent scraping */
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ScraperConfig, ProxyConfig } from '../types.js';

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

const STEALTH_SCRIPT = () => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['he-IL', 'he', 'en-US', 'en'] });
  (window as any).chrome = { runtime: {} };
};

export interface PooledContext {
  id: number;
  context: BrowserContext;
  page: Page;
  inUse: boolean;
}

export class BrowserPool {
  private browser: Browser | null = null;
  private contexts: PooledContext[] = [];
  private config: ScraperConfig;
  private nextId = 0;

  constructor(config: ScraperConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({
      headless: this.config.headless ?? true,
      args: ['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox'],
    });
  }

  async createContext(proxy?: ProxyConfig): Promise<PooledContext> {
    if (!this.browser) await this.initialize();

    const context = await this.browser!.newContext({
      viewport: this.config.viewport ?? { width: 1920, height: 1080 },
      userAgent: this.config.userAgent ?? USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
      locale: 'he-IL',
      timezoneId: 'Asia/Jerusalem',
      geolocation: { latitude: 32.0853, longitude: 34.7818 },
      permissions: ['geolocation'],
      ...(proxy && { proxy }),
    });

    await context.addInitScript(STEALTH_SCRIPT);
    const page = await context.newPage();
    const pooled = { id: this.nextId++, context, page, inUse: false };
    this.contexts.push(pooled);
    return pooled;
  }

  async acquire(proxy?: ProxyConfig): Promise<PooledContext> {
    let ctx = this.contexts.find(c => !c.inUse);
    if (!ctx && this.contexts.length < (this.config.concurrency ?? 3)) {
      ctx = await this.createContext(proxy);
    }
    if (!ctx) {
      ctx = await new Promise<PooledContext>(resolve => {
        const check = setInterval(() => {
          const available = this.contexts.find(c => !c.inUse);
          if (available) { clearInterval(check); resolve(available); }
        }, 100);
      });
    }
    ctx.inUse = true;
    return ctx;
  }

  release(ctx: PooledContext): void {
    ctx.inUse = false;
  }

  async shutdown(): Promise<void> {
    for (const c of this.contexts) {
      await c.page.close().catch(() => {});
      await c.context.close().catch(() => {});
    }
    this.contexts = [];
    await this.browser?.close();
    this.browser = null;
  }

  getStats() {
    const inUse = this.contexts.filter(c => c.inUse).length;
    return { total: this.contexts.length, inUse, available: this.contexts.length - inUse };
  }
}
