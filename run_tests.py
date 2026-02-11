#!/usr/bin/env python3
"""
Convenience script to run testing suite from project root
"""

import sys
import os

# Add testing directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'testing'))

# Import and run test runner
from test_runner import main

if __name__ == "__main__":
    main()
