import { Spec } from "@confect/core";
import email from "../node/email.spec";

export default Spec.makeNode().addAt("email", email);
