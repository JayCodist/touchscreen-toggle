# Touchscreen Toggle

A GNOME Shell extension to enable or disable touchscreen devices straight from
the top bar. It works by unbinding/rebinding the device's kernel driver, so it
works on **Wayland and X11**, on **GNOME 45–51**, and with **any** touchscreen
(Wacom, ELAN, Goodix, Atmel, USB, I²C, …) — no device is hard-coded.

## How it works

- The panel icon reflects whether detected touchscreens are connected. With a
  single touchscreen, clicking the icon toggles it directly; with two or more,
  clicking opens a menu with one on/off switch per device.
- Detection reads udev: any input device advertised as `ID_INPUT_TOUCHSCREEN=1`
  is grouped up to the nearest bus device that owns a driver — that is the node
  the kernel's `unbind` / `drivers_probe` ABI operates on.
- The icon updates **event-driven** via a `GUdev` `uevent` subscription
  (no polling), so it is instant and battery-friendly.
- Because toggling requires writing to `/sys`, the actual privileged action is
  done by a tiny helper script run through `sudo`. The helper validates its
  arguments strictly and only ever writes a device name to sysfs.

## Requirements

- GNOME Shell 45 or newer
- `bash`, `sudo`
- No hard dependency on any specific touchscreen driver

## Installation

### 1. Install the extension

From a checkout of this repository:

```sh
make install        # installs the extension to ~/.local/share/gnome-shell/extensions
```

Then restart GNOME Shell (log out / log back in on Wayland; <kbd>Alt</kbd>+<kbd>F2</kbd> → `r` on X11) and enable it with the **Extensions** app or:

```sh
gnome-extensions enable touchscreen-toggle@jaycodist
```

### 2. Install the privileged helper + sudoers rule

The helper must live at `/usr/local/bin/touchscreen-toggle` (the path the
extension calls). One command installs it and grants your user passwordless
sudo **only** for that script:

```sh
sudo make install-helper
```

This is the only step that needs root, and it is deliberately separate so you
can review exactly what is being installed.

<details>
<summary>What <code>install-helper</code> does</summary>

- copies `data/touchscreen-toggle.sh` to `/usr/local/bin/touchscreen-toggle` (mode `0755`)
- writes `/etc/sudoers.d/touchscreen-toggle`, mode `0440`, containing:

  ```
  <your-user> ALL=(ALL) NOPASSWD: /usr/local/bin/touchscreen-toggle
  ```

The sudoers line is scoped to that single absolute path, so it does not grant
general root. To remove:

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

- **Nothing happens / "toggle failed" notification** — the helper or sudoers
  rule is missing. Run `sudo -n /usr/local/bin/touchscreen-toggle` to check; you
  should see a `usage:` line (not a password prompt).
- **Icon is stuck on "disabled"** — no touchscreen was detected. Verify with
  `udevadm info -e | grep -l ID_INPUT_TOUCHSCREEN` or list them:
  `ls /sys/class/input/*/device/../ 2>/dev/null` and check `ID_INPUT_TOUCHSCREEN`.
- **Device won't re-enable** — some drivers need a physical re-plug or a
  `modprobe` after unbind; the helper uses `drivers_probe`, which handles the
  common cases (hid/usb/i2c/serio).

## Development

The extension is written in **TypeScript** and compiled to plain ESM JavaScript
(the only thing GJS runs). Type definitions come from the community
[`@girs`](https://www.npmjs.com/search?q=%40girs) packages, so Shell-internal
APIs (`PanelMenu.Button`, `GUdev`, `St`, …) are checked at compile time.

```sh
npm ci            # install toolchain + @girs types (once)
npm run build     # tsc -> dist/ (extension.js + deviceUtils.js)
npm run watch     # rebuild on change
npm run typecheck # tsc --noEmit only
make install      # build + install dist/ to ~/.local/share/gnome-shell/extensions
make dist         # build + zip for extensions.gnome.org
```

Layout:

- `src/*.ts` — TypeScript sources (import `gi://…` and `resource:///…` directly)
- `ambient.d.ts` — wires the `@girs` ambient type packages for `tsc`
- `data/touchscreen-toggle.sh` — the privileged helper (installed separately)
- `dist/` — compiled output; this is what is installed and zipped

To try your build without leaving the repo: `make install`, then log out/in and
`gnome-extensions enable touchscreen-toggle@jaycodist`.

## Building a release zip

```sh
make dist           # produces touchscreen-toggle@jaycodist-<version>.zip
```

Upload the zip to
[extensions.gnome.org](https://extensions.gnome.org/upload/) for review.

## Security notes

- The extension itself runs unprivileged and never touches `/sys` directly.
- All privileged work is one narrow, argument-validated helper invoked with
  `sudo -n` (never prompts, and only for that exact path via sudoers).
- The helper rejects path traversal and non-`/sys` paths, and writes only the
  validated device basename to `unbind`/`drivers_probe`.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
