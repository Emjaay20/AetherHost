FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY apps/agent-go/go.mod apps/agent-go/go.sum ./
RUN go mod download
COPY apps/agent-go/ ./
RUN go build -o agent main.go

FROM alpine:3.20
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /app
COPY --from=builder /app/agent /app/agent
COPY apps/runtimes /app/runtimes
ENTRYPOINT ["/app/agent"]
