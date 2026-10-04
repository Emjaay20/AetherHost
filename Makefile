.PHONY: up down test build clean

up:
	docker compose up -d --build

down:
	docker compose down

test:
	pnpm -r test
	cd apps/agent-go && go test -v

build:
	pnpm -r build
	cd apps/agent-go && go build -o agent main.go

clean:
	pnpm -r clean
	rm -rf apps/agent-go/agent
	docker compose down -v
