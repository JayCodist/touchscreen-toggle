# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-27

### Added
- Hardware-agnostic touchscreen detection via udev (`ID_INPUT_TOUCHSCREEN`),
  grouped to the nearest driver-owning ancestor across hid/usb/i2c/serio buses.
- Top-bar panel button with a per-device on/off menu, using the GNOME 45+
  `PanelMenu.Button` API.
- Event-driven state updates via a `GUdev` `uevent` subscription (no polling).
- Privileged, argument-validated `bash` helper that unbinds / re-probes the
  device driver (`drivers_probe`), so no driver name is hard-coded.
- Bundled symbolic on/off icons registered at runtime.
- TypeScript sources compiled to ESM with `@girs` type definitions.
- Build tooling: `Makefile` (`build`/`install`/`install-helper`/`dist`),
  `npm` scripts, and GitHub Actions CI.

[unreleased]: https://github.com/JayCodist/touchscreen-toggle/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/JayCodist/touchscreen-toggle/releases/tag/v1.0.0
