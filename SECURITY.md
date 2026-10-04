# Security Policy

## Scope

This extension performs privileged operations. It runs a small helper script as
`root` through a scoped `sudo` rule. The script writes to `/sys` to unbind and
re-probe input device drivers. We treat this code as security-critical.

## Trust model

- The GNOME Shell extension runs without root and never writes to `/sys`
  directly.
- All privileged work goes to `data/touchscreen-toggle.sh`. The system installs
  it at `/usr/local/bin/touchscreen-toggle`. The extension calls it as
  `sudo -n <helper> <args>`.
- The sudoers rule applies only to that one absolute path. It does not grant
  general root.
- The helper checks its arguments. It rejects path traversal and any path
  outside `/sys`. It writes only a validated device name to `unbind` and
  `drivers_probe`.

## Known considerations

- `sudo -n` means the helper runs without a password. The scoped sudoers entry
  allows this by design. Anyone who can run that exact path as your user can
  toggle the touchscreen devices the extension lists. They cannot do anything
  else.
- The device arguments come from the extension's own udev enumeration. They do
  not come from untrusted input.

## Reporting a vulnerability

Report security issues privately through GitHub
[security advisories](https://github.com/JayCodist/touchscreen-toggle/security/advisories/new),
not in a public issue. We acknowledge reports within 7 days and ship a fix or
mitigation promptly.
