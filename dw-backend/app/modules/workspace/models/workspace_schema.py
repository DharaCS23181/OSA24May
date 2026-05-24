from pydantic import BaseModel
from typing import List, Optional

class Cell(BaseModel):
    language: str
    content: str
    output: Optional[str] = None


class WorkspaceCreate(BaseModel):
    name: str
    type: str  # folder | notebook | file
    parentId: Optional[str] = None

    isFavorite: bool = False
    isDeleted: bool = False
    isShared: bool = False

    language: Optional[str] = None
    cells: Optional[List[Cell]] = []


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    isFavorite: Optional[bool] = None
    isDeleted: Optional[bool] = None
    cells: Optional[List[Cell]] = None
