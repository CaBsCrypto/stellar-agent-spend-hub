import { runAdminContractAccountDeploy } from "../adminContractAccountDeploy.mjs";
import { runAdminSorobanTransfer } from "../adminSorobanTransfer.mjs";
import { runAdminTestnetPayment } from "../adminTestnetPayment.mjs";
import { exact } from "../apiRouteHelpers.mjs";

export function adminRoutes({ service, env, dependencies }) {
  return [
    exact("POST", "/api/admin/testnet-payment", async ({ request }) => ({
      body: await runAdminTestnetPayment({ request, env, service }),
    })),
    exact("POST", "/api/admin/soroban-transfer", async ({ request, readJson }) => ({
      body: await runAdminSorobanTransfer({ request, body: await readJson(), env, service }),
    })),
    exact("POST", "/api/admin/contract-account/deploy", async ({ request, readJson }) => ({
      body: await runAdminContractAccountDeploy({
        request,
        body: await readJson(),
        env,
        ceremonies: dependencies.contractAccountCeremonies(),
      }),
    })),
  ];
}
