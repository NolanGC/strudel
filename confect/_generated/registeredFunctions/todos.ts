import { RegisteredConvexFunction, RegisteredFunctions } from "@confect/server";
import databaseSchema from "../schema";
import todos from "../../todos.impl";

export default RegisteredFunctions.buildForGroup<typeof import("../../todos.spec")["default"]>(databaseSchema, todos, RegisteredConvexFunction.make);
