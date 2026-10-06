PORT ?= 3067
.PHONY: dev build preview test clean import

dev:
	PORT=$(PORT) bun server.ts

test:
	bun test

clean:
	rm -rf dist

build:
	bun build.ts

preview: build
	bunx serve dist -l $(PORT)

import:
	@if [ -n "$(DECK)" ]; then bun importer.ts --deck $(DECK); else bun importer.ts $(MD) $(SLUG); fi
