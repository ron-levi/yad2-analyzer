/** Yad2 Scraper - Main entry point */
import { ScraperOrchestrator } from './services/ScraperOrchestrator.js';
import { config } from './config.js';

// Exports
export { AdLister, AdFetcher, BaseScraper, BrowserPool, type PooledContext } from './scrapers/index.js';
export { StorageService, ScraperOrchestrator } from './services/index.js';
export * from './types.js';
export { config, createConfig, parseProxies } from './config.js';

// CLI
async function main() {
  const args = process.argv.slice(2);
  const searchUrl = args.find(arg => !arg.startsWith('--'));
  
  if (!searchUrl) {
    console.error('Usage: npm start <search_url> [--max-pages N] [--concurrency N]');
    console.error('Example: npm start "https://www.yad2.co.il/vehicles/cars" --max-pages 10 --concurrency 3');
    process.exit(1);
  }

  const maxPagesArg = args.find((arg, i) => args[i - 1] === '--max-pages');
  const concurrencyArg = args.find((arg, i) => args[i - 1] === '--concurrency');

  const orchestrator = new ScraperOrchestrator(config);
  try {
    const result = await orchestrator.run({
      searchUrl,
      skipExisting: true,
      maxPages: maxPagesArg ? parseInt(maxPagesArg, 10) : undefined,
      concurrency: concurrencyArg ? parseInt(concurrencyArg, 10) : 1,
    });
    console.log('📊 Results:', JSON.stringify(result, null, 2));
    // Print compact JSON on the last line for the Python service to consume
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error('❌ Error:', error);
    await orchestrator.shutdown();
    process.exit(1);
  }
}

main();
