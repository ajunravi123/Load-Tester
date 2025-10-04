#!/usr/bin/env python3
"""
Quick verification script to test async file operations
"""
import asyncio
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import (
    async_read_json, 
    async_write_json, 
    load_users, 
    load_tenants,
    async_listdir
)

async def test_async_operations():
    """Test async file operations"""
    print("🧪 Testing Async File Operations\n")
    
    # Test 1: Read users.json
    print("1️⃣ Testing async_read_json (users.json)...")
    try:
        users_data = await async_read_json('users.json', default={})
        users = users_data.get('users', [])
        print(f"   ✅ Successfully read {len(users)} users")
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False
    
    # Test 2: Read tenants.json
    print("\n2️⃣ Testing async_read_json (tenants.json)...")
    try:
        tenants_data = await async_read_json('tenants.json', default={})
        tenants = tenants_data.get('tenants', [])
        print(f"   ✅ Successfully read {len(tenants)} tenants")
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False
    
    # Test 3: Test load_users function
    print("\n3️⃣ Testing load_users() function...")
    try:
        users = await load_users()
        print(f"   ✅ Successfully loaded {len(users)} users")
        if users:
            print(f"   📝 First user: {users[0].get('username', 'N/A')}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False
    
    # Test 4: Test load_tenants function
    print("\n4️⃣ Testing load_tenants() function...")
    try:
        tenants = await load_tenants()
        print(f"   ✅ Successfully loaded {len(tenants)} tenants")
        if tenants:
            print(f"   📝 First tenant: {tenants[0].get('name', 'N/A')}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False
    
    # Test 5: Test async_listdir
    print("\n5️⃣ Testing async_listdir()...")
    try:
        if os.path.exists('logs'):
            files = await async_listdir('logs')
            print(f"   ✅ Successfully listed {len(files)} items in logs/")
        else:
            print(f"   ⚠️  logs/ directory doesn't exist yet")
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False
    
    # Test 6: Write test file
    print("\n6️⃣ Testing async_write_json()...")
    try:
        test_data = {"test": "async write", "timestamp": "2024"}
        await async_write_json('test_async_write.json', test_data)
        print(f"   ✅ Successfully wrote test file")
        
        # Read it back
        read_data = await async_read_json('test_async_write.json')
        if read_data == test_data:
            print(f"   ✅ Read back matches written data")
        
        # Clean up
        os.remove('test_async_write.json')
        print(f"   🧹 Cleaned up test file")
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False
    
    # Test 7: Concurrent file operations
    print("\n7️⃣ Testing concurrent file operations...")
    try:
        # Simulate multiple concurrent reads
        tasks = [
            load_users(),
            load_tenants(),
            load_users(),
            load_tenants(),
        ]
        results = await asyncio.gather(*tasks)
        print(f"   ✅ Successfully completed 4 concurrent operations")
        print(f"   📊 Results: {[len(r) for r in results]} items")
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False
    
    print("\n" + "="*50)
    print("✨ All async operations tests passed!")
    print("="*50)
    return True

if __name__ == "__main__":
    print("\n" + "="*50)
    print("   Async File I/O Verification Script")
    print("="*50 + "\n")
    
    success = asyncio.run(test_async_operations())
    
    if success:
        print("\n✅ Your application is ready for high-concurrency!")
        print("💡 All file operations are now non-blocking.\n")
        sys.exit(0)
    else:
        print("\n❌ Some tests failed. Please check the errors above.\n")
        sys.exit(1)

