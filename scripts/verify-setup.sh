#!/usr/bin/env bash
# Check whether the environment is ready for the booking → payment flow.
# Usage:  bash scripts/verify-setup.sh  [API_BASE_URL]
# Reads Supabase values from .env when present.

set -uo pipefail
API="${1:-http://localhost:4000/api}"
[ -f .env ] && set -a && . ./.env 2>/dev/null && set +a
URL="${SUPABASE_URL:-}"
KEY="${SUPABASE_PUBLISHABLE_KEY:-}"
pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); }

echo ""
echo "1. Database migration (20260804120000_booking_payment_flow.sql)"
if [ -z "$URL" ] || [ -z "$KEY" ]; then
  bad "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not set — cannot check"
else
  body=$(curl -s --noproxy '*' -X POST "$URL/rest/v1/rpc/create_booking_with_payment" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d '{"p_service_id":"00000000-0000-0000-0000-000000000000","p_specialist_id":"00000000-0000-0000-0000-000000000000","p_slot_id":"00000000-0000-0000-0000-000000000000"}' 2>/dev/null)
  case "$body" in
    *PGRST202*) bad "create_booking_with_payment NOT found — migration not applied yet" ;;
    *)          ok  "create_booking_with_payment exists — migration applied" ;;
  esac
fi

echo ""
echo "2. Payment gateway ($API/payments/config)"
cfg=$(curl -s --noproxy '*' "$API/payments/config" 2>/dev/null)
if [ -z "$cfg" ]; then
  bad "API not reachable at $API — start it with: npm run dev"
else
  case "$cfg" in
    *'"configured":true'*)
      ok "Moyasar keys configured"
      case "$cfg" in
        *'"testMode":true'*) ok "TEST mode — no real charges" ;;
        *) bad "LIVE mode — real cards will be charged. Use sk_test_/pk_test_ keys." ;;
      esac ;;
    *) bad "Moyasar keys not set (MOYASAR_SECRET_KEY / MOYASAR_PUBLISHABLE_KEY)" ;;
  esac
  case "$cfg" in
    *sk_live*|*sk_test*) bad "SECRET KEY LEAKED in the public config response!" ;;
    *) ok "secret key not exposed by the public endpoint" ;;
  esac
fi

echo ""
echo "3. Payment result persistence"
if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  ok "SUPABASE_SERVICE_ROLE_KEY set — verified payments will be recorded"
else
  bad "SUPABASE_SERVICE_ROLE_KEY missing — payments verify but bookings stay unconfirmed"
fi

echo ""
echo "4. OTP mode"
case "${VITE_AUTH_MODE:-mock}" in
  sms)  ok "sms — real one-time codes" ;;
  *)    bad "mock — fixed on-screen code. NOT for production." ;;
esac

echo ""
printf 'passed: %s   needs attention: %s\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
