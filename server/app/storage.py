"""MinIO S3 storage client utility"""
from minio import Minio
from minio.error import S3Error
from app.config import config
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

# Initialize MinIO client
_minio_client = None

def get_minio_client() -> Minio:
    """Get or create MinIO client instance"""
    global _minio_client
    if _minio_client is None:
        _minio_client = Minio(
            config.minio_endpoint,
            access_key=config.minio_access_key,
            secret_key=config.minio_secret_key,
            secure=config.minio_secure
        )
        logger.info(f"✅ MinIO client initialized for {config.minio_endpoint}")
    return _minio_client


def ensure_bucket_exists():
    """Ensure the configured bucket exists, create if it doesn't"""
    client = get_minio_client()
    bucket_name = config.minio_bucket
    
    try:
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)
            logger.info(f"✅ Created bucket: {bucket_name}")
        else:
            logger.debug(f"Bucket already exists: {bucket_name}")
    except S3Error as e:
        logger.error(f"❌ Error ensuring bucket exists: {e}")
        raise


def list_objects(prefix: str = "", recursive: bool = True) -> List[Dict]:
    """
    List objects in the configured bucket with optional prefix.
    
    Args:
        prefix: Path prefix to filter objects (e.g., "folder/subfolder/")
        recursive: If True, list recursively; if False, list only direct children
    
    Returns:
        List of dictionaries containing object metadata
    """
    client = get_minio_client()
    bucket_name = config.minio_bucket
    
    try:
        objects = []
        for obj in client.list_objects(bucket_name, prefix=prefix, recursive=recursive):
            objects.append({
                "name": obj.object_name,
                "size": obj.size,
                "last_modified": obj.last_modified.isoformat() if obj.last_modified else None,
                "etag": obj.etag,
                "is_dir": obj.is_dir if hasattr(obj, 'is_dir') else False
            })
        return objects
    except S3Error as e:
        logger.error(f"❌ Error listing objects with prefix '{prefix}': {e}")
        raise
