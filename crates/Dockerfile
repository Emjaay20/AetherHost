# Multi-stage production build for AetherHost Rust Platform Binaries
# Builds: aether-router, aether-logd, aether-cli

FROM rust:1.82-bookworm AS builder
WORKDIR /usr/src/aetherhost

# Pre-copy manifests for dependency layer caching
COPY crates/Cargo.toml crates/Cargo.lock ./crates/
COPY crates/aether-core/Cargo.toml ./crates/aether-core/
COPY crates/aether-authz/Cargo.toml ./crates/aether-authz/
COPY crates/aether-telemetry/Cargo.toml ./crates/aether-telemetry/
COPY crates/aether-router/Cargo.toml ./crates/aether-router/
COPY crates/aether-logd/Cargo.toml ./crates/aether-logd/
COPY crates/aether-cli/Cargo.toml ./crates/aether-cli/

# Copy full crate sources
COPY crates ./crates

# Compile release binaries for the workspace
WORKDIR /usr/src/aetherhost/crates
RUN cargo build --release --bins

# Runtime image: minimal Debian bookworm-slim with non-root security profile
FROM debian:bookworm-slim AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -g 10001 aether && \
    useradd -u 10001 -g aether -s /bin/false -m aether

# Copy compiled binaries from builder stage
COPY --from=builder /usr/src/aetherhost/crates/target/release/aether-router /usr/local/bin/aether-router
COPY --from=builder /usr/src/aetherhost/crates/target/release/aether-logd /usr/local/bin/aether-logd
COPY --from=builder /usr/src/aetherhost/crates/target/release/aether /usr/local/bin/aether

USER 10001:10001
WORKDIR /home/aether

EXPOSE 8080 4001

CMD ["/usr/local/bin/aether-router"]
