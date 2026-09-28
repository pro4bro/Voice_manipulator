import { createHash, randomUUID } from "node:crypto";

const password = process.env.OBS_WEBSOCKET_PASSWORD;
const durationMs = Number(process.argv[2] ?? 10000);
if (!password) throw new Error("Set OBS_WEBSOCKET_PASSWORD for the local OBS test profile.");

const socket = new WebSocket("ws://127.0.0.1:4455");
const timeout = setTimeout(() => fail("OBS WebSocket did not finish the smoke recording."), durationMs + 15000);

function encodedHash(value) {
  return createHash("sha256").update(value).digest("base64");
}

function fail(message) {
  clearTimeout(timeout);
  try { socket.close(); } catch {}
  console.error(message);
  process.exitCode = 1;
}

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.op === 0) {
    const authentication = message.d.authentication;
    const secret = encodedHash(password + authentication.salt);
    socket.send(JSON.stringify({
      op: 1,
      d: { rpcVersion: 1, authentication: encodedHash(secret + authentication.challenge) },
    }));
    return;
  }
  if (message.op === 2) {
    setTimeout(() => socket.send(JSON.stringify({
      op: 6,
      d: { requestType: "StopRecord", requestId: randomUUID(), requestData: {} },
    })), durationMs);
    return;
  }
  if (message.op === 7 && message.d.requestType === "StopRecord") {
    clearTimeout(timeout);
    if (!message.d.requestStatus.result) return fail(message.d.requestStatus.comment ?? "OBS refused StopRecord.");
    console.log("OBS recording stopped cleanly through the local WebSocket.");
    socket.close();
  }
});
socket.addEventListener("error", () => fail("Cannot connect to local OBS WebSocket on port 4455."));
