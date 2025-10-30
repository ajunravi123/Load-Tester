import asyncio
import aiohttp
import time
import json
import logging
import os
import random
from typing import Optional, List, Dict, Any, Union
from dataclasses import dataclass, asdict
from datetime import datetime
import ssl
from enum import Enum
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request, Response, Depends, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uuid
import re
import jwt
from datetime import datetime, timedelta
import aiofiles
import aiofiles.os

# Disable SSL verification for development
ssl._create_default_https_context = ssl._create_unverified_context

# JWT Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key-change-in-production-2024")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 14

# HTTP Bearer token security
security = HTTPBearer()

# Async File I/O Helper Functions
async def async_read_json(filepath: str, default: Any = None) -> Any:
    """Async read JSON file"""
    try:
        async with aiofiles.open(filepath, 'r', encoding='utf-8') as f:
            content = await f.read()
            return json.loads(content)
    except FileNotFoundError:
        return default
    except json.JSONDecodeError:
        return default

async def async_write_json(filepath: str, data: Any) -> None:
    """Async write JSON file"""
    async with aiofiles.open(filepath, 'w', encoding='utf-8') as f:
        await f.write(json.dumps(data, indent=2, default=str))

async def async_read_text(filepath: str) -> str:
    """Async read text file"""
    async with aiofiles.open(filepath, 'r', encoding='utf-8') as f:
        return await f.read()

async def async_file_exists(filepath: str) -> bool:
    """Check if file exists asynchronously"""
    try:
        await aiofiles.os.stat(filepath)
        return True
    except FileNotFoundError:
        return False

async def async_remove_file(filepath: str) -> None:
    """Async remove file"""
    await aiofiles.os.remove(filepath)

async def async_rename_file(old_path: str, new_path: str) -> None:
    """Async rename/move file"""
    await aiofiles.os.rename(old_path, new_path)

async def async_listdir(directory: str) -> List[str]:
    """Async list directory contents"""
    return await aiofiles.os.listdir(directory)

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

class LoginRequest(BaseModel):
    """Login request model"""
    username: str
    password: str

class LoadTestConfig(BaseModel):
    """Configuration for load test"""
    base_url: str = Field(..., description="Full API URL to test")
    http_method: str = Field(default="POST", description="HTTP method (GET, POST, PUT, DELETE, PATCH)")
    headers: Dict[str, str] = Field(default={}, description="Custom HTTP headers")
    body_type: str = Field(default="json", description="Request body type (json, form, raw)")
    request_body: Dict[str, Any] = Field(default={}, description="Request body as key-value pairs")
    body_fields_config: List[Dict[str, Any]] = Field(default=[], description="Body fields configuration with random value support")
    raw_body: Optional[str] = Field(default=None, description="Raw request body (for raw body type)")
    concurrent_calls: int = Field(default=1, ge=1, le=1000, description="Number of simultaneous requests")
    sequential_batches: Optional[int] = Field(default=None, ge=1, le=100, description="Number of sequential batches")
    validation_rules: List[Dict[str, Any]] = Field(default=[], description="Array of validation rules")
    timeout: int = Field(default=600, ge=1, le=1800, description="Request timeout in seconds")
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
    """WebSocket connection manager for real-time updates with session isolation"""
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}  # connection_id -> websocket
        self.session_connections: Dict[str, str] = {}  # session_id -> connection_id

    async def connect(self, websocket: WebSocket, connection_id: str):
        await websocket.accept()
        self.active_connections[connection_id] = websocket
        print(f"WebSocket connected: {connection_id}")

    def disconnect(self, connection_id: str):
        if connection_id in self.active_connections:
            del self.active_connections[connection_id]
        # Clean up session associations
        sessions_to_remove = [sid for sid, cid in self.session_connections.items() if cid == connection_id]
        for sid in sessions_to_remove:
            del self.session_connections[sid]
        print(f"WebSocket disconnected: {connection_id}")

    def associate_session(self, session_id: str, connection_id: str):
        """Associate a test session with a specific WebSocket connection"""
        self.session_connections[session_id] = connection_id
        print(f"Session {session_id} associated with connection {connection_id}")

    async def send_personal_message(self, message: str, connection_id: str):
        """Send message to a specific connection"""
        if connection_id in self.active_connections:
            websocket = self.active_connections[connection_id]
            await websocket.send_text(message)

    async def send_to_session(self, message: str, session_id: str):
        """Send message only to the connection that owns this session"""
        try:
            msg_data = json.loads(message)
            msg_type = msg_data.get('type', 'unknown')
            
            # Find the connection associated with this session
            connection_id = self.session_connections.get(session_id)
            
            if connection_id and connection_id in self.active_connections:
                websocket = self.active_connections[connection_id]
                print(f"Sending {msg_type} for session {session_id} to connection {connection_id}")
                await websocket.send_text(message)
            else:
                print(f"No active connection found for session {session_id}")
        except Exception as e:
            print(f"Error sending to session {session_id}: {e}")

    async def broadcast(self, message: str):
        """Broadcast to all connections (use sparingly, prefer send_to_session)"""
        try:
            msg_data = json.loads(message)
            print(f"Broadcasting: {msg_data.get('type')} to {len(self.active_connections)} clients")
        except:
            pass
        
        disconnected = []
        for connection_id, websocket in self.active_connections.items():
            try:
                await websocket.send_text(message)
            except Exception as e:
                print(f"Error sending to client {connection_id}: {e}")
                disconnected.append(connection_id)
        
        # Clean up disconnected connections
        for connection_id in disconnected:
            self.disconnect(connection_id)

class EnhancedLoadTester:
    """Enhanced load testing utility with advanced validation"""
    
    def __init__(self, config: LoadTestConfig):
        self.config = config
        self.endpoint = config.base_url
        self.session_id = str(uuid.uuid4())
        self.log_directory = "logs"
        self.load_test_directory = os.path.join(self.log_directory, "load_test")
        self.summary_directory = os.path.join(self.log_directory, "summary")
        self.is_cancelled = False  # Flag to track cancellation
        
        # Create directories if they don't exist
        os.makedirs(self.load_test_directory, exist_ok=True)
        os.makedirs(self.summary_directory, exist_ok=True)
    
    def cancel(self):
        """Cancel the running test"""
        self.is_cancelled = True
        
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
    
    def _generate_random_body(self) -> Dict[str, Any]:
        """Generate request body with random values where specified"""
        if not self.config.body_fields_config:
            # If no body_fields_config, use the regular request_body
            return self.config.request_body.copy() if self.config.request_body else {}
        
        body = {}
        for field in self.config.body_fields_config:
            key = field.get('key')
            value = field.get('value')
            is_random = field.get('isRandom', False)
            
            if not key:
                continue
            
            if is_random and value:
                # Try to parse value as JSON array
                try:
                    values_array = json.loads(value) if isinstance(value, str) else value
                    if isinstance(values_array, list) and len(values_array) > 0:
                        # Randomly select one value from the array
                        body[key] = random.choice(values_array)
                    else:
                        # If not a valid array, use the value as-is
                        body[key] = value
                except (json.JSONDecodeError, TypeError):
                    # If JSON parsing fails, use the value as-is
                    body[key] = value
            else:
                # Not random, use the value directly
                body[key] = value
        
        return body
    
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
        # Generate request body with random values if configured
        request_data = self._generate_random_body()
        
        # Prepare request body based on body type
        request_kwargs = {
            'headers': request_headers,
            'timeout': aiohttp.ClientTimeout(total=self.config.timeout),
            'allow_redirects': self.config.follow_redirects
        }
        
        if self.config.http_method in ['POST', 'PUT', 'PATCH']:
            if self.config.body_type == 'json':
                request_kwargs['json'] = request_data
            elif self.config.body_type == 'form':
                form_data = aiohttp.FormData()
                for key, value in request_data.items():
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
                
                # Send real-time update via WebSocket with complete result data
                if websocket_manager:
                    await websocket_manager.send_to_session(json.dumps({
                        "type": "request_completed",
                        "session_id": self.session_id,
                        "request_num": request_num + 1,
                        "status": final_status,
                        "response_time": response_time,
                        "status_code": response.status,
                        "validation_passed": validation_passed,
                        "validation_results": validation_results,
                        "error_message": None,
                        "request_data": request_data,
                        "response_data": full_response[:10000] if full_response else None,  # Limit size for WebSocket (10KB)
                        "request_headers": request_headers,
                        "response_headers": response_headers,
                        "endpoint_url": self.endpoint
                    }, default=str), self.session_id)  # Handle datetime serialization
                
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
            
            # Send error update via WebSocket with complete result data
            if websocket_manager:
                await websocket_manager.send_to_session(json.dumps({
                    "type": "request_completed",  # Use same type for consistency
                    "session_id": self.session_id,
                    "request_num": request_num + 1,
                    "status": "error",
                    "response_time": response_time,
                    "status_code": None,
                    "validation_passed": False,
                    "validation_results": [],
                    "error_message": str(e),
                    "request_data": request_data,
                    "response_data": None,
                    "request_headers": request_headers,
                    "response_headers": None,
                    "endpoint_url": self.endpoint
                }, default=str), self.session_id)
            
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
                await websocket_manager.send_to_session(json.dumps({
                    "type": "test_started",
                    "session_id": self.session_id,
                    "total_requests": self.config.concurrent_calls * (self.config.sequential_batches or 1)
                }), self.session_id)
            
            async with aiohttp.ClientSession(connector=connector) as session:
                if self.config.sequential_batches:
                    # Run multiple sequential batches
                    for batch_num in range(self.config.sequential_batches):
                        # Check for cancellation before each batch
                        if self.is_cancelled:
                            break
                        
                        if websocket_manager:
                            await websocket_manager.send_to_session(json.dumps({
                                "type": "batch_started",
                                "session_id": self.session_id,
                                "batch_num": batch_num + 1,
                                "total_batches": self.config.sequential_batches
                            }), self.session_id)
                        
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
            test_session.status = "cancelled" if self.is_cancelled else "completed"
            test_session.end_time = datetime.now()
            
            # Send completion/cancellation notification
            if websocket_manager:
                if self.is_cancelled:
                    await websocket_manager.send_to_session(json.dumps({
                        "type": "test_cancelled",
                        "session_id": self.session_id,
                        "stats": stats,
                        "completed_requests": len(all_results)
                    }), self.session_id)
                else:
                    await websocket_manager.send_to_session(json.dumps({
                        "type": "test_completed",
                        "session_id": self.session_id,
                        "stats": stats
                    }), self.session_id)
            
            # Save results to file
            await self._save_results(test_session)
            
            return test_session
            
        except Exception as e:
            test_session.status = "failed"
            test_session.end_time = datetime.now()
            
            if websocket_manager:
                await websocket_manager.send_to_session(json.dumps({
                    "type": "test_failed",
                    "session_id": self.session_id,
                    "error": str(e)
                }), self.session_id)
            
            raise HTTPException(status_code=500, detail=f"Load test failed: {str(e)}")
    
    async def _save_results(self, test_session: TestSession):
        """Save test results to file (async)"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Convert to serializable format
        session_dict = test_session.dict()
        
        # Save detailed results to load_test folder
        results_file = os.path.join(self.load_test_directory, f"load_test_{timestamp}.json")
        await async_write_json(results_file, session_dict)
        
        # Save summary to summary folder
        summary_file = os.path.join(self.summary_directory, f"summary_{timestamp}.json")
        summary = {
            "session_id": test_session.session_id,
            "timestamp": timestamp,
            "config": session_dict["config"],
            "stats": session_dict["stats"],
            "status": test_session.status
        }
        await async_write_json(summary_file, summary)

# Utility Functions
def migrate_log_files():
    """Migrate existing log files to new folder structure"""
    logs_dir = "logs"
    load_test_dir = os.path.join(logs_dir, "load_test")
    summary_dir = os.path.join(logs_dir, "summary")
    
    # Create directories if they don't exist
    os.makedirs(load_test_dir, exist_ok=True)
    os.makedirs(summary_dir, exist_ok=True)
    
    if not os.path.exists(logs_dir):
        return
    
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
                    os.rename(old_path, new_path)
                    print(f"Moved {filename} to load_test folder")
                except Exception as e:
                    print(f"Error moving {filename}: {e}")
        elif filename.startswith("summary_"):
            new_path = os.path.join(summary_dir, filename)
            if not os.path.exists(new_path):
                try:
                    os.rename(old_path, new_path)
                    print(f"Moved {filename} to summary folder")
                except Exception as e:
                    print(f"Error moving {filename}: {e}")

# Tenant Management Functions
async def load_tenants():
    """Load tenants from JSON file (async)"""
    data = await async_read_json('tenants.json', default={})
    return data.get('tenants', [])

async def save_tenants(tenants):
    """Save tenants to JSON file (async)"""
    await async_write_json('tenants.json', {'tenants': tenants})

async def get_tenant_by_id(tenant_id: str):
    """Get tenant by ID (async)"""
    tenants = await load_tenants()
    for tenant in tenants:
        if tenant['id'] == tenant_id:
            return tenant
    return None

# Authentication Functions
async def load_users():
    """Load users from JSON file (async)"""
    data = await async_read_json('users.json', default={})
    return data.get('users', [])

async def save_users(users):
    """Save users to JSON file (async)"""
    await async_write_json('users.json', {'users': users})

async def authenticate_user(username: str, password: str, tenant_id: str = None):
    """Authenticate user credentials - supports multiple tenants (async)"""
    users = await load_users()
    matching_users = []
    
    for user in users:
        if user['username'] == username and user['password'] == password and user.get('status') == 'active':
            # Support both tenant_id and tenant_ids
            user_tenant_ids = user.get('tenant_ids', [])
            if not user_tenant_ids and user.get('tenant_id'):
                user_tenant_ids = [user.get('tenant_id')]
            
            # If tenant_id specified, check if user has access to it
            if tenant_id:
                if tenant_id in user_tenant_ids or user.get('tenant_id') == tenant_id:
                    return user
            else:
                matching_users.append(user)
    
    # If only one match and no tenant_id specified, return it
    if len(matching_users) == 1:
        return matching_users[0]
    
    # If multiple matches, return all (caller will handle)
    if len(matching_users) > 1:
        return matching_users
    
    return None

def create_token(username: str, name: str, tenant_id: str = None, role: str = 'user'):
    """Create JWT token"""
    expiration = datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS)
    payload = {
        'username': username,
        'name': name,
        'tenant_id': tenant_id,
        'role': role,
        'exp': expiration
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def optional_verify_token(request: Request):
    """Optional token verification for redirects"""
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    try:
        token = auth_header.split(' ')[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except:
        return None

# FastAPI app initialization
app = FastAPI(
    title="LoadLion - Hunt down performance bottlenecks",
    description="A powerful load testing application to hunt down performance bottlenecks with advanced validation capabilities",
    version="2.0.0"
)

# WebSocket connection manager
manager = ConnectionManager()

# Store active test sessions
active_sessions: Dict[str, TestSession] = {}

# Store active test runners for cancellation
active_testers: Dict[str, EnhancedLoadTester] = {}

# Startup event to migrate existing log files
@app.on_event("startup")
async def startup_event():
    """Run migrations on startup"""
    migrate_log_files()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/login", response_class=HTMLResponse)
async def login_page():
    """Serve the login page (async)"""
    content = await async_read_text("static/login.html")
    return HTMLResponse(content=content)

class ConfigListRequest(BaseModel):
    """Request model for listing configs by tenant"""
    tenant_id: Optional[str] = None

class LoginWithTenantRequest(BaseModel):
    """Login request with optional tenant selection"""
    username: str
    password: str
    tenant_id: Optional[str] = None

@app.post("/api/login")
async def login(login_request: LoginWithTenantRequest):
    """Authenticate user and return JWT token - supports multi-tenant"""
    result = await authenticate_user(login_request.username, login_request.password, login_request.tenant_id)
    
    if not result:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Check if multiple tenants found (list returned)
    if isinstance(result, list):
        # Return available tenants for user to choose
        tenants_info = []
        tenants = await load_tenants()
        for user in result:
            # Support both tenant_id and tenant_ids
            user_tenant_ids = user.get('tenant_ids', [])
            if not user_tenant_ids and user.get('tenant_id'):
                user_tenant_ids = [user.get('tenant_id')]
            
            for tenant_id in user_tenant_ids:
                tenant = next((t for t in tenants if t['id'] == tenant_id), None)
                tenants_info.append({
                    "tenant_id": tenant_id,
                    "tenant_name": tenant['name'] if tenant else tenant_id,
                    "role": user.get('role', 'user')
                })
        
        return {
            "multiple_tenants": True,
            "tenants": tenants_info
        }
    
    # Single user found
    user = result
    
    # Support both tenant_id and tenant_ids
    user_tenant_ids = user.get('tenant_ids', [])
    if not user_tenant_ids and user.get('tenant_id'):
        user_tenant_ids = [user.get('tenant_id')]
    
    # If user has multiple tenants AND no specific tenant was requested, return tenant selection
    if len(user_tenant_ids) > 1 and not login_request.tenant_id:
        # Return tenant selection
        tenants = await load_tenants()
        tenants_info = []
        for tenant_id in user_tenant_ids:
            tenant = next((t for t in tenants if t['id'] == tenant_id), None)
            tenants_info.append({
                "tenant_id": tenant_id,
                "tenant_name": tenant['name'] if tenant else tenant_id,
                "role": user.get('role', 'user')
            })
        
        return {
            "multiple_tenants": True,
            "tenants": tenants_info
        }
    
    # Use the requested tenant_id if provided, otherwise use first available or None
    if login_request.tenant_id:
        tenant_id = login_request.tenant_id
    else:
        tenant_id = user_tenant_ids[0] if user_tenant_ids else None
    tenant = await get_tenant_by_id(tenant_id) if tenant_id else None
    tenant_name = tenant['name'] if tenant else 'Unknown'
    
    token = create_token(
        user['username'], 
        user['name'],
        tenant_id,
        user.get('role', 'user')
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user['username'],
        "name": user['name'],
        "role": user.get('role', 'user'),
        "tenant_id": tenant_id,
        "tenant_name": tenant_name,
        "expires_in": JWT_EXPIRATION_DAYS * 24 * 60 * 60  # seconds
    }

@app.post("/api/logout")
async def logout(user: dict = Depends(verify_token)):
    """Logout endpoint (token invalidation handled client-side)"""
    return {"message": "Logged out successfully"}

@app.get("/api/user/tenants")
async def get_user_tenants(user: dict = Depends(verify_token)):
    """Get all tenants available for the current user - super_admin gets all tenants"""
    username = user.get('username')
    current_tenant_id = user.get('tenant_id')
    
    # Load all tenants
    tenants = await load_tenants()
    
    # Super admin gets all tenants
    if is_super_admin(user):
        available_tenants = []
        for tenant in tenants:
            available_tenants.append({
                "tenant_id": tenant['id'],
                "tenant_name": tenant['name'],
                "role": "super_admin",
                "is_current": tenant['id'] == current_tenant_id
            })
        
        return {
            "tenants": available_tenants,
            "current_tenant_id": current_tenant_id
        }
    
    # Regular users - find their assigned tenants
    users = await load_users()
    user_accounts = [u for u in users if u['username'] == username and u.get('status') == 'active']
    
    available_tenants = []
    
    for user_account in user_accounts:
        # Support both tenant_id and tenant_ids
        user_tenant_ids = user_account.get('tenant_ids', [])
        if not user_tenant_ids and user_account.get('tenant_id'):
            user_tenant_ids = [user_account.get('tenant_id')]
        
        for tenant_id in user_tenant_ids:
            tenant = next((t for t in tenants if t['id'] == tenant_id), None)
            
            available_tenants.append({
                "tenant_id": tenant_id,
                "tenant_name": tenant['name'] if tenant else tenant_id or 'Unknown',
                "role": user_account.get('role', 'user'),
                "is_current": tenant_id == current_tenant_id
            })
    
    return {
        "tenants": available_tenants,
        "current_tenant_id": current_tenant_id
    }

@app.post("/api/user/switch-tenant")
async def switch_tenant(request: Dict[str, str], user: dict = Depends(verify_token)):
    """Switch to a different tenant without re-authentication - super_admin can switch to any tenant"""
    target_tenant_id = request.get('tenant_id')
    username = user.get('username')
    
    if not target_tenant_id:
        raise HTTPException(status_code=400, detail="Tenant ID is required")
    
    # Super admin can switch to any tenant
    if is_super_admin(user):
        # Verify tenant exists
        tenants = await load_tenants()
        tenant_exists = any(t['id'] == target_tenant_id for t in tenants)
        
        if not tenant_exists:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        # Get tenant name
        tenant = await get_tenant_by_id(target_tenant_id)
        tenant_name = tenant['name'] if tenant else 'Unknown'
        
        # Create new token for super admin with target tenant
        new_token = create_token(
            username,
            user.get('name'),
            target_tenant_id,
            'super_admin'
        )
        
        return {
            "access_token": new_token,
            "token_type": "bearer",
            "username": username,
            "name": user.get('name'),
            "role": 'super_admin',
            "tenant_id": target_tenant_id,
            "tenant_name": tenant_name,
            "expires_in": JWT_EXPIRATION_DAYS * 24 * 60 * 60
        }
    
    # Regular users - find their accounts
    users = await load_users()
    target_user = None
    
    for u in users:
        if u['username'] == username and u.get('status') == 'active':
            # Support both tenant_id and tenant_ids
            user_tenant_ids = u.get('tenant_ids', [])
            if not user_tenant_ids and u.get('tenant_id'):
                user_tenant_ids = [u.get('tenant_id')]
            
            if target_tenant_id in user_tenant_ids:
                target_user = u
                break
    
    if not target_user:
        raise HTTPException(
            status_code=403, 
            detail="You don't have access to this tenant"
        )
    
    # Get tenant name
    tenant = await get_tenant_by_id(target_tenant_id)
    tenant_name = tenant['name'] if tenant else 'Unknown'
    
    # Create new token for the target tenant
    new_token = create_token(
        target_user['username'],
        target_user['name'],
        target_user.get('tenant_id'),
        target_user.get('role', 'user')
    )
    
    return {
        "access_token": new_token,
        "token_type": "bearer",
        "username": target_user['username'],
        "name": target_user['name'],
        "role": target_user.get('role', 'user'),
        "tenant_id": target_user.get('tenant_id'),
        "tenant_name": tenant_name,
        "expires_in": JWT_EXPIRATION_DAYS * 24 * 60 * 60
    }

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Serve the main UI (requires authentication)"""
    # Check if user has valid token via cookie
    token = request.cookies.get("access_token")
    if not token:
        return RedirectResponse(url="/login", status_code=303)
    
    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        content = await async_read_text("static/index.html")
        return HTMLResponse(content=content)
    except:
        return RedirectResponse(url="/login", status_code=303)

async def run_test_background(tester: EnhancedLoadTester):
    """Background task to run the load test"""
    try:
        test_session = await tester.run_load_test(manager)
        active_sessions[test_session.session_id] = test_session
    except Exception as e:
        print(f"Background test error: {str(e)}")
    finally:
        # Clean up tester after completion
        if tester.session_id in active_testers:
            del active_testers[tester.session_id]

@app.post("/api/test/start")
async def start_load_test(config: LoadTestConfig, background_tasks: BackgroundTasks, user: dict = Depends(verify_token)):
    """Start a new load test"""
    try:
        tester = EnhancedLoadTester(config)
        
        # Store tester for cancellation capability
        active_testers[tester.session_id] = tester
        
        # Run test in background (non-blocking)
        background_tasks.add_task(run_test_background, tester)
        
        return {
            "session_id": tester.session_id,
            "status": "started",
            "message": "Load test started successfully"
        }
    except Exception as e:
        # Clean up on error
        if 'tester' in locals() and tester.session_id in active_testers:
            del active_testers[tester.session_id]
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/test/{session_id}/cancel")
async def cancel_load_test(session_id: str, user: dict = Depends(verify_token)):
    """Cancel a running load test"""
    if session_id not in active_testers:
        raise HTTPException(status_code=404, detail="Test session not found or already completed")
    
    tester = active_testers[session_id]
    tester.cancel()
    
    return {
        "session_id": session_id,
        "status": "cancelling",
        "message": "Test cancellation requested"
    }

@app.get("/api/test/{session_id}")
async def get_test_results(session_id: str, user: dict = Depends(verify_token)):
    """Get test results by session ID"""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Test session not found")
    
    return active_sessions[session_id]

@app.get("/api/test/history")
async def get_test_history(user: dict = Depends(verify_token)):
    """Get list of all test sessions (async)"""
    log_files = []
    summary_dir = os.path.join("logs", "summary")
    
    # Check new summary directory first
    if os.path.exists(summary_dir):
        filenames = await async_listdir(summary_dir)
        for filename in filenames:
            if filename.startswith("summary_") and filename.endswith(".json"):
                try:
                    filepath = os.path.join(summary_dir, filename)
                    summary = await async_read_json(filepath)
                    if summary:
                        log_files.append(summary)
                except Exception:
                    continue
    
    # Also check old logs directory for backward compatibility
    if os.path.exists("logs"):
        filenames = await async_listdir("logs")
        for filename in filenames:
            if filename.startswith("summary_") and filename.endswith(".json"):
                try:
                    filepath = os.path.join("logs", filename)
                    summary = await async_read_json(filepath)
                    if summary:
                        log_files.append(summary)
                except Exception:
                    continue
    
    return {"sessions": sorted(log_files, key=lambda x: x.get("timestamp", ""), reverse=True)}

@app.post("/api/config/save")
async def save_config(config: Dict[str, Any], user: dict = Depends(verify_token)):
    """Save or update configuration to backend (async)"""
    try:
        config_dir = "configs"
        os.makedirs(config_dir, exist_ok=True)
        
        # Use tenant_id from request if provided, otherwise use user's tenant_id
        # This allows super admin to save configs for specific tenants
        if "tenant_id" not in config or config["tenant_id"] is None:
            config["tenant_id"] = user.get("tenant_id")
        
        # Validate: Check if user has access to the tenant they're trying to save to
        is_super = is_super_admin(user)
        if not is_super:
            # Get user's available tenants
            username = user.get('username')
            users = await load_users()
            user_accounts = [u for u in users if u['username'] == username and u.get('status') == 'active']
            
            # Collect all tenant IDs the user has access to
            user_tenant_ids = []
            for user_account in user_accounts:
                tenant_ids = user_account.get('tenant_ids', [])
                if not tenant_ids and user_account.get('tenant_id'):
                    tenant_ids = [user_account.get('tenant_id')]
                user_tenant_ids.extend(tenant_ids)
            
            # Check if config tenant_id is in user's available tenants
            if config["tenant_id"] not in user_tenant_ids:
                raise HTTPException(
                    status_code=403, 
                    detail=f"You don't have access to save configs for this tenant. Your available tenants: {user_tenant_ids}"
                )
        
        config["created_by"] = user.get("username")
        
        print(f"[CONFIG SAVE] User: {user.get('username')}, Saving config with tenant_id: {config['tenant_id']}")
        
        config_id = config.get("id")
        config_name = config.get("name", f"config_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        
        # Check for duplicate names (only if creating new)
        if not config_id:
            filenames = await async_listdir(config_dir)
            for filename in filenames:
                if filename.endswith('.json'):
                    filepath = os.path.join(config_dir, filename)
                    try:
                        existing_config = await async_read_json(filepath)
                        if existing_config and existing_config.get("name", "").lower() == config_name.lower():
                            raise HTTPException(
                                status_code=400, 
                                detail="Configuration name already exists"
                            )
                    except Exception:
                        continue
        
        # If updating, find and use existing file
        if config_id:
            # Find existing file with this ID
            filenames = await async_listdir(config_dir)
            for filename in filenames:
                if filename.endswith('.json'):
                    filepath = os.path.join(config_dir, filename)
                    try:
                        existing_config = await async_read_json(filepath)
                        if existing_config and existing_config.get("id") == config_id:
                            # Update existing config
                            config["saved_at"] = datetime.now().isoformat()
                            config["created_at"] = existing_config.get("created_at", datetime.now().isoformat())
                            
                            # Use new filename if name changed
                            new_filename = f"{config_name.replace(' ', '_')}.json"
                            new_filepath = os.path.join(config_dir, new_filename)
                            
                            await async_write_json(new_filepath, config)
                            
                            # Remove old file if name changed
                            if new_filepath != filepath:
                                await async_remove_file(filepath)
                            
                            return {"status": "success", "filename": new_filename, "id": config_id}
                    except Exception:
                        continue
        
        # Create new config
        filename = f"{config_name.replace(' ', '_')}.json"
        filepath = os.path.join(config_dir, filename)
        
        # Add metadata
        config["saved_at"] = datetime.now().isoformat()
        config["created_at"] = datetime.now().isoformat()
        config["id"] = str(uuid.uuid4())
        
        await async_write_json(filepath, config)
        
        return {"status": "success", "filename": filename, "id": config["id"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save config: {str(e)}")

@app.post("/api/config/list")
async def list_configs(request: ConfigListRequest, response: Response, user: dict = Depends(verify_token)):
    """List saved configurations filtered by tenant_id from request body (async)"""
    # Set no-cache headers to prevent stale data after tenant switch
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    
    try:
        config_dir = "configs"
        if not os.path.exists(config_dir):
            return {"configs": []}
        
        configs = []
        user_tenant_id = user.get("tenant_id")
        user_role = user.get("role")
        is_super = is_super_admin(user)
        
        # Use tenant_id from request body, fallback to user's tenant from token
        # Handle None/null values explicitly
        filter_tenant_id = request.tenant_id if request.tenant_id is not None else user_tenant_id
        
        print(f"[CONFIG LIST] User: {user.get('username')}, Role: {user_role}, Is Super: {is_super}, User Tenant: {user_tenant_id}, Filter Tenant: {filter_tenant_id}, Request Tenant: {request.tenant_id}")
        
        # Load tenant names for super admin display
        tenants = await load_tenants() if is_super else []
        tenant_map = {t['id']: t['name'] for t in tenants}
        
        # For regular users, get their available tenant IDs
        user_tenant_ids = []
        if not is_super:
            username = user.get('username')
            users = await load_users()
            user_accounts = [u for u in users if u['username'] == username and u.get('status') == 'active']
            
            for user_account in user_accounts:
                tenant_ids = user_account.get('tenant_ids', [])
                if not tenant_ids and user_account.get('tenant_id'):
                    tenant_ids = [user_account.get('tenant_id')]
                user_tenant_ids.extend(tenant_ids)
            
            print(f"[CONFIG LIST] Regular user available tenants: {user_tenant_ids}")
        
        filenames = await async_listdir(config_dir)
        for filename in filenames:
            if filename.endswith('.json'):
                try:
                    filepath = os.path.join(config_dir, filename)
                    config = await async_read_json(filepath)
                    if config:
                        config_tenant_id = config.get("tenant_id")
                        
                        # Filter by the selected tenant_id from request
                        # Super admin can see all tenants, regular users can only see their own tenant
                        if is_super:
                            # Super admin: filter by requested tenant_id (including null/no tenant)
                            if config_tenant_id == filter_tenant_id:
                                config_item = {
                                    "id": config.get("id", filename),
                                    "name": config.get("name", filename.replace('.json', '')),
                                    "saved_at": config.get("saved_at", ""),
                                    "filename": filename,
                                    "created_by": config.get("created_by", ""),
                                    "tenant_id": config_tenant_id
                                }
                                config_item["tenant_name"] = tenant_map.get(config_tenant_id, config_tenant_id or 'No Tenant')
                                configs.append(config_item)
                        else:
                            # Regular users: can only see configs for tenants they have access to
                            # Check if the filter_tenant_id is in user's available tenants
                            # AND the config matches the filter_tenant_id
                            if filter_tenant_id in user_tenant_ids and config_tenant_id == filter_tenant_id:
                                config_item = {
                                    "id": config.get("id", filename),
                                    "name": config.get("name", filename.replace('.json', '')),
                                    "saved_at": config.get("saved_at", ""),
                                    "filename": filename,
                                    "created_by": config.get("created_by", ""),
                                    "tenant_id": config_tenant_id
                                }
                                configs.append(config_item)
                except Exception as e:
                    print(f"Error reading {filename}: {e}")
                    continue
        
        # Sort by saved_at descending
        configs.sort(key=lambda x: x.get("saved_at", ""), reverse=True)
        
        print(f"[CONFIG LIST] Returning {len(configs)} configs for tenant {filter_tenant_id}")
        
        return {"configs": configs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list configs: {str(e)}")

@app.get("/api/config/{config_id}")
async def get_config(config_id: str, response: Response, user: dict = Depends(verify_token)):
    """Get a specific configuration - super_admin can access any tenant's config (async)"""
    # Set no-cache headers
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    
    try:
        config_dir = "configs"
        is_super = is_super_admin(user)
        
        # Get user's available tenant IDs
        user_tenant_ids = []
        if not is_super:
            username = user.get('username')
            users = await load_users()
            user_accounts = [u for u in users if u['username'] == username and u.get('status') == 'active']
            
            for user_account in user_accounts:
                tenant_ids = user_account.get('tenant_ids', [])
                if not tenant_ids and user_account.get('tenant_id'):
                    tenant_ids = [user_account.get('tenant_id')]
                user_tenant_ids.extend(tenant_ids)
        
        # Find config by ID or filename
        filenames = await async_listdir(config_dir)
        for filename in filenames:
            if filename.endswith('.json'):
                filepath = os.path.join(config_dir, filename)
                config = await async_read_json(filepath)
                if config and (config.get("id") == config_id or filename == config_id):
                    # Super admin can access any config, regular users only configs in their tenants
                    if is_super or config.get("tenant_id") in user_tenant_ids:
                        return config
        
        raise HTTPException(status_code=404, detail="Config not found")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Config not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load config: {str(e)}")

@app.delete("/api/config/{config_id}")
async def delete_config(config_id: str, user: dict = Depends(verify_token)):
    """Delete a configuration - super_admin can delete any tenant's config (async)"""
    try:
        config_dir = "configs"
        is_super = is_super_admin(user)
        
        # Get user's available tenant IDs
        user_tenant_ids = []
        if not is_super:
            username = user.get('username')
            users = await load_users()
            user_accounts = [u for u in users if u['username'] == username and u.get('status') == 'active']
            
            for user_account in user_accounts:
                tenant_ids = user_account.get('tenant_ids', [])
                if not tenant_ids and user_account.get('tenant_id'):
                    tenant_ids = [user_account.get('tenant_id')]
                user_tenant_ids.extend(tenant_ids)
        
        filenames = await async_listdir(config_dir)
        for filename in filenames:
            if filename.endswith('.json'):
                filepath = os.path.join(config_dir, filename)
                config = await async_read_json(filepath)
                if config and (config.get("id") == config_id or filename == config_id):
                    # Super admin can delete any config, regular users only configs in their tenants
                    if is_super or config.get("tenant_id") in user_tenant_ids:
                        await async_remove_file(filepath)
                        return {"status": "success", "message": "Config deleted"}
        
        raise HTTPException(status_code=404, detail="Config not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete config: {str(e)}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates with connection isolation"""
    # Generate unique connection ID for this WebSocket
    connection_id = str(uuid.uuid4())
    
    await manager.connect(websocket, connection_id)
    
    try:
        # Send connection acknowledgment with connection ID
        await manager.send_personal_message(json.dumps({
            "type": "connection_established",
            "connection_id": connection_id
        }), connection_id)
        
        while True:
            data = await websocket.receive_text()
            
            try:
                msg = json.loads(data)
                
                # Handle session association from client
                if msg.get("type") == "associate_session":
                    session_id = msg.get("session_id")
                    if session_id:
                        manager.associate_session(session_id, connection_id)
                        await manager.send_personal_message(json.dumps({
                            "type": "session_associated",
                            "session_id": session_id
                        }), connection_id)
                else:
                    # Echo back for other messages
                    await manager.send_personal_message(f"Message received: {data}", connection_id)
            except json.JSONDecodeError:
                # Not JSON, just echo
                await manager.send_personal_message(f"Message received: {data}", connection_id)
                
    except WebSocketDisconnect:
        manager.disconnect(connection_id)

# Helper function to check admin access
def is_admin_or_super(user: dict) -> bool:
    """Check if user is admin or super_admin"""
    return user.get('role') in ['admin', 'super_admin']

def is_super_admin(user: dict) -> bool:
    """Check if user is super_admin"""
    return user.get('role') == 'super_admin'

# Admin Panel API Endpoints
@app.get("/admin")
async def admin_panel(request: Request):
    """Serve the admin panel (requires admin or super_admin role, async)"""
    token = request.cookies.get("access_token")
    if not token:
        return RedirectResponse(url="/login", status_code=303)
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if not is_admin_or_super(payload):
            return HTMLResponse(content="<h1>403 Forbidden</h1><p>Admin access required</p>", status_code=403)
        content = await async_read_text("static/admin.html")
        return HTMLResponse(content=content)
    except:
        return RedirectResponse(url="/login", status_code=303)

@app.get("/api/admin/tenants")
async def get_tenants(user: dict = Depends(verify_token)):
    """Get all tenants (super_admin only, async)"""
    if not is_super_admin(user):
        raise HTTPException(status_code=403, detail="Super admin access required")
    
    tenants = await load_tenants()
    return {"tenants": tenants}

@app.post("/api/admin/tenants")
async def create_tenant(tenant_data: Dict[str, Any], user: dict = Depends(verify_token)):
    """Create new tenant (super_admin only, async)"""
    if not is_super_admin(user):
        raise HTTPException(status_code=403, detail="Super admin access required")
    
    tenants = await load_tenants()
    
    # Generate unique ID
    tenant_id = f"tenant_{str(uuid.uuid4())[:8]}"
    
    new_tenant = {
        "id": tenant_id,
        "name": tenant_data.get("name"),
        "created_at": datetime.now().isoformat(),
        "status": tenant_data.get("status", "active"),
        "contact_email": tenant_data.get("contact_email", ""),
        "max_users": tenant_data.get("max_users", 50)
    }
    
    tenants.append(new_tenant)
    await save_tenants(tenants)
    
    return {"status": "success", "tenant": new_tenant}

@app.put("/api/admin/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, tenant_data: Dict[str, Any], user: dict = Depends(verify_token)):
    """Update tenant (super_admin only, async)"""
    if not is_super_admin(user):
        raise HTTPException(status_code=403, detail="Super admin access required")
    
    tenants = await load_tenants()
    tenant_found = False
    
    for i, tenant in enumerate(tenants):
        if tenant['id'] == tenant_id:
            tenants[i].update({
                "name": tenant_data.get("name", tenant['name']),
                "status": tenant_data.get("status", tenant['status']),
                "contact_email": tenant_data.get("contact_email", tenant.get('contact_email', '')),
                "max_users": tenant_data.get("max_users", tenant.get('max_users', 50))
            })
            tenant_found = True
            break
    
    if not tenant_found:
        raise HTTPException(status_code=404, detail="Tenant not found")
    
    await save_tenants(tenants)
    return {"status": "success", "message": "Tenant updated"}

@app.delete("/api/admin/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, user: dict = Depends(verify_token)):
    """Delete tenant (super_admin only, async)"""
    if not is_super_admin(user):
        raise HTTPException(status_code=403, detail="Super admin access required")
    
    tenants = await load_tenants()
    tenants = [t for t in tenants if t['id'] != tenant_id]
    await save_tenants(tenants)
    
    return {"status": "success", "message": "Tenant deleted"}

@app.get("/api/admin/users")
async def get_users(user: dict = Depends(verify_token)):
    """Get users - super_admin sees all, admin sees only users in their tenants (async)"""
    if not is_admin_or_super(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = await load_users()
    
    # Super admin sees all users, admin sees only users in their tenants
    if is_super_admin(user):
        tenant_users = users
    else:
        # Get current admin's available tenant IDs
        admin_username = user.get('username')
        admin_accounts = [u for u in users if u['username'] == admin_username and u.get('status') == 'active']
        
        admin_tenant_ids = []
        for admin_account in admin_accounts:
            tenant_ids = admin_account.get('tenant_ids', [])
            if not tenant_ids and admin_account.get('tenant_id'):
                tenant_ids = [admin_account.get('tenant_id')]
            admin_tenant_ids.extend(tenant_ids)
        
        # Filter users that have access to any of the admin's tenants
        tenant_users = []
        for u in users:
            user_tenant_ids = u.get('tenant_ids', [])
            if not user_tenant_ids and u.get('tenant_id'):
                user_tenant_ids = [u.get('tenant_id')]
            
            # Check if there's any overlap between admin's tenants and user's tenants
            if any(tenant_id in admin_tenant_ids for tenant_id in user_tenant_ids):
                tenant_users.append(u)
    
    # Remove passwords from response
    for u in tenant_users:
        u.pop('password', None)
    
    return {"users": tenant_users}

@app.post("/api/admin/users")
async def create_user(user_data: Dict[str, Any], user: dict = Depends(verify_token)):
    """Create new user - admin/super_admin can create users (async)"""
    if not is_admin_or_super(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = await load_users()
    
    # Check if username already exists
    if any(u['username'] == user_data.get('username') for u in users):
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Determine tenant_ids
    # Super admin can assign to any tenants, admin can only assign to their own tenants
    if is_super_admin(user):
        tenant_ids = user_data.get("tenant_ids", [])
        # Also support old single tenant_id for backward compatibility
        if not tenant_ids and user_data.get("tenant_id"):
            tenant_ids = [user_data.get("tenant_id")]
        if not tenant_ids:
            raise HTTPException(status_code=400, detail="At least one tenant is required")
    else:
        # Regular admin can only create users in their own tenants
        admin_username = user.get('username')
        admin_accounts = [u for u in users if u['username'] == admin_username and u.get('status') == 'active']
        
        admin_tenant_ids = []
        for admin_account in admin_accounts:
            t_ids = admin_account.get('tenant_ids', [])
            if not t_ids and admin_account.get('tenant_id'):
                t_ids = [admin_account.get('tenant_id')]
            admin_tenant_ids.extend(t_ids)
        
        if not admin_tenant_ids:
            raise HTTPException(status_code=400, detail="Admin has no tenants assigned")
        
        # Get requested tenant_ids from user_data
        requested_tenant_ids = user_data.get("tenant_ids", [])
        if not requested_tenant_ids and user_data.get("tenant_id"):
            requested_tenant_ids = [user_data.get("tenant_id")]
        
        if not requested_tenant_ids:
            raise HTTPException(status_code=400, detail="At least one tenant is required")
        
        # Validate that all requested tenants are in admin's accessible tenants
        invalid_tenants = [tid for tid in requested_tenant_ids if tid not in admin_tenant_ids]
        if invalid_tenants:
            raise HTTPException(
                status_code=403, 
                detail=f"You don't have access to assign these tenants: {invalid_tenants}. Your accessible tenants: {admin_tenant_ids}"
            )
        
        # Use the requested tenant_ids (which are now validated)
        tenant_ids = requested_tenant_ids
    
    # Validate role assignment
    new_role = user_data.get("role", "user")
    if new_role == "super_admin" and not is_super_admin(user):
        raise HTTPException(status_code=403, detail="Only super admins can create super admin users")
    
    new_user = {
        "username": user_data.get("username"),
        "password": user_data.get("password"),
        "name": user_data.get("name"),
        "email": user_data.get("email", ""),
        "tenant_ids": tenant_ids,
        "role": new_role,
        "created_at": datetime.now().isoformat(),
        "status": user_data.get("status", "active")
    }
    
    users.append(new_user)
    await save_users(users)
    
    # Remove password from response
    new_user_response = new_user.copy()
    new_user_response.pop('password', None)
    
    return {"status": "success", "user": new_user_response}

@app.put("/api/admin/users/{username}")
async def update_user(username: str, user_data: Dict[str, Any], user: dict = Depends(verify_token)):
    """Update user - admin/super_admin can update users (async)"""
    if not is_admin_or_super(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = await load_users()
    user_found = False
    
    # Get current admin's available tenant IDs
    admin_tenant_ids = []
    if not is_super_admin(user):
        admin_username = user.get('username')
        admin_accounts = [u for u in users if u['username'] == admin_username and u.get('status') == 'active']
        
        for admin_account in admin_accounts:
            tenant_ids = admin_account.get('tenant_ids', [])
            if not tenant_ids and admin_account.get('tenant_id'):
                tenant_ids = [admin_account.get('tenant_id')]
            admin_tenant_ids.extend(tenant_ids)
    
    for i, u in enumerate(users):
        # Super admin can edit any user, admin can only edit users in their tenants
        user_tenant_ids = u.get('tenant_ids', [])
        if not user_tenant_ids and u.get('tenant_id'):
            user_tenant_ids = [u.get('tenant_id')]
        
        # Check if admin has access to any of the user's tenants
        can_edit = is_super_admin(user) or any(tenant_id in admin_tenant_ids for tenant_id in user_tenant_ids)
        
        if u['username'] == username and can_edit:
            # Update fields
            if 'name' in user_data:
                users[i]['name'] = user_data['name']
            if 'email' in user_data:
                users[i]['email'] = user_data['email']
            if 'role' in user_data:
                # Only super admin can change role to/from super_admin
                new_role = user_data['role']
                if (new_role == 'super_admin' or u['role'] == 'super_admin') and not is_super_admin(user):
                    raise HTTPException(status_code=403, detail="Only super admins can manage super admin role")
                users[i]['role'] = new_role
            if 'status' in user_data:
                users[i]['status'] = user_data['status']
            if 'password' in user_data and user_data['password']:
                users[i]['password'] = user_data['password']
            if 'tenant_ids' in user_data:
                # Both super admin and regular admin can change tenants
                new_tenant_ids = user_data['tenant_ids']
                
                if is_super_admin(user):
                    # Super admin can assign any tenants
                    users[i]['tenant_ids'] = new_tenant_ids
                else:
                    # Regular admin can only assign tenants they have access to
                    invalid_tenants = [tid for tid in new_tenant_ids if tid not in admin_tenant_ids]
                    if invalid_tenants:
                        raise HTTPException(
                            status_code=403,
                            detail=f"You don't have access to assign these tenants: {invalid_tenants}. Your accessible tenants: {admin_tenant_ids}"
                        )
                    users[i]['tenant_ids'] = new_tenant_ids
            elif 'tenant_id' in user_data:
                # Support old single tenant_id for backward compatibility
                new_tenant_id = user_data['tenant_id']
                
                if is_super_admin(user):
                    users[i]['tenant_ids'] = [new_tenant_id]
                else:
                    # Regular admin can only assign tenants they have access to
                    if new_tenant_id not in admin_tenant_ids:
                        raise HTTPException(
                            status_code=403,
                            detail=f"You don't have access to assign tenant: {new_tenant_id}. Your accessible tenants: {admin_tenant_ids}"
                        )
                    users[i]['tenant_ids'] = [new_tenant_id]
            
            user_found = True
            break
    
    if not user_found:
        raise HTTPException(status_code=404, detail="User not found")
    
    await save_users(users)
    return {"status": "success", "message": "User updated"}

@app.delete("/api/admin/users/{username}")
async def delete_user(username: str, user: dict = Depends(verify_token)):
    """Delete user - admin/super_admin can delete users (async)"""
    if not is_admin_or_super(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Prevent deleting yourself
    if username == user.get('username'):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    users = await load_users()
    
    # Find user to delete
    user_to_delete = next((u for u in users if u['username'] == username), None)
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check permissions
    if not is_super_admin(user):
        # Regular admin can only delete users in their tenant
        user_tenant_ids = user_to_delete.get('tenant_ids', [])
        if not user_tenant_ids and user_to_delete.get('tenant_id'):
            user_tenant_ids = [user_to_delete.get('tenant_id')]
        
        if user.get('tenant_id') not in user_tenant_ids:
            raise HTTPException(status_code=403, detail="Cannot delete users from other tenants")
        # Cannot delete super admins
        if user_to_delete.get('role') == 'super_admin':
            raise HTTPException(status_code=403, detail="Cannot delete super admin users")
    
    users = [u for u in users if u['username'] != username]
    await save_users(users)
    
    return {"status": "success", "message": "User deleted"}

@app.get("/api/validation-types")
async def get_validation_types(user: dict = Depends(verify_token)):
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
    # Migrate existing log files to new folder structure
    migrate_log_files()
    
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
