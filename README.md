# FLOGOST

The Astro source for [flogost.com](https://flogost.com).

## Local development

```sh
npm install
npm run dev
```

The site deploys to GitHub Pages from `main` through `.github/workflows/deploy.yml`. By default, GitHub Actions builds for the repository staging path. Set the repository Actions variable `FLOGOST_CUSTOM_DOMAIN=true` when `flogost.com` is connected.

The custom domain is configured in the repository's Pages settings; this project intentionally does not use a `public/CNAME` file.
