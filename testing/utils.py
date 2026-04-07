#!/usr/bin/env python3
"""
Testing Utilities
Funciones comunes para todos los tests
"""

import sys
import os
import json
import time
import requests
from typing import Dict, Any, Optional

# Allow running as script or as module
if __name__ == "__main__" or not __package__:
    sys.path.insert(0, os.path.dirname(__file__))
    from config import *
else:
    from .config import *


class TestResult:
    """Resultado de un test individual"""
    def __init__(self, name: str, passed: bool, message: str, details: Optional[Dict] = None):
        self.name = name
        self.passed = passed
        self.message = message
        self.details = details or {}
        self.execution_time = 0

    def __str__(self):
        status = f"{Colors.GREEN}[PASS]{Colors.RESET}" if self.passed else f"{Colors.RED}[FAIL]{Colors.RESET}"
        return f"{status} | {self.name}: {self.message}"


def _get_latest_exec_id() -> Optional[str]:
    """Returns the latest execution ID without fetching full details."""
    try:
        r = requests.get(
            f"{N8N_BASE_URL}/api/v1/executions",
            headers={"X-N8N-API-KEY": N8N_API_KEY},
            params={"workflowId": WORKFLOW_ID, "limit": 1},
            timeout=API_TIMEOUT
        )
        if r.status_code == 200:
            data = r.json().get("data", [])
            if data:
                return str(data[0]["id"])
    except Exception:
        pass
    return None


def execute_workflow(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ejecuta el workflow con un payload de test.
    Registra el execution ID previo para que wait_for_execution
    pueda hacer polling por la ejecución correcta.

    Args:
        payload: Webhook payload simulando Chatwoot

    Returns:
        Ejecución result JSON
    """
    # Record the latest execution ID BEFORE sending the webhook
    execute_workflow._prev_exec_id = _get_latest_exec_id()

    webhook_url = f"{N8N_BASE_URL}/webhook/chatwoot-sofia"

    try:
        response = requests.post(
            webhook_url,
            json=payload,
            timeout=API_TIMEOUT,
            headers={
                "Content-Type": "application/json",
                "x-chatwoot-signature": "sha256=test-ci-bypass"
            }
        )
        return {
            "webhook_status": response.status_code,
            "webhook_response": response.text if response.text else None
        }
    except Exception as e:
        return {"webhook_status": 0, "error": str(e)}


execute_workflow._prev_exec_id = None


def reset_test_conversation():
    """
    Resets the test conversation governance record to active/unpaused.
    Call before each test that triggers the Sofia workflow.
    Prevents bot_paused=true from a prior escalation test blocking subsequent tests.
    """
    supabase_url = os.getenv("SUPABASE_URL", "https://inhyrrjidhzrbqecnptn.supabase.co")
    service_key = os.getenv("SUPABASE_SERVICE_KEY", "")
    try:
        r = requests.patch(
            f"{supabase_url}/rest/v1/conversations",
            params={"chatwoot_conversation_id": f"eq.{TEST_CONVERSATION_ID}"},
            json={"bot_paused": False, "status": "active"},
            headers={"apikey": service_key, "Authorization": f"Bearer {service_key}",
                     "Prefer": "return=minimal"},
            timeout=5
        )
        if r.status_code not in (200, 204):
            print(f"[reset_test_conversation] WARNING: status {r.status_code} — {r.text[:100]}")
    except Exception as e:
        print(f"[reset_test_conversation] WARNING: {e}")  # Non-fatal — test will still run


def wait_for_execution(max_seconds: int = 30):
    """
    Polls until a NEW finished execution appears after the last execute_workflow() call.
    Stores the detected execution ID in wait_for_execution._detected_exec_id
    so get_latest_execution() can return exactly the right execution.
    """
    if not hasattr(wait_for_execution, '_detected_exec_id'):
        wait_for_execution._detected_exec_id = None
    wait_for_execution._detected_exec_id = None
    prev_id = getattr(execute_workflow, '_prev_exec_id', None)
    deadline = time.time() + max_seconds
    while time.time() < deadline:
        time.sleep(2)
        try:
            r = requests.get(
                f"{N8N_BASE_URL}/api/v1/executions",
                headers={"X-N8N-API-KEY": N8N_API_KEY},
                params={"workflowId": WORKFLOW_ID, "limit": 3},
                timeout=API_TIMEOUT
            )
            if r.status_code == 200:
                for exec_entry in r.json().get("data", []):
                    eid = str(exec_entry["id"])
                    status = exec_entry.get("status", "")
                    # Find the newest execution that is past prev_id and finished
                    if (prev_id is None or int(eid) > int(prev_id)) and \
                       status in ("success", "error", "crashed"):
                        wait_for_execution._detected_exec_id = eid
                        return
        except Exception:
            pass


def get_latest_execution() -> Optional[Dict[str, Any]]:
    """
    Obtiene los detalles de la ejecución correcta.
    Usa el ID detectado por wait_for_execution() si está disponible.
    """
    # Use the execution ID tracked by wait_for_execution when available
    detected_id = getattr(wait_for_execution, '_detected_exec_id', None)
    if detected_id:
        return get_execution_details(detected_id)

    # Fallback: get latest from API
    api_url = f"{N8N_BASE_URL}/api/v1/executions"
    try:
        response = requests.get(
            api_url,
            headers={"X-N8N-API-KEY": N8N_API_KEY},
            params={"workflowId": WORKFLOW_ID, "limit": 1},
            timeout=API_TIMEOUT
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("data") and len(data["data"]) > 0:
                exec_id = data["data"][0]["id"]
                return get_execution_details(exec_id)
        return None
    except Exception as e:
        print(f"{Colors.RED}Error fetching latest execution: {e}{Colors.RESET}")
        return None


def get_execution_details(exec_id: str) -> Optional[Dict[str, Any]]:
    """
    Obtiene detalles completos de una ejecución específica

    Args:
        exec_id: ID de la ejecución

    Returns:
        Full execution data con runData
    """
    api_url = f"{N8N_BASE_URL}/api/v1/executions/{exec_id}"

    try:
        response = requests.get(
            api_url,
            headers={"X-N8N-API-KEY": N8N_API_KEY},
            params={"includeData": "true"},
            timeout=API_TIMEOUT
        )

        if response.status_code == 200:
            return response.json()

        return None
    except Exception as e:
        print(f"{Colors.RED}Error fetching execution {exec_id}: {e}{Colors.RESET}")
        return None


def create_test_payload(
    message: str,
    conversation_id: Optional[int] = None,
    custom_attributes: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Crea un payload de test simulando Chatwoot webhook

    Args:
        message: Mensaje del usuario
        conversation_id: ID de conversación (default: TEST_CONVERSATION_ID)
        custom_attributes: Custom attributes adicionales

    Returns:
        Payload listo para enviar al webhook
    """
    conv_id = conversation_id or TEST_CONVERSATION_ID
    attrs = custom_attributes or {}

    # Default attributes
    default_attrs = {
        "bot_interaction_count": 0,
        "awaiting_slot_confirmation": "false",
        "offered_slots": []
    }
    default_attrs.update(attrs)

    return {
        "event": "message_created",
        "content": message,
        "message_type": "incoming",
        "created_at": int(time.time()),
        "account": {"id": CHATWOOT_ACCOUNT_ID},
        "sender": {
            "id": TEST_CONTACT_ID,
            "name": "Test User",
            "phone_number": "+51999888777"
        },
        "conversation": {
            "id": conv_id,
            "inbox_id": TEST_INBOX_ID,
            "contact_inbox": {
                "source_id": f"test-{conv_id}",
                "inbox": {"channel_type": "Channel::WebWidget"}
            },
            "custom_attributes": default_attrs
        }
    }


def analyze_execution(execution: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analiza una ejecución y extrae métricas clave

    Args:
        execution: Execution data de n8n API

    Returns:
        Análisis con métricas
    """
    if not execution or "data" not in execution:
        return {
            "success": False,
            "finished": False,
            "status": "error",
            "error": "No execution data",
            "nodes_executed": 0,
            "nodes_list": [],
            "errors": [],
            "key_outputs": {},
            "execution_id": "N/A"
        }

    data = execution.get("data", {})
    result_data = data.get("resultData", {})
    run_data = result_data.get("runData", {})

    nodes_executed = list(run_data.keys())

    # Check for errors
    errors = []
    for node_name, node_runs in run_data.items():
        for run in node_runs:
            if run.get("error"):
                errors.append({
                    "node": node_name,
                    "error": run["error"].get("message", "Unknown error")
                })

    # Extract key nodes output
    key_outputs = {}

    # Clasificador output
    if "Clasificador de Intención" in run_data:
        clasificador_data = run_data["Clasificador de Intención"][0].get("data", {}).get("main", [[]])[0]
        if clasificador_data:
            key_outputs["intent"] = clasificador_data[0].get("json", {}).get("output", "N/A")

    # Normalizar Intent output
    if "Normalizar Intent" in run_data:
        normalizar_data = run_data["Normalizar Intent"][0].get("data", {}).get("main", [[]])[0]
        if normalizar_data:
            key_outputs["normalized_intent"] = normalizar_data[0].get("json", {}).get("intent", "N/A")

    # Calcular Slots output
    if "Calcular Slots Disponibles" in run_data:
        slots_data = run_data["Calcular Slots Disponibles"][0].get("data", {}).get("main", [[]])[0]
        if slots_data:
            slots = slots_data[0].get("json", {}).get("available_slots", [])
            key_outputs["slots_calculated"] = len(slots)

    # Check Slot State output
    if "Check Slot Confirmation State" in run_data:
        check_data = run_data["Check Slot Confirmation State"][0].get("data", {}).get("main", [[]])[0]
        if check_data:
            key_outputs["slot_confirmation_pending"] = check_data[0].get("json", {}).get("slot_confirmation_pending", False)

    # Procesar Elección Slot output
    if "Procesar Elección Slot" in run_data:
        proc_data = run_data["Procesar Elección Slot"][0].get("data", {}).get("main", [[]])[0]
        if proc_data:
            key_outputs["slot_chosen"] = proc_data[0].get("json", {}).get("slot_chosen", False)

    # Google Calendar output
    if "Crear Evento Google Calendar" in run_data:
        calendar_data = run_data["Crear Evento Google Calendar"][0].get("data", {}).get("main", [[]])[0]
        if calendar_data:
            event_data = calendar_data[0].get("json", {})
            key_outputs["event_created"] = bool(event_data.get("id"))
            key_outputs["event_id"] = event_data.get("id", "N/A")

    return {
        "success": len(errors) == 0,
        "finished": execution.get("finished", data.get("finished", False)),
        "status": execution.get("status", data.get("status", "unknown")),
        "nodes_executed": len(nodes_executed),
        "nodes_list": nodes_executed,
        "errors": errors,
        "key_outputs": key_outputs,
        "execution_id": execution.get("id", "N/A")
    }


def print_test_header(title: str):
    """Imprime header de sección de test"""
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*70}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}{title.center(70)}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*70}{Colors.RESET}\n")


def print_test_result(result: TestResult):
    """Imprime resultado de un test"""
    print(str(result))
    if result.details:
        for key, value in result.details.items():
            print(f"  -> {key}: {value}")


def print_summary(results: list[TestResult]):
    """Imprime resumen de todos los tests"""
    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)
    total = len(results)

    print(f"\n{Colors.BOLD}{Colors.MAGENTA}{'='*70}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.MAGENTA}{'TEST SUMMARY'.center(70)}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.MAGENTA}{'='*70}{Colors.RESET}\n")

    print(f"Total Tests: {total}")
    print(f"{Colors.GREEN}Passed: {passed}{Colors.RESET}")
    print(f"{Colors.RED}Failed: {failed}{Colors.RESET}")
    print(f"Success Rate: {(passed/total*100):.1f}%\n")

    if failed > 0:
        print(f"{Colors.RED}{Colors.BOLD}FAILED TESTS:{Colors.RESET}")
        for result in results:
            if not result.passed:
                print(f"  • {result.name}: {result.message}")
