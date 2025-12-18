#!/bin/bash

# API Testing Script
# Tests all critical endpoints

API_URL="${API_URL:-http://localhost:3000}"
ADMIN_ADDRESS="${ADMIN_ADDRESS:-ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K}"

echo "🧪 Testing Stacks Payment Router API"
echo "======================================"
echo "API URL: $API_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local headers=$5
    
    echo -n "Testing $name... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -H "$headers" "$API_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -H "$headers" -d "$data" "$API_URL$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
        echo "  Response: $body"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# 1. Health Check
echo "1. Health Check"
test_endpoint "Health Check" "GET" "/health" "" ""
echo ""

# 2. Agent Endpoints (requires existing agent)
echo "2. Agent Endpoints"
test_endpoint "Get Agent Payments" "GET" "/api/v1/agents/$ADMIN_ADDRESS/payments" "" ""
test_endpoint "Get Agent Vault Stats" "GET" "/api/v1/agents/$ADMIN_ADDRESS/vault" "" ""
test_endpoint "Get Withdrawal History" "GET" "/api/v1/agents/$ADMIN_ADDRESS/withdrawals" "" ""
echo ""

# 3. Admin Endpoints
echo "3. Admin Endpoints"
test_endpoint "Get Pending Settlements" "GET" "/api/v1/admin/settlements/pending" "" "x-admin-address: $ADMIN_ADDRESS"
echo ""

# Summary
echo "======================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some tests failed. Check API server is running.${NC}"
    exit 1
fi

