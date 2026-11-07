# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Desktop design spec: Electron tray app, Apple Speech (macOS), whisper.cpp (Windows).
- Project tooling: TypeScript, ESLint, Prettier, Vitest, electron-builder, GitHub Actions CI.
- MIT license, security policy and contribution guide.

### Changed

- Moved the web prototype (Express + Docker + CLI bridge) to `legacy/web-prototype/`.

## [0.1.0] - 2026-11-04

### Added

- Web prototype: Chrome speech recognition → host bridge → `claude -p` → streaming
  `speechSynthesis` in Vietnamese and English.
