import os
import sys
import pandas as pd
import psycopg2
from sqlalchemy import create_engine
from datetime import datetime

# Database Connection (Reads from standard Postgres env var)
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://aether:aether@localhost:5433/aetherhost')

def export_events_to_parquet():
    print(f"[{datetime.now().isoformat()}] Starting Domain Event ETL Process...")
    
    try:
        # Create SQLAlchemy Engine
        engine = create_engine(DATABASE_URL)
        
        # Extract: Read from DomainEventRecord table
        query = """
            SELECT id, "eventName", "tenantId", "payload", "createdAt"
            FROM "DomainEventRecord"
            ORDER BY "createdAt" ASC
        """
        
        print(f"[{datetime.now().isoformat()}] Extracting records from PostgreSQL...")
        df = pd.read_sql_query(query, engine)
        
        if df.empty:
            print(f"[{datetime.now().isoformat()}] No records found to export.")
            return

        print(f"[{datetime.now().isoformat()}] Extracted {len(df)} records. Transforming...")
        
        # Transform: Extract JSON payload fields into distinct columns for analytical querying
        # This simulates a real ELT/ETL transformation step
        if 'payload' in df.columns:
            # Expand the JSON payload into separate columns
            payload_df = pd.json_normalize(df['payload'])
            df = df.drop('payload', axis=1).join(payload_df)
            
        # Ensure timestamp is proper datetime object
        df['createdAt'] = pd.to_datetime(df['createdAt'])
        
        # Partitioning by date (simulate Data Lake layout)
        today = datetime.now().strftime('%Y-%m-%d')
        output_dir = f"./data_lake/domain_events/date={today}"
        os.makedirs(output_dir, exist_ok=True)
        
        output_file = f"{output_dir}/events.parquet"
        
        # Load: Write to Parquet format (Columnar storage, optimal for Data Warehouses/Athena)
        print(f"[{datetime.now().isoformat()}] Loading {len(df)} records into Parquet format at {output_file}...")
        df.to_parquet(output_file, index=False, engine='pyarrow', compression='snappy')
        
        print(f"[{datetime.now().isoformat()}] ETL Pipeline Complete! Saved to {output_file}")
        
    except Exception as e:
        print(f"[{datetime.now().isoformat()}] ETL Pipeline Failed: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    export_events_to_parquet()
