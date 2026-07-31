# Contributing to WebSocket Serverless

Thank you for your interest in contributing to **WebSocket Serverless**. We welcome bug reports, feature requests, documentation improvements, and code contributions.

Author & Maintainer: Maximiliano Contartesi ([@mcontartesi](https://github.com/mcontartesi))

---

## Getting Started

1. Fork the Repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/mcontartesi/websocket-serverless.git
   cd websocket-serverless
   ```
3. Install project dependencies:
   ```bash
   npm install
   ```

---

## Local Development & Verification

Start the local Wrangler emulation server:

```bash
npm run dev
```

Execute TypeScript type checking:

```bash
npx tsc --noEmit
```

Run the Vitest test suite:

```bash
npm test
```

---

## Commit Conventions (Conventional Commits)

This repository utilizes Semantic Release for automated versioning and release management. Please structure commit messages following the Conventional Commits specification:

- `feat: add support for encrypted private channels` (Triggers MINOR release)
- `fix: resolve channel signature validation error` (Triggers PATCH release)
- `docs: update deployment instructions in README`
- `chore: update development dependencies`

---

## Submitting a Pull Request

1. Create a feature branch: `git checkout -b feat/my-feature-name`
2. Ensure all tests pass (`npm test` and `npx tsc --noEmit`).
3. Commit your changes following conventional commit syntax.
4. Push your branch to GitHub and open a Pull Request against the `main` branch.
