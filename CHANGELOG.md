# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-27

### Added
- Touchscreen detection that works with any device. It reads udev
  (`ID_INPUT_TOUCHSCREEN`) and groups each device to the nearest ancestor that
  owns a driver. This works on the hid, usb, i2c, and serio buses.
- A panel button in the top bar. It has one menu with a switch for each device.
  It uses the `PanelMenu.Button` API from GNOME 45 and newer.
- State updates that react to events. The extension subscribes to `GUdev`
  `uevent` events instead of polling.
- A privileged `bash` helper that checks its arguments. It unbinds the device
  driver and re-probes it with `drivers_probe`, so no driver name is hard-coded.
- Bundled symbolic icons for the enabled and disabled states, installed at
  runtime.
- TypeScript sources compiled to ESM, with `@girs` type definitions.
- Build tooling: a `Makefile` with the `build`, `install`, `install-helper`, and
  `dist` targets, `npm` scripts, and GitHub Actions CI.

[unreleased]: https://github.com/JayCodist/touchscreen-toggle/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/JayCodist/touchscreen-toggle/releases/tag/v1.0.0
