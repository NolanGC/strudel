import { Table } from "@confect/server";
import { Schema } from "effect";

export const Todos = Table.make(
  "todos",
  Schema.Struct({
    text: Schema.String,
  }),
);
