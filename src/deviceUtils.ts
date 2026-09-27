// Shared touchscreen discovery for both the shell and prefs processes.
//
// A "toggleable device" is the nearest ancestor of an ID_INPUT_TOUCHSCREEN
// input node that has a bound driver — that is the node the kernel's
// unbind / drivers_probe ABI operates on, regardless of bus (hid/usb/i2c/...).
import Gio from 'gi://Gio';
import GUdev from 'gi://GUdev';

export interface Touchscreen {
    /** Absolute sysfs dir of the toggle target (owns the `driver` symlink). */
    syspath: string;
    /** Bound driver name, e.g. "wacom". May be empty if unknown. */
    driver: string;
    /** udev SUBSYSTEM of the target, e.g. "hid" — locates drivers_probe. */
    subsystem: string;
    /** Human-readable label for the menu. */
    name: string;
    /** Path-independent id, stable across replug / event renumbering. */
    id: string;
}

// Ancestors that never own the toggleable driver.
const IGNORE_SUBSYSTEMS = new Set(['input', 'usb_endpoint', 'hidraw']);

export function listTouchscreens(): Touchscreen[] {
    const client = GUdev.Client.new([]);
    const devices = client.query_by_subsystem('input') ?? [];

    // First pass: map toggle-target syspath -> { target, child input names }.
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
        // udev's NAME can be quote-wrapped; drop surrounding quotes.
        const clean = (n: string) => n.replace(/^"|"$/g, '').trim();
        // "Wacom HID 4998 Finger" / "... Pen" -> common prefix, else first name.
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
    // A path-independent identifier so saved state survives re-plugging and
    // event-node renumbering.
    for (const p of ['ID_SERIAL', 'PRODUCT', 'MODALIAS', 'Uniq']) {
        const v = device.get_property(p);
        if (v && v.length > 0)
            return v;
    }
    return syspath;
}
