.PHONY: setup up down server web logs

ROOT_DIR := $(CURDIR)
PID_DIR := .pids
LOG_DIR := .logs
SERVER_PID := $(PID_DIR)/server.pid
WEB_PID    := $(PID_DIR)/web.pid
SERVER_LOG := $(LOG_DIR)/server.log
WEB_LOG    := $(LOG_DIR)/web.log
SERVER_PORT := 8989
CUDA_LIB_DIR := /usr/local/cuda-12.8/targets/x86_64-linux/lib:/lib/x86_64-linux-gnu

$(PID_DIR) $(LOG_DIR):
	mkdir -p $@

setup:
	cd web && pnpm install
	cd server && uv sync && LD_LIBRARY_PATH=$(CUDA_LIB_DIR):$${LD_LIBRARY_PATH:-} uv run python src/download_models.py

up: $(PID_DIR) $(LOG_DIR) server web
	@echo "Server log: $(SERVER_LOG)  Web log: $(WEB_LOG)"
	@echo "Run 'make logs' to tail both"

server: $(PID_DIR) $(LOG_DIR)
	@if [ -f $(SERVER_PID) ] && kill -0 $$(cat $(SERVER_PID)) 2>/dev/null; then \
		echo "server already running (pid $$(cat $(SERVER_PID)))"; \
	else \
		setsid sh -c 'cd "$(ROOT_DIR)/server" && export LD_LIBRARY_PATH="$(CUDA_LIB_DIR):$${LD_LIBRARY_PATH:-}" && exec uv run python src/server.py --port $(SERVER_PORT)' > $(ROOT_DIR)/$(SERVER_LOG) 2>&1 < /dev/null & \
		echo $$! > $(SERVER_PID); \
		echo "server started on port $(SERVER_PORT) (pid $$(cat $(SERVER_PID)))"; \
	fi

web: $(PID_DIR) $(LOG_DIR)
	@if [ -f $(WEB_PID) ] && kill -0 $$(cat $(WEB_PID)) 2>/dev/null; then \
		echo "web already running (pid $$(cat $(WEB_PID)))"; \
	else \
		setsid sh -c 'cd "$(ROOT_DIR)/web" && exec pnpm exec vp dev' > $(ROOT_DIR)/$(WEB_LOG) 2>&1 < /dev/null & \
		echo $$! > $(WEB_PID); \
		echo "web started (pid $$(cat $(WEB_PID)))"; \
	fi

down:
	@if [ -f $(SERVER_PID) ]; then kill -- -$$(cat $(SERVER_PID)) 2>/dev/null && echo "server stopped" || true; rm -f $(SERVER_PID); fi
	@if [ -f $(WEB_PID) ]; then kill -- -$$(cat $(WEB_PID)) 2>/dev/null && echo "web stopped" || true; rm -f $(WEB_PID); fi

logs:
	@tail -f $(SERVER_LOG) $(WEB_LOG)
