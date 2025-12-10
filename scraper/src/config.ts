/** Configuration loader */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ScraperConfig, ProxyConfig } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

export type { ScraperConfig, ProxyConfig } from './types.js';

const env = (key: string, def: string) => process.env[key] || def;
const envInt = (key: string, def: number) => parseInt(env(key, String(def)), 10);
const envBool = (key: string, def: boolean) => env(key, String(def)) !== 'false';

export const config: ScraperConfig = {
  delayMinMs: envInt('DELAY_MIN_MS', 4000),
  delayMaxMs: envInt('DELAY_MAX_MS', 8000),
  maxPagesPerRun: envInt('MAX_PAGES_PER_RUN', 10),
  outputDir: env('OUTPUT_DIR', './output'),
  headless: envBool('HEADLESS', true),
  userAgent: process.env.USER_AGENT,
  proxy: process.env.PROXY_SERVER ? {
    server: process.env.PROXY_SERVER,
    username: process.env.PROXY_USERNAME,
    password: process.env.PROXY_PASSWORD,
  } : undefined,
  concurrency: envInt('CONCURRENCY', 2),
};

export const createConfig = (overrides: Partial<ScraperConfig> = {}): ScraperConfig => ({
  ...config,
  ...overrides,
});

export const parseProxies = (str: string): ProxyConfig[] =>
  str.split(',').map(p => {
    const [host, port, username, password] = p.trim().split(':');
    return { server: port ? `${host}:${port}` : host, username, password };
  });
