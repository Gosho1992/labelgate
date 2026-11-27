import { defineConfig } from "vite";
export default defineConfig({
  build: { rollupOptions: { input: { main: "index.html", bench: "bench.html", privacy: "privacy-test.html", specproof: "specproof.html", acceptance: "acceptance.html", acceptanceB: "acceptance-b.html", reviewerTest: "reviewer-test.html" } } },
});
