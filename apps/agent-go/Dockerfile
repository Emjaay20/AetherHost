FROM golang:alpine AS builder
WORKDIR /app
COPY apps/agent-go/go.mod apps/agent-go/go.sum ./
RUN go mod download
COPY apps/agent-go/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -a -ldflags '-extldflags "-static"' -o agent .

FROM alpine:3.21
RUN apk add --no-cache docker-cli docker-cli-compose git
WORKDIR /app
COPY --from=builder /app/agent /usr/local/bin/agent
COPY apps/runtimes /app/runtimes
ENTRYPOINT ["/usr/local/bin/agent"]
