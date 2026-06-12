import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

import { Id } from "./_generated/id";
import todos from "./_generated/tables/todos";

export default GroupSpec.make()
  .addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: () => Schema.Struct({}),
      returns: () => Schema.Array(todos.Doc),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "create",
      args: () => Schema.Struct({ text: Schema.String }),
      returns: () => Id("todos"),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "deleteTodo",
      args: () => Schema.Struct({ id: Id("todos") }),
      returns: () => Schema.Null,
    }),
  );
