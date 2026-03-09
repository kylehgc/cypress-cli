#!/usr/bin/env bash
# validation/run-all.sh — Quick smoke test for all validation scenarios.
#
# Runs command sequences non-interactively. Does NOT verify snapshot contents
# (that requires an LLM or human). Only checks that commands return without
# error exit codes.
#
# Usage:
#   bash validation/run-all.sh [--headed] [--scenario N]
#
# Options:
#   --headed      Run with visible browser
#   --scenario N  Run only scenario N (1-4)

set -euo pipefail

CLI="node bin/cypress-cli"
OUTDIR="/tmp/cypress-cli-validation"
HEADED_FLAG=""
SCENARIO_FILTER=""

for arg in "$@"; do
  case "$arg" in
    --headed) HEADED_FLAG="--headed" ;;
    --scenario) shift; SCENARIO_FILTER="$1" ;;
    --scenario=*) SCENARIO_FILTER="${arg#*=}" ;;
  esac
done

mkdir -p "$OUTDIR"

passed=0
failed=0
skipped=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log_header() {
  echo ""
  echo "================================================================"
  echo "  $1"
  echo "================================================================"
}

log_step() {
  echo "  → $1"
}

log_pass() {
  echo "  ✓ $1"
  ((passed++))
}

log_fail() {
  echo "  ✗ FAILED: $1"
  ((failed++))
}

run_cmd() {
  local description="$1"
  shift
  log_step "$description"
  if $CLI "$@" > /dev/null 2>&1; then
    log_pass "$description"
    return 0
  else
    log_fail "$description ($*)"
    return 1
  fi
}

run_cmd_allow_fail() {
  local description="$1"
  shift
  log_step "$description"
  if $CLI "$@" > /dev/null 2>&1; then
    log_pass "$description"
  else
    log_fail "$description ($*)"
  fi
}

stop_session() {
  $CLI stop > /dev/null 2>&1 || true
  sleep 1
}

# ---------------------------------------------------------------------------
# Scenario 1: TodoMVC
# ---------------------------------------------------------------------------

run_scenario_1() {
  log_header "Scenario 1: TodoMVC (demo.playwright.dev/todomvc)"

  stop_session

  if ! run_cmd "Open TodoMVC" open https://demo.playwright.dev/todomvc $HEADED_FLAG; then
    echo "  ⚠ Could not open page, skipping scenario"
    ((skipped++))
    return
  fi

  run_cmd "Assert title" asserttitle contain 'TodoMVC'
  run_cmd "Snapshot" snapshot

  # We don't know the exact refs ahead of time, so we use snapshot + type
  # For smoke testing, we just verify commands don't crash
  run_cmd_allow_fail "Export test" export --file "$OUTDIR/todomvc.cy.ts" --describe 'TodoMVC' --it 'manages todos'

  run_cmd "Stop session" stop
  echo ""
  echo "  Scenario 1 complete."
}

# ---------------------------------------------------------------------------
# Scenario 2: SauceDemo
# ---------------------------------------------------------------------------

run_scenario_2() {
  log_header "Scenario 2: SauceDemo (www.saucedemo.com)"

  stop_session

  if ! run_cmd "Open SauceDemo" open https://www.saucedemo.com $HEADED_FLAG; then
    echo "  ⚠ Could not open page, skipping scenario"
    ((skipped++))
    return
  fi

  run_cmd "Assert title" asserttitle contain 'Swag Labs'
  run_cmd "Snapshot" snapshot
  run_cmd "Screenshot" screenshot --filename "$OUTDIR/saucedemo-login"

  run_cmd_allow_fail "Export test" export --file "$OUTDIR/saucedemo.cy.ts" --describe 'SauceDemo' --it 'completes purchase'

  run_cmd "Stop session" stop
  echo ""
  echo "  Scenario 2 complete."
}

# ---------------------------------------------------------------------------
# Scenario 3: The Internet
# ---------------------------------------------------------------------------

run_scenario_3() {
  log_header "Scenario 3: The Internet (the-internet.herokuapp.com)"

  stop_session

  if ! run_cmd "Open The Internet" open https://the-internet.herokuapp.com $HEADED_FLAG; then
    echo "  ⚠ Could not open page, skipping scenario"
    ((skipped++))
    return
  fi

  run_cmd "Snapshot homepage" snapshot
  run_cmd "Navigate to checkboxes" navigate https://the-internet.herokuapp.com/checkboxes
  run_cmd "Snapshot checkboxes" snapshot
  run_cmd "Navigate to dropdown" navigate https://the-internet.herokuapp.com/dropdown
  run_cmd "Snapshot dropdown" snapshot
  run_cmd "Navigate to login" navigate https://the-internet.herokuapp.com/login
  run_cmd "Snapshot login" snapshot
  run_cmd "Navigate to JS alerts" navigate https://the-internet.herokuapp.com/javascript_alerts
  run_cmd "Snapshot JS alerts" snapshot
  run_cmd "Navigate to key presses" navigate https://the-internet.herokuapp.com/key_presses
  run_cmd "Snapshot key presses" snapshot

  run_cmd_allow_fail "Export test" export --file "$OUTDIR/the-internet.cy.ts" --describe 'The Internet' --it 'multi-page tour'

  run_cmd "Stop session" stop
  echo ""
  echo "  Scenario 3 complete."
}

# ---------------------------------------------------------------------------
# Scenario 4: RealWorld Conduit
# ---------------------------------------------------------------------------

run_scenario_4() {
  log_header "Scenario 4: RealWorld Conduit (demo.realworld.show)"

  stop_session

  if ! run_cmd "Open Conduit" open https://demo.realworld.show $HEADED_FLAG; then
    echo "  ⚠ Could not open page, skipping scenario"
    ((skipped++))
    return
  fi

  run_cmd "Assert title" asserttitle contain 'Conduit'
  run_cmd "Snapshot home" snapshot
  run_cmd "Screenshot home" screenshot --filename "$OUTDIR/conduit-home"

  run_cmd_allow_fail "Export test" export --file "$OUTDIR/conduit.cy.ts" --describe 'Conduit' --it 'CRUD workflow'

  run_cmd "Stop session" stop
  echo ""
  echo "  Scenario 4 complete."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

echo "cypress-cli LLM Validation — Smoke Test"
echo "========================================"
echo "Output directory: $OUTDIR"
echo ""

# Ensure built
if [ ! -f dist/injected.iife.js ]; then
  echo "ERROR: IIFE bundle not found. Run 'npm run build' first."
  exit 1
fi

if [ -n "$SCENARIO_FILTER" ]; then
  case "$SCENARIO_FILTER" in
    1) run_scenario_1 ;;
    2) run_scenario_2 ;;
    3) run_scenario_3 ;;
    4) run_scenario_4 ;;
    *) echo "Unknown scenario: $SCENARIO_FILTER (use 1-4)"; exit 1 ;;
  esac
else
  run_scenario_1
  run_scenario_2
  run_scenario_3
  run_scenario_4
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "========================================"
echo "  Summary"
echo "========================================"
echo "  Passed:  $passed"
echo "  Failed:  $failed"
echo "  Skipped: $skipped"
echo ""

if [ "$failed" -gt 0 ]; then
  echo "  ⚠ Some commands failed. Check output above."
  exit 1
else
  echo "  All smoke tests passed."
fi
