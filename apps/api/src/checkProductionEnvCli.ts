import { validateProductionEnv } from "./productionEnv";

const result = validateProductionEnv(process.env);

if (!result.ok) {
  console.error("Production environment is incomplete:");
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.info("Production environment check passed.");
}
