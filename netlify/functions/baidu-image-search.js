import { handler as previewSearchHandler } from "./preview-search.js";

export async function handler(event) {
  return previewSearchHandler({
    ...event,
    queryStringParameters: {
      ...event.queryStringParameters,
      provider: "baidu",
    },
  });
}
