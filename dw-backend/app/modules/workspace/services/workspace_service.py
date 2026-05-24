from app.core.database import get_workspace_collection
from app.common.utils.helper import serialize_item
from bson import ObjectId


# CREATE
async def create_item(data):
    coll = get_workspace_collection()
    result = await coll.insert_one(data)
    print(f"DEBUG [service]: ✅ Inserted document with _id: {result.inserted_id}")
    new_item = await coll.find_one({"_id": result.inserted_id})
    if new_item:
        print(f"DEBUG [service]: ✅ Verified - document found in DB after insert")
    else:
        print(f"ERROR [service]: ❌ Document NOT found after insert! Data may not have reached Atlas.")
    return serialize_item(new_item)


# GET ALL (global)
async def get_all_items():
    coll = get_workspace_collection()
    items = []
    async for item in coll.find():
        items.append(serialize_item(item))
    print(f"DEBUG [service]: Retrieved {len(items)} items from workspace_items")
    return items


# GET ALL NOTEBOOKS (for Jobs dropdown)
async def get_all_notebooks():
    coll = get_workspace_collection()
    query = {"type": "notebook", "isDeleted": False}
    notebooks = []
    async for item in coll.find(query):
        notebooks.append(serialize_item(item))
    return notebooks


# GET SINGLE NOTEBOOK BY ID
async def get_notebook_by_id(item_id):
    coll = get_workspace_collection()
    try:
        item = await coll.find_one({"_id": ObjectId(item_id)})
        return serialize_item(item) if item else None
    except:
        return None


# GET ITEMS BY FOLDER
async def get_items_by_parent(parent_id):
    coll = get_workspace_collection()
    query = {"parentId": parent_id, "isDeleted": False}
    items = []
    async for item in coll.find(query):
        items.append(serialize_item(item))
    return items


# UPDATE
async def update_item(item_id, data):
    coll = get_workspace_collection()
    await coll.update_one(
        {"_id": ObjectId(item_id)},
        {"$set": data}
    )
    updated = await coll.find_one({"_id": ObjectId(item_id)})
    return serialize_item(updated)


# SOFT DELETE
async def soft_delete(item_id):
    coll = get_workspace_collection()
    await coll.update_one(
        {"_id": ObjectId(item_id)},
        {"$set": {"isDeleted": True}}
    )


# RESTORE
async def restore_item(item_id):
    coll = get_workspace_collection()
    await coll.update_one(
        {"_id": ObjectId(item_id)},
        {"$set": {"isDeleted": False}}
    )


# PERMANENT DELETE
async def permanent_delete(item_id):
    coll = get_workspace_collection()
    await coll.delete_one(
        {"_id": ObjectId(item_id)}
    )


# FAVORITE TOGGLE
async def toggle_favorite(item_id, value):
    coll = get_workspace_collection()
    await coll.update_one(
        {"_id": ObjectId(item_id)},
        {"$set": {"isFavorite": value}}
    )


# CLONE
async def clone_item(item_id):
    coll = get_workspace_collection()
    item = await coll.find_one({"_id": ObjectId(item_id)})
    if not item:
        raise Exception("Item not found")

    # Create shallow clone
    new_item = item.copy()
    del new_item["_id"]
    new_item["name"] = f"{item['name']} (Copy)"
    
    result = await coll.insert_one(new_item)
    inserted = await coll.find_one({"_id": result.inserted_id})
    
    # If it's a folder, basic clone doesn't copy children here for "easy" implementation
    # but we return the cloned object
    return serialize_item(inserted)


# MOVE
async def move_item(item_id, new_parent_id):
    coll = get_workspace_collection()
    await coll.update_one(
        {"_id": ObjectId(item_id)},
        {"$set": {"parentId": new_parent_id}}
    )
    updated = await coll.find_one({"_id": ObjectId(item_id)})
    return serialize_item(updated)
