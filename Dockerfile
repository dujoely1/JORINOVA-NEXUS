# ════════════════════════════════════════════════════════════════════════════
# JORINOVA NEXUS ALIS-X — ROOT Dockerfile (for Google Cloud Run "Deploy from
# repository" via the CONSOLE, which builds with the REPOSITORY ROOT as context).
#
# The real backend Dockerfile lives in backend/ and expects backend/ as its build
# context; the console cannot set that, so its COPY of requirements.txt fails.
# This root image reproduces the same build but with backend/ prefixes, so the
# console flow works with NO CLI:
#   Build type: Dockerfile   ·   Dockerfile: /Dockerfile   ·   Branch: ^main$
#
# ML is ON by default here (INSTALL_ML=1) so the YOLOv8 vision models load — give
# the Cloud Run service at least 2 GiB memory and WEB_CONCURRENCY=1. Set the build
# arg INSTALL_ML=0 to build a lighter API-only image (vision falls back to the
# cloud/offline path).
# ════════════════════════════════════════════════════════════════════════════

# ── Stage 1: build dependencies ──────────────────────────────────────────────
FROM python:3.12-slim AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl && rm -rf /var/lib/apt/lists/*

ARG INSTALL_ML=1
COPY backend/requirements.txt backend/requirements-prod.txt* backend/requirements-ml.txt* ./
RUN python -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip wheel && \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt && \
    if [ -f requirements-prod.txt ]; then /opt/venv/bin/pip install --no-cache-dir -r requirements-prod.txt; fi && \
    if [ "$INSTALL_ML" = "1" ] && [ -f requirements-ml.txt ]; then /opt/venv/bin/pip install --no-cache-dir -r requirements-ml.txt; fi

# ── Stage 2: runtime image ───────────────────────────────────────────────────
FROM python:3.12-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 curl ca-certificates poppler-utils libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* && apt-get clean

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH="/app"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Application source (backend/ only) — includes backend/models/*.pt vision weights
COPY backend/ .

RUN mkdir -p /app/media/staff_photos /app/media/vision /app/logs /app/data && \
    groupadd -r alisapp && useradd -r -g alisapp -s /bin/false alisapp && \
    chown -R alisapp:alisapp /app
USER alisapp

EXPOSE 8080
# Shell form so ${PORT} expands (Cloud Run injects PORT=8080; local falls back to 8000).
CMD gunicorn main:app --workers ${WEB_CONCURRENCY:-2} --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT:-8000} --timeout 120 --keep-alive 5 --access-logfile - --error-logfile - --log-level warning --forwarded-allow-ips=*
