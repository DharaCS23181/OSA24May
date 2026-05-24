import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import async_session
from app.models.connector import Connector
from app.connectors.registry import CONNECTOR_REGISTRY, _connector_type
from sqlalchemy import select, update

async def refresh_connectors():
    print("Refreshing connector schemas in database...")
    async with async_session() as session:
        try:
            for engine, connector_cls in CONNECTOR_REGISTRY.items():
                if engine in {"http", "fno"}: # Skip aliases
                    continue
                    
                schema = connector_cls.get_config_schema()
                display = connector_cls.get_display_name()
                
                # Check if exists
                result = await session.execute(select(Connector).where(Connector.engine == engine))
                existing = result.scalar_one_or_none()
                
                if existing:
                    print(f"Updating existing connector: {engine}")
                    await session.execute(
                        update(Connector)
                        .where(Connector.engine == engine)
                        .values(
                            config_schema=schema,
                            name=display,
                            connector_type=_connector_type(engine)
                        )
                    )
                else:
                    print(f"Adding new connector: {engine}")
                    conn = Connector(
                        name=display,
                        connector_type=_connector_type(engine),
                        engine=engine,
                        config_schema=schema,
                        is_active=True,
                    )
                    session.add(conn)
            
            await session.commit()
        except Exception as e:
            print(f"Error during refresh: {e}")
            import traceback
            traceback.print_exc()
            await session.rollback()
    print("Done!")

if __name__ == "__main__":
    asyncio.run(refresh_connectors())
