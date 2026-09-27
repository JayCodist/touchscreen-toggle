# Security Policy

## Scope

This extension performs privileged operations: it runs a small helper script as
`root` (via a scoped `sudo` rule) that writes to `/sys` to unbind and re-probe
input device drivers. That surface is treated as security-critical.

## Trust model

- The GNOME Shell extension itself runs **unprivileged** and never writes to
  `/sys` directly.
- All privileged work is delegated to `data/touchscreen-toggle.sh`, installed
  at `/usr/local/bin/touchscreen-toggle` and invoked as `sudo -n <helper> <args>`.
- The sudoers rule is scoped to that single absolute path — it does **not**
  grant general root.
- The helper validates its arguments strictly: it rejects path traversal and any
  path outside `/sys`, and writes only a validated device basename to
  `unbind` / `drivers_probe`.

## Known considerations

- `sudo -n` means the helper runs without a password by design (enabled by the
  scoped sudoers entry). Anyone able to invoke that exact path as your user can
  toggle the configured touchscreen devices — and nothing else.
- Device arguments come from the extension's own udev enumeration, not from
  untrusted input.

## Reporting a vulnerability

Please report security issues **privately** via GitHub's
[security advisories](https://github.com/JayCodist/touchscreen-toggle/security/advisories/new)
rather than a public issue. We aim to acknowledge within 7 days and ship a fix
or mitigation promptly.
