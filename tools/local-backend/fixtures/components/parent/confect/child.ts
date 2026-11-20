import { Component } from "@confect/core";
import contract from "../../counter/confect/_generated/component";
import { components } from "./_generated/components";
import { scope } from "./_generated/id";

export const child = Component.bind(contract, components.child, {
  parentScope: scope,
});
