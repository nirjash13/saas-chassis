FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy source and resolve dependencies (go mod tidy generates go.sum)
COPY . .
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -o /audit-service ./cmd/server

FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata

COPY --from=builder /audit-service /audit-service

EXPOSE 3005
ENTRYPOINT ["/audit-service"]
