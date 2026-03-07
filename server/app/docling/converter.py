"""Docling document converter wrapper"""
from docling.document_converter import DocumentConverter
from io import BytesIO
from pathlib import Path
import logging
import os
from tempfile import NamedTemporaryFile

logger = logging.getLogger(__name__)


class DoclingConverter:
    """Simple wrapper around Docling DocumentConverter"""
    
    def __init__(self):
        """Initialize DocumentConverter with default configuration"""
        self.converter = DocumentConverter()
        logger.info("✅ DoclingConverter initialized")
    
    def convert_to_markdown(self, file_content: bytes, filename: str) -> str:
        """
        Convert file content to markdown.
        
        Args:
            file_content: Raw file bytes
            filename: Original filename (for format detection)
            
        Returns:
            Markdown string
            
        Raises:
            Exception: If conversion fails
        """
        # Create temporary file with original extension for docling
        suffix = Path(filename).suffix
        if not suffix:
            suffix = ".bin"  # Default extension if none provided
        
        tmp_file = None
        tmp_path = None
        
        try:
            # Create temporary file
            tmp_file = NamedTemporaryFile(delete=False, suffix=suffix)
            tmp_file.write(file_content)
            tmp_file.close()
            tmp_path = tmp_file.name
            
            logger.info(f"🔄 Converting {filename} to markdown (temp file: {tmp_path})")
            
            # Convert using docling
            result = self.converter.convert(tmp_path)
            markdown = result.document.export_to_markdown()
            
            logger.info(f"✅ Successfully converted {filename} to markdown ({len(markdown)} chars)")
            return markdown
            
        except Exception as e:
            logger.error(f"❌ Conversion failed for {filename}: {e}")
            raise
        finally:
            # Cleanup temp file
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                    logger.debug(f"🧹 Cleaned up temp file: {tmp_path}")
                except Exception as cleanup_error:
                    logger.warning(f"⚠️ Failed to cleanup temp file {tmp_path}: {cleanup_error}")
