#!/usr/bin/env python3
"""
Regression Testing
Tests para asegurar que no se rompieron funcionalidades existentes
"""

import sys
import os
import time

# Allow running as script or as module
if __name__ == "__main__" or not __package__:
    sys.path.insert(0, os.path.dirname(__file__))
    from utils import *
    from config import *
else:
    from .utils import *
    from .config import *


def test_info_flow_still_works():
    """Test: Flujo INFO sigue funcionando después de Phase 4"""
    payload = create_test_payload("¿Cuánto cuesta una limpieza?")

    exec_result = execute_workflow(payload)
    wait_for_execution()

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Should classify as INFO and NOT go to Phase 4
    intent = analysis.get("key_outputs", {}).get("normalized_intent", "")
    phase4_nodes = ["Procesar Elección Slot", "Crear Evento Google Calendar"]
    went_to_phase4 = any(node in analysis["nodes_list"] for node in phase4_nodes)

    passed = intent == "INFO" and not went_to_phase4

    return TestResult(
        name="Regression: INFO flow still works",
        passed=passed,
        message="INFO flow intact" if passed else "INFO flow broken",
        details={
            "intent": intent,
            "went_to_phase4": went_to_phase4,
            "execution_id": analysis["execution_id"]
        }
    )


def test_payment_escalation_works():
    """Test: PAYMENT sigue escalando correctamente"""
    payload = create_test_payload("¿Cómo puedo pagar?")

    exec_result = execute_workflow(payload)
    wait_for_execution()

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Should classify as PAYMENT and escalate
    intent = analysis.get("key_outputs", {}).get("normalized_intent", "")
    escalated = "Preparar Escalado" in analysis["nodes_list"]

    passed = intent == "PAYMENT" and escalated

    return TestResult(
        name="Regression: PAYMENT escalation works",
        passed=passed,
        message="PAYMENT escalation intact" if passed else "PAYMENT escalation broken",
        details={
            "intent": intent,
            "escalated": escalated,
            "execution_id": analysis["execution_id"]
        }
    )


def test_human_escalation_works():
    """Test: HUMAN sigue escalando correctamente"""
    payload = create_test_payload("Hola buenos días")

    exec_result = execute_workflow(payload)
    wait_for_execution()

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Should classify as HUMAN and escalate
    intent = analysis.get("key_outputs", {}).get("normalized_intent", "")
    escalated = "Preparar Escalado" in analysis["nodes_list"]

    passed = intent == "HUMAN" and escalated

    return TestResult(
        name="Regression: HUMAN escalation works",
        passed=passed,
        message="HUMAN escalation intact" if passed else "HUMAN escalation broken",
        details={
            "intent": intent,
            "escalated": escalated,
            "execution_id": analysis["execution_id"]
        }
    )


def test_first_interaction_not_phase4():
    """Test: Primera interacción no va a Phase 4"""
    payload = create_test_payload("Quiero una cita")

    exec_result = execute_workflow(payload)
    wait_for_execution(7)

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Should NOT go to Phase 4 confirmation processing
    phase4_confirmation = "Procesar Elección Slot" in analysis["nodes_list"]

    passed = not phase4_confirmation

    return TestResult(
        name="Regression: First interaction doesn't trigger Phase 4",
        passed=passed,
        message="Correctly went to Phase 2-3" if passed else "Incorrectly went to Phase 4",
        details={
            "went_to_phase4_confirmation": phase4_confirmation,
            "execution_id": analysis["execution_id"]
        }
    )


def test_workflow_no_infinite_loops():
    """Test: Workflow no entra en loops infinitos"""
    payload = create_test_payload("Test message")

    start_time = time.time()
    exec_result = execute_workflow(payload)
    wait_for_execution(15)  # Max 15 seconds

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    elapsed = time.time() - start_time
    finished = analysis.get("finished", False)

    passed = finished and elapsed < 20

    return TestResult(
        name="Regression: No infinite loops",
        passed=passed,
        message=f"Finished in {elapsed:.1f}s" if passed else "Timeout or not finished",
        details={
            "elapsed_seconds": elapsed,
            "finished": finished,
            "execution_id": analysis["execution_id"]
        }
    )


def run_regression_tests():
    """Ejecuta todos los regression tests"""
    print_test_header("REGRESSION TESTS")

    results = []

    # Test INFO flow
    print(f"\n{Colors.BLUE}Testing INFO flow regression...{Colors.RESET}")
    results.append(test_info_flow_still_works())

    # Test PAYMENT escalation
    print(f"\n{Colors.BLUE}Testing PAYMENT escalation regression...{Colors.RESET}")
    results.append(test_payment_escalation_works())

    # Test HUMAN escalation
    print(f"\n{Colors.BLUE}Testing HUMAN escalation regression...{Colors.RESET}")
    results.append(test_human_escalation_works())

    # Test first interaction
    print(f"\n{Colors.BLUE}Testing first interaction routing...{Colors.RESET}")
    results.append(test_first_interaction_not_phase4())

    # Test no infinite loops
    print(f"\n{Colors.BLUE}Testing for infinite loops...{Colors.RESET}")
    results.append(test_workflow_no_infinite_loops())

    # Print results
    print(f"\n{Colors.BOLD}Results:{Colors.RESET}")
    for result in results:
        print_test_result(result)

    print_summary(results)

    return results


if __name__ == "__main__":
    results = run_regression_tests()
    exit(0 if all(r.passed for r in results) else 1)
