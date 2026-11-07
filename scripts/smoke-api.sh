#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-http://127.0.0.1:3000}"
CK="$(mktemp)"
trap 'rm -f "$CK"' EXIT

SUFFIX="$(date +%s)"

echo "health:"
curl -fsS "$BASE/api/health" | grep -q '"ok":true'
echo "  ok"

echo "login:"
curl -fsS -c "$CK" -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"changeme"}' | grep -q '"username":"admin"'
echo "  ok"

echo "create cluster:"
CLUSTER=$(curl -fsS -b "$CK" -X POST "$BASE/api/clusters" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Smoke\",\"clusterId\":\"smoke-${SUFFIX}\",\"transferInventory\":true,\"transferDinos\":true,\"transferTribute\":true}")
echo "$CLUSTER"
CID=$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.cluster.id)' "$CLUSTER")

PORTS=$(curl -fsS -b "$CK" "$BASE/api/meta")
GAME=$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(String(j.suggestedPorts.gamePort))' "$PORTS")
QUERY=$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(String(j.suggestedPorts.queryPort))' "$PORTS")
RCON=$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(String(j.suggestedPorts.rconPort))' "$PORTS")

echo "create instance:"
INST=$(curl -fsS -b "$CK" -X POST "$BASE/api/instances" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Smoke Island ${SUFFIX}\",\"edition\":\"ASA\",\"mapId\":\"the-island\",\"sessionName\":\"Smoke\",\"gamePort\":${GAME},\"queryPort\":${QUERY},\"rconPort\":${RCON},\"maxPlayers\":20,\"adminPassword\":\"testpass\",\"clusterId\":\"$CID\"}")
echo "$INST"
IID=$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.instance.id)' "$INST")

echo "start:"
curl -fsS -b "$CK" -X POST "$BASE/api/instances/$IID/start" | grep -qE '"status":"(mock|running)"'
echo "  ok"

echo "console:"
curl -fsS -b "$CK" "$BASE/api/instances/$IID/console" | grep -q 'lines'
echo "  ok"

echo "stop:"
curl -fsS -b "$CK" -X POST "$BASE/api/instances/$IID/stop" | grep -q '"status":"stopped"'
echo "  ok"

echo "OK"
