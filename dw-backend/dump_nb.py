import json
from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()
client = MongoClient(os.environ['MONGO_URI'])
db = client[os.environ['DB_NAME']]
nb = db.workspace_items.find_one({'name': 'Notebook 2'})
if nb:
    nb['_id'] = str(nb['_id'])
    with open("notebook2.json", "w", encoding="utf-8") as f:
        json.dump(nb, f, indent=2)
    print("Notebook dumped to notebook2.json")
else:
    print("Notebook not found")
