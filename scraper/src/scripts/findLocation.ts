#!/usr/bin/env node
/**
 * CLI tool to search for Yad2 location codes
 * 
 * Usage:
 *   npx ts-node src/scripts/findLocation.ts "רעננה"
 *   npx ts-node src/scripts/findLocation.ts "tel aviv"
 *   npx ts-node src/scripts/findLocation.ts --list-areas
 *   npx ts-node src/scripts/findLocation.ts --online "תל אביב"  # Use live API
 */

import { LocationResolver, LocationCodes } from '../services/LocationResolver.js';

async function main() {
  const resolver = new LocationResolver();
  await resolver.init();
  
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }
  
  if (args.includes('--list-areas') || args.includes('-l')) {
    listAllAreas(resolver);
    return;
  }
  
  // Online search mode - uses live Yad2 autocomplete API
  if (args.includes('--online') || args.includes('-o')) {
    const queryIndex = args.indexOf('--online') !== -1 
      ? args.indexOf('--online') 
      : args.indexOf('-o');
    const query = args.slice(queryIndex + 1).join(' ');
    
    if (!query) {
      console.error('Please provide a search query after --online');
      process.exit(1);
    }
    
    await searchOnline(resolver, query);
    return;
  }
  
  if (args.includes('--build-url') || args.includes('-u')) {
    const cityIndex = args.indexOf('--build-url') !== -1 
      ? args.indexOf('--build-url') 
      : args.indexOf('-u');
    const city = args[cityIndex + 1];
    
    if (!city) {
      console.error('Please provide a city name after --build-url');
      process.exit(1);
    }
    
    await buildExampleUrl(resolver, city);
    return;
  }
  
  // Default: search for the query
  const query = args.join(' ');
  searchLocation(resolver, query);
}

function printHelp(): void {
  console.log(`
🔍 Yad2 Location Code Finder

Usage:
  npx ts-node src/scripts/findLocation.ts <search_query>
  npx ts-node src/scripts/findLocation.ts --online <search_query>
  npx ts-node src/scripts/findLocation.ts --list-areas
  npx ts-node src/scripts/findLocation.ts --build-url <city_name>

Examples:
  npx ts-node src/scripts/findLocation.ts "רעננה"
  npx ts-node src/scripts/findLocation.ts --online "תל אביב"  # Uses live API
  npx ts-node src/scripts/findLocation.ts --build-url "רעננה"

Options:
  -o, --online        Search using Yad2's live autocomplete API (most accurate)
  -l, --list-areas    List all available top areas and their codes
  -u, --build-url     Build an example URL for the given city
  -h, --help          Show this help message
  `);
}

function listAllAreas(resolver: LocationResolver): void {
  console.log('\n📍 Available Top Areas (מחוזות):\n');
  
  const topAreas = resolver.getTopAreas();
  
  for (const topArea of topAreas) {
    console.log(`  ${topArea.name} (topArea=${topArea.id})`);
    
    const areas = resolver.getAreas(topArea.id);
    for (const area of areas) {
      console.log(`    └─ ${area.name} (area=${area.id})`);
    }
  }
  
  console.log('\n💡 Use a search query to find cities within these areas');
  console.log('💡 Use --online for the most accurate, up-to-date data');
}

async function searchOnline(resolver: LocationResolver, query: string): Promise<void> {
  console.log(`\n🌐 Searching online for: "${query}"\n`);
  
  const results = await resolver.searchOnline(query);
  
  if (results.length === 0) {
    console.log('❌ No locations found matching your query.');
    return;
  }
  
  console.log(`Found ${results.length} result(s):\n`);
  
  for (const result of results) {
    const typeLabel = {
      topArea: '🌍 Region',
      area: '📍 Area', 
      city: '🏙️  City',
      neighborhood: '🏘️  Neighborhood',
      street: '🛣️  Street',
    }[result.type];
    
    console.log(`${typeLabel}: ${result.name}`);
    console.log(`  Codes: ${formatCodes(result.codes)}`);
    console.log('');
  }
  
  // Show example URL for the first city result
  const cityResult = results.find(r => r.type === 'city');
  if (cityResult) {
    const params = new URLSearchParams();
    if (cityResult.codes.topArea) params.set('topArea', cityResult.codes.topArea.toString());
    if (cityResult.codes.area) params.set('area', cityResult.codes.area.toString());
    if (cityResult.codes.city) params.set('city', cityResult.codes.city.toString());
    
    console.log('📎 Example URL:');
    console.log(`   https://www.yad2.co.il/realestate/forsale?${params.toString()}`);
  }
}

function searchLocation(resolver: LocationResolver, query: string): void {
  console.log(`\n🔍 Searching in cache for: "${query}"\n`);
  console.log('💡 For more accurate results, use --online flag\n');
  
  const results = resolver.search(query);
  
  if (results.length === 0) {
    console.log('❌ No locations found matching your query.');
    console.log('\n💡 Try:');
    console.log('   - Using --online flag for live search');
    console.log('   - Using Hebrew characters (e.g., "רעננה" instead of "raanana")');
    console.log('   - A partial name (e.g., "רען" for "רעננה")');
    console.log('   - Running --list-areas to see available regions');
    return;
  }
  
  console.log(`Found ${results.length} result(s):\n`);
  
  for (const result of results) {
    const typeLabel = {
      topArea: '🌍 Region',
      area: '📍 Area', 
      city: '🏙️  City',
      neighborhood: '🏘️  Neighborhood',
      street: '🛣️  Street',
    }[result.type];
    
    console.log(`${typeLabel}: ${result.name}`);
    console.log(`  Path: ${result.path}`);
    console.log(`  Codes: ${formatCodes(result.codes)}`);
    console.log('');
  }
  
  // Show example URL for the first city result
  const cityResult = results.find(r => r.type === 'city');
  if (cityResult) {
    const url = resolver.buildSearchUrl(
      'https://www.yad2.co.il/realestate/forsale',
      cityResult.name
    );
    if (url) {
      console.log('📎 Example URL:');
      console.log(`   ${url}`);
    }
  }
}

async function buildExampleUrl(resolver: LocationResolver, city: string): Promise<void> {
  // Try online search first for accuracy
  console.log(`\n🏙️  Looking up: ${city}\n`);
  
  const onlineResults = await resolver.searchOnline(city);
  const cityResult = onlineResults.find(r => r.type === 'city');
  
  if (!cityResult) {
    // Fall back to cache
    const cacheResults = resolver.search(city);
    const cacheCityResult = cacheResults.find(r => r.type === 'city');
    
    if (!cacheCityResult) {
      console.error(`❌ Could not find city: "${city}"`);
      return;
    }
    
    console.log(`⚠️  Using cached data (online lookup failed)`);
    console.log(`Location: ${cacheCityResult.path}`);
    console.log(`Codes: ${formatCodes(cacheCityResult.codes)}\n`);
    
    console.log('🏠 Real Estate:');
    console.log(`   For Sale: ${resolver.buildSearchUrl('https://www.yad2.co.il/realestate/forsale', cacheCityResult.name)}`);
    console.log(`   For Rent: ${resolver.buildSearchUrl('https://www.yad2.co.il/realestate/rent', cacheCityResult.name)}`);
    return;
  }
  
  console.log(`✅ Found via online API`);
  console.log(`Location: ${cityResult.name}`);
  console.log(`Codes: ${formatCodes(cityResult.codes)}\n`);
  
  // Build URLs
  const params = new URLSearchParams();
  if (cityResult.codes.topArea) params.set('topArea', cityResult.codes.topArea.toString());
  if (cityResult.codes.area) params.set('area', cityResult.codes.area.toString());
  if (cityResult.codes.city) params.set('city', cityResult.codes.city.toString());
  
  console.log('🏠 Real Estate:');
  console.log(`   For Sale: https://www.yad2.co.il/realestate/forsale?${params.toString()}`);
  console.log(`   For Rent: https://www.yad2.co.il/realestate/rent?${params.toString()}`);
  
  console.log('\n🚗 Vehicles:');
  console.log(`   Cars: https://www.yad2.co.il/vehicles/cars?${params.toString()}`);
}

function formatCodes(codes: LocationCodes): string {
  return Object.entries(codes)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

main().catch(console.error);
