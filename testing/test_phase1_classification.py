#!/usr/bin/env python3
"""
Phase 1 Testing: Intent Classification
Tests para validar la clasificación correcta de intenciones
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


def test_create_event_detection():
    """Test: Detecta CREATE_EVENT correctamente"""
    results = []

    for message in TEST_MESSAGES["CREATE_EVENT"]:
        payload = create_test_payload(message)

        # Execute workflow
        exec_result = execute_workflow(payload)
        wait_for_execution()

        # Get execution details
        execution = get_latest_execution()
        analysis = analyze_execution(execution)

        # Verify intent detected
        intent = analysis.get("key_outputs", {}).get("normalized_intent", "")
        passed = intent == "CREATE_EVENT"

        results.append(TestResult(
            name=f"CREATE_EVENT: '{message[:30]}...'",
            passed=passed,
            message=f"Detected as {intent}",
            details={
                "nodes_executed": analysis["nodes_executed"],
                "execution_id": analysis["execution_id"]
            }
        ))

    return results


def test_info_detection():
    """Test: Detecta INFO correctamente"""
    results = []

    for message in TEST_MESSAGES["INFO"]:
        payload = create_test_payload(message)

        exec_result = execute_workflow(payload)
        wait_for_execution()

        execution = get_latest_execution()
        analysis = analyze_execution(execution)

        intent = analysis.get("key_outputs", {}).get("normalized_intent", "")
        passed = intent == "INFO"

        results.append(TestResult(
            name=f"INFO: '{message[:30]}...'",
            passed=passed,
            message=f"Detected as {intent}",
            details={
                "nodes_executed": analysis["nodes_executed"],
                "execution_id": analysis["execution_id"]
            }
        ))

    return results


def test_payment_detection():
    """Test: Detecta PAYMENT correctamente"""
    results = []

    for message in TEST_MESSAGES["PAYMENT"]:
        payload = create_test_payload(message)

        exec_result = execute_workflow(payload)
        wait_for_execution()

        execution = get_latest_execution()
        analysis = analyze_execution(execution)

        intent = analysis.get("key_outputs", {}).get("normalized_intent", "")
        passed = intent == "PAYMENT"

        results.append(TestResult(
            name=f"PAYMENT: '{message[:30]}...'",
            passed=passed,
            message=f"Detected as {intent}",
            details={
                "nodes_executed": analysis["nodes_executed"],
                "execution_id": analysis["execution_id"]
            }
        ))

    return results


def test_human_fallback():
    """Test: Mensajes ambiguos caen a HUMAN"""
    results = []

    for message in TEST_MESSAGES["HUMAN"]:
        payload = create_test_payload(message)

        exec_result = execute_workflow(payload)
        wait_for_execution()

        execution = get_latest_execution()
        analysis = analyze_execution(execution)

        intent = analysis.get("key_outputs", {}).get("normalized_intent", "")
        passed = intent == "HUMAN"

        results.append(TestResult(
            name=f"HUMAN: '{message[:30]}...'",
            passed=passed,
            message=f"Detected as {intent}",
            details={
                "nodes_executed": analysis["nodes_executed"],
                "execution_id": analysis["execution_id"]
            }
        ))

    return results


def test_whatsapp_safe_check():
    """Test: WhatsApp Safe Check funciona correctamente"""
    results = []

    # Test 1: First message should pass
    payload = create_test_payload("Hola", custom_attributes={"bot_interaction_count": 0})
    exec_result = execute_workflow(payload)
    wait_for_execution()

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Should NOT escalate
    escalated = "Preparar Escalado" in analysis["nodes_list"]
    passed = not escalated

    results.append(TestResult(
        name="WhatsApp Safe Check: First interaction",
        passed=passed,
        message="Passed safe check" if passed else "Incorrectly escalated",
        details={"nodes_executed": analysis["nodes_executed"]}
    ))

    # Test 2: Second message should escalate
    payload = create_test_payload("Otra pregunta", custom_attributes={"bot_interaction_count": 1})
    exec_result = execute_workflow(payload)
    wait_for_execution()

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Should escalate
    escalated = "Preparar Escalado" in analysis["nodes_list"]
    passed = escalated

    results.append(TestResult(
        name="WhatsApp Safe Check: Second interaction",
        passed=passed,
        message="Correctly escalated" if passed else "Failed to escalate",
        details={"nodes_executed": analysis["nodes_executed"]}
    ))

    # Test 3: WhatsApp channel should respect limit
    payload = create_test_payload("Hola")
    payload["conversation"]["contact_inbox"]["inbox"]["channel_type"] = "Channel::Whatsapp"
    payload["conversation"]["custom_attributes"]["bot_interaction_count"] = 1

    exec_result = execute_workflow(payload)
    wait_for_execution()

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    escalated = "Preparar Escalado" in analysis["nodes_list"]
    passed = escalated

    results.append(TestResult(
        name="WhatsApp Safe Check: WhatsApp channel respects limit",
        passed=passed,
        message="Correctly escalated on WhatsApp" if passed else "Failed to escalate on WhatsApp",
        details={"nodes_executed": analysis["nodes_executed"]}
    ))

    return results


def run_phase1_tests():
    """Ejecuta todos los tests de Phase 1"""
    print_test_header("PHASE 1: INTENT CLASSIFICATION TESTS")

    all_results = []

    # Test CREATE_EVENT detection
    print(f"\n{Colors.BLUE}Testing CREATE_EVENT detection...{Colors.RESET}")
    all_results.extend(test_create_event_detection())

    # Test INFO detection
    print(f"\n{Colors.BLUE}Testing INFO detection...{Colors.RESET}")
    all_results.extend(test_info_detection())

    # Test PAYMENT detection
    print(f"\n{Colors.BLUE}Testing PAYMENT detection...{Colors.RESET}")
    all_results.extend(test_payment_detection())

    # Test HUMAN fallback
    print(f"\n{Colors.BLUE}Testing HUMAN fallback...{Colors.RESET}")
    all_results.extend(test_human_fallback())

    # Test WhatsApp Safe Check
    print(f"\n{Colors.BLUE}Testing WhatsApp Safe Check...{Colors.RESET}")
    all_results.extend(test_whatsapp_safe_check())

    # Print individual results
    print(f"\n{Colors.BOLD}Results:{Colors.RESET}")
    for result in all_results:
        print_test_result(result)

    # Print summary
    print_summary(all_results)

    return all_results


if __name__ == "__main__":
    results = run_phase1_tests()
    exit(0 if all(r.passed for r in results) else 1)
