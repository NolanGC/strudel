import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";

import api from "./_generated/api";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";

const list = FunctionImpl.make(api, "todos", "list", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader
      .table("todos")
      .index("by_creation_time", "desc")
      .collect();
  }).pipe(Effect.orDie),
);

const create = FunctionImpl.make(api, "todos", "create", ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    return yield* writer.table("todos").insert({ text });
  }).pipe(Effect.orDie),
);

const deleteTodo = FunctionImpl.make(
  api,
  "todos",
  "deleteTodo",
  ({ id }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      yield* writer.table("todos").delete(id);
      return null;
    }).pipe(Effect.orDie),
);

export const todos = GroupImpl.make(api, "todos").pipe(
  Layer.provide(list),
  Layer.provide(create),
  Layer.provide(deleteTodo),
);
