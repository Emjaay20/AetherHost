FROM alpine:3.20 AS builder
RUN apk add --no-cache go
WORKDIR /app
COPY apps/agent-go/go.mod apps/agent-go/go.sum ./
RUN go mod download
COPY apps/agent-go/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -a -ldflags '-extldflags "-static"' -o agent .

FROM alpine:3.20
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /app
COPY --from=builder /app/agent /app/agent
COPY apps/runtimes /app/runtimes
ENTRYPOINT ["/app/agent"]
