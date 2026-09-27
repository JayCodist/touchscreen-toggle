/// <reference types="@girs/gio-2.0/ambient" />
/// <reference types="@girs/glib-2.0/ambient" />
/// <reference types="@girs/gobject-2.0/ambient" />
/// <reference types="@girs/gtk-4.0/ambient" />
/// <reference types="@girs/gdk-4.0/ambient" />
/// <reference types="@girs/gudev-1.0/ambient" />
/// <reference types="@girs/st-18/ambient" />
/// <reference types="@girs/clutter-18/ambient" />
/// <reference types="@girs/shell-18/ambient" />
/// <reference types="@girs/gjs/ambient" />
/// <reference types="@girs/gnome-shell/ambient" />

// GJS provides this WHATWG global at runtime; the @girs/gjs ambient path does
// not declare it, so we do so here (minimal surface we use).
declare class TextDecoder {
    constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
    decode(input?: ArrayBufferView | ArrayBuffer | null): string;
}
