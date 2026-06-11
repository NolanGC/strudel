import { defineSchema as $defineSchema } from "convex/server";

import todos from "./tables/todos";

export default $defineSchema({
  todos: todos.tableDefinition,
});
