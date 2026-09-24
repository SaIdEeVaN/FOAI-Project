# CLAUDE.md

## Git workflow

- Commit and push directly to `main`. Do not create feature branches or pull requests.
- Every push to `main` deploys the site to Firebase Hosting (`.github/workflows/deploy.yml`),
  so run `npm run build` and make sure it passes before pushing.
