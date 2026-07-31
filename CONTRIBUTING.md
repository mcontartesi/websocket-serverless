# Contributing to WebSocket Serverless 🤝

Thank you for your interest in contributing to **WebSocket Serverless**! We welcome bug reports, feature requests, documentation improvements, and code contributions.

Author & Maintainer: **Maximiliano Contartesi** ([@mcontartesi](https://github.com/mcontartesi))

---

## 🚀 Getting Started

1. **Fork the Repository**: Create your own fork on GitHub.
2. **Clone Locally**:
   ```bash
   git clone https://github.com/mcontartesi/websocket-serverless.git
   cd websocket-serverless
   ```
3. **Install Dependencies**:
   ```bash
   npm install
   ```

---

## 🛠️ Local Development & Testing

Start the local Wrangler emulation server:

```bash
npm run dev
```

Run TypeScript type checking:

```bash
npx tsc --noEmit
```

Run the Vitest test suite:

```bash
npm test
```

---

## 📝 Commit Conventions (Conventional Commits)

This repository uses **Semantic Release** to automatically generate version tags and release notes. Please format your commit messages using [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add new presence channel metadata feature` (Triggers MINOR release)
- `fix: resolve authorization signature mismatch on private channels` (Triggers PATCH release)
- `docs: update deployment instructions in README`
- `chore: update dependencies`

---

## 🔀 Submitting a Pull Request

1. Create a feature branch: `git checkout -b feat/my-awesome-feature`
2. Ensure all tests pass (`npm test` and `npx tsc --noEmit`).
3. Commit your changes following conventional commit syntax.
4. Push your branch to GitHub and open a Pull Request against `main`.
5. Maintainers will review your PR and provide feedback promptly.
