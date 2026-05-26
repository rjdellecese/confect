import { Spec } from "@confect/core";
import email from "../node/email.spec";

export default Spec.makeNode().addPath(email, "email").addAt("email", email);
