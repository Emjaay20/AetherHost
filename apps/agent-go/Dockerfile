FROM golang:alpine AS builder
WORKDIR /app
COPY apps/agent-go/go.mod apps/agent-go/go.sum ./
RUN go mod download
COPY apps/agent-go/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -a -ldflags '-extldflags "-static"' -o agent .

FROM alpine:3.21
RUN apk add --no-cache docker-cli docker-cli-compose git && \
    (getent group docker >/dev/null || addgroup -S docker) && \
    adduser -S -D -H -G docker aether && \
    mkdir -p /app/deployments && \
    chown -R aether /app
WORKDIR /app
COPY --from=builder --chown=aether /app/agent /usr/local/bin/agent
COPY --chown=aether apps/runtimes /app/runtimes

USER aether
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pgrep agent || exit 1
ENTRYPOINT ["/usr/local/bin/agent"]
