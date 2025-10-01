# Git Ignore Configuration

## Overview
The `.gitignore` file has been configured to exclude user-generated data and environment-specific files from version control.

## Ignored Folders

### 📁 `configs/`
**Why ignored:**
- Contains user-specific test configurations
- Each user/environment should maintain their own configs
- Prevents conflicts when multiple users work on the project
- Configurations may contain sensitive API endpoints or credentials

**What's in this folder:**
- Saved load test configurations (*.json)
- User-defined test scenarios

### 📁 `logs/`
**Why ignored:**
- Contains test execution results and logs
- Can grow very large over time (100+ files)
- Not needed in version control (generated data)
- Each environment generates its own test results

**What's in this folder:**
- `logs/load_test/` - Detailed test results
- `logs/summary/` - Test summary reports

## Other Ignored Items

### Python-specific
- `__pycache__/` - Python bytecode cache
- `*.pyc` - Compiled Python files
- Virtual environment folders (`venv/`, `env/`)

### IDE-specific
- `.vscode/` - VS Code settings
- `.idea/` - PyCharm settings
- `.DS_Store` - macOS metadata

### Sensitive Files
- `.env` - Environment variables
- `users.json` - User credentials (if present)

## What IS Tracked

✅ Source code (`.py` files)
✅ Static files (HTML, CSS, JS)
✅ Configuration templates (if any)
✅ Documentation (README files)
✅ Requirements file
✅ Migration scripts

## Setup Complete

The following actions have been taken:
1. ✅ Created `.gitignore` file with comprehensive rules
2. ✅ Removed `configs/` folder from git tracking (files remain on disk)
3. ✅ Removed `logs/` folder from git tracking (files remain on disk)
4. ✅ Added `.gitignore` to git

## Note

**Your local files are safe!** The `configs/` and `logs/` folders still exist on your disk with all their contents. They're just no longer tracked by git.

To commit these changes:
```bash
git status                    # Review changes
git commit -m "Add .gitignore to exclude user data folders"
git push
```

## For New Users

When new users clone this repository:
1. The `configs/` and `logs/` folders won't exist initially
2. They'll be created automatically when the application runs
3. Each user will have their own configs and logs (not synced via git)

