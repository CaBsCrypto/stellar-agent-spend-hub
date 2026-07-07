import { createDependencies } from "./apiDependencies.mjs";
import { adminRoutes } from "./routes/adminRoutes.mjs";
import { contractAccountRoutes } from "./routes/contractAccountRoutes.mjs";
import { mppRoutes } from "./routes/mppRoutes.mjs";
import { multichainRoutes } from "./routes/multichainRoutes.mjs";
import { pilotRoutes } from "./routes/pilotRoutes.mjs";
import { productRoutes } from "./routes/productRoutes.mjs";
import { spendIntentRoutes } from "./routes/spendIntentRoutes.mjs";

export function createRoutes({ service, env, dependencies }) {
  const context = { service, env, dependencies };
  return [
    ...adminRoutes(context),
    ...productRoutes(context),
    ...mppRoutes(context),
    ...pilotRoutes(context),
    ...contractAccountRoutes(context),
    ...spendIntentRoutes(context),
    ...multichainRoutes(context),
  ];
}

export { createDependencies };
