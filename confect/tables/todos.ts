import { Table } from "@confect/server";
import { Schema } from "effect";

export default Table.make(() =>
  Schema.Struct({
    text: Schema.String,
  }),
);