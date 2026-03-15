import {query} from "./_generated/server";

export const testFunction = query({
    args: {},
    handler: async () => {
        return "Hello, World!";
    }
})