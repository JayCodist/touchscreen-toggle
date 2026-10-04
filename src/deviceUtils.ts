// This module finds touchscreen devices. The Shell process and the preferences
// process both use it.
//
// A toggleable device is the closest ancestor of an ID_INPUT_TOUCHSCREEN input
// node that has a bound driver. The kernel unbind and drivers_probe interface
// acts on this node. This is true for every bus type (hid, usb, i2c, and
// others).
import Gio from 'gi://Gio';
import GUdev from 'gi://GUdev';

export interface Touchscreen {
    /** Absolute path of the toggle target sysfs directory. It owns the driver symlink. */
    syspath: string;
    /** Name of the bound driver, for example "wacom". Empty if unknown. */
    driver: string;
    /** udev SUBSYSTEM of the target, for example "hid". This locates drivers_probe. */
    subsystem: string;
    /** Label shown in the menu. */
    name: string;
    /** Identifier that does not depend on the path. It stays the same after a
     *  device is reconnected or an event node is renumbered. */
    id: string;
}

// These subsystems never own the toggleable driver.
const IGNORE_SUBSYSTEMS = new Set(['input', 'usb_endpoint', 'hidraw']);

export function listTouchscreens(): Touchscreen[] {
    const client = GUdev.Client.new([]);
    const devices = client.query_by_subsystem('input') ?? [];

    // First pass: build a map from each toggle-target syspath to its target device
    // and its child input names.
    const groups = new Map<string, { syspath: string; target: GUdev.Device; names: string[] }>();
    for (const dev of devices) {
        if (dev.get_property('ID_INPUT_TOUCHSCREEN') !== '1')
            continue;

        let target: GUdev.Device | null = null;
        for (let node: GUdev.Device | null = dev; node; node = node.get_parent()) {
            const driver = node.get_property('DRIVER');
            const subsystem = node.get_property('SUBSYSTEM');
            if (driver && subsystem && !IGNORE_SUBSYSTEMS.has(subsystem)) {
                target = node;
                break;
            }
        }
        if (!target)
            continue;

        const syspath = target.get_sysfs_path();
        let group = groups.get(syspath);
        if (!group) {
            group = { syspath, target, names: [] };
            groups.set(syspath, group);
        }
        const name = dev.get_property('NAME');
        if (name)
            group.names.push(name);
    }

    const result: Touchscreen[] = [];
    for (const { syspath, target, names } of groups.values()) {
        result.push({
            syspath,
            driver: target.get_property('DRIVER') ?? '',
            subsystem: target.get_property('SUBSYSTEM') ?? '',
            name: friendlyName(target, names),
            id: stableId(target, syspath),
        });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function isBound(syspath: string): boolean {
    return Gio.File.new_for_path(`${syspath}/driver`).query_exists(null);
}

function friendlyName(device: GUdev.Device, inputNames: string[]): string {
    if (inputNames.length > 0) {
        // udev can wrap the NAME value in quotes. Remove the surrounding quotes.
        const clean = (n: string) => n.replace(/^"|"$/g, '').trim();
        // Names such as "Wacom HID 4998 Finger" and "Wacom HID 4998 Pen" share a
        // prefix. Remove the role word, then use the common name if one remains.
        const stripped = [...new Set(inputNames.map(n =>
            clean(n).replace(/\s+(finger|pen|touch|stylus|eraser)\s*$/i, '').trim()))];
        if (stripped.length === 1)
            return stripped[0];
        return clean(inputNames[0]);
    }
    const vendor = device.get_property('ID_VENDOR_FROM_DATABASE') ?? device.get_property('ID_VENDOR');
    const model = device.get_property('ID_MODEL_FROM_DATABASE') ?? device.get_property('ID_MODEL');
    if (vendor && model)
        return `${vendor} ${model}`;
    return `${device.get_property('DRIVER') ?? 'unknown'} touchscreen`;
}

function stableId(device: GUdev.Device, syspath: string): string {
    // Return an identifier that does not depend on the path. Saved state stays
    // valid after a device is reconnected or an event node is renumbered.
    for (const p of ['ID_SERIAL', 'PRODUCT', 'MODALIAS', 'Uniq']) {
        const v = device.get_property(p);
        if (v && v.length > 0)
            return v;
    }
    return syspath;
}
