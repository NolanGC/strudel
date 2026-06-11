import { DatabaseSchema as $DatabaseSchema } from "@confect/server";

import todos from "./tables/todos";

export default $DatabaseSchema.make({
  todos,
});
