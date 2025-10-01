# Log Files Organization

## Folder Structure

As of this update, log files are now organized into separate subdirectories for better management:

```
logs/
├── load_test/          # Detailed load test results
│   └── load_test_YYYYMMDD_HHMMSS.json
└── summary/            # Summary reports
    └── summary_YYYYMMDD_HHMMSS.json
```

## File Types

### Load Test Files (`logs/load_test/`)
- **Filename pattern:** `load_test_YYYYMMDD_HHMMSS.json`
- **Contents:** Complete test session data including:
  - Full configuration used
  - Detailed results for each request
  - Response times, status codes, headers
  - Validation results
  - Complete statistics

### Summary Files (`logs/summary/`)
- **Filename pattern:** `summary_YYYYMMDD_HHMMSS.json`
- **Contents:** Condensed test session overview including:
  - Session ID and timestamp
  - Test configuration
  - Aggregate statistics
  - Test status

## Migration

### Automatic Migration
The application automatically migrates existing log files from the root `logs/` directory to the appropriate subdirectories on startup. This happens:
- When you run the application with `python main.py`
- When the FastAPI app starts up (via startup event)

### Manual Migration
You can also manually migrate files by running the migration script:

```bash
python migrate_logs.py
```

This script will:
- Create the necessary subdirectories if they don't exist
- Move `load_test_*.json` files to `logs/load_test/`
- Move `summary_*.json` files to `logs/summary/`
- Skip files that already exist in the destination
- Provide a summary of moved and skipped files

## Backward Compatibility

The application maintains backward compatibility:
- The test history API checks both the new `logs/summary/` directory and the old `logs/` root
- Existing files in the root `logs/` directory will continue to be accessible until migrated
- No data loss during migration

## Benefits

1. **Better Organization:** Separate folders for detailed tests vs. summaries
2. **Easier Cleanup:** Delete all load tests or summaries independently
3. **Improved Performance:** Faster directory scanning with organized structure
4. **Scalability:** Better handling of large numbers of test results

