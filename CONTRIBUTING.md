# Contributing to Touchscreen Toggle

Thanks for your interest in improving the extension! This document explains how
to set up a development environment and how contributions are reviewed.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

You need GNOME Shell 45+, Node.js (for the TypeScript toolchain), `bash`, and
`sudo` for the privileged helper.

```sh
git clone https://github.com/JayCodist/touchscreen-toggle.git
cd touchscreen-toggle
npm ci
make install         # compiles src/*.ts -> dist/ and installs it
sudo make install-helper   # installs the helper + scoped sudoers rule
```

Log out and back in (Wayland restarts the Shell only on login), then enable:

```sh
gnome-extensions enable touchscreen-toggle@jaycodist
```

## Development loop

- Sources are TypeScript (`src/*.ts`); GJS runs the compiled ESM in `dist/`.
- `npm run watch` rebuilds on save.
- **Code changes require a Shell restart to reload** (GJS caches the extension
  module). On X11: <kbd>Alt</kbd>+<kbd>F2</kbd> → `r`. On Wayland: log out/in.
- Icon SVG changes are picked up on the next repaint without a restart.

## Verifying your change

```sh
npm run typecheck    # tsc --noEmit (must be clean)
make build           # tsc + assemble dist/
bash -n data/touchscreen-toggle.sh
```

CI runs the same checks on every pull request.

## Device support / hardware notes

The extension detects any udev device with `ID_INPUT_TOUCHSCREEN=1` and toggles
the nearest ancestor that owns a driver. If your touchscreen is not detected or
won't re-enable, open an issue and include the output of:

```sh
udevadm info -e | grep -B5 ID_INPUT_TOUCHSCREEN=1
```

## Submitting changes

1. Fork the repo and create a branch off `main`.
2. Keep commits focused; use imperative commit messages
   (e.g. `Fix detection for USB-only touchscreens`).
3. Run `npm run typecheck` and, if you changed runtime behaviour, test on at
   least one real device.
4. Open a pull request describing **what** changed and **why**, and link any
   related issue.

Maintainers will review for correctness, hardware breadth, and — because this
extension runs a privileged helper — security.

## Security-sensitive changes

Changes to `data/touchscreen-toggle.sh`, the sudoers rule, or anything that
touches `/sys` are security-relevant. Please read [SECURITY.md](SECURITY.md)
and call out such changes explicitly in your PR.
