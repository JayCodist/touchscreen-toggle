#!/usr/bin/env bash
#
# touchscreen-toggle.sh — enable/disable an input device at the kernel driver level.
#
# Usage: touchscreen-toggle.sh <sysfs-device-path> <subsystem> <on|off|toggle>
#
#   <sysfs-device-path>  real device dir, e.g.
#                        /sys/devices/pci0000:00/.../0018:056A:4998.0002
#   <subsystem>          the device's udev SUBSYSTEM (hid, usb, i2c, serio, ...),
#                        used to locate /sys/bus/<subsystem>/drivers_probe.
#
# Disabling unbinds the device from its driver (the kernel stops seeing it);
# enabling re-probes it, letting the kernel re-bind the matched driver — so no
# driver name is ever hard-coded.
#
# Designed to be run via sudo with a NOPASSWD sudoers entry limited to this
# script. Input is therefore validated strictly: only real directories under
# /sys/ are accepted, path traversal is rejected, and only validated strings
# are ever written to sysfs.
#
# SPDX-License-Identifier: GPL-3.0-or-later

set -euo pipefail

usage() {
    echo "usage: $(basename "$0") <sysfs-device-path> <subsystem> <on|off|toggle>" >&2
    exit 2
}

[[ $# -eq 3 ]] || usage
DEVPATH="$1"
SUBSYSTEM="$2"
ACTION="$3"

# --- strict input validation -------------------------------------------------
[[ "$DEVPATH" != *'..'* ]] || { echo "error: path traversal rejected" >&2; exit 2; }
if [[ ! "$DEVPATH" =~ ^/sys/[a-zA-Z0-9_/:.+[:space:]-]+$ ]]; then
    echo "error: refusing unexpected device path: $DEVPATH" >&2
    exit 2
fi
[[ -d "$DEVPATH" ]] || { echo "error: no such device: $DEVPATH" >&2; exit 1; }

if [[ ! "$SUBSYSTEM" =~ ^[a-z0-9_-]+$ ]]; then
    echo "error: refusing unexpected subsystem: $SUBSYSTEM" >&2
    exit 2
fi

DEVNAME=$(basename "$DEVPATH")

# Bound == the driver symlink exists.
is_bound() { [[ -e "$DEVPATH/driver" ]]; }

do_off() {
    if ! is_bound; then
        echo "already disabled"
        return 0
    fi
    local driver_dir
    driver_dir=$(readlink -f "$DEVPATH/driver")
    [[ -w "$driver_dir/unbind" ]] || { echo "error: cannot write $driver_dir/unbind" >&2; exit 1; }
    printf '%s' "$DEVNAME" > "$driver_dir/unbind"
    echo "disabled $DEVNAME (driver $(basename "$driver_dir") unbound)"
}

do_on() {
    if is_bound; then
        echo "already enabled"
        return 0
    fi
    local probe="/sys/bus/$SUBSYSTEM/drivers_probe"
    [[ -w "$probe" ]] || { echo "error: $probe not writable" >&2; exit 1; }
    printf '%s' "$DEVNAME" > "$probe"
    # drivers_probe returns before binding finishes; give udev a moment.
    sleep 0.2
    if is_bound; then
        echo "enabled $DEVNAME (driver $(basename "$(readlink -f "$DEVPATH/driver")") bound)"
    else
        echo "error: re-probed $DEVNAME but no driver bound" >&2
        exit 1
    fi
}

case "$ACTION" in
    off)   do_off ;;
    on)    do_on ;;
    toggle) if is_bound; then do_off; else do_on; fi ;;
    *)     usage ;;
esac
