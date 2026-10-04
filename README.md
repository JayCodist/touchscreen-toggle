# Touchscreen Toggle

This GNOME Shell extension enables or disables touchscreen devices from the top
bar. It unbinds and rebinds the kernel driver of the device. It works on Wayland
and on X11. It works on GNOME 45 or newer. It works with any touchscreen, such
as a Wacom, ELAN, Goodix, or Atmel device on USB, I²C, or another bus. No device
is hard-coded.

## How it works

- The panel icon shows whether each detected touchscreen is connected. If you
  have one touchscreen, a click on the icon toggles it directly. If you have two
  or more, a click opens a menu with one switch for each device.
- Detection reads udev. The extension groups every input device that reports
  `ID_INPUT_TOUCHSCREEN=1` up to the nearest bus device that owns a driver. That
  device is the node the kernel `unbind` and `drivers_probe` interface acts on.
- The extension subscribes to `GUdev` `uevent` events. The icon updates when an
  event arrives. The extension does not poll for changes.
- Toggling writes to `/sys`, which needs root. A small helper script does the
  privileged action through `sudo`. The helper checks its arguments and writes
  only a device name to sysfs.

## Requirements

- GNOME Shell 45 or newer
- `bash` and `sudo`
- No dependency on a specific touchscreen driver

## Installation

### 1. Install the extension

From a checkout of this repository:

```sh
make install        # Installs the extension into ~/.local/share/gnome-shell/extensions
```

Restart GNOME Shell. On Wayland, log out and log back in. On X11, press
<kbd>Alt</kbd>+<kbd>F2</kbd>, then type `r`. Then enable the extension with the
Extensions app, or run:

```sh
gnome-extensions enable touchscreen-toggle@jaycodist
```

### 2. Install the privileged helper and the sudoers rule

The helper must be at `/usr/local/bin/touchscreen-toggle`. This is the path the
extension calls. One command installs the helper and gives your user
passwordless sudo for only that script:

```sh
sudo make install-helper
```

This is the only step that needs root. It is a separate step so you can review
what it installs.

<details>
<summary>What <code>install-helper</code> does</summary>

- Copies `data/touchscreen-toggle.sh` to `/usr/local/bin/touchscreen-toggle` with
  mode `0755`.
- Writes `/etc/sudoers.d/touchscreen-toggle` with mode `0440`. The file contains:

  ```
  <your-user> ALL=(ALL) NOPASSWD: /usr/local/bin/touchscreen-toggle
  ```

The sudoers rule applies only to that one absolute path. It does not grant
general root. To remove both files, run:

```sh
sudo rm -f /etc/sudoers.d/touchscreen-toggle /usr/local/bin/touchscreen-toggle
```
</details>

## Manual helper install (if you prefer not to use make)

```sh
sudo install -m 0755 data/touchscreen-toggle.sh /usr/local/bin/touchscreen-toggle
echo "$USER ALL=(ALL) NOPASSWD: /usr/local/bin/touchscreen-toggle" \
  | sudo tee /etc/sudoers.d/touchscreen-toggle
sudo chmod 0440 /etc/sudoers.d/touchscreen-toggle
```

## Troubleshooting

- If nothing happens, or you see a "toggle failed" notification, the helper or
  the sudoers rule is missing. Run `sudo -n /usr/local/bin/touchscreen-toggle` to
  check. You should see a `usage:` line, not a password prompt.
- If the icon stays on "disabled", the extension detected no touchscreen. Check
  with `udevadm info -e | grep -l ID_INPUT_TOUCHSCREEN`. You can also list the
  devices with `ls /sys/class/input/*/device/../ 2>/dev/null` and look for
  `ID_INPUT_TOUCHSCREEN`.
- If a device will not re-enable, some drivers need a physical re-plug or a
  `modprobe` after unbind. The helper uses `drivers_probe`, which handles the
  common cases on the hid, usb, i2c, and serio buses.

## Development

The extension is written in TypeScript. The build compiles it to plain ESM
JavaScript, which is what GJS runs. The community
[`@girs`](https://www.npmjs.com/search?q=%40girs) packages provide the type
definitions. This lets `tsc` check Shell-internal APIs such as
`PanelMenu.Button`, `GUdev`, and `St` at compile time.

```sh
npm ci            # Install the toolchain and the @girs types. Run this once.
npm run build     # Run tsc and write dist/ (extension.js and deviceUtils.js).
npm run watch     # Rebuild on each change.
npm run typecheck # Run tsc --noEmit only.
make install      # Build, then install dist/ into ~/.local/share/gnome-shell/extensions
make dist         # Build, then make a zip for extensions.gnome.org
```

The project layout is:

- `src/*.ts`: TypeScript sources. They import `gi://` and `resource:///` URIs
  directly.
- `ambient.d.ts`: Connects the `@girs` ambient type packages for `tsc`.
- `data/touchscreen-toggle.sh`: The privileged helper. You install it separately.
- `dist/`: The compiled output. This is what you install and zip.

To test a build from inside the repository, run `make install`. Then log out and
log back in, and run `gnome-extensions enable touchscreen-toggle@jaycodist`.

## Build a release zip

```sh
make dist           # Produces touchscreen-toggle@jaycodist.zip
```

Upload that zip to
[extensions.gnome.org](https://extensions.gnome.org/upload/) for review.

## Security notes

- The extension runs without root and never writes to `/sys` directly.
- All privileged work happens in one small helper. The extension calls it with
  `sudo -n`, so it never asks for a password. The sudoers rule allows only that
  exact path.
- The helper rejects path traversal and any path outside `/sys`. It writes only
  the validated device name to `unbind` and `drivers_probe`.

## License

This project is licensed under GPL-3.0-or-later. See [LICENSE](LICENSE).
