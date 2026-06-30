import test from "node:test";
import assert from "node:assert/strict";
import { Address } from "@stellar/stellar-sdk";
import {
  runAdminContractAccountDeploy,
  CONTRACT_ACCOUNT_DEPLOY_MAX_FEE,
  SPEND_ACCOUNT_WASM_HASH,
  validateRegistration,
  sendAssembledDeployment,
} from "../src/adminContractAccountDeploy.mjs";
import {
  createFixtureAuthenticator,
  runFixtureE2E,
} from "../scripts/contract-account-fixture-e2e.mjs";

const token = "a".repeat(48);
const registration = {
  ownerPublicKeyHex: `04${"11".repeat(64)}`,
  credentialIdHash: "22".repeat(32),
  rpIdHash: "33".repeat(32),
  originHash: "44".repeat(32),
};

function request(value = token) {
  return { headers: { authorization: `Bearer ${value}` } };
}

function env(overrides = {}) {
  return {
    CONTRACT_ACCOUNT_DEPLOY_ADMIN_TOKEN: token,
    CONTRACT_ACCOUNT_DEPLOY_ENABLED: "true",
    CONTRACT_ACCOUNT_NETWORK: "stellar:testnet",
    ...overrides,
  };
}

test("deploy admin exige bearer token correcto", async () => {
  await assert.rejects(
    runAdminContractAccountDeploy({
      request: request("wrong"),
      body: registration,
      env: env(),
      deployer: async () => ({}),
    }),
    /Unauthorized/,
  );
});

test("deploy gate permanece cerrado por defecto", async () => {
  await assert.rejects(
    runAdminContractAccountDeploy({
      request: request(),
      body: registration,
      env: env({ CONTRACT_ACCOUNT_DEPLOY_ENABLED: "false" }),
      deployer: async () => ({}),
    }),
    /gate is closed/,
  );
});

test("registro valida public key y hashes sin credential ID crudo", () => {
  assert.deepEqual(validateRegistration(registration), registration);
  assert.throws(
    () => validateRegistration({ ...registration, ownerPublicKeyHex: "bad" }),
    /65 bytes/,
  );
});

test("deploy mock retorna solo evidencia publica", async () => {
  const result = await runAdminContractAccountDeploy({
    request: request(),
    body: registration,
    env: env(),
    deployer: async ({ registration: safeRegistration }) => {
      assert.deepEqual(safeRegistration, registration);
      return {
        contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        transactionHash: "ab".repeat(32),
      };
    },
  });
  assert.equal(result.wasmHash, SPEND_ACCOUNT_WASM_HASH);
  assert.equal(result.ownerType, "webauthn-secp256r1");
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("fixture Contract Account es explicita, reproducible y no se presenta como passkey humana", async () => {
  const plan = await runFixtureE2E({ execute: false });
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.owner, "deterministic-test-fixture-not-user-passkey");
  assert.deepEqual(plan.steps, ["deploy", "fund", "passkey-grant", "session-pay", "passkey-revoke", "verify"]);
});

test("fixture WebAuthn genera registro P-256 y firma low-S con challenge exacto", () => {
  const fixture = createFixtureAuthenticator();
  const payload = "55".repeat(32);
  const assertion = fixture.sign(payload);
  const clientData = JSON.parse(Buffer.from(assertion.clientDataJson, "base64url").toString("utf8"));
  const signature = Buffer.from(assertion.signature, "base64url");
  const order = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  const s = BigInt(`0x${signature.subarray(32).toString("hex")}`);

  assert.equal(fixture.registration.ownerPublicKeyHex.length, 130);
  assert.equal(fixture.registration.credentialIdHash.length, 64);
  assert.equal(Buffer.from(assertion.authenticatorData, "base64url").length, 37);
  assert.equal(signature.length, 64);
  assert.equal(clientData.challenge, Buffer.from(payload, "hex").toString("base64url"));
  assert.equal(clientData.origin, "https://agente-pagos-stellar.vercel.app");
  assert.ok(s <= order / 2n);
});

test("deploy envia una sola vez la transaccion ya ensamblada", async () => {
  const contractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
  let signed = false;
  let sentTransaction = null;
  const transaction = {
    fee: "100",
    sign() { signed = true; },
  };
  const server = {
    async sendTransaction(value) {
      sentTransaction = value;
      return { status: "PENDING", hash: "cd".repeat(32) };
    },
    async getTransaction() {
      return { status: "SUCCESS", returnValue: new Address(contractId).toScVal() };
    },
  };

  const result = await sendAssembledDeployment({ assembled: { built: transaction }, relayer: {}, server });
  assert.equal(signed, true);
  assert.equal(sentTransaction, transaction);
  assert.equal(result.contractId, contractId);
  assert.equal(result.transactionHash, "cd".repeat(32));
});

test("deploy bloquea fee testnet sobre el cap antes de firmar", async () => {
  let signed = false;
  const transaction = {
    fee: (CONTRACT_ACCOUNT_DEPLOY_MAX_FEE + 1n).toString(),
    sign() { signed = true; },
  };
  await assert.rejects(
    sendAssembledDeployment({ assembled: { built: transaction }, relayer: {}, server: {} }),
    /fee exceeds/,
  );
  assert.equal(signed, false);
});
