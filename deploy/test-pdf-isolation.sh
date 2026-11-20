#!/usr/bin/env bash
# Ephemeral GitHub Actions only. Exercises a real isolated parser container.
set -euo pipefail
root="$(mktemp -d)"
name="suportai-pdf-ci-$$"
cleanup(){
  docker rm -f "$name" >/dev/null 2>&1 || true
  sudo chown -R "$(id -u):$(id -g)" "$root" >/dev/null 2>&1 || true
  rm -rf "$root"
}
trap cleanup EXIT
mkdir -p "$root/socket" "$root/fixture"
chmod 0711 "$root"
chmod 0755 "$root/fixture"
chmod 0700 "$root/socket"
sudo chown 10001:10001 "$root/socket"
node - "$root/fixture/synthetic.pdf" <<'NODE'
const {PDFDocument,StandardFonts}=require('pdf-lib');
const fs=require('node:fs');
(async()=>{
 const pdf=await PDFDocument.create();
 const page=pdf.addPage([600,420]);
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 page.drawText('Laboratorio ficticio: registrar resultados do backup semanal e conferir evidencias.',{
   x:28,y:300,size:11,font
 });
 fs.writeFileSync(process.argv[2],await pdf.save({useObjectStreams:false}));
})().catch(()=>process.exitCode=1);
NODE

docker run -d --name "$name" --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user 10001:10001 \
  --memory 384m --cpus 0.75 --pids-limit 64 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=$root/socket,dst=/run/suportai" \
  --env NODE_ENV=production --env PDF_PARSER_SOCKET=/run/suportai/pdf-parser.sock \
  suportai/runtime:ci node apps/api/dist/pdf-parser-server.js >/dev/null

for ((i=0;i<40;i++)); do
  if docker exec "$name" node -e \
     "if(!require('node:fs').statSync('/run/suportai/pdf-parser.sock').isSocket())process.exit(1)" \
     >/dev/null 2>&1; then break; fi
  sleep 0.25
done
docker exec "$name" node -e "if(!require('node:fs').statSync('/run/suportai/pdf-parser.sock').isSocket())process.exit(1)"
test "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$name")" = none
test "$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}}' "$name")" = true
docker exec "$name" node apps/api/dist/pdf-isolation-preflight.js | grep -q "Controles básicos do processo: OK"

# The parser has no credentials, and even direct TCP egress is unavailable.
docker exec "$name" node -e '
 const blocked=["DATABASE_URL","DATABASE_URL_FILE","OPENAI_API_KEY","OPENAI_API_KEY_FILE","BOOTSTRAP_ADMIN_PASSWORD"];
 if(blocked.some(k=>process.env[k]))process.exit(1);
'
docker exec "$name" node -e '
 const c=require("node:net").connect({host:"1.1.1.1",port:80,timeout:1200});
 c.on("connect",()=>process.exit(1));
 c.on("error",()=>process.exit(0));
 c.on("timeout",()=>{c.destroy();process.exit(0);});
'

# A second process with a read-only socket mount uses the same IPC client as the worker.
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user 10001:10001 \
  --mount "type=bind,src=$root/socket,dst=/run/suportai,readonly" \
  --mount "type=bind,src=$root/fixture,dst=/fixture,readonly" \
  suportai/runtime:ci node --input-type=module -e '
 import {readFileSync} from "node:fs";
 import {extractPdfViaSocket} from "./apps/api/dist/pdf-socket-client.js";
 const text=await extractPdfViaSocket(readFileSync("/fixture/synthetic.pdf"),"/run/suportai/pdf-parser.sock");
 if(!text.includes("backup semanal"))process.exit(1);
 console.log("Isolated PDF extraction through Unix socket: OK");
'

# The reader must NOT transparently fall back to local parsing when it is down.
docker stop -t 2 "$name" >/dev/null
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user 10001:10001 \
  --mount "type=bind,src=$root/socket,dst=/run/suportai,readonly" \
  --mount "type=bind,src=$root/fixture,dst=/fixture,readonly" \
  --env NODE_ENV=production --env PDF_PARSER_SOCKET=/run/suportai/pdf-parser.sock \
  suportai/runtime:ci node --input-type=module -e '
 import {readFileSync} from "node:fs";
 import {extractPdfText} from "./apps/api/dist/pdf-extract.js";
 let message="";
 try{await extractPdfText(readFileSync("/fixture/synthetic.pdf"));}
 catch(error){message=error?.message||"";}
 if(message!=="Leitor de PDF isolado indisponível")process.exit(1);
 console.log("Parser outage fails closed without local fallback: OK");
'
