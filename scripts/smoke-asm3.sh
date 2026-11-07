#!/usr/bin/env bash
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
  -d "{\"name\":\"ASM3\",\"clusterId\":\"asm3-${SUFFIX}\",\"transferInventory\":true,\"transferDinos\":false,\"transferTribute\":true}")
CID=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).cluster.id)' "$CLUSTER")
CTOKEN=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).cluster.clusterId)' "$CLUSTER")

echo "== instance =="
INST=$(curl -fsS -b "$CK" -X POST "$BASE/api/instances" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"ASM3 Island\",\"edition\":\"ASA\",\"mapId\":\"the-island\",\"sessionName\":\"ASM3\",\"gamePort\":7800,\"queryPort\":27100,\"rconPort\":27150,\"maxPlayers\":20,\"adminPassword\":\"testpass\",\"clusterId\":\"$CID\"}")
IID=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).instance.id)' "$INST")

echo "== files list/write/read =="
curl -fsS -b "$CK" "$BASE/api/instances/$IID/files" | grep -q 'entries'
curl -fsS -b "$CK" -X PUT "$BASE/api/instances/$IID/files/content" \
  -H 'content-type: application/json' \
  -d '{"path":"Config/hello.txt","content":"hello ark host\n"}' | grep -q '"size"'
curl -fsS -b "$CK" "$BASE/api/instances/$IID/files/content?path=Config%2Fhello.txt" | grep -q 'hello ark host'
curl -fsS -b "$CK" -X POST "$BASE/api/instances/$IID/files/mkdir" \
  -H 'content-type: application/json' \
  -d '{"path":"Saved/Logs"}' | grep -q 'Saved/Logs'

echo "== upload =="
echo 'upload-bytes' >/tmp/ark-upload.txt
curl -fsS -b "$CK" -X POST "$BASE/api/instances/$IID/files/upload?path=Config" \
  -F "file=@/tmp/ark-upload.txt" | grep -q 'ark-upload.txt'

echo "== download =="
curl -fsS -b "$CK" "$BASE/api/instances/$IID/files/download?path=Config%2Fhello.txt" | grep -q 'hello ark host'

echo "== cluster apply =="
curl -fsS -b "$CK" -X POST "$BASE/api/clusters/$CID/apply" | grep -q 'sharedDirHint'
test -f "/tmp/ark-host-instances/_cluster/${CTOKEN}/ark-host-cluster.json"
grep -q 'PreventDownloadDinos=True' /tmp/ark-host-instances/"$IID"/Config/GameUserSettings.ini
grep -q 'PreventDownloadItems=False' /tmp/ark-host-instances/"$IID"/Config/GameUserSettings.ini

echo "== launch preview =="
curl -fsS -b "$CK" "$BASE/api/instances/$IID/launch-preview" | grep -q 'ArkAscendedServer'

echo "== steamcmd mock =="
curl -fsS -b "$CK" -X POST "$BASE/api/instances/$IID/steamcmd-update" | grep -q '"mock":true'

echo "== start + console poll =="
curl -fsS -b "$CK" -X POST "$BASE/api/instances/$IID/start" | grep -qE '"status":"(mock|running)"'
curl -fsS -b "$CK" "$BASE/api/instances/$IID/console?after=-1" | grep -q 'Mock'

echo "== websocket bridge =="
node --input-type=module <<EOF
import WebSocket from 'ws';
import fs from 'fs';
const ck = fs.readFileSync('$CK','utf8');
const m = ck.match(/ark_host_session\s+(\S+)/);
if (!m) throw new Error('no session cookie');
const ws = new WebSocket('ws://127.0.0.1:3000/api/instances/$IID/console/ws?after=-1', {
  headers: { Cookie: 'ark_host_session=' + m[1] },
});
const timer = setTimeout(() => { console.error('ws timeout'); process.exit(1); }, 8000);
ws.on('message', (d) => {
  const msg = JSON.parse(String(d));
  if (msg.type === 'lines' && msg.lines?.length) {
    clearTimeout(timer);
    console.log('ws lines', msg.lines.length);
    ws.close();
    process.exit(0);
  }
});
ws.on('error', (e) => { console.error(e); process.exit(1); });
EOF

echo "== stop =="
curl -fsS -b "$CK" -X POST "$BASE/api/instances/$IID/stop" | grep -q '"status":"stopped"'

echo "ASM-3 OK"
