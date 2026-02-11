#!/usr/bin/env python3
"""
Phase 4 Testing: Slot Confirmation & Event Creation
Tests para validar confirmación de slot y creación automática de evento
"""

import sys
import os
import json

# Allow running as script or as module
if __name__ == "__main__" or not __package__:
    sys.path.insert(0, os.path.dirname(__file__))
    from utils import *
    from config import *
else:
    from .utils import *
    from .config import *


def test_slot_confirmation_detection():
    """Test: Detecta segunda interacción correctamente"""
    # Simulate second interaction with awaiting_slot_confirmation = true
    offered_slots = [
        {"start_iso": "2026-02-11T14:00:00-05:00", "end_iso": "2026-02-11T14:30:00-05:00", "date": "martes, 11 de febrero de 2026", "time": "02:00 p.m."},
        {"start_iso": "2026-02-11T15:00:00-05:00", "end_iso": "2026-02-11T15:30:00-05:00", "date": "martes, 11 de febrero de 2026", "time": "03:00 p.m."},
        {"start_iso": "2026-02-12T09:00:00-05:00", "end_iso": "2026-02-12T09:30:00-05:00", "date": "miércoles, 12 de febrero de 2026", "time": "09:00 a.m."}
    ]

    payload = create_test_payload(
        "La opción 2",
        custom_attributes={
            "awaiting_slot_confirmation": "true",
            "offered_slots": json.dumps(offered_slots),
            "bot_interaction_count": 1
        }
    )

    exec_result = execute_workflow(payload)
    wait_for_execution(10)  # Phase 4 takes longer (creates event)

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Check if slot confirmation was detected
    slot_conf_pending = analysis.get("key_outputs", {}).get("slot_confirmation_pending", False)

    return TestResult(
        name="Slot Confirmation Detection: Detects second interaction",
        passed=slot_conf_pending,
        message="Second interaction detected" if slot_conf_pending else "Failed to detect second interaction",
        details={
            "slot_confirmation_pending": slot_conf_pending,
            "execution_id": analysis["execution_id"]
        }
    )


def test_slot_choice_processing():
    """Test: Procesa elección de slot correctamente"""
    offered_slots = [
        {"start_iso": "2026-02-11T14:00:00-05:00", "end_iso": "2026-02-11T14:30:00-05:00", "date": "martes, 11 de febrero de 2026", "time": "02:00 p.m."},
        {"start_iso": "2026-02-11T15:00:00-05:00", "end_iso": "2026-02-11T15:30:00-05:00", "date": "martes, 11 de febrero de 2026", "time": "03:00 p.m."},
        {"start_iso": "2026-02-12T09:00:00-05:00", "end_iso": "2026-02-12T09:30:00-05:00", "date": "miércoles, 12 de febrero de 2026", "time": "09:00 a.m."}
    ]

    payload = create_test_payload(
        "La opción 2 por favor",
        custom_attributes={
            "awaiting_slot_confirmation": "true",
            "offered_slots": json.dumps(offered_slots),
            "bot_interaction_count": 1
        }
    )

    exec_result = execute_workflow(payload)
    wait_for_execution(10)

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Check if slot was chosen
    slot_chosen = analysis.get("key_outputs", {}).get("slot_chosen", False)

    return TestResult(
        name="Slot Choice Processing: Identifies slot selection",
        passed=slot_chosen,
        message="Slot chosen successfully" if slot_chosen else "Failed to identify slot",
        details={
            "slot_chosen": slot_chosen,
            "execution_id": analysis["execution_id"]
        }
    )


def test_event_creation():
    """Test: Crea evento en Google Calendar"""
    offered_slots = [
        {"start_iso": "2026-02-11T14:00:00-05:00", "end_iso": "2026-02-11T14:30:00-05:00", "date": "martes, 11 de febrero de 2026", "time": "02:00 p.m."},
        {"start_iso": "2026-02-11T15:00:00-05:00", "end_iso": "2026-02-11T15:30:00-05:00", "date": "martes, 11 de febrero de 2026", "time": "03:00 p.m."},
        {"start_iso": "2026-02-12T09:00:00-05:00", "end_iso": "2026-02-12T09:30:00-05:00", "date": "miércoles, 12 de febrero de 2026", "time": "09:00 a.m."}
    ]

    payload = create_test_payload(
        "1",
        custom_attributes={
            "awaiting_slot_confirmation": "true",
            "offered_slots": json.dumps(offered_slots),
            "bot_interaction_count": 1
        }
    )

    exec_result = execute_workflow(payload)
    wait_for_execution(10)

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Check if event was created
    event_created = analysis.get("key_outputs", {}).get("event_created", False)

    return TestResult(
        name="Event Creation: Creates event in Google Calendar",
        passed=event_created,
        message=f"Event created (ID: {analysis.get('key_outputs', {}).get('event_id', 'N/A')})" if event_created else "Failed to create event",
        details={
            "event_created": event_created,
            "event_id": analysis.get("key_outputs", {}).get("event_id", "N/A"),
            "execution_id": analysis["execution_id"]
        }
    )


def test_confirmation_message():
    """Test: Envía mensaje de confirmación al paciente"""
    offered_slots = [
        {"start_iso": "2026-02-11T14:00:00-05:00", "end_iso": "2026-02-11T14:30:00-05:00", "date": "martes, 11 de febrero de 2026", "time": "02:00 p.m."},
        {"start_iso": "2026-02-11T15:00:00-05:00", "end_iso": "2026-02-11T15:30:00-05:00", "date": "martes, 11 de febrero de 2026", "time": "03:00 p.m."},
        {"start_iso": "2026-02-12T09:00:00-05:00", "end_iso": "2026-02-12T09:30:00-05:00", "date": "miércoles, 12 de febrero de 2026", "time": "09:00 a.m."}
    ]

    payload = create_test_payload(
        "3",
        custom_attributes={
            "awaiting_slot_confirmation": "true",
            "offered_slots": json.dumps(offered_slots),
            "bot_interaction_count": 1
        }
    )

    exec_result = execute_workflow(payload)
    wait_for_execution(10)

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Check if confirmation nodes executed
    confirm_executed = "Confirmar al Paciente" in analysis["nodes_list"]
    send_executed = "Enviar Confirmación" in analysis["nodes_list"]

    passed = confirm_executed and send_executed

    return TestResult(
        name="Confirmation Message: Sends confirmation to patient",
        passed=passed,
        message="Confirmation sent" if passed else "Failed to send confirmation",
        details={
            "confirm_node": confirm_executed,
            "send_node": send_executed,
            "execution_id": analysis["execution_id"]
        }
    )


def test_ambiguous_response_handling():
    """Test: Maneja respuestas ambiguas correctamente"""
    offered_slots = [
        {"start_iso": "2026-02-11T14:00:00-05:00", "end_iso": "2026-02-11T14:30:00-05:00", "date": "martes, 11 de febrero de 2026", "time": "02:00 p.m."},
        {"start_iso": "2026-02-11T15:00:00-05:00", "end_iso": "2026-02-11T15:30:00-05:00", "date": "martes, 11 de febrero de 2026", "time": "03:00 p.m."},
        {"start_iso": "2026-02-12T09:00:00-05:00", "end_iso": "2026-02-12T09:30:00-05:00", "date": "miércoles, 12 de febrero de 2026", "time": "09:00 a.m."}
    ]

    payload = create_test_payload(
        "El del martes mejor",  # Ambiguous - multiple Tuesday slots
        custom_attributes={
            "awaiting_slot_confirmation": "true",
            "offered_slots": json.dumps(offered_slots),
            "bot_interaction_count": 1
        }
    )

    exec_result = execute_workflow(payload)
    wait_for_execution(7)

    execution = get_latest_execution()
    analysis = analyze_execution(execution)

    # Check if clarification was requested
    clarification_executed = "Pedir Aclaración" in analysis["nodes_list"]

    return TestResult(
        name="Ambiguous Response: Requests clarification",
        passed=clarification_executed,
        message="Clarification requested" if clarification_executed else "Accepted ambiguous response (may need review)",
        details={
            "clarification_node": clarification_executed,
            "execution_id": analysis["execution_id"]
        }
    )


def run_phase4_tests():
    """Ejecuta todos los tests de Phase 4"""
    print_test_header("PHASE 4: SLOT CONFIRMATION & EVENT CREATION TESTS")

    results = []

    # Test Slot Confirmation Detection
    print(f"\n{Colors.BLUE}Testing slot confirmation detection...{Colors.RESET}")
    results.append(test_slot_confirmation_detection())

    # Test Slot Choice Processing
    print(f"\n{Colors.BLUE}Testing slot choice processing...{Colors.RESET}")
    results.append(test_slot_choice_processing())

    # Test Event Creation
    print(f"\n{Colors.BLUE}Testing event creation in Google Calendar...{Colors.RESET}")
    results.append(test_event_creation())

    # Test Confirmation Message
    print(f"\n{Colors.BLUE}Testing confirmation message...{Colors.RESET}")
    results.append(test_confirmation_message())

    # Test Ambiguous Response Handling
    print(f"\n{Colors.BLUE}Testing ambiguous response handling...{Colors.RESET}")
    results.append(test_ambiguous_response_handling())

    # Print results
    print(f"\n{Colors.BOLD}Results:{Colors.RESET}")
    for result in results:
        print_test_result(result)

    print_summary(results)

    return results


if __name__ == "__main__":
    results = run_phase4_tests()
    exit(0 if all(r.passed for r in results) else 1)
