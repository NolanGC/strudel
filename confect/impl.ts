import { Impl } from "@confect/server";
import { Layer } from "effect";

import api from "./_generated/api";
import { todos } from "./todos.impl";

export default Impl.make(api).pipe(
  Layer.provide(todos),
  Impl.finalize,
);
