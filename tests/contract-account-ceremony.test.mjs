import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ContractAccountCeremonyRepository,
  ContractAccountCeremonyService,
  CONTRACT_ACCOUNT_ORIGIN,
  CONTRACT_ACCOUNT_RP_ID,
} from "../src/contractAccountCeremony.mjs";
import { registerPasskeyCeremony } from "../src/client/passkey.mjs";
import { runContractAccountCeremony } from "../scripts/contract-account-ceremony.mjs";
import { runAdminContractAccountDeploy } from "../src/adminContractAccountDeploy.mjs";

const token = "c".repeat(48);
const ceremonyId = "a1111111-b222-4333-8444-c55555555555";
const contractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const transactionHash = "ab".repeat(32);
const baseTime = new Date("2026-06-30T12:00:00.000Z");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function registration(overrides = {}) {
  return {
    publicKey: `04${"11".repeat(64)}`,
    credentialIdHash: "22".repeat(32),
    rpId: CONTRACT_ACCOUNT_RP_ID,
    rpIdHash: sha256(CONTRACT_ACCOUNT_RP_ID),
    originHash: sha256(CONTRACT_ACCOUNT_ORIGIN),
    createdAt: baseTime.toISOString(),
    ...overrides,
  };
}

function harness({ now = () => baseTime, env = { NODE_ENV: "test" }, idFactory = () => ceremonyId } = {}) {
  const repository = new ContractAccountCeremonyRepository({ env });
  const service = new ContractAccountCeremonyService({ env, repository, now, idFactory, rateLimiter: null });
  return { repository, service };
}

function adminEnv() {
  return {
    CONTRACT_ACCOUNT_DEPLOY_ADMIN_TOKEN: token,
    CONTRACT_ACCOUNT_DEPLOY_ENABLED: "true",
    CONTRACT_ACCOUNT_NETWORK: "stellar:testnet",
  };
}

function adminRequest() {
  return { headers: { authorization: `Bearer ${token}` } };
}

test("ceremonia guarda solo registro publico y devuelve handoff temporal", async () => {
  const { repository, service } = harness();
  const result = await service.register(registration(), { ip: "127.0.0.1" });
  const stored = await repository.get(ceremonyId);

  assert.equal(result.status, "pending");
  assert.equal(result.ceremonyId, ceremonyId);
  assert.equal(result.rpId, CONTRACT_ACCOUNT_RP_ID);
  assert.equal(result.contractId, null);
  assert.equal(JSON.stringify(result).includes("11".repeat(64)), false);
  assert.equal(stored.registration.ownerPublicKeyHex.length, 130);
  assert.equal(stored.registration.credentialIdHash.length, 64);
});

test("ceremonia bloquea RP ID, RP hash u origin ajenos", async () => {
  const { service } = harness();
  await assert.rejects(service.register(registration({ rpId: "evil.example" })), /RP ID is not allowed/);
  await assert.rejects(service.register(registration({ rpIdHash: "33".repeat(32) })), /RP ID hash/);
  await assert.rejects(service.register(registration({ originHash: "44".repeat(32) })), /origin/);
});

test("ceremonia rechaza credential ID, assertion, firma y XDR", async () => {
  for (const field of ["credentialId", "assertion", "signature", "xdr"]) {
    const { service } = harness();
    await assert.rejects(service.register(registration({ [field]: "private-value" })), /Private passkey field/);
  }
});

test("claim consume la ceremonia una sola vez", async () => {
  const { service } = harness();
  await service.register(registration());
  const claimed = await service.claim(ceremonyId);
  assert.equal(claimed.status, "pending");
  await assert.rejects(service.claim(ceremonyId), /already consumed/);
});

test("ceremonia expirada no puede desplegarse", async () => {
  let now = baseTime;
  const { service } = harness({ now: () => now });
  await service.register(registration());
  now = new Date(baseTime.getTime() + 601_000);
  assert.equal((await service.status(ceremonyId)).status, "expired");
  await assert.rejects(service.claim(ceremonyId), /expired/);
});

test("produccion falla cerrado sin Upstash", async () => {
  const env = { NODE_ENV: "production" };
  const repository = new ContractAccountCeremonyRepository({ env });
  const service = new ContractAccountCeremonyService({ env, repository, rateLimiter: null });
  await assert.rejects(service.register(registration()), /store is unavailable/);
});

test("deploy admin reclama ceremonia y publica solo resultado verificable", async () => {
  const { service } = harness();
  await service.register(registration());
  const result = await runAdminContractAccountDeploy({
    request: adminRequest(),
    body: { ceremonyId },
    env: adminEnv(),
    ceremonies: service,
    deployer: async ({ registration: deployRegistration }) => {
      assert.equal(deployRegistration.ownerPublicKeyHex, registration().publicKey);
      return { contractId, transactionHash };
    },
  });

  assert.equal(result.ceremonyId, ceremonyId);
  assert.equal(result.contractId, contractId);
  const status = await service.status(ceremonyId);
  assert.equal(status.status, "deployed");
  assert.equal(status.transactionHash, transactionHash);
});

test("deploy fallido marca ceremonia sin permitir replay", async () => {
  const { service } = harness();
  await service.register(registration());
  await assert.rejects(
    runAdminContractAccountDeploy({
      request: adminRequest(),
      body: { ceremonyId },
      env: adminEnv(),
      ceremonies: service,
      deployer: async () => { throw new Error("fixture deploy failed"); },
    }),
    /fixture deploy failed/,
  );
  assert.equal((await service.status(ceremonyId)).status, "failed");
  await assert.rejects(service.claim(ceremonyId), /already consumed/);
});

test("cliente registra material publico y refleja ceremonyId en URL", async () => {
  const { service } = harness();
  const stored = new Map();
  let replacedUrl = null;
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, value),
  };
  globalThis.location = {
    href: "https://agente-pagos-stellar.vercel.app/wallet",
    hostname: CONTRACT_ACCOUNT_RP_ID,
    origin: CONTRACT_ACCOUNT_ORIGIN,
  };
  globalThis.history = { replaceState: (_state, _title, url) => { replacedUrl = String(url); } };
  try {
    const result = await registerPasskeyCeremony(registration(), async (_url, options) => {
      const body = await service.register(JSON.parse(options.body));
      return new Response(JSON.stringify(body), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    });
    assert.equal(result.ceremony.ceremonyId, ceremonyId);
    assert.match(replacedUrl, new RegExp(`ceremony=${ceremonyId}`));
    assert.equal([...stored.values()].some((value) => value.includes("credentialId")), false);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.location;
    delete globalThis.history;
  }
});

test("CLI de ceremonia restringe host y nunca devuelve bearer token", async () => {
  await assert.rejects(
    runContractAccountCeremony({ ceremonyId, endpoint: "https://evil.example" }),
    /not allowlisted/,
  );
  const result = await runContractAccountCeremony({
    ceremonyId,
    deploy: true,
    token,
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      return new Response(JSON.stringify({
        network: "stellar:testnet",
        ceremonyId,
        contractId,
        transactionHash,
        ownerType: "webauthn-secp256r1",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  assert.equal(result.contractId, contractId);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("deploy exitoso conserva evidencia on-chain aunque falle persistencia final", async () => {
  let failed = false;
  const ceremonies = {
    async claim() {
      return {
        ceremonyId,
        registration: {
          ownerPublicKeyHex: registration().publicKey,
          credentialIdHash: registration().credentialIdHash,
          rpIdHash: registration().rpIdHash,
          originHash: registration().originHash,
        },
      };
    },
    async complete() { throw new Error("temporary store failure"); },
    async fail() { failed = true; },
  };
  const result = await runAdminContractAccountDeploy({
    request: adminRequest(),
    body: { ceremonyId },
    env: adminEnv(),
    ceremonies,
    deployer: async () => ({ contractId, transactionHash }),
  });
  assert.equal(result.contractId, contractId);
  assert.equal(result.ceremonyStatus, "deployed-record-pending");
  assert.equal(failed, false);
});
