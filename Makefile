# Build and install tooling for the Touchscreen Toggle GNOME extension.
#
# The sources are TypeScript files in src/. The build compiles them into
# extension.js and deviceUtils.js in dist/. The install and dist targets use the
# contents of dist/.
UUID        := touchscreen-toggle@jaycodist
VERSION     := $(shell sed -nE 's/.*"version"[^0-9]*([0-9]+).*/\1/p' src/metadata.json)
# extensions.gnome.org accepts only a zip named exactly <uuid>.zip. It reads the
# version from metadata.json, not from the file name. The release target also
# makes a copy with the version in its name for the GitHub release asset.
ZIP         := $(UUID).zip
RELEASE_ZIP := $(UUID)-v$(VERSION).zip
INSTALL_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
HELPER      := data/touchscreen-toggle.sh
HELPER_DEST := /usr/local/bin/touchscreen-toggle

.PHONY: all build install uninstall install-helper dist release clean check typecheck

all: build

# Compile TypeScript into dist/ and assemble the files that the Shell runs.
build: node_modules/.install-stamp
	npx tsc
	@cp src/metadata.json dist/metadata.json
	@# Remove dist/icons before the copy. If the destination already exists from
	@# an earlier build, `cp -r src/icons dist/icons` creates dist/icons/icons/.
	@rm -rf dist/icons
	@cp -r src/icons dist/icons
	@echo "Built dist/ for $(UUID) v$(VERSION)"

node_modules/.install-stamp: package.json package-lock.json
	npm ci
	@touch $@

typecheck: build

check: build
	@bash -n $(HELPER)

# Install the extension. This target does not need root.
install: build
	@# Delete the install directory first. Copying over an existing tree leaves
	@# stale files, and `cp -r` nests directories (for example icons/icons/).
	@rm -rf $(INSTALL_DIR)
	@mkdir -p $(INSTALL_DIR)
	@cp -r dist/* $(INSTALL_DIR)/
	@echo "Installed to $(INSTALL_DIR)"
	@echo "Log out/in, then: gnome-extensions enable $(UUID)"

# Install the privileged helper and the sudoers rule. Run this target with sudo.
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

# extensions.gnome.org expects a zip whose top level holds the extension files.
dist: build
	cd dist && zip -r ../$(ZIP) . -x '*.~*'
	@echo "Wrote $(ZIP) (upload this to extensions.gnome.org)"

# Build the extensions.gnome.org zip and a versioned copy for a GitHub release.
release: dist
	@cp $(ZIP) $(RELEASE_ZIP)
	@echo "Wrote $(RELEASE_ZIP)"

clean:
	rm -rf dist $(ZIP) $(RELEASE_ZIP)
