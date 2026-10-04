#!/usr/bin/env bash
#
# touchscreen-toggle.sh: Enable or disable an input device at the kernel driver
# level.
#
# Usage: touchscreen-toggle.sh <sysfs-device-path> <subsystem> <on|off|toggle>
#
#   <sysfs-device-path>  The real device directory, for example
#                        /sys/devices/pci0000:00/.../0018:056A:4998.0002
#   <subsystem>          The udev SUBSYSTEM of the device (hid, usb, i2c, serio,
#                        or another). The script uses it to build the path
#                        /sys/bus/<subsystem>/drivers_probe.
#
# To disable, the script unbinds the device from its driver. The kernel then
# stops seeing the device. To enable, the script re-probes the device, and the
# kernel binds the matching driver again. The script never stores a driver name.
#
# Run this script with sudo. A NOPASSWD sudoers entry limits it to this script
# path. The script validates every argument. It accepts only real directories
# under /sys/, rejects path traversal, and writes only validated strings to
# sysfs.
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

# Strict input validation. No sysfs write happens until these checks pass.
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

# A device is bound when its driver symlink exists.
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
    # drivers_probe returns before the kernel finishes binding. Wait for udev.
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
