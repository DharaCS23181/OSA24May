# 📊 Cache & Data Persistence Diagnostic Guide

## What is the DataFrame Cache?

The `DataProcessor` class maintains an **in-memory cache** of DataFrames to avoid repeatedly reading files from disk:

- **Up to 5 files** can be cached simultaneously
- **Validated by file modification time** (mtime) - if file hasn't changed, cache is used
- **Performance benefit** - avoids re-reading large CSV/Excel files on every request
- **Thread-safe** - uses locks to prevent concurrent access issues

### Cache Behavior Examples

```
✅ Cache HIT for /path/to/file.csv (500 rows × 12 cols, age: 45.2s)
   → File was already in memory and unmodified → returns cached version

📖 [Cache MISS] Reading /path/to/file.csv from disk (size: 2.50MB)...
   → File not in cache yet → reads from disk and caches it

⚠️ Cache INVALID for /path/to/file.csv - file was modified, reading fresh
   → File was modified on disk → invalidates cache, reads fresh
```

## Does Cache Affect Report Data Persistence?

### ✅ What Cache Does NOT Affect:
- **Report data in database** - Chart data embedded in `layout_json` is stored in database, not in cache
- **Saved reports** - When you save a report, data goes directly to database
- **Report retrieval** - Saved reports are loaded from database, not from file cache

### ⚠️ Potential Indirect Issues:
1. **Initial chart creation** - If creating a chart from a file, cache may return incomplete data before full processing
2. **Stale data in memory** - If file data changes and cache isn't cleared, charts might show old data
3. **Session timeouts** - In-memory data (in `elementData` state) is lost on page refresh

## 🔍 Diagnostic Endpoints

### 1. Get Cache Statistics
```bash
curl http://localhost:8010/api/reports/diagnose/cache-stats
```

**Response:**
```json
{
  "status": "ok",
  "cache": {
    "cached_files": 2,
    "total_memory_mb": 15.42,
    "max_size": 5,
    "files": [
      "/home/aw/apps/DW/DEMO/Analytics/backend/uploads/abc123.csv",
      "/home/aw/apps/DW/DEMO/Analytics/backend/uploads/xyz789.xlsx"
    ]
  }
}
```

### 2. Clear All Cache
```bash
curl -X POST http://localhost:8010/api/reports/diagnose/cache-clear
```

**Response:**
```json
{
  "status": "cleared",
  "result": {
    "cleared": 2
  },
  "info": "All cached DataFrames have been removed from memory"
}
```

### 3. Clear Cache for Specific File
```bash
curl -X POST http://localhost:8010/api/reports/diagnose/cache-clear?file_id=abc-123-def
```

### 4. Alternative: File Router Cache Endpoints
```bash
# Clear cache for a specific file
curl http://localhost:8010/api/files/abc-123-def/cache-clear

# Clear all file caches
curl -X POST http://localhost:8010/api/files/cache-clear-all
```

## 📊 Console Log Interpretation

### New Cache Logging Format

**Cache Hit (good - faster):**
```
✅ Cache HIT for /path/uploads/file.csv (1000 rows × 8 cols, age: 120.3s)
```
- File was in memory, no disk read needed
- Data is `120.3s` old but still valid

**Cache Miss (expected on first read):**
```
📖 [Cache MISS] Reading /path/uploads/file.csv from disk (size: 2.50MB)...
```
- File not in cache, read from disk
- File size is 2.50MB

**Cache Skip (explicit bypass):**
```
📖 [Cache SKIP] Reading /path/uploads/file.csv (size: 2.50MB) - cache disabled
```
- Cache was intentionally bypassed for this operation

**Cache Invalid (file changed):**
```
⚠️ Cache INVALID for /path/uploads/file.csv - file was modified, reading fresh
```
- File on disk was updated, invalidating the cache
- Fresh read performed automatically

## 🧪 Troubleshooting Workflow

### Issue: "No data available" after saving report

**Step 1: Check if data was embedded in database**
```bash
curl http://localhost:8010/api/reports/{report_id}/diagnose
```
Look for `charts_with_inline_data` count. Should be > 0.

**Step 2: Clear cache and reload**
```bash
# Clear all cache
curl -X POST http://localhost:8010/api/reports/diagnose/cache-clear

# Reload the report
# (Go back to report in UI)
```

**Step 3: Check frontend logs**
```javascript
// In browser DevTools console, you should see:
🔍 [Report Load] Fetching report: abc-123
✅ [Report Load] Chart "Sales Data" has inline data: {"rows": 150, "sizeKB": 12.5}
```

### Issue: Stale data showing in charts

**Solution: Clear cache**
```bash
# Option 1: Clear all cache
curl -X POST http://localhost:8010/api/reports/diagnose/cache-clear

# Option 2: Clear specific file
curl -X POST http://localhost:8010/api/reports/diagnose/cache-clear?file_id=xyz-123
```

## 📈 Performance Notes

**Cache helps with:**
- Multiple requests for the same file (common during development)
- Large CSV/Excel files (5MB+)
- Repeated data operations

**Cache doesn't help with:**
- Reports with embedded chart data (database is used)
- Real-time data that changes frequently (disable cache for dynamic data)

## 🔧 Advanced: Disable Cache for Testing

In `services/data_processor.py`, modify `read_file()` call:
```python
# Always read fresh from disk
df = DataProcessor.read_file(file_path, skip_cache=True)
```

Or clear cache between operations:
```python
DataProcessor.clear_cache()
```

---

**Key Takeaway:** Cache is for file I/O performance. Report data persistence is database-driven. If reports lose data after saving, check database content using `/diagnose` endpoint, not cache.
