import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

loadLocalEnvironment();

const config = readConfiguration();
const request = await buildRequest(config);
const tokenClaims = await verifyAccessToken(request.token, config);
const serializedBody = JSON.stringify(request.body);
const parsedBody = JSON.parse(serializedBody);

validateRequest(request, parsedBody, tokenClaims);

console.log("dry_run=passed");
console.log(`provider=${config.provider}`);
console.log("endpoint_path=/v2/mascot/incubations");
console.log(`payload_content_type=${parsedBody.content_type}`);
console.log(`payload_base64_bytes=${Buffer.from(parsedBody.image_base64, "base64").byteLength}`);
console.log(`payload_keys=${Object.keys(parsedBody).sort().join(",")}`);
console.log("headers=authorization,content-type,x-bff-request-id,x-correlation-id,x-idempotency-key,x-operation-id");
console.log("jwt_alg=HS256");
console.log("jwt_claims_valid=true");
console.log("network_request_sent=false");
console.log("gpu_execution=false");

function readConfiguration() {
  const provider = process.env.MASCOT_GENERATION_PROVIDER ?? "mock";
  const modalApiUrl = process.env.MODAL_MASCOT_API_URL?.replace(/\/$/, "") ?? "";
  const secret = process.env.MODAL_BFF_JWT_SECRET ?? "";
  const issuer = process.env.MODAL_BFF_JWT_ISSUER ?? "puleiro-bff";
  const audience = process.env.MODAL_BFF_JWT_AUDIENCE ?? "gru-modal";
  const ttlSeconds = boundedPositiveInteger(process.env.MODAL_BFF_JWT_TTL_SECONDS, 90, 120);

  if (provider !== "modal") fail("MASCOT_GENERATION_PROVIDER deve ser modal para este dry-run.");
  if (!/^https:\/\//.test(modalApiUrl)) fail("MODAL_MASCOT_API_URL deve ser uma URL HTTPS.");
  if (secret.length < 32) fail("MODAL_BFF_JWT_SECRET deve ter pelo menos 32 caracteres.");

  return { provider, modalApiUrl, secret, issuer, audience, ttlSeconds };
}

async function buildRequest(config) {
  const ownerId = randomUUID();
  const attemptId = randomUUID();
  const correlationId = randomUUID();
  const operationId = randomUUID();
  const requestId = randomUUID();
  const idempotencyKey = `qa-dry-run:${randomUUID()}`;
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

  const body = {
    image_base64: bytes.toString("base64"),
    content_type: "image/png",
    attempt_id: attemptId,
    subject_identity: {
      category: "animal",
      label: "Mascote QA",
      species: "galo",
      confirmed: true,
    },
    pose_choices: {
      normal: "normal_attentive",
      listening: "listening_focus",
      transcribing: "transcribing_fast",
    },
    subject_hint: {
      version: "subject-hint-policy-v2",
      suggestedCategory: "animal",
      confidenceBand: "high",
      requiresConfirmation: false,
      overrideConfirmed: false,
    },
  };
  const token = await createAccessToken(config, ownerId, attemptId);

  return {
    endpoint: `${config.modalApiUrl}/v2/mascot/incubations`,
    token,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Idempotency-Key": idempotencyKey,
      "X-Correlation-Id": correlationId,
      "X-Operation-Id": operationId,
      "X-Bff-Request-Id": requestId,
    },
    body,
    ownerId,
    attemptId,
    idempotencyKey,
    correlationId,
    operationId,
    requestId,
  };
}

function createAccessToken(config, ownerId, attemptId) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ attempt_id: attemptId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject(ownerId)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + config.ttlSeconds)
    .sign(new TextEncoder().encode(config.secret));
}

async function verifyAccessToken(tokenPromise, config) {
  const token = await tokenPromise;
  const verified = await jwtVerify(token, new TextEncoder().encode(config.secret), {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ["HS256"],
  });
  return { token, claims: verified.payload };
}

function validateRequest(request, parsedBody, tokenResult) {
  const expectedBodyKeys = [
    "attempt_id",
    "content_type",
    "image_base64",
    "pose_choices",
    "subject_hint",
    "subject_identity",
  ];
  const actualBodyKeys = Object.keys(parsedBody).sort();
  if (actualBodyKeys.join(",") !== expectedBodyKeys.sort().join(",")) fail("Payload do Modal diverge do contrato esperado.");
  if (parsedBody.attempt_id !== request.attemptId) fail("attempt_id não coincide com o token.");
  if (parsedBody.content_type !== "image/png") fail("content_type inválido.");
  if (Buffer.from(parsedBody.image_base64, "base64").byteLength === 0) fail("image_base64 vazio ou inválido.");
  if (!request.endpoint.endsWith("/v2/mascot/incubations")) fail("Endpoint de incubação inválido.");

  const claims = tokenResult.claims;
  if (claims.attempt_id !== request.attemptId || claims.sub !== request.ownerId) fail("Claims do JWT não correspondem à identidade da requisição.");
  if (request.headers.Authorization !== `Bearer ${tokenResult.token}`) fail("Header Authorization não corresponde ao JWT gerado.");
  for (const header of ["X-Idempotency-Key", "X-Correlation-Id", "X-Operation-Id", "X-Bff-Request-Id"]) {
    if (!request.headers[header]) fail(`Header obrigatório ausente: ${header}.`);
  }
}

function boundedPositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

function loadLocalEnvironment() {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    if (!name || name.startsWith("#") || process.env[name]) continue;
    process.env[name] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

function fail(message) {
  console.error(`dry_run=failed: ${message}`);
  process.exit(2);
}
