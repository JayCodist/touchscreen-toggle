import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GUdev from 'gi://GUdev';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Button } from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { PopupMenu, PopupMenuItem, PopupSwitchMenuItem } from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { listTouchscreens, isBound, type Touchscreen } from './deviceUtils.js';

// Fixed, documented location of the privileged helper (see README install step).
const HELPER_PATH = '/usr/local/bin/touchscreen-toggle';

// Subsystems that can carry a touchscreen; uevents here trigger a re-scan.
const WATCH_SUBSYSTEMS = ['hid', 'usb', 'i2c', 'serio', 'input'];

export default class TouchscreenToggleExtension extends Extension {
    #button: Button | null = null;
    #icon: St.Icon | null = null;
    #udev: GUdev.Client | null = null;
    #udevId = 0;
    #debounceId = 0;
    #devices: Touchscreen[] = [];
    #syncing = false;

    #runHelper(syspath: string, subsystem: string, action: string): boolean {
        const argv = ['sudo', '-n', HELPER_PATH, syspath, subsystem, action];
        const [ok, , err] = GLib.spawn_sync(
            null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null);
        if (!ok) {
            const msg = err ? new TextDecoder().decode(err).trim() : '';
            Main.notify(_('Touchscreen toggle failed'),
                msg || _('Helper missing or sudoers not set up. See the extension README.'));
        }
        return ok;
    }

    #anyEnabled(): boolean {
        return this.#devices.some(d => isBound(d.syspath));
    }

    #menu(): PopupMenu {
        // Created without dontCreateMenu, so button.menu is a real PopupMenu.
        return this.#button!.menu as PopupMenu;
    }

    #updateIcon(): void {
        if (!this.#icon || !this.#button)
            return;
        const any = this.#anyEnabled();
        this.#icon.gicon = Gio.icon_new_for_string(
            any ? 'touchscreen-on-symbolic' : 'touchscreen-off-symbolic');
        // set_tooltip_text is a runtime Clutter method absent from the GIR types.
        (this.#button as unknown as Tooltipable).set_tooltip_text(
            any ? _('Touchscreen enabled') : _('Touchscreen disabled'));
    }

    #rebuildMenu(): void {
        const menu = this.#menu();
        menu.removeAll();

        if (this.#devices.length === 0) {
            const item = new PopupMenuItem(_('No touchscreen found'));
            item.setSensitive(false);
            menu.addMenuItem(item);
            return;
        }

        for (const dev of this.#devices) {
            const item = new PopupSwitchMenuItem(dev.name, isBound(dev.syspath));
            item.connect('toggled', () => {
                if (this.#syncing)
                    return;
                this.#runHelper(dev.syspath, dev.subsystem, item.state ? 'on' : 'off');
                this.#rescan();
            });
            menu.addMenuItem(item);
        }
    }

    #rescan(): void {
        this.#devices = listTouchscreens();
        this.#rebuildMenu();
        this.#updateIcon();
    }

    #scheduleRescan(): void {
        if (this.#debounceId)
            return;
        this.#debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this.#debounceId = 0;
            this.#rescan();
            return GLib.SOURCE_REMOVE;
        });
    }

    override enable(): void {
        // Make bundled symbolic icons resolvable by name.
        const iconDir = this.dir.get_child('icons').get_path();
        const display = Gdk.Display.get_default();
        if (iconDir && display)
            Gtk.IconTheme.get_for_display(display).add_search_path(iconDir);

        // Auto-menu Button: it creates + registers its own PopupMenu (button.menu).
        const button = new Button(0.5, _('Touchscreen Toggle'));
        this.#button = button;
        const icon = new St.Icon({ style_class: 'system-status-icon' });
        this.#icon = icon;
        button.add_child(icon);
        this.#menu().connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen)
                this.#rescan();
        });

        Main.panel.addToStatusArea(this.uuid, button);
        this.#rescan();

        const udev = GUdev.Client.new(WATCH_SUBSYSTEMS);
        this.#udev = udev;
        this.#udevId = udev.connect('uevent', () => this.#scheduleRescan());
    }

    override disable(): void {
        if (this.#udevId) {
            this.#udev?.disconnect(this.#udevId);
            this.#udevId = 0;
        }
        if (this.#debounceId) {
            GLib.source_remove(this.#debounceId);
            this.#debounceId = 0;
        }
        this.#udev = null;
        this.#button?.destroy();
        this.#button = null;
        this.#icon = null;
    }
}
