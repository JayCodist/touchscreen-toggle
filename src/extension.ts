import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GUdev from 'gi://GUdev';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Button } from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { PopupMenu, PopupMenuItem, PopupMenuManager, PopupSwitchMenuItem } from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { listTouchscreens, isBound, type Touchscreen } from './deviceUtils.js';

// The privileged helper lives at this path. The README explains how to install it.
const HELPER_PATH = '/usr/local/bin/touchscreen-toggle';

// Subsystems that can contain a touchscreen. A uevent on these subsystems starts
// a re-scan.
const WATCH_SUBSYSTEMS = ['hid', 'usb', 'i2c', 'serio', 'input'];

// Path of the device registry. This file survives logout and reboot. An unbound
// device loses its ID_INPUT_TOUCHSCREEN udev property, so enumeration cannot find
// it again. The registry records every device the extension sees. This lets the
// menu re-enable a device after it stops reporting as a touchscreen.
const STATE_PATH = GLib.build_filenamev(
    [GLib.get_user_data_dir(), 'touchscreen-toggle', 'devices.json']);

export default class TouchscreenToggleExtension extends Extension {
    #button: Button | null = null;
    #icon: St.Icon | null = null;
    #popup: PopupMenu | null = null;
    // A private manager controls the open and close grab for our popup. Do not use
    // the shared Main.panel.menuManager. If you register the popup on that manager,
    // it shares a source actor with the button's PopupDummyMenu. The panel then
    // opens the popup when the pointer hovers over the button. A private manager
    // keeps the outside-click-close behavior. Its captured-event handler lives on
    // the hidden BoxPointer, so hovering over the button cannot open the popup.
    #menuManager: PopupMenuManager | null = null;
    #udev: GUdev.Client | null = null;
    #udevId = 0;
    #buttonPressId = 0;
    #popupOpenId = 0;
    #debounceId = 0;
    // Every touchscreen the extension has seen, keyed by syspath. The extension
    // saves this map to STATE_PATH. The menu is built from it, so a disabled device
    // stays in the menu.
    #known = new Map<string, Touchscreen>();
    #syncing = false;

    #loadKnown(): void {
        try {
            const [ok, bytes] = GLib.file_get_contents(STATE_PATH);
            if (!ok)
                return;
            const list = JSON.parse(new TextDecoder().decode(bytes));
            if (!Array.isArray(list))
                return;
            for (const d of list) {
                if (!d?.syspath || !d?.subsystem || !d?.name)
                    continue;
                // Remove devices that are no longer present. An unbound touchscreen
                // keeps its sysfs directory, so this check only removes hardware that
                // was unplugged.
                if (!Gio.File.new_for_path(d.syspath).query_exists(null))
                    continue;
                this.#known.set(d.syspath, d);
            }
        } catch {
            // First run or a corrupt file: start with an empty registry.
        }
    }

    #saveKnown(): void {
        try {
            const dir = GLib.path_get_dirname(STATE_PATH);
            GLib.mkdir_with_parents(dir, 0o755);
            GLib.file_set_contents(STATE_PATH, JSON.stringify([...this.#known.values()]));
        } catch (e) {
            log(`touchscreen-toggle: could not persist device list: ${e}`);
        }
    }

    #runHelper(syspath: string, subsystem: string, action: string): boolean {
        const argv = ['sudo', '-n', HELPER_PATH, syspath, subsystem, action];
        const [ok, , err] = GLib.spawn_sync(
            null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null);
        if (!ok) {
            const msg = err ? new TextDecoder().decode(err).trim() : '';
            Main.notify(_('Touchscreen toggle failed'),
                msg || _('The helper is missing or the sudoers rule is not set up. See the README.'));
        }
        return ok;
    }

    #menu(): PopupMenu {
        return this.#popup!;
    }

    // Copy the bundled symbolic icons into the user icon theme. The panel resolves
    // them by themed name from there. GNOME 50 has no public API to add a search
    // path to the default St theme. The user hicolor directory is already in the
    // lookup path of every theme.
    #installIcons(): void {
        const hicolorDir = GLib.build_filenamev([
            GLib.get_user_data_dir(), 'icons', 'hicolor']);
        const statusDir = GLib.build_filenamev([hicolorDir, 'scalable', 'status']);
        try {
            GLib.mkdir_with_parents(statusDir, 0o755);
            const src = this.dir.get_child('icons')
                .get_child('hicolor').get_child('scalable').get_child('status');
            for (const name of ['touchscreen-on-symbolic.svg', 'touchscreen-off-symbolic.svg']) {
                const dst = Gio.File.new_for_path(GLib.build_filenamev([statusDir, name]));
                try {
                    dst.delete(null);
                } catch {
                    // The file does not exist yet.
                }
                src.get_child(name).copy(dst, Gio.FileCopyFlags.NONE, null, null);
            }
            // Update the theme cache so the running Shell loads the new icons.
            GLib.spawn_async(
                null, ['gtk-update-icon-cache', '-q', '-t', '-f', hicolorDir],
                null, GLib.SpawnFlags.SEARCH_PATH, null);
        } catch (e) {
            log(`touchscreen-toggle: could not install icons: ${e}`);
        }
    }

    #updateIcon(): void {
        if (!this.#icon || !this.#button)
            return;
        const devices = [...this.#known.values()];
        let iconName: string;
        let label: string;
        if (devices.length === 0) {
            // Error state: the extension found no touchscreen.
            iconName = 'dialog-error-symbolic';
            label = _('No touchscreen found');
        } else if (devices.every(d => isBound(d.syspath))) {
            // Every known touchscreen is bound (enabled).
            iconName = 'touchscreen-on-symbolic';
            label = _('Touchscreen enabled');
        } else {
            // At least one known touchscreen is unbound (disabled).
            iconName = 'touchscreen-off-symbolic';
            label = _('Touchscreen disabled');
        }
        this.#icon.gicon = Gio.icon_new_for_string(iconName);
        // GNOME 50 Clutter has no set_tooltip_text method. accessible_name is the
        // supported label. It sets both the screen-reader name and the hover text.
        this.#button.accessible_name = label;
    }

    #rebuildMenu(): void {
        const menu = this.#menu();
        menu.removeAll();

        const devices = [...this.#known.values()]
            .sort((a, b) => a.name.localeCompare(b.name));

        if (devices.length === 0) {
            const item = new PopupMenuItem(_('No touchscreen found'));
            item.setSensitive(false);
            menu.addMenuItem(item);
            return;
        }

        for (const dev of devices) {
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
        // Add each newly detected device to the registry. Do not remove a device
        // already in it. A device loses its udev properties once it is unbound.
        for (const dev of listTouchscreens())
            this.#known.set(dev.syspath, dev);
        this.#saveKnown();
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

    // With one device, a click toggles it directly. With two or more devices, a
    // click opens the menu. dontCreateMenu turns off the button's built-in click
    // gesture, so the button-press-event handler controls all behavior.
    #onActivate(): void {
        const devices = [...this.#known.values()];
        if (devices.length === 1) {
            const dev = devices[0];
            this.#runHelper(dev.syspath, dev.subsystem, isBound(dev.syspath) ? 'off' : 'on');
            this.#rescan();
        } else {
            this.#menu().toggle();
        }
    }

    override enable(): void {
        this.#installIcons();

        // dontCreateMenu=true makes button.menu an inactive PopupDummyMenu and turns
        // off the automatic click gesture. The button-press-event handler controls
        // every action.
        const button = new Button(0.5, _('Touchscreen Toggle'), true);
        this.#button = button;
        const icon = new St.Icon({ style_class: 'system-status-icon' });
        this.#icon = icon;
        const box = new St.BoxLayout({ style_class: 'panel-status-indicators-box' });
        box.add_child(icon);
        button.add_child(box);

        // Build our own popup. A private manager owns it, so an outside click closes
        // it. The manager handles the modal grab. The shared panel manager never
        // opens this popup on hover. See #menuManager for why the manager must be
        // private and not Main.panel.menuManager.
        const popup = new PopupMenu(button, 0.5, St.Side.TOP);
        this.#popup = popup;
        Main.uiGroup.add_child(popup.actor);
        popup.actor.hide();
        this.#menuManager = new PopupMenuManager(button);
        this.#menuManager.addMenu(popup);
        this.#popupOpenId = popup.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen)
                this.#rescan();
        });

        this.#buttonPressId = button.connect('button-press-event', (_actor, event) => {
            if (event.get_button() === Clutter.BUTTON_PRIMARY) {
                this.#onActivate();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        Main.panel.addToStatusArea(this.uuid, button);
        this.#loadKnown();
        this.#rescan();

        const udev = GUdev.Client.new(WATCH_SUBSYSTEMS);
        this.#udev = udev;
        this.#udevId = udev.connect('uevent', () => this.#scheduleRescan());
    }

    override disable(): void {
        if (this.#buttonPressId) {
            this.#button?.disconnect(this.#buttonPressId);
            this.#buttonPressId = 0;
        }
        if (this.#popupOpenId) {
            this.#popup?.disconnect(this.#popupOpenId);
            this.#popupOpenId = 0;
        }
        if (this.#udevId) {
            this.#udev?.disconnect(this.#udevId);
            this.#udevId = 0;
        }
        if (this.#debounceId) {
            GLib.source_remove(this.#debounceId);
            this.#debounceId = 0;
        }
        this.#udev = null;
        if (this.#popup) {
            this.#menuManager?.removeMenu(this.#popup);
            this.#popup.destroy();
            this.#popup = null;
        }
        this.#menuManager = null;
        this.#button?.destroy();
        this.#button = null;
        // The icon is a child of the button, so destroying the button destroys it.
        // Call destroy() explicitly so teardown is complete even if the button
        // detaches first.
        this.#icon?.destroy();
        this.#icon = null;
    }
}
