#!/usr/bin/env python3
"""
Testing Configuration
Configuración centralizada para la suite de testing
"""

import os

# n8n API Configuration
N8N_BASE_URL = "https://workflows.n8n.redsolucionesti.com"
N8N_API_KEY = os.getenv("N8N_API_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwNzY4NTgyLCJleHAiOjE3NzMyODgwMDF9.Z3vHmfdFzKFXzVgGVxoxIuX9VDsuepcFC_9wJiK7EyM")
WORKFLOW_ID = "37SLdWISQLgkHeXk"

# Chatwoot Configuration (for testing)
CHATWOOT_BASE_URL = "https://chat.redsolucionesti.com"
CHATWOOT_ACCOUNT_ID = 2
CHATWOOT_API_TOKEN = "yypAwZDH2dV3crfbqJqWCgj1"

# Test Data IDs (fake conversation IDs para testing)
TEST_CONVERSATION_ID = 9001
TEST_CONTACT_ID = 9001
TEST_INBOX_ID = 2

# Google Calendar Configuration
CALENDAR_ID = "family00280432052323677917@group.calendar.google.com"

# Test Cases Configuration
TEST_MESSAGES = {
    "CREATE_EVENT": [
        "Quiero agendar una cita para limpieza dental",
        "Necesito una cita de ortodoncia",
        "Me gustaría agendar un blanqueamiento",
        "Quiero reservar una consulta"
    ],
    "INFO": [
        "¿Cuánto cuesta una limpieza?",
        "¿Cuáles son sus horarios?",
        "¿Dónde quedan ubicados?",
        "¿Qué servicios ofrecen?"
    ],
    "PAYMENT": [
        "¿Cómo puedo pagar?",
        "¿Aceptan tarjetas?",
        "Quiero hacer un pago",
        "¿Tienen yape?"
    ],
    "HUMAN": [
        "Hola",
        "Buenos días",
        "????",
        "asdfghjkl"
    ]
}

# Slot Selection Test Patterns
SLOT_SELECTIONS = [
    "1",
    "La opción 2",
    "El 3 por favor",
    "La primera",
    "La segunda opción",
    "El tercero",
    "El del martes",
    "El de la tarde"
]

# Expected Outcomes
EXPECTED_NODES_PHASE1 = 9  # Nodes executed in Phase 1
EXPECTED_NODES_PHASE2 = 12  # Additional nodes in Phase 2
EXPECTED_NODES_PHASE3 = 11  # Additional nodes in Phase 3
EXPECTED_NODES_PHASE4 = 13  # Additional nodes in Phase 4

# Timeout Configuration
API_TIMEOUT = 30  # seconds
EXECUTION_WAIT_TIME = 5  # seconds to wait for execution to complete

# Colors for terminal output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'
