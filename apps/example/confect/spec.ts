import { ConfectApiSpec } from "@rjdellecese/confect/api";
import { Groups } from "./spec/groups";

export const Spec = ConfectApiSpec.make("api").add(Groups);
