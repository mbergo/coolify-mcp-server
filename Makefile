# ============================================================
#  coolify-11d — CLI, MCP Server & Claude.ai Connector
# ============================================================
SHELL := /bin/bash
.DEFAULT_GOAL := help

NODE_BIN := ./node_modules/.bin
PKG_MGR  := npm
IMAGE    := ghcr.io/v3ct0r/coolify-11d
TAG      := $(shell git rev-parse --short HEAD 2>/dev/null || echo latest)

# ==================== Install ====================
install: ## Install dependencies (clean install)
	$(PKG_MGR) ci

install-dev: ## Install dependencies (with lock updates)
	$(PKG_MGR) install

# ==================== Dev ====================
dev: ## Run connector (SSE + UI) with hot reload on :3111
	$(NODE_BIN)/tsx watch src/connector/server.ts

dev-cli: ## Run CLI in dev mode — pass args: make dev-cli ARGS="apps list"
	$(NODE_BIN)/tsx src/cli/index.ts $(ARGS)

dev-mcp: ## Run MCP stdio server in dev (for Claude Desktop/Code testing)
	$(NODE_BIN)/tsx src/mcp/server.ts

# ==================== Build ====================
build: ## Compile TS -> dist/ (ESM + d.ts)
	$(NODE_BIN)/tsup

clean: ## Remove build artifacts
	rm -rf dist coverage .turbo

# ==================== Prod ====================
start: ## Run built connector
	node dist/connector/server.js

start-cli: ## Run built CLI — pass args: make start-cli ARGS="apps list"
	node dist/cli.js $(ARGS)

start-mcp: ## Run built MCP server
	node dist/mcp.js

prod: build start ## Build then run connector

# ==================== Test ====================
test: ## Run unit tests
	$(NODE_BIN)/vitest run

test-watch: ## Unit tests in watch mode
	$(NODE_BIN)/vitest

test-integration: ## Live API tests against COOLIFY_BASE_URL (needs COOLIFY_TOKEN)
	COOLIFY_INTEGRATION=1 $(NODE_BIN)/vitest run tests/integration

test-e2e: ## Spawn CLI + MCP server, drive with MCP client
	$(NODE_BIN)/vitest run tests/e2e

test-all: test test-integration test-e2e ## Run every test suite

coverage: ## Unit test coverage report
	$(NODE_BIN)/vitest run --coverage

# ==================== Quality ====================
lint: ## Biome lint
	$(NODE_BIN)/biome lint src tests

format: ## Biome format (write)
	$(NODE_BIN)/biome format --write src tests

check: ## Biome full check + tsc --noEmit
	$(NODE_BIN)/biome check src tests
	$(NODE_BIN)/tsc --noEmit

fix: ## Biome autofix + format
	$(NODE_BIN)/biome check --write src tests

# ==================== Docker ====================
docker-build: ## Build Docker image ($(IMAGE):$(TAG) + :latest)
	docker build -t $(IMAGE):$(TAG) -t $(IMAGE):latest .

docker-run: ## Run container on :3111 (reads env from shell)
	docker run --rm -p 3111:3111 \
		-e COOLIFY_BASE_URL="$$COOLIFY_BASE_URL" \
		-e COOLIFY_TOKEN="$$COOLIFY_TOKEN" \
		-e CONNECTOR_AUTH_TOKEN="$$CONNECTOR_AUTH_TOKEN" \
		$(IMAGE):latest

docker-push: ## Push image to GHCR ($(IMAGE):$(TAG) + :latest)
	docker push $(IMAGE):$(TAG)
	docker push $(IMAGE):latest

docker-size: ## Show final image size
	docker images $(IMAGE):latest --format '{{.Size}}'

compose-up: ## docker compose up -d
	docker compose up -d

compose-down: ## docker compose down
	docker compose down

compose-logs: ## Tail docker compose logs
	docker compose logs -f --tail=100

# ==================== Render ====================
render-install: ## Install Render CLI (macOS brew or linux binary)
	@if command -v brew >/dev/null 2>&1; then \
		brew install render; \
	else \
		curl -fsSL https://github.com/render-oss/cli/releases/latest/download/cli_linux_amd64.zip -o /tmp/render.zip && \
		unzip -o /tmp/render.zip -d /tmp/render-cli && \
		sudo mv /tmp/render-cli/cli_* /usr/local/bin/render && \
		chmod +x /usr/local/bin/render; \
	fi
	@render --version

render-validate: ## Validate render.yaml blueprint
	render blueprints validate render.yaml

render-create: ## One-time: create web service on Render from this repo
	@test -n "$$RENDER_API_KEY" || (echo "ERROR: RENDER_API_KEY not set" && exit 1)
	render services create \
		--name coolify-11d \
		--type web_service \
		--runtime docker \
		--repo "$$(git config --get remote.origin.url)" \
		--branch main \
		--plan starter \
		--region oregon \
		--output json

render-deploy: ## Trigger deploy (needs RENDER_API_KEY + RENDER_SERVICE_ID)
	@test -n "$$RENDER_API_KEY"    || (echo "ERROR: RENDER_API_KEY not set"    && exit 1)
	@test -n "$$RENDER_SERVICE_ID" || (echo "ERROR: RENDER_SERVICE_ID not set" && exit 1)
	render deploys create $$RENDER_SERVICE_ID --wait --output json

render-logs: ## Tail Render service logs
	@test -n "$$RENDER_SERVICE_ID" || (echo "ERROR: RENDER_SERVICE_ID not set" && exit 1)
	render logs --resources $$RENDER_SERVICE_ID --tail

render-status: ## List recent deploys for the service
	@test -n "$$RENDER_SERVICE_ID" || (echo "ERROR: RENDER_SERVICE_ID not set" && exit 1)
	render deploys list $$RENDER_SERVICE_ID --output json

# ---- Render project (workspace grouping) ----
RENDER_PROJECT ?= mcp-servers

render-project-list: ## List projects in the current workspace
	@test -n "$$RENDER_API_KEY" || (echo "ERROR: RENDER_API_KEY not set" && exit 1)
	curl -sS -H "Authorization: Bearer $$RENDER_API_KEY" -H "Accept: application/json" \
		https://api.render.com/v1/projects | jq '.'

render-project-create: ## Create the RENDER_PROJECT (default: mcp-servers)
	@test -n "$$RENDER_API_KEY" || (echo "ERROR: RENDER_API_KEY not set" && exit 1)
	curl -sS -X POST -H "Authorization: Bearer $$RENDER_API_KEY" -H "Content-Type: application/json" \
		-d '{"name":"$(RENDER_PROJECT)"}' \
		https://api.render.com/v1/projects | jq '.'

render-project-assign: ## Move this service into RENDER_PROJECT
	@test -n "$$RENDER_API_KEY"    || (echo "ERROR: RENDER_API_KEY not set"    && exit 1)
	@test -n "$$RENDER_SERVICE_ID" || (echo "ERROR: RENDER_SERVICE_ID not set" && exit 1)
	@test -n "$$RENDER_PROJECT_ID" || (echo "ERROR: RENDER_PROJECT_ID not set — grab it via 'make render-project-list'" && exit 1)
	curl -sS -X PATCH -H "Authorization: Bearer $$RENDER_API_KEY" -H "Content-Type: application/json" \
		-d "{\"projectId\":\"$$RENDER_PROJECT_ID\"}" \
		https://api.render.com/v1/services/$$RENDER_SERVICE_ID | jq '.'

# ==================== Release ====================
release-patch: ## npm version patch + push tag
	npm version patch && git push --follow-tags

release-minor: ## npm version minor + push tag
	npm version minor && git push --follow-tags

release-major: ## npm version major + push tag
	npm version major && git push --follow-tags

publish: build ## Publish to npm (public, with provenance)
	npm publish --access public --provenance

# ==================== Help ====================
help: ## Show this help
	@awk 'BEGIN{FS=":.*?## "; printf "\n\033[1mcoolify-11d targets\033[0m\n\n"} \
		/^[a-zA-Z0-9_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""

.PHONY: install install-dev dev dev-cli dev-mcp build clean start start-cli start-mcp prod \
        test test-watch test-integration test-e2e test-all coverage \
        lint format check fix \
        docker-build docker-run docker-push docker-size compose-up compose-down compose-logs \
        render-install render-validate render-create render-deploy render-logs render-status \
        render-project-list render-project-create render-project-assign \
        release-patch release-minor release-major publish help
