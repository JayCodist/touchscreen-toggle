# Build/install tooling for the Touchscreen Toggle GNOME extension.
#
# Sources are TypeScript (src/*.ts); they compile to extension.js +
# deviceUtils.js in dist/, which is what gets installed and zipped.
UUID        := touchscreen-toggle@jaycodist
VERSION     := $(shell sed -nE 's/.*"version"[^0-9]*([0-9]+).*/\1/p' src/metadata.json)
# extensions.gnome.org only accepts a zip named exactly <uuid>.zip; the version
# is read from metadata.json, not the filename. Keep a versioned copy for the
# GitHub release asset.
ZIP         := $(UUID).zip
RELEASE_ZIP := $(UUID)-v$(VERSION).zip
INSTALL_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
HELPER      := data/touchscreen-toggle.sh
HELPER_DEST := /usr/local/bin/touchscreen-toggle

.PHONY: all build install uninstall install-helper dist release clean check typecheck

all: build

# Compile TypeScript to dist/ and assemble the runnable extension payload.
build: node_modules/.install-stamp
	npx tsc
	@cp src/metadata.json dist/metadata.json
	@# Remove before copying: `cp -r src/icons dist/icons` nests into
	@# dist/icons/icons/ when the destination already exists from a previous build.
	@rm -rf dist/icons
	@cp -r src/icons dist/icons
	@echo "Built dist/ for $(UUID) v$(VERSION)"

node_modules/.install-stamp: package.json package-lock.json
	npm ci
	@touch $@

typecheck: build

check: build
	@bash -n $(HELPER)

# Install the extension (unprivileged).
install: build
	@# Wipe the install dir first: copying over an existing tree leaves stale
	@# files and `cp -r` nests directories (e.g. icons/icons/).
	@rm -rf $(INSTALL_DIR)
	@mkdir -p $(INSTALL_DIR)
	@cp -r dist/* $(INSTALL_DIR)/
	@echo "Installed to $(INSTALL_DIR)"
	@echo "Log out/in, then: gnome-extensions enable $(UUID)"

# Install the privileged helper + sudoers rule (needs root: run with sudo).
install-helper:
	@test $$(id -u) -eq 0 || { echo "run as: sudo make install-helper"; exit 1; }
	install -m 0755 $(HELPER) $(HELPER_DEST)
	@SUDO_USER=$${SUDO_USER:-$$(logname)}; \
	echo "$$SUDO_USER ALL=(ALL) NOPASSWD: $(HELPER_DEST)" > /etc/sudoers.d/touchscreen-toggle; \
	chmod 0440 /etc/sudoers.d/touchscreen-toggle; \
	echo "helper + sudoers installed for $$SUDO_USER"

uninstall:
	rm -rf $(INSTALL_DIR)
	rm -f $(HOME)/.local/share/icons/hicolor/scalable/status/touchscreen-on-symbolic.svg \
	      $(HOME)/.local/share/icons/hicolor/scalable/status/touchscreen-off-symbolic.svg
	gtk-update-icon-cache -q -t -f $(HOME)/.local/share/icons/hicolor 2>/dev/null || true
	@echo "Extension removed. To drop the helper: sudo rm -f $(HELPER_DEST) /etc/sudoers.d/touchscreen-toggle"

# extensions.gnome.org expects a zip whose top level is the extension contents.
dist: build
	cd dist && zip -r ../$(ZIP) . -x '*.~*'
	@echo "Wrote $(ZIP) (upload this to extensions.gnome.org)"

# Build the EGO zip plus a versioned copy for a GitHub release asset.
release: dist
	@cp $(ZIP) $(RELEASE_ZIP)
	@echo "Wrote $(RELEASE_ZIP)"

clean:
	rm -rf dist $(ZIP) $(RELEASE_ZIP)
