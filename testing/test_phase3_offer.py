#!/usr/bin/env python3
"""
Phase 3 Testing: Slot Offer
Tests para validar que los slots se ofrecen correctamente al paciente
"""

import sys
import os

# Allow running as script or as module
if __name__ == "__main__" or not __package__:
    sys.path.insert(0, os.path.dirname(__file__))
    from utils import *
    from config import *
else:
    from .utils import *
    from .config import *


def test_slot_offer_message():
    """Test: Formatea y envía mensaje de oferta correctamente"""
    payload = create_test_payload("Quiero una cita de limpieza")

    exec_result = execute_workflow(payload)
    wait_for_execution(7)

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Check if offer nodes executed
    format_executed = "Formatear Oferta de Slots" in analysis["nodes_list"]
    send_executed = "Enviar Oferta Chatwoot" in analysis["nodes_list"]

    passed = format_executed and send_executed

    return TestResult(
        name="Slot Offer: Message formatted and sent",
        passed=passed,
        message="Offer sent successfully" if passed else "Failed to send offer",
        details={
            "format_node": format_executed,
            "send_node": send_executed,
            "execution_id": analysis["execution_id"]
        }
    )


def test_custom_attributes_updated():
    """Test: Actualiza custom_attributes con awaiting_slot_confirmation"""
    payload = create_test_payload("Necesito agendar")

    exec_result = execute_workflow(payload)
    wait_for_execution(7)

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Check if "Marcar Esperando Confirmación" executed
    marked = "Marcar Esperando Confirmación" in analysis["nodes_list"]

    return TestResult(
        name="Custom Attributes: awaiting_slot_confirmation set to true",
        passed=marked,
        message="Attributes updated" if marked else "Failed to update attributes",
        details={
            "node_executed": marked,
            "execution_id": analysis["execution_id"]
        }
    )


def test_phase3_completion():
    """Test: Phase 3 completa y termina correctamente"""
    payload = create_test_payload("Quiero una consulta")

    exec_result = execute_workflow(payload)
    wait_for_execution(7)

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Check if workflow finished successfully
    finished = analysis.get("finished", False)
    success = analysis.get("success", False)

    passed = finished and success

    return TestResult(
        name="Phase 3 Completion: Workflow finishes successfully",
        passed=passed,
        message="Phase 3 completed" if passed else "Phase 3 failed to complete",
        details={
            "finished": finished,
            "success": success,
            "nodes_executed": analysis["nodes_executed"],
            "execution_id": analysis["execution_id"]
        }
    )


def run_phase3_tests():
    """Ejecuta todos los tests de Phase 3"""
    print_test_header("PHASE 3: SLOT OFFER TESTS")

    results = []

    # Test Slot Offer Message
    print(f"\n{Colors.BLUE}Testing slot offer message...{Colors.RESET}")
    results.append(test_slot_offer_message())

    # Test Custom Attributes
    print(f"\n{Colors.BLUE}Testing custom attributes update...{Colors.RESET}")
    results.append(test_custom_attributes_updated())

    # Test Phase 3 Completion
    print(f"\n{Colors.BLUE}Testing phase 3 completion...{Colors.RESET}")
    results.append(test_phase3_completion())

    # Print results
    print(f"\n{Colors.BOLD}Results:{Colors.RESET}")
    for result in results:
        print_test_result(result)

    print_summary(results)

    return results


if __name__ == "__main__":
    results = run_phase3_tests()
    exit(0 if all(r.passed for r in results) else 1)
