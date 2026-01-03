import asyncio
import json
import sys
from ..config import config

class ScraperService:
    def __init__(self):
        self.scraper_dir = config.SCRAPER_DIR
        self.cmd = config.SCRAPER_CMD

    async def trigger_scrape(self, url: str, segment_name: str):
        """
        Trigger the scraper for a specific URL in the background.
        """
        print(f"🚀 Triggering scraper for: {segment_name}")
        
        # We run this in a separate thread/process to not block the async loop
        # Using asyncio.create_subprocess_exec is better for async apps
        
        try:
            # Construct command: npm run scrape -- "url"
            # Note: The extra -- is needed to pass args to the script in package.json
            
            # We need to split the command string "npm run scrape"
            cmd_parts = self.cmd.split() 
            args = cmd_parts + ["--", url]
            
            process = await asyncio.create_subprocess_exec(
                *args,
                cwd=self.scraper_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # Stream output in real-time
            stdout_lines = []
            stderr_lines = []
            
            async def log_stream(stream, prefix, collection):
                while True:
                    line = await stream.readline()
                    if not line: break
                    decoded = line.decode().strip()
                    if decoded:
                        print(f"[{prefix}] {decoded}")
                        collection.append(decoded)

            await asyncio.gather(
                log_stream(process.stdout, "Scraper", stdout_lines),
                log_stream(process.stderr, "Scraper ERR", stderr_lines)
            )
            
            await process.wait()
            
            if process.returncode == 0:
                print(f"✅ Scraper finished for {segment_name}")
                
                # Parse output to find the file
                try:
                    # Find the last non-empty line
                    last_line = next((line for line in reversed(stdout_lines) if line.strip()), "")
                    report = json.loads(last_line)
                    
                    if 'outputFile' in report:
                        output_file_rel = report['outputFile']
                        # Resolve to absolute path (output is relative to scraper_dir)
                        output_file_abs = (self.scraper_dir / output_file_rel).resolve()
                        
                        print(f"📄 Output file: {output_file_abs}")
                        
                        # Trigger Parser
                        print("🚀 Triggering parser ingestion...")
                        
                        parser_cmd = [
                            sys.executable, "-m", "data_parser.src.main",
                            "--ingest-json", str(output_file_abs),
                            "--db",
                            "--segment-name", segment_name,
                            "--search-url", url
                        ]
                        
                        parser_process = await asyncio.create_subprocess_exec(
                            *parser_cmd,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE
                        )
                        
                        p_stdout, p_stderr = await parser_process.communicate()
                        
                        if parser_process.returncode == 0:
                            print(f"✅ Parser finished successfully")
                            print(p_stdout.decode())
                        else:
                            print(f"❌ Parser failed: {p_stderr.decode()}")
                            
                except Exception as e:
                    print(f"❌ Failed to parse scraper output or trigger parser: {e}")

            else:
                print(f"❌ Scraper failed for {segment_name}. See logs above.")
                
        except Exception as e:
            print(f"❌ Failed to launch scraper: {e}")
