import Clutter from 'gi://Clutter';
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

// Where the session-independent device registry is stored. An unbound device
// loses its ID_INPUT_TOUCHSCREEN udev property, so enumeration alone cannot
// find it again after logout/reboot; persisting what we've seen keeps the
// menu able to re-enable it.
const STATE_PATH = GLib.build_filenamev(
    [GLib.get_user_data_dir(), 'touchscreen-toggle', 'devices.json']);

export default class TouchscreenToggleExtension extends Extension {
    #button: Button | null = null;
    #icon: St.Icon | null = null;
    #popup: PopupMenu | null = null;
    #udev: GUdev.Client | null = null;
    #udevId = 0;
    #debounceId = 0;
    // Every touchscreen ever seen (persisted to STATE_PATH, see above), keyed
    // by syspath. Drives the menu so a disabled device never disappears from it.
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
                // Prune devices physically removed since last session (an
                // unbound-but-present touchscreen keeps its sysfs dir, so this
                // only drops genuinely gone hardware).
                if (!Gio.File.new_for_path(d.syspath).query_exists(null))
                    continue;
                this.#known.set(d.syspath, d);
            }
        } catch {
            // first run / corrupt state: start empty
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
                msg || _('Helper missing or sudoers not set up. See the extension README.'));
        }
        return ok;
    }

    #menu(): PopupMenu {
        return this.#popup!;
    }

    // Install the bundled symbolic icons into the user icon theme so the panel
    // (St.Icon) can resolve them by themed name. GNOME 50 exposes no public
    // API to append a search path to St's own default theme, and the user's
    // hicolor dir is already in every theme's lookup path.
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
                    // not present yet
                }
                src.get_child(name).copy(dst, Gio.FileCopyFlags.NONE, null, null);
            }
            // Refresh the theme cache so the running shell picks the new icons up.
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
            // Error state: no touchscreen could be found at all.
            iconName = 'dialog-error-symbolic';
            label = _('No touchscreen found');
        } else if (devices.every(d => isBound(d.syspath))) {
            // All discovered touchscreens connected.
            iconName = 'touchscreen-on-symbolic';
            label = _('Touchscreen enabled');
        } else {
            // One or more discovered touchscreens disconnected.
            iconName = 'touchscreen-off-symbolic';
            label = _('Touchscreen disabled');
        }
        this.#icon.gicon = Gio.icon_new_for_string(iconName);
        // GNOME 50 Clutter has no set_tooltip_text; accessible_name is the
        // supported label (screen-reader name + hover text).
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
        // Merge freshly-detected devices into the registry; never forget one
        // we've already seen (its udev props disappear once unbound).
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

    // Single device: click toggles it directly (original UX). Two or more:
    // click opens the per-device menu. dontCreateMenu keeps the button's own
    // click gesture disabled so our button-press-event fully controls behavior.
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

        // dontCreateMenu=true -> button.menu is an inert PopupDummyMenu and the
        // auto click gesture is off; we drive everything from button-press-event.
        const button = new Button(0.5, _('Touchscreen Toggle'), true);
        this.#button = button;
        const icon = new St.Icon({ style_class: 'system-status-icon' });
        this.#icon = icon;
        button.add_child(icon);

        // Our own popup, registered with the panel's menu manager so an
        // outside click closes it (PopupMenuManager handles the grab).
        const popup = new PopupMenu(button, 0.5, St.Side.TOP);
        this.#popup = popup;
        Main.uiGroup.add_child(popup.actor);
        popup.actor.hide();
        Main.panel.menuManager.addMenu(popup);
        popup.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen)
                this.#rescan();
        });

        button.connect('button-press-event', (_actor, event) => {
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
            Main.panel.menuManager.removeMenu(this.#popup);
            this.#popup.destroy();
            this.#popup = null;
        }
        this.#button?.destroy();
        this.#button = null;
        this.#icon = null;
    }
}
