# JSON Paste Guide - Common Issues & Solutions

## ✅ Your Corrected JSON

```json
{
	"user_input": "Generate a banner image for upc 15561117128 for a summer event.",
	"product": "MARINA BACKGROUND 12IN GREEN PLANTS-BLACK 1FT",
	"keywords_csv_path": "accounts/psp/public_files/psp-keywords-v6.csv",
	"event_related_info": "summar",
	"segment": "my pet"
}
```

**What was wrong:** There was a trailing comma after `"my pet"` before the closing brace.

## 🚫 Common JSON Errors

### 1. Trailing Comma (Most Common)

❌ **Wrong:**
```json
{
	"name": "John",
	"age": 30,    ← Extra comma here!
}
```

✅ **Correct:**
```json
{
	"name": "John",
	"age": 30
}
```

### 2. Single Quotes Instead of Double Quotes

❌ **Wrong:**
```json
{
	'name': 'John'
}
```

✅ **Correct:**
```json
{
	"name": "John"
}
```

### 3. Missing Quotes on Keys

❌ **Wrong:**
```json
{
	name: "John"
}
```

✅ **Correct:**
```json
{
	"name": "John"
}
```

### 4. Missing Comma Between Fields

❌ **Wrong:**
```json
{
	"name": "John"
	"age": 30
}
```

✅ **Correct:**
```json
{
	"name": "John",
	"age": 30
}
```

### 5. Unclosed Strings

❌ **Wrong:**
```json
{
	"name": "John,
	"age": 30
}
```

✅ **Correct:**
```json
{
	"name": "John",
	"age": 30
}
```

### 6. Unclosed Braces

❌ **Wrong:**
```json
{
	"name": "John",
	"age": 30
```

✅ **Correct:**
```json
{
	"name": "John",
	"age": 30
}
```

## 🎯 Quick Validation Tips

### Before Pasting:
1. ✅ Check last field - no comma after it
2. ✅ All strings in double quotes
3. ✅ All keys in double quotes
4. ✅ Opening `{` and closing `}`
5. ✅ Commas between fields (but not after last one)

### Using the Tool:
1. Click "Paste JSON" button
2. Paste your JSON
3. Click "Validate" button first
4. If valid ✅, click "Apply"
5. If invalid ❌, fix the error shown

## 📝 Valid JSON Examples

### Simple Object
```json
{
	"name": "John Doe",
	"email": "john@example.com",
	"age": 30
}
```

### With Nested Values
```json
{
	"user": "John",
	"settings": "{\"theme\": \"dark\"}",
	"active": "true"
}
```

### With Numbers and Booleans
```json
{
	"name": "Product",
	"price": 29.99,
	"inStock": true,
	"quantity": 100
}
```

### With Special Characters
```json
{
	"description": "This is a \"quoted\" text",
	"path": "folder\\subfolder\\file.txt",
	"url": "https://example.com/path?param=value"
}
```

## 🔧 Tool Features

### Validate Button
- Click to check JSON without applying
- Shows detailed error messages
- Helps you fix issues before applying

### Error Messages
The tool now shows specific errors:
- "Remove trailing comma" - for comma before `}`
- "Must start with {" - missing opening brace
- "Must end with }" - missing closing brace
- Plus line numbers and specific issues from JSON parser

### Success Message
When valid, shows:
- ✅ Success message
- Number of fields found
- Ready to apply

## 💡 Pro Tips

1. **Use a JSON Validator First**
   - Online: jsonlint.com
   - Or use our "Validate" button

2. **Copy from Code Editors**
   - Most editors auto-format JSON correctly
   - VS Code, Sublime, etc.

3. **Remove Trailing Commas**
   - Most common issue
   - JSON doesn't allow them (unlike JavaScript)

4. **Use Double Quotes**
   - Single quotes don't work in JSON
   - Only double quotes are valid

5. **Check Brackets**
   - Every `{` needs a matching `}`
   - Every `[` needs a matching `]`

## 🎯 Your Specific JSON

For your use case:
```json
{
	"user_input": "Generate a banner image for upc 15561117128 for a summer event.",
	"product": "MARINA BACKGROUND 12IN GREEN PLANTS-BLACK 1FT",
	"keywords_csv_path": "accounts/psp/public_files/psp-keywords-v6.csv",
	"event_related_info": "summer",
	"segment": "my pet"
}
```

This will create 5 fields:
1. user_input
2. product  
3. keywords_csv_path
4. event_related_info
5. segment

All ready to use in your load test! 🚀

## 🐛 Still Having Issues?

1. Click "Validate" button - see exact error
2. Check console (F12) for detailed error
3. Copy-paste to jsonlint.com
4. Compare with examples above
5. Check for typos in your JSON

## ✨ Quick Fix Checklist

- [ ] No comma after last field
- [ ] All strings in double quotes `"`
- [ ] All keys in double quotes `"`
- [ ] Commas between fields
- [ ] Opening and closing braces
- [ ] No single quotes
- [ ] No trailing commas

---

**Remember:** The most common error is the trailing comma! Always remove it before the closing brace. ✅
