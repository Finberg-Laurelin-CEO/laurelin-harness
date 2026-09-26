"""Local embedding adapters for generated Polygres pipelines."""

from __future__ import annotations

import json
import math
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol


class LocalEmbeddingError(RuntimeError):
    pass


@dataclass(frozen=True)
class EmbeddingConfig:
    provider: str
    model: str
    revision: str
    dimensions: int
    normalization: str
    document_prefix: str = ""
    query_prefix: str = ""
    endpoint: str | None = None
    device: str | None = None


class EmbeddingProvider(Protocol):
    def embed_documents(self, values: list[str]) -> list[list[float]]: ...

    def embed_query(self, value: str) -> list[float]: ...


def _is_loopback(value: str) -> bool:
    parsed = urllib.parse.urlparse(value)
    return parsed.scheme in {"http", "https"} and parsed.hostname in {
        "localhost",
        "127.0.0.1",
        "::1",
    }


def _normalize(vector: list[float], mode: str) -> list[float]:
    if mode == "none":
        return vector
    if mode == "l2":
        divisor = math.sqrt(sum(value * value for value in vector))
    elif mode == "l1":
        divisor = sum(abs(value) for value in vector)
    else:
        raise LocalEmbeddingError(f"unsupported normalization: {mode}")
    if divisor == 0:
        raise LocalEmbeddingError("embedding vector has zero norm")
    return [value / divisor for value in vector]


def _validate_vectors(
    values: Any,
    *,
    expected_count: int,
    config: EmbeddingConfig,
) -> list[list[float]]:
    if not isinstance(values, list) or len(values) != expected_count:
        raise LocalEmbeddingError("embedding response count does not match input count")
    output: list[list[float]] = []
    for index, raw_vector in enumerate(values):
        if not isinstance(raw_vector, list) or len(raw_vector) != config.dimensions:
            raise LocalEmbeddingError(
                f"embedding {index} has the wrong dimensions; expected {config.dimensions}"
            )
        vector: list[float] = []
        for raw_value in raw_vector:
            if isinstance(raw_value, bool) or not isinstance(raw_value, (int, float)):
                raise LocalEmbeddingError(f"embedding {index} contains a non-numeric value")
            value = float(raw_value)
            if not math.isfinite(value):
                raise LocalEmbeddingError(f"embedding {index} contains a non-finite value")
            vector.append(value)
        output.append(_normalize(vector, config.normalization))
    return output


class LocalHttpEmbeddingProvider:
    def __init__(self, config: EmbeddingConfig) -> None:
        if config.endpoint is None or not _is_loopback(config.endpoint):
            raise LocalEmbeddingError("local HTTP endpoint must use a loopback host")
        self.config = config

    def _request(self, values: list[str]) -> list[list[float]]:
        if self.config.provider == "ollama":
            path = "/api/embed"
            payload = {"model": self.config.model, "input": values}
        else:
            path = "/v1/embeddings"
            payload = {"model": self.config.model, "input": values}
        request = urllib.request.Request(
            f"{self.config.endpoint.rstrip('/')}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = json.load(response)
        except (OSError, urllib.error.URLError, json.JSONDecodeError, TimeoutError) as error:
            raise LocalEmbeddingError(f"local embedding request failed: {error}") from error
        if self.config.provider == "ollama":
            raw_vectors = body.get("embeddings") if isinstance(body, dict) else None
        else:
            data = body.get("data") if isinstance(body, dict) else None
            raw_vectors = (
                [item.get("embedding") for item in data]
                if isinstance(data, list) and all(isinstance(item, dict) for item in data)
                else None
            )
        return _validate_vectors(
            raw_vectors,
            expected_count=len(values),
            config=self.config,
        )

    def embed_documents(self, values: list[str]) -> list[list[float]]:
        return self._request([f"{self.config.document_prefix}{value}" for value in values])

    def embed_query(self, value: str) -> list[float]:
        return self._request([f"{self.config.query_prefix}{value}"])[0]


class SentenceTransformerEmbeddingProvider:
    def __init__(self, config: EmbeddingConfig) -> None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as error:
            raise LocalEmbeddingError("sentence-transformers is not installed") from error
        self.config = config
        self.model = SentenceTransformer(
            config.model,
            revision=config.revision,
            device=config.device,
            local_files_only=True,
        )

    def _encode(self, values: list[str]) -> list[list[float]]:
        encoded = self.model.encode(values, convert_to_numpy=True, normalize_embeddings=False)
        raw_vectors = encoded.tolist()
        return _validate_vectors(
            raw_vectors,
            expected_count=len(values),
            config=self.config,
        )

    def embed_documents(self, values: list[str]) -> list[list[float]]:
        return self._encode([f"{self.config.document_prefix}{value}" for value in values])

    def embed_query(self, value: str) -> list[float]:
        return self._encode([f"{self.config.query_prefix}{value}"])[0]


def create_provider(config: EmbeddingConfig) -> EmbeddingProvider:
    if config.provider in {"ollama", "llama.cpp", "local-http"}:
        return LocalHttpEmbeddingProvider(config)
    if config.provider == "sentence-transformers":
        return SentenceTransformerEmbeddingProvider(config)
    if config.provider == "onnx":
        raise LocalEmbeddingError(
            "ONNX requires the approved model-specific tokenizer and pooling adapter"
        )
    raise LocalEmbeddingError(f"unsupported local embedding provider: {config.provider}")
