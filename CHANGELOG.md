# Changelog 📋

All notable changes to the **WebSocket Serverless** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-07-31

### Added
- 🎉 Initial 100% Serverless release of **WebSocket Serverless** built for Cloudflare Workers & Durable Objects.
- 💤 Native support for Cloudflare Durable Objects **WebSockets Hibernation API**.
- 🔄 Full Pusher Protocol v7 compatibility (Public, Private, Presence, and Client Events).
- 🛠️ Pusher Server HTTP REST API v1 (`/apps/:app_id/events`, `/apps/:app_id/batch_events`, `/apps/:app_id/channels`, `/apps/:app_id/channels/:channel_name/users`).
- 🔐 Built-in Admin Console authentication with username/password and native **Cloudflare One / Cloudflare Access** header integration.
- 🎨 Modern Glassmorphic Admin Dashboard UI with interactive Event Studio, Live Socket Inspector, and Code Snippets.
- 🔔 Animated Toast Notification system for status updates and feedback.
- 🤖 GitHub Actions CI/CD workflows for automated type checking, testing, semantic release, and Cloudflare Worker deployment.
- 🧪 Automated Vitest unit & integration test suite.
