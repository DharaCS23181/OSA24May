from bson import ObjectId

def serialize_item(item):
    if not item: return item
    item["_id"] = str(item["_id"])
    item["id"] = item["_id"]  # Provide both for compatibility
    return item
