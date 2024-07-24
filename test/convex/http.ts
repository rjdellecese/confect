import { httpRouter } from "convex/server";
import { get } from "~/test/convex/http/get";

const http = httpRouter();

http.route({
	path: "/get",
	method: "GET",
	handler: get,
});

export default http;
