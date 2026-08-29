// oxlint-disable-next-line effecttsgo/node-builtin-import -- This bootstrap removes dependencies and cannot depend on Effect's platform services.
import { rmSync } from "node:fs";

for (const target of process.argv.slice(2)) {
  rmSync(target, { recursive: true, force: true });
}
