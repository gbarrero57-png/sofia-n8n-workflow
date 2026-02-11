#!/usr/bin/env python3
"""
SofIA Testing Suite Runner
Ejecuta toda la suite de tests y genera reporte consolidado
"""

import sys
import os
import time
import argparse
from datetime import datetime

# Allow running as script or as module
if __name__ == "__main__" or not __package__:
    sys.path.insert(0, os.path.dirname(__file__))
    from test_phase1_classification import run_phase1_tests
    from test_phase2_calendar import run_phase2_tests
    from test_phase3_offer import run_phase3_tests
    from test_phase4_booking import run_phase4_tests
    from test_regression import run_regression_tests
    from utils import print_test_header, Colors
else:
    from .test_phase1_classification import run_phase1_tests
    from .test_phase2_calendar import run_phase2_tests
    from .test_phase3_offer import run_phase3_tests
    from .test_phase4_booking import run_phase4_tests
    from .test_regression import run_regression_tests
    from .utils import print_test_header, Colors


def print_banner():
    """Imprime banner de la suite"""
    banner = f"""
{Colors.BOLD}{Colors.CYAN}{'='*70}
                     SOFIA TESTING SUITE
                 n8n Workflow Automated Tests
                     Version 1.0 - 2026-02-10
{'='*70}{Colors.RESET}
"""
    print(banner)


def run_all_tests(phases=None):
    """
    Ejecuta toda la suite de tests o fases específicas

    Args:
        phases: Lista de fases a ejecutar (default: todas)

    Returns:
        Lista de todos los resultados
    """
    all_results = []
    start_time = time.time()

    # Define test suites
    test_suites = {
        "phase1": ("Phase 1: Classification", run_phase1_tests),
        "phase2": ("Phase 2: Calendar & Slots", run_phase2_tests),
        "phase3": ("Phase 3: Slot Offer", run_phase3_tests),
        "phase4": ("Phase 4: Event Creation", run_phase4_tests),
        "regression": ("Regression Tests", run_regression_tests)
    }

    # Determine which phases to run
    phases_to_run = phases if phases else list(test_suites.keys())

    # Run each test suite
    for phase_name in phases_to_run:
        if phase_name not in test_suites:
            print(f"{Colors.RED}Unknown phase: {phase_name}{Colors.RESET}")
            continue

        suite_name, suite_func = test_suites[phase_name]

        print(f"\n{Colors.YELLOW}{'='*70}{Colors.RESET}")
        print(f"{Colors.YELLOW}Running: {suite_name}{Colors.RESET}")
        print(f"{Colors.YELLOW}{'='*70}{Colors.RESET}")

        try:
            results = suite_func()
            all_results.extend(results)
        except Exception as e:
            print(f"{Colors.RED}Error running {suite_name}: {e}{Colors.RESET}")

        # Pause between test suites
        if phase_name != phases_to_run[-1]:
            print(f"\n{Colors.BLUE}Waiting 5 seconds before next suite...{Colors.RESET}")
            time.sleep(5)

    elapsed = time.time() - start_time
    return all_results, elapsed


def generate_report(results, elapsed_time, output_file=None):
    """
    Genera reporte consolidado de todos los tests

    Args:
        results: Lista de TestResults
        elapsed_time: Tiempo total de ejecución
        output_file: Path para guardar reporte (opcional)
    """
    # Calculate statistics
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)
    success_rate = (passed / total * 100) if total > 0 else 0

    # Generate report
    report = f"""
{Colors.BOLD}{Colors.MAGENTA}{'='*70}
                        FINAL TEST REPORT
{'='*70}{Colors.RESET}

Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Duration: {elapsed_time:.2f} seconds

{Colors.BOLD}SUMMARY:{Colors.RESET}
  Total Tests:   {total}
  {Colors.GREEN}Passed:        {passed}{Colors.RESET}
  {Colors.RED}Failed:        {failed}{Colors.RESET}
  Success Rate:  {success_rate:.1f}%

{Colors.BOLD}TEST BREAKDOWN:{Colors.RESET}
"""

    # Group results by phase
    phases = {}
    for result in results:
        phase = result.name.split(":")[0] if ":" in result.name else "Other"
        if phase not in phases:
            phases[phase] = {"passed": 0, "failed": 0, "tests": []}

        if result.passed:
            phases[phase]["passed"] += 1
        else:
            phases[phase]["failed"] += 1
        phases[phase]["tests"].append(result)

    # Print phase breakdown
    for phase, data in phases.items():
        total_phase = data["passed"] + data["failed"]
        rate = (data["passed"] / total_phase * 100) if total_phase > 0 else 0
        status = f"{Colors.GREEN}[PASS]{Colors.RESET}" if data["failed"] == 0 else f"{Colors.RED}[FAIL]{Colors.RESET}"

        report += f"\n{status} {phase}:\n"
        report += f"   Passed: {data['passed']}/{total_phase} ({rate:.0f}%)\n"

        # List failed tests
        if data["failed"] > 0:
            report += f"   {Colors.RED}Failed tests:{Colors.RESET}\n"
            for test in data["tests"]:
                if not test.passed:
                    report += f"     - {test.name}: {test.message}\n"

    # Failed tests summary
    if failed > 0:
        report += f"\n{Colors.RED}{Colors.BOLD}FAILED TESTS DETAILS:{Colors.RESET}\n"
        for result in results:
            if not result.passed:
                report += f"\n  {Colors.RED}[FAIL] {result.name}{Colors.RESET}\n"
                report += f"    Message: {result.message}\n"
                if result.details:
                    report += f"    Details:\n"
                    for key, value in result.details.items():
                        report += f"      - {key}: {value}\n"

    # Recommendations
    report += f"\n{Colors.BOLD}RECOMMENDATIONS:{Colors.RESET}\n"
    if success_rate == 100:
        report += f"  {Colors.GREEN}[PASS] All tests passed! Workflow is production-ready.{Colors.RESET}\n"
    elif success_rate >= 90:
        report += f"  {Colors.YELLOW}[WARN] Most tests passed. Review failed tests before deployment.{Colors.RESET}\n"
    elif success_rate >= 70:
        report += f"  {Colors.YELLOW}[WARN] Several tests failed. Investigation required.{Colors.RESET}\n"
    else:
        report += f"  {Colors.RED}[FAIL] Critical failures detected. Workflow needs fixes before deployment.{Colors.RESET}\n"

    print(report)

    # Save to file if requested
    if output_file:
        # Remove color codes for file output
        clean_report = report
        for color_code in [Colors.GREEN, Colors.RED, Colors.YELLOW, Colors.BLUE, Colors.MAGENTA, Colors.CYAN, Colors.BOLD, Colors.RESET]:
            clean_report = clean_report.replace(color_code, "")

        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(clean_report)
        print(f"\n{Colors.GREEN}Report saved to: {output_file}{Colors.RESET}")


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="SofIA n8n Workflow Testing Suite")
    parser.add_argument(
        "--phases",
        nargs="+",
        choices=["phase1", "phase2", "phase3", "phase4", "regression", "all"],
        default=["all"],
        help="Phases to test (default: all)"
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        help="Output file for test report"
    )

    args = parser.parse_args()

    # Print banner
    print_banner()

    # Determine phases to run
    phases = None if "all" in args.phases else args.phases

    # Run tests
    print(f"{Colors.BLUE}Starting test execution...{Colors.RESET}\n")
    results, elapsed = run_all_tests(phases)

    # Generate report
    generate_report(results, elapsed, args.output)

    # Exit with appropriate code
    exit_code = 0 if all(r.passed for r in results) else 1
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
