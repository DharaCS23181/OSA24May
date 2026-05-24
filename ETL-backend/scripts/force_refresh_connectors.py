import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.connectors.registry import seed_connectors

async def run_refresh():
    print("Starting connector refresh...")
    await seed_connectors()
    print("Refresh complete.")

if __name__ == "__main__":
    asyncio.run(run_refresh())
