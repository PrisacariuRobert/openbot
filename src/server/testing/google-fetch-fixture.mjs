// Loaded explicitly by disposable tests, never imported by the product.
const transport = globalThis.fetch;
const fixture = new URL(process.env.OPENBOT_TEST_GOOGLE_URL || "invalid:");
if (fixture.protocol !== "http:" || fixture.hostname !== "127.0.0.1") throw new Error("A loopback Google fixture is required.");
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (["https://gmail.googleapis.com", "https://www.googleapis.com"].includes(url.origin)) return transport(fixture.origin + url.pathname + url.search, init);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return transport(input, init);
  throw new Error("External requests are disabled in the customer-workflow fixture.");
};
