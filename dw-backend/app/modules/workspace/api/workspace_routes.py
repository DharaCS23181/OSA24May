from fastapi import APIRouter
from app.modules.workspace.services import workspace_service

router = APIRouter()


@router.post("/")
async def create_item(data: dict):
    return await workspace_service.create_item(data)


@router.get("/")
async def get_all():
    return await workspace_service.get_all_items()


@router.get("/notebooks")
async def get_notebooks():
    return await workspace_service.get_all_notebooks()


@router.get("/folder/{parent_id}")
async def get_by_folder(parent_id: str):
    return await workspace_service.get_items_by_parent(parent_id)


@router.put("/{item_id}")
async def update(item_id: str, data: dict):
    return await workspace_service.update_item(item_id, data)


@router.delete("/{item_id}")
async def delete(item_id: str):
    await workspace_service.soft_delete(item_id)
    return {"message": "Moved to trash"}


@router.patch("/{item_id}/restore")
async def restore(item_id: str):
    await workspace_service.restore_item(item_id)
    return {"message": "Restored"}


@router.delete("/{item_id}/permanent")
async def permanent(item_id: str):
    await workspace_service.permanent_delete(item_id)
    return {"message": "Deleted permanently"}


@router.patch("/{item_id}/favorite")
async def favorite(item_id: str, value: bool):
    await workspace_service.toggle_favorite(item_id, value)
    return {"message": "Updated"}


@router.post("/{item_id}/clone")
async def clone(item_id: str):
    return await workspace_service.clone_item(item_id)


@router.patch("/{item_id}/move")
async def move(item_id: str, new_parent_id: str):
    return await workspace_service.move_item(item_id, new_parent_id)
