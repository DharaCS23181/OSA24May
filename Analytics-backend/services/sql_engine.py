import pandas as pd
import sqlalchemy
from sqlalchemy import create_engine, text
import re
from typing import List, Dict, Any, Optional
import traceback

class SQLEngine:
    @staticmethod
    def preprocess_sql(content: str) -> str:
        """
        Translates simple MySQL-style SQL to PostgreSQL compatible SQL.
        """
        # Remove backticks (MySQL) and replace with nothing
        content = content.replace("`", "")
        
        # Remove MySQL ENGINE, CHARSET, and AUTO_INCREMENT suffixes at the end of CREATE TABLE
        content = re.sub(r'ENGINE\s*=\s*\w+', '', content, flags=re.IGNORECASE)
        content = re.sub(r'DEFAULT\s+CHARSET\s*=\s*\w+', '', content, flags=re.IGNORECASE)
        content = re.sub(r'COLLATE\s*=\s*[\w\d]+', '', content, flags=re.IGNORECASE)
        content = re.sub(r'AUTO_INCREMENT\s*=\s*\d+', '', content, flags=re.IGNORECASE)
        
        # Replace MySQL types with PostgreSQL equivalents
        # Handle tinyint first to avoid partial match with int
        content = re.sub(r'\btinyint\(\d+\)', 'SMALLINT', content, flags=re.IGNORECASE)
        content = re.sub(r'\btinyint\b', 'SMALLINT', content, flags=re.IGNORECASE)
        
        # Match "int(11) NOT NULL AUTO_INCREMENT" or similar
        content = re.sub(r'\bint\(\d+\)\s+NOT\s+NULL\s+AUTO_INCREMENT', 'SERIAL', content, flags=re.IGNORECASE)
        content = re.sub(r'\bint\(\d+\)', 'INTEGER', content, flags=re.IGNORECASE)
        content = re.sub(r'\bint\b', 'INTEGER', content, flags=re.IGNORECASE)
        
        content = re.sub(r'\bAUTO_INCREMENT\b', 'SERIAL', content, flags=re.IGNORECASE)
        
        return content

    @staticmethod
    def parse_sql_file(file_path: str) -> List[str]:
        """
        Reads a .sql file and splits it into individual executable commands.
        """
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Remove comments
        content = re.sub(r'--.*', '', content)
        content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
        
        # Preprocess MySQL dialect
        content = SQLEngine.preprocess_sql(content)
        
        # Split by semicolon
        commands = [cmd.strip() for cmd in content.split(';') if cmd.strip()]
        return commands

    @staticmethod
    def execute_on_local_db(commands: List[str], engine: sqlalchemy.engine.Engine):
        """
        Executes a list of SQL commands on the local application database.
        Use with caution.
        """
        with engine.begin() as conn:
            for cmd in commands:
                try:
                    conn.execute(text(cmd))
                except sqlalchemy.exc.IntegrityError as ie:
                    # Ignore duplicate key errors for re-uploads
                    if "duplicate key" in str(ie).lower() or "unique constraint" in str(ie).lower():
                        print(f"Skipping duplicate entry: {str(ie)[:100]}...")
                        continue
                    raise ie
                except Exception as e:
                    print(f"Error executing command: {cmd}\nError: {e}")
                    raise e

    @staticmethod
    def get_external_db_engine(db_config: Dict[str, Any]) -> sqlalchemy.engine.Engine:
        """
        Creates a SQLAlchemy engine for an external database.
        Supports: postgresql, mysql, sqlite
        """
        db_type = db_config.get('db_type', 'postgresql').lower().strip()
        host = str(db_config.get('host', 'localhost')).strip()
        port = db_config.get('port', 5432)
        database = str(db_config.get('database', '')).strip()
        username = str(db_config.get('username', '')).strip()
        password = str(db_config.get('password', '')).strip()
        
        if db_type == 'postgresql':
            if not host:
                raise ValueError("Host is required for PostgreSQL connection")
            url = f"postgresql://{username}:{password}@{host}:{port}/{database}"
            return create_engine(url, connect_args={'connect_timeout': 5})
        elif db_type == 'mysql':
            if not host:
                raise ValueError("Host is required for MySQL connection")
            # pymysql is often preferred for SQLAlchemy + MySQL
            url = f"mysql+pymysql://{username}:{password}@{host}:{port}/{database}"
            return create_engine(url, connect_args={'connect_timeout': 5})
        elif db_type == 'sqlite':
            # For SQLite, 'database' should be the relative/absolute path to the .db file
            url = f"sqlite:///{database}"
            return create_engine(url)
        elif db_type == 'mssql':
            if not host:
                raise ValueError("Host is required for MSSQL/Dataverse connection")
            # For Dataverse/MSSQL via TDS: mssql+pymssql://<user>:<password>@<host>:<port>/<database>
            # Dataverse usually uses 5558 as port, but it will be passed in from port variable
            url = f"mssql+pymssql://{username}:{password}@{host}:{port}/{database}"
            return create_engine(url, connect_args={'connect_timeout': 10})
        else:
            raise ValueError(f"Unsupported database type: {db_type}")

    @staticmethod
    def execute_query(query: str, engine: sqlalchemy.engine.Engine) -> pd.DataFrame:
        """
        Executes a SELECT query and returns a pandas DataFrame.
        """
        # Preprocess query: remove comments and check if it starts with SELECT
        processed_query = re.sub(r'--.*', '', query)
        processed_query = re.sub(r'/\*.*?\*/', '', processed_query, flags=re.DOTALL)
        
        if not processed_query.strip().lower().startswith("select"):
             raise ValueError("Only SELECT queries are allowed for visualization.")
             
        try:
            # Use connection to be more robust
            with engine.connect() as conn:
                df = pd.read_sql_query(text(query), conn)
            return df
        except Exception as e:
            print(f"Query execution error: {e}")
            raise e

    @staticmethod
    def infer_column_types(df: pd.DataFrame) -> Dict[str, str]:
        """
        Infers logical data types for a DataFrame.
        """
        def _clean_numeric_string(v: Any) -> str:
            s = str(v).strip()
            if not s:
                return s

            s = s.replace("\u00a0", " ")
            if s.startswith("(") and s.endswith(")") and len(s) > 2:
                s = "-" + s[1:-1].strip()

            s = re.sub(r"[$€£¥₹]", "", s)
            s = s.replace(" ", "")

            if s.endswith("%"):
                s = s[:-1]

            if "," in s:
                if "." in s:
                    s = s.replace(",", "")
                else:
                    s = s.replace(",", ".")
            return s

        types: Dict[str, str] = {}
        numeric_ratio_threshold = 0.8
        sample_size = min(len(df), 200)

        for col in df.columns:
            series = df[col]

            if pd.api.types.is_numeric_dtype(series):
                types[col] = "numeric"
                continue

            if pd.api.types.is_datetime64_any_dtype(series):
                types[col] = "datetime"
                continue

            sample = series.dropna()
            if not sample.empty:
                sample = sample[sample.astype(str).str.strip() != ""].head(sample_size)

            if sample.empty:
                types[col] = "categorical"
                continue

            # Try numeric strings first
            try:
                cleaned = sample.astype(str).map(_clean_numeric_string)
                converted = pd.to_numeric(cleaned, errors="coerce")
                ratio = float(converted.notna().sum()) / float(len(sample))
                if ratio >= numeric_ratio_threshold:
                    types[col] = "numeric"
                    continue
            except Exception:
                pass

            # Fallback to datetime detection
            try:
                pd.to_datetime(sample, errors="raise")
                types[col] = "datetime"
            except Exception:
                types[col] = "categorical"

        return types

    @staticmethod
    def format_for_charts(df: pd.DataFrame, x_col: str, y_col: Optional[str] = None, aggregation: str = "sum") -> Dict[str, List[Any]]:
        """
        Formats DataFrame data into a JSON-ready structure for charts.
        """
        if y_col and y_col in df.columns:
            if aggregation == "sum":
                grouped = df.groupby(x_col)[y_col].sum()
            elif aggregation == "mean":
                grouped = df.groupby(x_col)[y_col].mean()
            elif aggregation == "count":
                grouped = df.groupby(x_col)[y_col].count()
            else:
                grouped = df.groupby(x_col)[y_col].sum()
        else:
            # Default to count of occurrences of X
            grouped = df[x_col].value_counts()

        # Handle datetime indices
        labels = [str(i) for i in grouped.index.tolist()]
        values = grouped.tolist()

        return {
            "labels": labels,
            "values": values
        }
