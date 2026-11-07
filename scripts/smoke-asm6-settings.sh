#!/usr/bin/env bash
# ASM-6 richer settings smoke (mock-safe).
set -euo pipefail
BASE="${1:-http://127.0.0.1:3000}"
CK="$(mktemp)"
trap 'rm -f "$CK"' EXIT
SUFFIX="$(date +%s)"

echo "== login =="
curl -fsS -c "$CK" -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"changeme"}' | grep -q '"username":"admin"'

echo "== cluster =="
CLUSTER=$(curl -fsS -b "$CK" -X POST "$BASE/api/clusters" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"ASM6\",\"clusterId\":\"asm6-${SUFFIX}\",\"transferInventory\":true,\"transferDinos\":true,\"transferTribute\":false}")
CID=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).cluster.id)' "$CLUSTER")

echo "== instance =="
INST=$(curl -fsS -b "$CK" -X POST "$BASE/api/instances" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"ASM6 Settings\",\"edition\":\"ASA\",\"mapId\":\"the-island\",\"sessionName\":\"ASM6\",\"gamePort\":7900,\"queryPort\":27200,\"rconPort\":27250,\"maxPlayers\":40,\"adminPassword\":\"testpass\",\"clusterId\":\"$CID\"}")
IID=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).instance.id)' "$INST")

echo "== get settings =="
curl -fsS -b "$CK" "$BASE/api/instances/$IID/settings" | grep -q '"sessionName":"ASM6"'

echo "== save rich settings =="
SAVE=$(curl -fsS -b "$CK" -X PUT "$BASE/api/instances/$IID/settings" \
  -H 'content-type: application/json' \
  -d "{
    \"settings\": {
      \"name\": \"ASM6 Settings\",
      \"sessionName\": \"ASM6 Rich\",
      \"serverPassword\": \"joinme\",
      \"adminPassword\": \"testpass\",
      \"maxPlayers\": 55,
      \"mapId\": \"ragnarok\",
      \"difficultyOffset\": 1,
      \"overrideOfficialDifficulty\": 5,
      \"xpMultiplier\": 2.5,
      \"tamingSpeedMultiplier\": 3,
      \"harvestAmountMultiplier\": 4,
      \"harvestHealthMultiplier\": 1.5,
      \"resourcesRespawnPeriodMultiplier\": 0.5,
      \"matingIntervalMultiplier\": 0.25,
      \"eggHatchSpeedMultiplier\": 10,
      \"babyMatureSpeedMultiplier\": 20,
      \"babyCuddleIntervalMultiplier\": 0.5,
      \"babyImprintAmountMultiplier\": 2,
      \"layEggIntervalMultiplier\": 0.5,
      \"structureResistanceMultiplier\": 1,
      \"structureDamageMultiplier\": 1,
      \"structurePreventResourceRadiusMultiplier\": 1,
      \"pveStructureDecayPeriodMultiplier\": 1,
      \"maxStructuresInRange\": 10500,
      \"serverPve\": true,
      \"disableStructureDecayPve\": true,
      \"disableDinoDecayPve\": false,
      \"allowCaveBuildingPve\": true,
      \"gamePort\": 7900,
      \"queryPort\": 27200,
      \"rconPort\": 27250,
      \"rconPassword\": \"rconpass\",
      \"crossplay\": true,
      \"battleEye\": false,
      \"modList\": [{\"id\":\"928619\",\"enabled\":true},{\"id\":\"111111\",\"enabled\":false},{\"id\":\"222222\",\"enabled\":true}],
      \"clusterId\": \"$CID\",
      \"transferInventory\": true,
      \"transferDinos\": false,
      \"transferTribute\": true,
      \"autoSavePeriodMinutes\": 12,
      \"messageOfTheDay\": \"Welcome ASM6\",
      \"extraArgs\": \"-ForceAllowCaveFlyers\"
    }
  }")
echo "$SAVE" | grep -q 'Settings saved'
echo "$SAVE" | grep -q 'XPMultiplier=2.5'
echo "$SAVE" | grep -q 'MatingIntervalMultiplier=0.25'
echo "$SAVE" | grep -q 'ServerPVE=True'
echo "$SAVE" | grep -q 'Welcome ASM6'

GUS="/tmp/ark-host-instances/$IID/Config/GameUserSettings.ini"
GAME="/tmp/ark-host-instances/$IID/Config/Game.ini"
test -f "$GUS"
test -f "$GAME"
grep -q 'XPMultiplier=2.5' "$GUS"
grep -q 'OverrideOfficialDifficulty=5' "$GUS"
grep -q 'BabyMatureSpeedMultiplier=20' "$GUS"
grep -q 'DisableStructureDecayPVE=True' "$GUS"
grep -q 'PreventDownloadDinos=True' "$GUS"
grep -q 'Message=Welcome ASM6' "$GUS"
grep -q 'MatingIntervalMultiplier=0.25' "$GAME"

echo "== start reapplies INI + mods launch =="
# Delete GUS so start must rewrite managed settings (Claude ARK Panel behavior)
rm -f "$GUS"
curl -fsS -b "$CK" -X POST "$BASE/api/instances/$IID/start" | grep -qE '"status":"(mock|running)"'
test -f "$GUS"
grep -q 'SessionName=ASM6 Rich' "$GUS"
grep -q 'XPMultiplier=2.5' "$GUS"
grep -q 'Applied game settings to INI' <<<"$(curl -fsS -b "$CK" "$BASE/api/instances/$IID/console?after=-1")"
# launch preview should include enabled mods only (order preserved) and NoBattlEye
PREV=$(curl -fsS -b "$CK" "$BASE/api/instances/$IID/launch-preview")
echo "$PREV" | grep -q 'mods=928619,222222'
echo "$PREV" | grep -q 'NoBattlEye'
echo "$PREV" | grep -q 'ServerPlatform=All'
echo "$PREV" | grep -q 'SessionName=ASM6 Rich'

echo "== stop =="
curl -fsS -b "$CK" -X POST "$BASE/api/instances/$IID/stop" | grep -q '"status":"stopped"'

echo "ASM-6 settings OK"
