from __future__ import annotations

from pydantic import Field, field_validator

from app.domain.models import DomainModel


class MediaPoolFolder(DomainModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    parent_folder_id: str | None = Field(default=None, max_length=120)
    order: int = Field(default=0, ge=0)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Folder name cannot be empty")
        return value


class MediaPoolAssetPlacement(DomainModel):
    asset_id: str = Field(min_length=1, max_length=120)
    folder_id: str | None = Field(default=None, max_length=120)
    order: int = Field(default=0, ge=0)


class MediaPoolOrganization(DomainModel):
    schema_version: int = Field(default=1, ge=1, le=1)
    folders: list[MediaPoolFolder] = Field(default_factory=list)
    assets: list[MediaPoolAssetPlacement] = Field(default_factory=list)
