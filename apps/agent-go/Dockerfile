FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o agent main.go

FROM docker:dind
WORKDIR /app
COPY --from=builder /app/agent /app/agent
ENTRYPOINT ["/app/agent"]
