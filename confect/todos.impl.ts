import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";

import databaseSchema from "./_generated/schema";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";
import notes from "./todos.spec";

const list = FunctionImpl.make(databaseSchema, notes, "list", () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;

    return yield* reader
      .table("todos")
      .index("by_creation_time", "desc")
      .collect();
  }).pipe(Effect.orDie),
);

const create = FunctionImpl.make(databaseSchema, notes, "create", ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;

    return yield* writer.table("todos").insert({ text });
  }).pipe(Effect.orDie),
);

const deleteTodo = FunctionImpl.make(
  databaseSchema,
  notes,
  "deleteTodo",
  ({ id }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;

      yield* writer.table("todos").delete(id);
      return null;
    }).pipe(Effect.orDie),
);

export default GroupImpl.make(databaseSchema, notes).pipe(
  Layer.provide(list),
  Layer.provide(create),
  Layer.provide(deleteTodo),
  GroupImpl.finalize,
);
