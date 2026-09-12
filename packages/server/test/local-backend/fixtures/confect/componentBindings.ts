import { Component } from "@confect/core";
import counter from "../components/counter/confect/_generated/component";
import parent from "../components/parent/confect/_generated/component";
import { components } from "./_generated/components";

export const first = Component.bind(counter, components.first);
export const second = Component.bind(counter, components.second);
export const left = Component.bind(parent, components.left);
export const right = Component.bind(parent, components.right);
