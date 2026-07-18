# ════════════════════════════════════════════════════════════════════════════
# JORINOVA NEXUS ALIS-X — Production Dockerfile
# ════════════════════════════════════════════════════════════════════════════
# Multi-stage: builder → runtime (smaller final image, no dev tools)
# ════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build dependencies ──────────────────────────────────────────────
FROM python:3.12-slim AS builder


WORKDIR /build

# System build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies into a virtual environment.
# INSTALL_ML=1 additionally installs requirements-ml.txt (CPU torch + ultralytics)
# so the local YOLOv8 detectors load. OFF by default — torch needs ~1 GB RAM and
# would OOM Render's free 512 MB tier; enable only on a Standard (2 GB+) instance.
# Render injects the INSTALL_ML service env var here because this ARG matches it.
ARG INSTALL_ML=0
COPY requirements.txt requirements-prod.txt* requirements-ml.txt* ./
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip wheel && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt && \
    if [ -f requirements-prod.txt ]; then \
        /opt/venv/bin/pip install --no-cache-dir -r requirements-prod.txt; \
    fi && \
    if [ "$INSTALL_ML" = "1" ] && [ -f requirements-ml.txt ]; then \
        /opt/venv/bin/pip install --no-cache-dir -r requirements-ml.txt; \
    fi


# ── Stage 2: Runtime image ───────────────────────────────────────────────────
FROM python:3.12-slim AS runtime


WORKDIR /app

# Runtime system dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    ca-certificates \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean
# libgl1 + libglib2.0-0: shared libs OpenCV imports (pulled in by ultralytics when
# INSTALL_ML=1). Harmless/idle when the local detector is not enabled.

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH="/app"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Copy application source
COPY . .

# Create required directories
RUN mkdir -p /app/media/staff_photos \
             /app/media/vision \
             /app/logs \
             /app/data

# Create non-root user for security
RUN groupadd -r alisapp && \
    useradd -r -g alisapp -s /bin/false alisapp && \
    chown -R alisapp:alisapp /app

USER alisapp

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -sf http://localhost:8000/api/v1/health || exit 1

# Default: production gunicorn.
# Shell form so ${PORT} expands: Cloud Run / Render inject PORT (usually 8080);
# locally it falls back to 8000 so docker-compose keeps working unchanged.
# Logs go to stdout/stderr (-) so Cloud Run / Render capture them. Workers are
# tunable via WEB_CONCURRENCY (set it to 1 on a small Cloud Run instance so
# torch + the vision models don't OOM).
CMD gunicorn main:app --workers ${WEB_CONCURRENCY:-4} --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT:-8000} --timeout 120 --keep-alive 5 --access-logfile - --error-logfile - --log-level warning --forwarded-allow-ips=*
