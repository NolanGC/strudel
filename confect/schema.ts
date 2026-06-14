import { DatabaseSchema } from "@confect/server";

import { Todos } from "./tables/todos";

export default DatabaseSchema.make().addTable(Todos);
