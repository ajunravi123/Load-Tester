# 🚀 Load Testing Tool - Professional Edition

A modern, feature-rich load testing application built with FastAPI and Bootstrap 5.

## ✨ Features

### 🎨 **Beautiful Bootstrap UI**
- Clean, professional design with Bootstrap 5
- Responsive layout that works on all devices
- Intuitive two-column layout
- Sticky results panel

### 🌓 **Dark & Light Theme**
- Toggle between dark and light themes
- Theme preference saved automatically
- Smooth transitions between themes
- Easy-to-read in any environment

### 🔧 **Generic & Flexible**
- Any HTTP method (GET, POST, PUT, PATCH, DELETE)
- Any API endpoint
- Custom headers (unlimited)
- Multiple body types (JSON, Form Data, Raw, None)

### 📝 **Enhanced Body Configuration**
- **Field-by-Field**: Add body fields one at a time
- **Paste JSON**: Paste entire JSON object - automatically converts to fields
- Supports nested objects and arrays
- Real-time field management

### 💾 **Backend Configuration Storage**
- Save configurations to server as JSON files
- Load saved configurations from list
- Delete old configurations
- View save dates and metadata
- Configurations persist across sessions

### 🛡️ **Advanced Validation**
- String exists/doesn't exist
- Status code validation
- Regex pattern matching
- JSON path validation
- Custom descriptions

### ⚡ **Real-time Testing**
- Live progress tracking with progress bar
- WebSocket real-time updates
- Sound notification on completion
- Disabled button during execution
- Visual feedback throughout

### 📊 **Comprehensive Results**
- Success rate, average time, requests/sec
- Detailed results table
- Request/response inspection
- Validation results breakdown
- Export as JSON

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the Server

```bash
python main.py
```

Or:

```bash
uvicorn main:app --reload
```

### 3. Open in Browser

Navigate to: `http://localhost:8000`

## 📖 How to Use

### Step 1: Configure API

1. Select HTTP method (GET, POST, etc.)
2. Enter full API URL
3. Check/uncheck SSL verification
4. Check/uncheck follow redirects

### Step 2: Add Headers (Optional)

- Click "+ Add Header"
- Enter header name and value
- Add as many as needed
- Remove with trash icon

### Step 3: Configure Request Body

**Choose body type:**
- **JSON**: Add fields one by one OR paste JSON
- **Form**: Add form fields
- **Raw**: Paste raw text content
- **None**: No body (for GET/DELETE)

**To Paste JSON:**
1. Click "Paste JSON" button
2. Paste your JSON object
3. Click "Apply"
4. Fields automatically created!

### Step 4: Add Validation Rules (Optional)

- Click "+ Add Rule"
- Choose validation type
- Set expected value
- Add description
- Click "Add Rule"

### Step 5: Configure Load Settings

- Set concurrent requests (1-1000)
- Set sequential batches (optional)
- Set timeout (seconds)

### Step 6: Run Test

- Click "Run Load Test"
- Button disables during test
- Watch real-time progress
- Hear sound when complete

### Step 7: View Results

- See stats cards with key metrics
- Browse detailed results table
- Click eye icon for full details
- Export results as JSON

### Step 8: Save Configuration

- Click "Save" button
- Enter configuration name
- Saved to server as JSON file
- Load anytime from "Load" button

## 🎨 Theme Toggle

- Click moon/sun icon in header
- Instantly switches between themes
- Preference saved automatically
- All elements adapt to theme

## 💾 Configuration Management

### Save Configuration
1. Click "Save" button in header
2. Enter a name
3. Saved to `configs/` folder on server

### Load Configuration
1. Click "Load" button in header
2. See list of saved configurations
3. Click on any configuration to load
4. Click trash icon to delete

### Configuration Storage
- Stored as JSON files in `configs/` folder
- Includes all settings, headers, body, validation
- Metadata includes save timestamp and unique ID
- Sorted by most recent first

## 📋 Example Use Cases

### 1. Test REST API with JSON

```
Method: POST
URL: https://api.example.com/users
Headers:
  - Authorization: Bearer your_token_here
  - Content-Type: application/json

Body (Paste JSON):
{
  "name": "John Doe",
  "email": "john@example.com",
  "age": 30
}

Validation:
  - Status Code: 200
  - String Exists: "success"
  - JSON Path: data.id (check if exists)

Load Settings:
  - Concurrent: 10
  - Batches: 5
  - Total: 50 requests
```

### 2. Load Test GET Endpoint

```
Method: GET
URL: https://api.example.com/products?limit=100
Headers:
  - Accept: application/json
  - API-Key: your_api_key

Body: None

Validation:
  - Status Code: 200
  - Regex Match: "products":\s*\[

Load Settings:
  - Concurrent: 50
  - Batches: 10
  - Total: 500 requests
```

### 3. Test Form Submission

```
Method: POST
URL: https://example.com/contact
Headers:
  - Content-Type: application/x-www-form-urlencoded

Body (Form):
  - name: Test User
  - email: test@example.com
  - message: Hello World

Validation:
  - Status Code: 200
  - String Exists: "thank you"
```

## 🎯 New Features

### 1. Bootstrap UI ✅
- Professional, modern design
- Responsive grid system
- Beautiful components
- Consistent styling

### 2. Dark/Light Theme ✅
- Toggle button in header
- Smooth transitions
- Saved preference
- All elements themed

### 3. Disabled Button During Test ✅
- Button shows spinner
- Text changes to "Running..."
- Prevents double-clicks
- Re-enables when complete

### 4. Paste JSON Feature ✅
- "Paste JSON" button
- Modal for JSON input
- Automatic field conversion
- Error handling for invalid JSON

### 5. Backend Configuration Storage ✅
- Save to server as JSON
- List saved configurations
- Load from server
- Delete configurations
- Metadata tracking

## 🗂️ File Structure

```
My-Load/
├── main.py                 # FastAPI backend
├── requirements.txt        # Python dependencies
├── README.md              # This file
├── static/
│   ├── index.html         # Bootstrap UI
│   ├── css/
│   │   └── style.css      # Theme styles
│   └── js/
│       └── app.js         # Application logic
├── configs/               # Saved configurations (JSON)
└── logs/                  # Test results
    ├── load_test_*.json   # Detailed results
    └── summary_*.json     # Test summaries
```

## 🔧 API Endpoints

### Test Execution
- `POST /api/test/start` - Start load test
- `GET /api/test/{session_id}` - Get test results
- `GET /api/test/history` - List test history

### Configuration Management
- `POST /api/config/save` - Save configuration
- `GET /api/config/list` - List saved configurations
- `GET /api/config/{config_id}` - Get configuration
- `DELETE /api/config/{config_id}` - Delete configuration

### WebSocket
- `WS /ws` - Real-time test updates

## 🎨 Theme Colors

### Light Theme
- Background: Light gray (#f8f9fa)
- Cards: White
- Text: Dark gray
- Borders: Light gray

### Dark Theme
- Background: Dark blue-gray (#1a1d23)
- Cards: Slightly lighter (#25282e)
- Text: Light gray
- Borders: Medium gray

## 💡 Tips

1. **Use Dark Theme**: Better for long testing sessions
2. **Paste JSON**: Faster than adding fields one by one
3. **Save Configs**: Store frequently used setups
4. **Start Small**: Test with low concurrent requests first
5. **Add Validation**: Catch failures automatically
6. **Export Results**: Keep records of important tests

## 🔊 Sound Notification

- Plays automatically when test completes
- Works on success or failure
- Browser may block - click page first
- Can be muted in browser settings

## 📱 Responsive Design

- **Desktop**: Full two-column layout
- **Tablet**: Stacked columns
- **Mobile**: Single column, optimized

## 🐛 Troubleshooting

**Theme not saving?**
- Check browser localStorage is enabled
- Try clearing cache

**Config won't load?**
- Check `configs/` folder exists
- Check file permissions
- Check JSON format is valid

**Button stays disabled?**
- Refresh page
- Check console for errors
- Check WebSocket connection

**Sound won't play?**
- Click page first (browser autoplay policy)
- Check browser sound settings
- Check volume isn't muted

## 🔐 Security

- SSL verification optional (disabled by default for testing)
- Configurations saved on server (not in browser)
- No sensitive data logged
- Local execution only

## 📈 Performance

- Supports up to 1000 concurrent requests
- Handles large response bodies
- Real-time updates without lag
- Efficient memory usage

## 🆕 What's New in This Version

- ✅ Bootstrap 5 UI
- ✅ Dark/Light theme toggle
- ✅ Disabled button during test
- ✅ Paste JSON feature
- ✅ Backend configuration storage
- ✅ Better error handling
- ✅ Improved UX/UI

## 📄 License

Open source - use as you wish!

---

**Happy Load Testing! 🚀**

Need help? Check the browser console for detailed logs.