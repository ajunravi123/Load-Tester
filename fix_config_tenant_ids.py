#!/usr/bin/env python3
"""
Script to fix configs that have null tenant_id.
This will prompt you for the correct tenant_id to assign to configs with null tenant_id.
"""

import json
import os
from pathlib import Path

def main():
    config_dir = Path("configs")
    
    if not config_dir.exists():
        print("configs directory not found!")
        return
    
    # Load tenants to show available options
    tenants_file = Path("tenants.json")
    if tenants_file.exists():
        with open(tenants_file, 'r') as f:
            tenants_data = json.load(f)
            tenants = tenants_data.get('tenants', [])
            
        if tenants:
            print("\nAvailable tenants:")
            for tenant in tenants:
                print(f"  - {tenant['id']}: {tenant['name']}")
            print()
    
    # Find configs with null tenant_id
    null_configs = []
    
    for config_file in config_dir.glob("*.json"):
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
            
            if config.get('tenant_id') is None:
                null_configs.append({
                    'file': config_file,
                    'name': config.get('name', config_file.name),
                    'config': config
                })
        except Exception as e:
            print(f"Error reading {config_file.name}: {e}")
    
    if not null_configs:
        print("✓ No configs with null tenant_id found!")
        return
    
    print(f"\nFound {len(null_configs)} config(s) with null tenant_id:\n")
    for item in null_configs:
        print(f"  - {item['name']} ({item['file'].name})")
    
    print("\nOptions:")
    print("1. Assign a specific tenant_id to all")
    print("2. Assign tenant_id individually for each config")
    print("3. Exit without changes")
    
    choice = input("\nEnter your choice (1-3): ").strip()
    
    if choice == '1':
        tenant_id = input("\nEnter the tenant_id to assign to all configs: ").strip()
        
        for item in null_configs:
            item['config']['tenant_id'] = tenant_id
            with open(item['file'], 'w') as f:
                json.dump(item['config'], f, indent=2)
            print(f"✓ Updated {item['name']}")
        
        print(f"\n✓ Successfully updated {len(null_configs)} config(s)")
    
    elif choice == '2':
        for item in null_configs:
            print(f"\nConfig: {item['name']} ({item['file'].name})")
            tenant_id = input(f"  Enter tenant_id (or press Enter to skip): ").strip()
            
            if tenant_id:
                item['config']['tenant_id'] = tenant_id
                with open(item['file'], 'w') as f:
                    json.dump(item['config'], f, indent=2)
                print(f"  ✓ Updated {item['name']}")
            else:
                print(f"  - Skipped {item['name']}")
    
    else:
        print("\nExiting without changes.")

if __name__ == "__main__":
    main()

