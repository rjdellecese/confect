import { Api } from "@confect/server";

import schema from "../schema";
import nodeSpec from "../nodeSpec";

export default Api.make(schema, nodeSpec);
