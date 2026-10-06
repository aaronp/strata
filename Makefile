PORT ?= 3000
.PHONY: dev build preview test clean

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
