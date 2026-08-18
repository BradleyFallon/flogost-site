import { defineConfig } from "astro/config";

const isGitHubBuild = process.env.GITHUB_ACTIONS === "true";
const usesCustomDomain = process.env.FLOGOST_CUSTOM_DOMAIN === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "flogost-site";

export default defineConfig({
  site: usesCustomDomain ? "https://flogost.com" : "https://bradleyfallon.github.io",
  base: isGitHubBuild && !usesCustomDomain ? `/${repositoryName}` : undefined,
});
