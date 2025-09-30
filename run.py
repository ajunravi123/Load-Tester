#!/usr/bin/env python3
"""
Startup script for the Advanced Load Testing Suite
"""

import uvicorn
import sys
import os

def main():
    """Main entry point for the application"""
    
    # Ensure we're in the correct directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    print("🚀 Starting Advanced Load Testing Suite...")
    print("📍 Server will be available at: http://localhost:8000")
    print("🔧 Press Ctrl+C to stop the server")
    print("-" * 50)
    
    try:
        # Run the FastAPI application with uvicorn
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            reload_dirs=[script_dir],
            log_level="info"
        )
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error starting server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
