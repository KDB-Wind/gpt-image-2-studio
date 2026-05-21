const baseUrl = process.env.BASE_URL ?? "https://ruoli.dev/v1";
const siteOrigin = process.env.SITE_ORIGIN ?? "https://kdb-wind.github.io";
const endpoint = new URL("images/generations", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);

const response = await fetch(endpoint, {
  method: "OPTIONS",
  headers: {
    Origin: siteOrigin,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization,content-type",
  },
});

const allowOrigin = response.headers.get("access-control-allow-origin");
const allowMethods = response.headers.get("access-control-allow-methods");
const allowHeaders = response.headers.get("access-control-allow-headers");

console.log(`Endpoint: ${endpoint.toString()}`);
console.log(`Origin: ${siteOrigin}`);
console.log(`Status: ${response.status}`);
console.log(`Access-Control-Allow-Origin: ${allowOrigin ?? ""}`);
console.log(`Access-Control-Allow-Methods: ${allowMethods ?? ""}`);
console.log(`Access-Control-Allow-Headers: ${allowHeaders ?? ""}`);

const allowsOrigin = allowOrigin === "*" || allowOrigin === siteOrigin;
const allowsPost = allowMethods?.toLowerCase().includes("post") ?? false;
const allowsAuth =
  allowHeaders === "*" ||
  (allowHeaders?.toLowerCase().includes("authorization") ?? false);

if (!response.ok || !allowsOrigin || !allowsPost || !allowsAuth) {
  throw new Error("CORS preflight check failed. This provider may block browser-only static HTML usage.");
}

console.log("CORS preflight check passed.");
