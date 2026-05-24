import sys
import os

path = r'd:\arithwise-ETL\backend\app\connectors\dlt_connector.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Look for the last return selected_schema in the get_config_schema method
target = '        return selected_schema'
injection = """        selected_schema["properties"]["save_to_vault"] = {
            "type": "boolean",
            "title": "Save configurations for quick extraction",
            "default": False,
        }

        return selected_schema"""

# We want to replace the one inside the if block or the final one?
# Actually, the file has it twice or something.
# Let's replace the one near the end of the get_config_schema method.
if target in content:
    new_content = content.replace(target, injection, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully injected.")
else:
    print("Target not found.")
