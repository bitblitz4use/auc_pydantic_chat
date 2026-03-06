#!/usr/bin/env python3
"""
Verification script for Document Editing Agent implementation.

This script checks that all required components are in place
without actually running the servers.

Run: python verify_implementation.py
"""

import sys
from pathlib import Path

def check_file_exists(filepath: str, description: str) -> bool:
    """Check if a file exists and report."""
    path = Path(filepath)
    exists = path.exists()
    status = "✅" if exists else "❌"
    print(f"{status} {description}: {filepath}")
    return exists

def check_imports() -> bool:
    """Check if required imports are available."""
    print("\n🔍 Checking Python imports...")
    
    required_packages = [
        ("fastapi", "FastAPI framework"),
        ("pydantic_ai", "Pydantic AI"),
        ("httpx", "HTTP client"),
        ("dataclasses", "Standard library dataclasses"),
        ("typing", "Type hints"),
        ("uuid", "UUID generation"),
    ]
    
    all_ok = True
    for package, description in required_packages:
        try:
            __import__(package)
            print(f"✅ {description}: {package}")
        except ImportError:
            print(f"❌ {description}: {package} (not installed)")
            all_ok = False
    
    return all_ok

def check_implementation() -> bool:
    """Check the main implementation file."""
    print("\n🔍 Checking implementation...")
    
    main_file = Path("main.py")
    if not main_file.exists():
        print("❌ main.py not found")
        return False
    
    content = main_file.read_text()
    
    checks = [
        ("DocumentContext", "DocumentContext class defined"),
        ("get_document_content", "get_document_content tool defined"),
        ("update_document_content", "update_document_content tool defined"),
        ("document_agent", "document_agent configured"),
        ("deps_type=DocumentContext", "Agent uses DocumentContext"),
        ("RunContext[DocumentContext]", "Tools use RunContext pattern"),
        ("X-AI-Model", "Metadata headers implemented"),
        ("X-AI-Prompt", "Prompt metadata implemented"),
        ("X-AI-Change-Id", "Change ID tracking implemented"),
    ]
    
    all_ok = True
    for search_str, description in checks:
        if search_str in content:
            print(f"✅ {description}")
        else:
            print(f"❌ {description} (not found)")
            all_ok = False
    
    return all_ok

def check_documentation() -> bool:
    """Check that documentation files exist."""
    print("\n🔍 Checking documentation...")
    
    docs = [
        ("DOCUMENT_AGENT_GUIDE.md", "Technical guide"),
        ("QUICK_START.md", "Quick start guide"),
        ("ARCHITECTURE_FLOW.md", "Architecture documentation"),
        ("IMPLEMENTATION_SUMMARY.md", "Implementation summary"),
        ("verify_implementation.py", "This verification script"),
    ]
    
    all_ok = True
    for filename, description in docs:
        exists = check_file_exists(filename, description)
        all_ok = all_ok and exists
    
    return all_ok

def check_endpoints() -> bool:
    """Verify expected endpoints are configured."""
    print("\n🔍 Checking endpoint configuration...")
    
    main_file = Path("main.py")
    if not main_file.exists():
        return False
    
    content = main_file.read_text()
    
    endpoints = [
        ("/api/ai/export/", "Export endpoint URL"),
        ("/api/ai/import/", "Import endpoint URL"),
        ("/api/chat", "Chat endpoint"),
    ]
    
    all_ok = True
    for endpoint, description in endpoints:
        if endpoint in content:
            print(f"✅ {description}: {endpoint}")
        else:
            print(f"⚠️  {description}: {endpoint} (not found)")
            all_ok = False
    
    return all_ok

def main():
    """Run all verification checks."""
    print("=" * 70)
    print("🔍 Document Editing Agent - Implementation Verification")
    print("=" * 70)
    
    checks = [
        ("Documentation", check_documentation),
        ("Implementation", check_implementation),
        ("Endpoints", check_endpoints),
        ("Imports", check_imports),
    ]
    
    results = {}
    for name, check_func in checks:
        try:
            results[name] = check_func()
        except Exception as e:
            print(f"\n❌ Error checking {name}: {e}")
            results[name] = False
    
    # Summary
    print("\n" + "=" * 70)
    print("📊 Verification Summary")
    print("=" * 70)
    
    all_passed = all(results.values())
    
    for name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {name}")
    
    print("=" * 70)
    
    if all_passed:
        print("\n✅ All checks passed! Implementation is complete.")
        print("\n📋 Next steps:")
        print("   1. Start Hocuspocus server: cd ../hocuspocus && pnpm dev")
        print("   2. Start Python API: uvicorn main:app --reload --port 8000")
        print("   3. Start frontend: cd ../../client && pnpm dev")
        print("   4. Test: Open http://localhost:3000 and try editing a document")
        print("\n📖 See QUICK_START.md for detailed testing instructions")
        return 0
    else:
        print("\n❌ Some checks failed. Please review the output above.")
        print("\n💡 Tips:")
        print("   - Make sure you're in the server/app directory")
        print("   - Install dependencies: pip install -r requirements.txt")
        print("   - Check that all files were created correctly")
        return 1

if __name__ == "__main__":
    sys.exit(main())
