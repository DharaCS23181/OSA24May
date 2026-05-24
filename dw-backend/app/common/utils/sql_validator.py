"""
SQL validation utilities — ensure query safety.
"""
import re
from typing import Tuple

def validate_select_only(sql_query: str) -> Tuple[bool, str]:
    """
    Check if the query is a simple SELECT statement.
    Prevents destructive operations (DROP, DELETE, UPDATE, etc.)
    """
    # Remove comments and extra whitespace
    clean_query = re.sub(r'--.*', '', sql_query)
    clean_query = clean_query.strip().lower()

    if not clean_query:
        return False, "Query is empty."

    # Must start with SELECT or WITH (CTE)
    if not (clean_query.startswith("select") or clean_query.startswith("with")):
        return False, "Only SELECT statements are permitted."

    # Check for forbidden keywords
    forbidden = [
        "drop", "delete", "update", "insert", "truncate", "alter", 
        "create", "grant", "revoke", "commit", "rollback"
    ]
    
    # Use word boundary search to avoid matching sub-strings (like "create" in "recreate")
    for word in forbidden:
        if re.search(rf'\b{word}\b', clean_query):
            return False, f"Forbidden keyword detected: '{word.upper()}'"

    return True, ""
