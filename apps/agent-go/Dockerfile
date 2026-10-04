FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY apps/agent-go/go.mod apps/agent-go/go.sum ./
RUN go mod download
COPY apps/agent-go/ ./
RUN go build -o agent main.go

FROM docker:dind
WORKDIR /app
COPY --from=builder /app/agent /app/agent
# Copy runtimes into the agent image
COPY apps/runtimes /app/runtimes
ENTRYPOINT ["/app/agent"]
