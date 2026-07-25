# syntax=docker/dockerfile:1
# Builds transcribe.cpp as a shared library, then ships it with the Python app.
# The GGUF model is NOT baked in — it is bind-mounted at /models (see compose).

FROM python:3.12-slim-bookworm AS builder
ARG TRANSCRIBE_REF=main
RUN apt-get update && apt-get install -y --no-install-recommends \
      git cmake build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "${TRANSCRIBE_REF}" \
      https://github.com/handy-computer/transcribe.cpp /src/transcribe.cpp
WORKDIR /src/transcribe.cpp
RUN cmake -B build-shared -DTRANSCRIBE_BUILD_SHARED=ON -DCMAKE_BUILD_TYPE=Release \
 && cmake --build build-shared --target transcribe -j"$(nproc)"


FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /src/transcribe.cpp/build-shared/src/libtranscribe.so /usr/local/lib/
COPY --from=builder /src/transcribe.cpp/bindings/python /opt/transcribe-python
RUN ldconfig
ENV TRANSCRIBE_LIBRARY=/usr/local/lib/libtranscribe.so

COPY --from=ghcr.io/astral-sh/uv:0.11.12 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project \
 && uv pip install /opt/transcribe-python
ENV PATH="/app/.venv/bin:$PATH"

COPY notanda_server ./notanda_server
COPY deploy ./deploy

ENV NOTANDA_DATA_DIR=/data \
    NOTANDA_MODEL_PATH=/models/model.gguf \
    PYTHONUNBUFFERED=1
CMD ["uvicorn", "notanda_server.api:app", "--host", "0.0.0.0", "--port", "8000"]
