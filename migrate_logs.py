#!/usr/bin/env python3
"""
Migration script to organize log files into subdirectories.
This script moves existing log files from the root logs directory
into organized subdirectories:
- logs/load_test/ for load_test_*.json files
- logs/summary/ for summary_*.json files
"""

import os
import shutil

def migrate_log_files():
    """Migrate existing log files to new folder structure"""
    logs_dir = "logs"
    load_test_dir = os.path.join(logs_dir, "load_test")
    summary_dir = os.path.join(logs_dir, "summary")
    
    # Create directories if they don't exist
    os.makedirs(load_test_dir, exist_ok=True)
    os.makedirs(summary_dir, exist_ok=True)
    
    if not os.path.exists(logs_dir):
        print("No logs directory found. Nothing to migrate.")
        return
    
    moved_count = 0
    skipped_count = 0
    
    # Move files to appropriate folders
    for filename in os.listdir(logs_dir):
        if not filename.endswith('.json'):
            continue
            
        old_path = os.path.join(logs_dir, filename)
        
        # Skip if it's not a file (could be directory)
        if not os.path.isfile(old_path):
            continue
        
        # Determine destination based on filename
        if filename.startswith("load_test_"):
            new_path = os.path.join(load_test_dir, filename)
            if not os.path.exists(new_path):
                try:
                    shutil.move(old_path, new_path)
                    print(f"✓ Moved {filename} to load_test/ folder")
                    moved_count += 1
                except Exception as e:
                    print(f"✗ Error moving {filename}: {e}")
            else:
                print(f"⊘ Skipped {filename} (already exists in destination)")
                skipped_count += 1
                
        elif filename.startswith("summary_"):
            new_path = os.path.join(summary_dir, filename)
            if not os.path.exists(new_path):
                try:
                    shutil.move(old_path, new_path)
                    print(f"✓ Moved {filename} to summary/ folder")
                    moved_count += 1
                except Exception as e:
                    print(f"✗ Error moving {filename}: {e}")
            else:
                print(f"⊘ Skipped {filename} (already exists in destination)")
                skipped_count += 1
    
    print(f"\n{'='*60}")
    print(f"Migration complete!")
    print(f"Files moved: {moved_count}")
    print(f"Files skipped: {skipped_count}")
    print(f"{'='*60}")

if __name__ == "__main__":
    print("="*60)
    print("Log Files Migration Script")
    print("="*60)
    print()
    migrate_log_files()

