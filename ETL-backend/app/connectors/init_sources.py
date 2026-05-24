import os
import subprocess
import sys

# Use the current python executable (the venv being used)
python_exe = sys.executable

sources = [
    "shopify", "hubspot", "github", "slack", "zendesk", "salesforce", 
    "zoho_crm", "stripe_analytics", "google_analytics", "google_ads", 
    "google_search_console", "google_drive", "bigquery", "facebook_ads", 
    "linkedin_ads", "notion", "airtable", "intercom", "mongodb", "snowflake"
]

installed_reqs = []

print("Starting DLT source initialization...")

for source in sources:
    if os.path.isdir(source) and os.path.exists(os.path.join(source, "__init__.py")):
        print(f"[{source}] Directory appears configured. Skipping dlt init.")
    else:
        print(f"[{source}] Initializing...")
        try:
            res = subprocess.run(
                [python_exe, "-m", "dlt", "init", source, "duckdb"],
                input=b"N\n\nN\n",
                capture_output=True,
                timeout=60
            )
            print(f"[{source}] Process exit code: {res.returncode}")
            if res.returncode != 0:
                print(f"[{source}] Error: {res.stderr.decode('utf-8', 'replace')}")
        except Exception as e:
            print(f"[{source}] Exception: {e}")
            
    # Check for requirements
    req_file = os.path.join(source, "requirements.txt")
    if os.path.exists(req_file):
        with open(req_file, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    installed_reqs.append(line)

print("\n--- Finished Initializing ---")

# De-duplicate requirements
unique_reqs = list(set(installed_reqs))
print(f"Found {len(unique_reqs)} unique pip requirements from all sources.")

master_reqs_path = "dlt_master_requirements.txt"
with open(master_reqs_path, "w") as f:
    for req in unique_reqs:
        f.write(req + "\n")

print(f"Installing requirements from {master_reqs_path} using pip...")
res_pip = subprocess.run([python_exe, "-m", "pip", "install", "-r", master_reqs_path])
print(f"Pip install exit code: {res_pip.returncode}")
print("All tasks completed.")
