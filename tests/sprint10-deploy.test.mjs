import test from "node:test";
import assert from "node:assert/strict";
import {
  runAdminContractAccountDeploy,
  SPEND_ACCOUNT_WASM_HASH,
  validateRegistration,
} from "../src/adminContractAccountDeploy.mjs";

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
