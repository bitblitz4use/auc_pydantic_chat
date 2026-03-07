"""Storage module for MinIO S3 operations"""
from app.storage.client import (
    get_minio_client,
    ensure_bucket_exists,
    list_objects,
    get_user_tags_from_metadata,
    create_metadata_from_tags,
)

__all__ = [
    "get_minio_client",
    "ensure_bucket_exists",
    "list_objects",
    "get_user_tags_from_metadata",
    "create_metadata_from_tags",
]
