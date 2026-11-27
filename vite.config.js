import { defineConfig } from "vite";
export default defineConfig({
  build: { rollupOptions: { input: { main: "index.html", app: "app/index.html", how: "how/index.html", bench: "bench.html", privacy: "privacy-test.html", specproof: "specproof.html", acceptance: "acceptance.html", acceptanceB: "acceptance-b.html", reviewerTest: "reviewer-test.html" } } },
});
