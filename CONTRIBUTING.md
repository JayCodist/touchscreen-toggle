# Contributing to Touchscreen Toggle

This document explains how to set up a development environment and how to
contribute changes to the extension.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

You need GNOME Shell 45 or newer, Node.js for the TypeScript toolchain, `bash`,
and `sudo` for the privileged helper.

```sh
git clone https://github.com/JayCodist/touchscreen-toggle.git
cd touchscreen-toggle
npm ci
make install         # Compiles src/*.ts into dist/ and installs it
sudo make install-helper   # Installs the helper and the scoped sudoers rule
```

Log out and log back in. On Wayland, the Shell restarts only at login. Then
enable the extension:

```sh
gnome-extensions enable touchscreen-toggle@jaycodist
```

## Development loop

- The sources are TypeScript files in `src/`. GJS runs the compiled ESM in
  `dist/`.
- `npm run watch` rebuilds on each save.
- Code changes need a Shell restart to reload. GJS caches the extension module.
  On X11, press <kbd>Alt</kbd>+<kbd>F2</kbd>, then type `r`. On Wayland, log out
  and log back in.
- The Shell picks up icon SVG changes on the next repaint. No restart is needed.

## Verifying your change

```sh
npm run typecheck    # Run tsc --noEmit. It must report no errors.
make build           # Run tsc and assemble dist/
bash -n data/touchscreen-toggle.sh
```

CI runs the same checks on every pull request.

## Device support and hardware notes

The extension detects any udev device with `ID_INPUT_TOUCHSCREEN=1` and toggles
the nearest ancestor that owns a driver. If the extension does not detect your
touchscreen, or the touchscreen will not re-enable, open an issue. Include the
output of:

```sh
udevadm info -e | grep -B5 ID_INPUT_TOUCHSCREEN=1
```

## Submitting changes

1. Fork the repository and create a branch from `main`.
2. Keep each commit focused. Use an imperative commit message, for example
   `Fix detection for USB-only touchscreens`.
3. Run `npm run typecheck`. If you changed runtime behavior, test on at least
   one real device.
4. Open a pull request. Describe what changed and why. Link any related issue.

Maintainers review for correctness, hardware coverage, and security. Security
matters because this extension runs a privileged helper.

## Security-sensitive changes

Changes to `data/touchscreen-toggle.sh`, the sudoers rule, or anything that
writes to `/sys` are security-relevant. Read [SECURITY.md](SECURITY.md) and
call out these changes in your pull request.
