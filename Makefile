.PHONY: up down server web logs

PID_DIR := .pids
LOG_DIR := .logs
SERVER_PID := $(PID_DIR)/server.pid
WEB_PID    := $(PID_DIR)/web.pid
SERVER_LOG := $(LOG_DIR)/server.log
WEB_LOG    := $(LOG_DIR)/web.log

$(PID_DIR) $(LOG_DIR):
	mkdir -p $@

up: $(PID_DIR) $(LOG_DIR) server web
	@echo "Server log: $(SERVER_LOG)  Web log: $(WEB_LOG)"
	@echo "Run 'make logs' to tail both"

server: $(PID_DIR) $(LOG_DIR)
	@if [ -f $(SERVER_PID) ] && kill -0 $$(cat $(SERVER_PID)) 2>/dev/null; then \
		echo "server already running (pid $$(cat $(SERVER_PID)))"; \
	else \
		cd server && uv run python src/server.py -v > ../$(SERVER_LOG) 2>&1 & echo $$! > ../$(SERVER_PID); \
		echo "server started (pid $$(cat ../$(SERVER_PID)))"; \
	fi

web: $(PID_DIR) $(LOG_DIR)
	@if [ -f $(WEB_PID) ] && kill -0 $$(cat $(WEB_PID)) 2>/dev/null; then \
		echo "web already running (pid $$(cat $(WEB_PID)))"; \
	else \
		cd web && vp dev > ../$(WEB_LOG) 2>&1 & echo $$! > ../$(WEB_PID); \
		echo "web started (pid $$(cat ../$(WEB_PID)))"; \
	fi

down:
	@if [ -f $(SERVER_PID) ]; then kill $$(cat $(SERVER_PID)) 2>/dev/null && echo "server stopped" || true; rm -f $(SERVER_PID); fi
	@if [ -f $(WEB_PID) ]; then kill $$(cat $(WEB_PID)) 2>/dev/null && echo "web stopped" || true; rm -f $(WEB_PID); fi

logs:
	@tail -f $(SERVER_LOG) $(WEB_LOG)
