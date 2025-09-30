import asyncio
import aiohttp
import time
import json
import logging
import os
from typing import Optional, List, Dict, Any, Union
from dataclasses import dataclass, asdict
from datetime import datetime
import ssl
from enum import Enum
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
import uuid
import re

# Disable SSL verification for development
ssl._create_default_https_context = ssl._create_unverified_context

class ValidationType(str, Enum):
    EXISTS = "exists"
    NOT_EXISTS = "not_exists"
    VALUE_CHECK = "value_check"
    BOOLEAN_CHECK = "boolean_check"
    STATUS_CODE = "status_code"
    REGEX_MATCH = "regex_match"
    JSON_PATH = "json_path"

@dataclass
class ValidationRule:
    """Enhanced validation rule with multiple types"""
    type: ValidationType
    value: Any
    field_path: Optional[str] = None  # For JSON path validation
    description: Optional[str] = None

class LoadTestConfig(BaseModel):
    """Configuration for load test"""
    base_url: str = Field(..., description="Full API URL to test")
    http_method: str = Field(default="POST", description="HTTP method (GET, POST, PUT, DELETE, PATCH)")
    headers: Dict[str, str] = Field(default={}, description="Custom HTTP headers")
    body_type: str = Field(default="json", description="Request body type (json, form, raw)")
    request_body: Dict[str, Any] = Field(default={}, description="Request body as key-value pairs")
    raw_body: Optional[str] = Field(default=None, description="Raw request body (for raw body type)")
    concurrent_calls: int = Field(default=1, ge=1, le=1000, description="Number of simultaneous requests")
    sequential_batches: Optional[int] = Field(default=None, ge=1, le=100, description="Number of sequential batches")
    validation_rules: List[Dict[str, Any]] = Field(default=[], description="Array of validation rules")
    timeout: int = Field(default=30, ge=1, le=300, description="Request timeout in seconds")
    follow_redirects: bool = Field(default=True, description="Follow HTTP redirects")
    verify_ssl: bool = Field(default=False, description="Verify SSL certificates")

class LoadTestResult(BaseModel):
    """Store results of a single API call"""
    status: str
    response_time: float
    status_code: Optional[int] = None
    error_message: Optional[str] = None
    timestamp: datetime
    request_data: Optional[Dict[str, Any]] = None
    response_data: Optional[str] = None
    response_headers: Optional[Dict[str, str]] = None
    request_headers: Optional[Dict[str, str]] = None
    endpoint_url: Optional[str] = None
    validation_results: List[Dict[str, Any]] = []
    validation_passed: bool = True

class TestSession(BaseModel):
    """Test session information"""
    session_id: str
    config: LoadTestConfig
    status: str  # running, completed, failed
    start_time: datetime
    end_time: Optional[datetime] = None
    results: List[LoadTestResult] = []
    stats: Optional[Dict[str, Any]] = None

class ConnectionManager:
    """WebSocket connection manager for real-time updates"""
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                # Remove disconnected connections
                self.active_connections.remove(connection)

class EnhancedLoadTester:
    """Enhanced load testing utility with advanced validation"""
    
    def __init__(self, config: LoadTestConfig):
        self.config = config
        self.endpoint = config.base_url
        self.session_id = str(uuid.uuid4())
        self.log_directory = "logs"
        
        # Create logs directory if it doesn't exist
        os.makedirs(self.log_directory, exist_ok=True)
        
    def _get_headers(self) -> Dict[str, str]:
        """Generate request headers from config"""
        headers = {
            'User-Agent': 'Advanced-Load-Testing-Suite/2.0',
        }
        
        # Add custom headers from config
        if self.config.headers:
            headers.update(self.config.headers)
        
        # Add Content-Type based on body type
        if self.config.http_method in ['POST', 'PUT', 'PATCH']:
            if self.config.body_type == 'json' and 'Content-Type' not in headers:
                headers['Content-Type'] = 'application/json'
            elif self.config.body_type == 'form' and 'Content-Type' not in headers:
                headers['Content-Type'] = 'application/x-www-form-urlencoded'
        
        return headers
    
    def _validate_response(self, response_data: str, status_code: int) -> List[Dict[str, Any]]:
        """Enhanced validation with multiple rule types"""
        validation_results = []
        
        for rule_dict in self.config.validation_rules:
            rule = ValidationRule(**rule_dict)
            result = {
                "rule": rule_dict,
                "passed": False,
                "message": "",
                "actual_value": None
            }
            
            try:
                if rule.type == ValidationType.EXISTS:
                    if str(rule.value) in response_data:
                        result["passed"] = True
                        result["message"] = f"String '{rule.value}' found in response"
                    else:
                        result["message"] = f"String '{rule.value}' not found in response"
                
                elif rule.type == ValidationType.NOT_EXISTS:
                    if str(rule.value) not in response_data:
                        result["passed"] = True
                        result["message"] = f"String '{rule.value}' correctly not found in response"
                    else:
                        result["message"] = f"String '{rule.value}' unexpectedly found in response"
                
                elif rule.type == ValidationType.STATUS_CODE:
                    result["actual_value"] = status_code
                    if status_code == rule.value:
                        result["passed"] = True
                        result["message"] = f"Status code matches expected {rule.value}"
                    else:
                        result["message"] = f"Status code {status_code} does not match expected {rule.value}"
                
                elif rule.type == ValidationType.REGEX_MATCH:
                    pattern = re.compile(str(rule.value))
                    matches = pattern.findall(response_data)
                    result["actual_value"] = matches
                    if matches:
                        result["passed"] = True
                        result["message"] = f"Regex pattern '{rule.value}' matched {len(matches)} times"
                    else:
                        result["message"] = f"Regex pattern '{rule.value}' did not match"
                
                elif rule.type == ValidationType.JSON_PATH:
                    try:
                        response_json = json.loads(response_data)
                        # Simple JSON path implementation
                        path_parts = rule.field_path.split('.')
                        current = response_json
                        for part in path_parts:
                            if isinstance(current, dict) and part in current:
                                current = current[part]
                            elif isinstance(current, list) and part.isdigit():
                                current = current[int(part)]
                            else:
                                raise KeyError(f"Path not found: {part}")
                        
                        result["actual_value"] = current
                        if current == rule.value:
                            result["passed"] = True
                            result["message"] = f"JSON path '{rule.field_path}' value matches expected"
                        else:
                            result["message"] = f"JSON path '{rule.field_path}' value {current} does not match expected {rule.value}"
                    except (json.JSONDecodeError, KeyError, TypeError) as e:
                        result["message"] = f"JSON path validation failed: {str(e)}"
                
                elif rule.type == ValidationType.BOOLEAN_CHECK:
                    # Check if response contains truthy/falsy values
                    lower_response = response_data.lower()
                    if rule.value:
                        # Expecting truthy
                        if any(word in lower_response for word in ['true', 'success', 'yes', 'ok']):
                            result["passed"] = True
                            result["message"] = "Response contains truthy value as expected"
                        else:
                            result["message"] = "Response does not contain expected truthy value"
                    else:
                        # Expecting falsy
                        if any(word in lower_response for word in ['false', 'error', 'no', 'fail']):
                            result["passed"] = True
                            result["message"] = "Response contains falsy value as expected"
                        else:
                            result["message"] = "Response does not contain expected falsy value"
                
                elif rule.type == ValidationType.VALUE_CHECK:
                    if str(rule.value) == response_data.strip():
                        result["passed"] = True
                        result["message"] = f"Response exactly matches expected value"
                    else:
                        result["message"] = f"Response does not exactly match expected value '{rule.value}'"
                        result["actual_value"] = response_data[:100] + "..." if len(response_data) > 100 else response_data
                
            except Exception as e:
                result["message"] = f"Validation error: {str(e)}"
            
            validation_results.append(result)
        
        return validation_results
    
    async def _make_single_request(
        self,
        session: aiohttp.ClientSession,
        request_num: int,
        websocket_manager: Optional[ConnectionManager] = None
    ) -> LoadTestResult:
        """Make a single API request with enhanced validation"""
        
        start_time = time.time()
        timestamp = datetime.now()
        
        request_headers = self._get_headers()
        request_data = self.config.request_body
        
        # Prepare request body based on body type
        request_kwargs = {
            'headers': request_headers,
            'timeout': aiohttp.ClientTimeout(total=self.config.timeout),
            'allow_redirects': self.config.follow_redirects
        }
        
        if self.config.http_method in ['POST', 'PUT', 'PATCH']:
            if self.config.body_type == 'json':
                request_kwargs['json'] = self.config.request_body
            elif self.config.body_type == 'form':
                form_data = aiohttp.FormData()
                for key, value in self.config.request_body.items():
                    form_data.add_field(str(key), str(value))
                request_kwargs['data'] = form_data
            elif self.config.body_type == 'raw' and self.config.raw_body:
                request_kwargs['data'] = self.config.raw_body
        
        try:
            # Make HTTP request with appropriate method
            async with session.request(
                method=self.config.http_method,
                url=self.endpoint,
                **request_kwargs
            ) as response:
                # Collect streaming response data
                full_response = ""
                async for chunk in response.content.iter_chunked(1024):
                    if chunk:
                        chunk_text = chunk.decode('utf-8', errors='ignore')
                        full_response += chunk_text
                
                response_time = time.time() - start_time
                response_headers = dict(response.headers)
                
                # Perform enhanced validation
                validation_results = self._validate_response(
                    full_response, response.status
                )
                
                # Determine overall validation status
                validation_passed = all(result["passed"] for result in validation_results) if validation_results else True
                final_status = 'success' if response.status == 200 and validation_passed else 'error'
                
                result = LoadTestResult(
                    status=final_status,
                    response_time=response_time,
                    status_code=response.status,
                    timestamp=timestamp,
                    request_data=request_data,
                    response_data=full_response,
                    response_headers=response_headers,
                    request_headers=request_headers,
                    endpoint_url=self.endpoint,
                    validation_results=validation_results,
                    validation_passed=validation_passed
                )
                
                # Send real-time update via WebSocket
                if websocket_manager:
                    await websocket_manager.broadcast(json.dumps({
                        "type": "request_completed",
                        "request_num": request_num + 1,
                        "status": final_status,
                        "response_time": response_time,
                        "validation_passed": validation_passed
                    }))
                
                return result
                
        except Exception as e:
            response_time = time.time() - start_time
            result = LoadTestResult(
                status='error',
                response_time=response_time,
                error_message=str(e),
                timestamp=timestamp,
                request_data=request_data,
                request_headers=request_headers,
                endpoint_url=self.endpoint,
                validation_results=[],
                validation_passed=False
            )
            
            # Send error update via WebSocket
            if websocket_manager:
                await websocket_manager.broadcast(json.dumps({
                    "type": "request_error",
                    "request_num": request_num + 1,
                    "error": str(e),
                    "response_time": response_time
                }))
            
            return result
    
    async def run_load_test(self, websocket_manager: Optional[ConnectionManager] = None) -> TestSession:
        """Run enhanced load test"""
        test_session = TestSession(
            session_id=self.session_id,
            config=self.config,
            status="running",
            start_time=datetime.now()
        )
        
        try:
            # Create SSL context based on configuration
            if not self.config.verify_ssl:
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
                connector = aiohttp.TCPConnector(ssl=ssl_context)
            else:
                connector = aiohttp.TCPConnector()
            
            all_results = []
            test_start_time = time.time()
            
            # Send start notification
            if websocket_manager:
                await websocket_manager.broadcast(json.dumps({
                    "type": "test_started",
                    "session_id": self.session_id,
                    "total_requests": self.config.concurrent_calls * (self.config.sequential_batches or 1)
                }))
            
            async with aiohttp.ClientSession(connector=connector) as session:
                if self.config.sequential_batches:
                    # Run multiple sequential batches
                    for batch_num in range(self.config.sequential_batches):
                        if websocket_manager:
                            await websocket_manager.broadcast(json.dumps({
                                "type": "batch_started",
                                "batch_num": batch_num + 1,
                                "total_batches": self.config.sequential_batches
                            }))
                        
                        tasks = [
                            self._make_single_request(session, i + (batch_num * self.config.concurrent_calls), websocket_manager)
                            for i in range(self.config.concurrent_calls)
                        ]
                        batch_results = await asyncio.gather(*tasks)
                        all_results.extend(batch_results)
                else:
                    # Run single batch
                    tasks = [
                        self._make_single_request(session, i, websocket_manager)
                        for i in range(self.config.concurrent_calls)
                    ]
                    all_results = await asyncio.gather(*tasks)
            
            total_test_time = time.time() - test_start_time
            
            # Calculate statistics
            successful_requests = [r for r in all_results if r.status == 'success']
            failed_requests = [r for r in all_results if r.status == 'error']
            response_times = [r.response_time for r in all_results]
            successful_times = [r.response_time for r in successful_requests]
            
            stats = {
                'total_requests': len(all_results),
                'successful_requests': len(successful_requests),
                'failed_requests': len(failed_requests),
                'success_rate': len(successful_requests) / len(all_results) * 100 if all_results else 0,
                'total_test_duration': total_test_time,
                'avg_response_time': sum(response_times) / len(response_times) if response_times else 0,
                'min_response_time': min(response_times) if response_times else 0,
                'max_response_time': max(response_times) if response_times else 0,
                'avg_successful_response_time': sum(successful_times) / len(successful_times) if successful_times else 0,
                'requests_per_second': len(all_results) / total_test_time if total_test_time > 0 else 0,
            }
            
            test_session.results = all_results
            test_session.stats = stats
            test_session.status = "completed"
            test_session.end_time = datetime.now()
            
            # Send completion notification
            if websocket_manager:
                await websocket_manager.broadcast(json.dumps({
                    "type": "test_completed",
                    "session_id": self.session_id,
                    "stats": stats
                }))
            
            # Save results to file
            self._save_results(test_session)
            
            return test_session
            
        except Exception as e:
            test_session.status = "failed"
            test_session.end_time = datetime.now()
            
            if websocket_manager:
                await websocket_manager.broadcast(json.dumps({
                    "type": "test_failed",
                    "session_id": self.session_id,
                    "error": str(e)
                }))
            
            raise HTTPException(status_code=500, detail=f"Load test failed: {str(e)}")
    
    def _save_results(self, test_session: TestSession):
        """Save test results to file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Convert to serializable format
        session_dict = test_session.dict()
        
        # Save detailed results
        results_file = os.path.join(self.log_directory, f"load_test_{timestamp}.json")
        with open(results_file, 'w') as f:
            json.dump(session_dict, f, indent=2, default=str)
        
        # Save summary
        summary_file = os.path.join(self.log_directory, f"summary_{timestamp}.json")
        summary = {
            "session_id": test_session.session_id,
            "timestamp": timestamp,
            "config": session_dict["config"],
            "stats": session_dict["stats"],
            "status": test_session.status
        }
        with open(summary_file, 'w') as f:
            json.dump(summary, f, indent=2, default=str)

# FastAPI app initialization
app = FastAPI(
    title="Advanced Load Testing Suite",
    description="A comprehensive load testing application with futuristic UI and advanced validation capabilities",
    version="2.0.0"
)

# WebSocket connection manager
manager = ConnectionManager()

# Store active test sessions
active_sessions: Dict[str, TestSession] = {}

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_root():
    """Serve the main UI"""
    with open("static/index.html", "r") as f:
        return HTMLResponse(content=f.read())

@app.post("/api/test/start")
async def start_load_test(config: LoadTestConfig):
    """Start a new load test"""
    try:
        tester = EnhancedLoadTester(config)
        
        # Run test in background
        test_session = await tester.run_load_test(manager)
        active_sessions[test_session.session_id] = test_session
        
        return {
            "session_id": test_session.session_id,
            "status": test_session.status,
            "message": "Load test completed successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/test/{session_id}")
async def get_test_results(session_id: str):
    """Get test results by session ID"""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Test session not found")
    
    return active_sessions[session_id]

@app.get("/api/test/history")
async def get_test_history():
    """Get list of all test sessions"""
    log_files = []
    if os.path.exists("logs"):
        for filename in os.listdir("logs"):
            if filename.startswith("summary_") and filename.endswith(".json"):
                try:
                    with open(os.path.join("logs", filename), "r") as f:
                        summary = json.load(f)
                        log_files.append(summary)
                except (IOError, json.JSONDecodeError):
                    continue
    
    return {"sessions": sorted(log_files, key=lambda x: x.get("timestamp", ""), reverse=True)}

@app.post("/api/config/save")
async def save_config(config: Dict[str, Any]):
    """Save or update configuration to backend"""
    try:
        config_dir = "configs"
        os.makedirs(config_dir, exist_ok=True)
        
        config_id = config.get("id")
        config_name = config.get("name", f"config_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        
        # Check for duplicate names (only if creating new)
        if not config_id:
            for filename in os.listdir(config_dir):
                if filename.endswith('.json'):
                    filepath = os.path.join(config_dir, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            existing_config = json.load(f)
                            if existing_config.get("name", "").lower() == config_name.lower():
                                raise HTTPException(
                                    status_code=400, 
                                    detail="Configuration name already exists"
                                )
                    except json.JSONDecodeError:
                        continue
        
        # If updating, find and use existing file
        if config_id:
            # Find existing file with this ID
            for filename in os.listdir(config_dir):
                if filename.endswith('.json'):
                    filepath = os.path.join(config_dir, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            existing_config = json.load(f)
                            if existing_config.get("id") == config_id:
                                # Update existing config
                                config["saved_at"] = datetime.now().isoformat()
                                config["created_at"] = existing_config.get("created_at", datetime.now().isoformat())
                                
                                # Use new filename if name changed
                                new_filename = f"{config_name.replace(' ', '_')}.json"
                                new_filepath = os.path.join(config_dir, new_filename)
                                
                                with open(new_filepath, 'w', encoding='utf-8') as f:
                                    json.dump(config, f, indent=2, default=str)
                                
                                # Remove old file if name changed
                                if new_filepath != filepath:
                                    os.remove(filepath)
                                
                                return {"status": "success", "filename": new_filename, "id": config_id}
                    except json.JSONDecodeError:
                        continue
        
        # Create new config
        filename = f"{config_name.replace(' ', '_')}.json"
        filepath = os.path.join(config_dir, filename)
        
        # Add metadata
        config["saved_at"] = datetime.now().isoformat()
        config["created_at"] = datetime.now().isoformat()
        config["id"] = str(uuid.uuid4())
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, default=str)
        
        return {"status": "success", "filename": filename, "id": config["id"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save config: {str(e)}")

@app.get("/api/config/list")
async def list_configs():
    """List all saved configurations"""
    try:
        config_dir = "configs"
        if not os.path.exists(config_dir):
            return {"configs": []}
        
        configs = []
        for filename in os.listdir(config_dir):
            if filename.endswith('.json'):
                try:
                    filepath = os.path.join(config_dir, filename)
                    with open(filepath, 'r', encoding='utf-8') as f:
                        config = json.load(f)
                        configs.append({
                            "id": config.get("id", filename),
                            "name": config.get("name", filename.replace('.json', '')),
                            "saved_at": config.get("saved_at", ""),
                            "filename": filename
                        })
                except Exception as e:
                    print(f"Error reading {filename}: {e}")
                    continue
        
        # Sort by saved_at descending
        configs.sort(key=lambda x: x.get("saved_at", ""), reverse=True)
        return {"configs": configs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list configs: {str(e)}")

@app.get("/api/config/{config_id}")
async def get_config(config_id: str):
    """Get a specific configuration"""
    try:
        config_dir = "configs"
        
        # Find config by ID or filename
        for filename in os.listdir(config_dir):
            if filename.endswith('.json'):
                filepath = os.path.join(config_dir, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    if config.get("id") == config_id or filename == config_id:
                        return config
        
        raise HTTPException(status_code=404, detail="Config not found")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Config not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load config: {str(e)}")

@app.delete("/api/config/{config_id}")
async def delete_config(config_id: str):
    """Delete a configuration"""
    try:
        config_dir = "configs"
        
        for filename in os.listdir(config_dir):
            if filename.endswith('.json'):
                filepath = os.path.join(config_dir, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    if config.get("id") == config_id or filename == config_id:
                        os.remove(filepath)
                        return {"status": "success", "message": "Config deleted"}
        
        raise HTTPException(status_code=404, detail="Config not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete config: {str(e)}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back for connection testing
            await manager.send_personal_message(f"Message received: {data}", websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/validation-types")
async def get_validation_types():
    """Get available validation types"""
    return {
        "types": [
            {
                "value": "exists",
                "label": "String Exists",
                "description": "Check if a string exists in the response",
                "requires_value": True,
                "requires_field_path": False
            },
            {
                "value": "not_exists",
                "label": "String Does Not Exist",
                "description": "Check if a string does not exist in the response",
                "requires_value": True,
                "requires_field_path": False
            },
            {
                "value": "status_code",
                "label": "Status Code Check",
                "description": "Validate HTTP status code",
                "requires_value": True,
                "requires_field_path": False
            },
            {
                "value": "regex_match",
                "label": "Regex Pattern Match",
                "description": "Check if response matches a regex pattern",
                "requires_value": True,
                "requires_field_path": False
            },
            {
                "value": "json_path",
                "label": "JSON Path Value",
                "description": "Validate value at specific JSON path",
                "requires_value": True,
                "requires_field_path": True
            },
            {
                "value": "boolean_check",
                "label": "Boolean Check",
                "description": "Check for truthy/falsy values in response",
                "requires_value": True,
                "requires_field_path": False
            },
            {
                "value": "value_check",
                "label": "Exact Value Match",
                "description": "Check if response exactly matches expected value",
                "requires_value": True,
                "requires_field_path": False
            }
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
