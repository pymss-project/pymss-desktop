from __future__ import annotations

import argparse
import importlib.util
import json
import platform
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKER_VERSION = "0.1.0"

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# 开发期优先使用相邻 pymss 源码：E:/123/pymss-desktop/python/worker.py -> E:/123/pymss
DEV_PYMSS = Path(__file__).resolve().parents[2] / "pymss"
if DEV_PYMSS.exists():
    sys.path.insert(0, str(DEV_PYMSS))


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


def emit(event_type: str, payload: dict[str, Any] | None = None, *, request_id: str | None = None, task_id: str | None = None) -> None:
    print(json.dumps({
        "type": event_type,
        "requestId": request_id,
        "taskId": task_id,
        "timestamp": now_iso(),
        "payload": payload or {},
    }, ensure_ascii=False), flush=True)


def emit_error(code: str, message: str, detail: str | None = None) -> int:
    emit("error", {
        "code": code,
        "message": message,
        "detail": detail,
        "recoverable": True,
    })
    return 1


def import_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def load_payload(payload_arg: str | None) -> dict[str, Any]:
    if not payload_arg:
        return {}
    path = Path(payload_arg)
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return json.loads(payload_arg)


def model_to_dict(entry: Any, model_dir: str | None = None, include_local_state: bool = True) -> dict[str, Any]:
    from pymss.model_registry import auxiliary_paths_for, config_path_for, model_path_for  # type: ignore

    model_path = model_path_for(entry, model_dir)
    config_path = config_path_for(entry, model_dir)
    auxiliary_paths = auxiliary_paths_for(entry, model_dir)
    required_paths = [model_path]
    if config_path is not None:
        required_paths.append(config_path)
    required_paths.extend(auxiliary_paths)
    missing_paths = [str(path) for path in required_paths if not path.is_file()]
    downloaded = include_local_state and not missing_paths

    return {
        "name": entry.name,
        "aliases": list(entry.aliases),
        "modelType": entry.model_type,
        "architecture": entry.architecture,
        "supported": bool(entry.supported),
        "unsupportedReason": entry.unsupported_reason,
        "category": entry.category_path or entry.primary_category,
        "categoryCn": " / ".join(filter(None, [entry.primary_category_cn, entry.secondary_category_cn])),
        "primaryCategory": entry.primary_category,
        "primaryCategoryCn": entry.primary_category_cn,
        "secondaryCategory": entry.secondary_category,
        "secondaryCategoryCn": entry.secondary_category_cn,
        "targetStem": entry.target_stem,
        "configInstruments": entry.config_instruments,
        "configTargetInstrument": entry.config_target_instrument,
        "classificationConfidence": entry.classification_confidence,
        "classificationBasis": entry.classification_basis,
        "sizeBytes": entry.size_bytes,
        "sha256": entry.sha256,
        "downloaded": downloaded,
        "missingPaths": missing_paths if include_local_state else [],
        "modelPath": str(model_path),
        "configPath": str(config_path) if config_path else None,
        "auxiliaryPaths": [str(path) for path in auxiliary_paths],
    }


def cmd_health() -> int:
    emit("health", {"ok": True, "workerVersion": WORKER_VERSION})
    return 0


def cmd_env_info() -> int:
    payload: dict[str, Any] = {
        "pythonVersion": sys.version.split()[0],
        "platform": platform.platform(),
        "workerVersion": WORKER_VERSION,
        "pymssAvailable": False,
        "pymssPath": None,
        "torchAvailable": False,
        "torchVersion": None,
        "cudaAvailable": False,
        "cudaDeviceCount": 0,
        "mpsAvailable": False,
        "mlxAvailable": import_available("mlx"),
        "avAvailable": import_available("av"),
    }

    try:
        import pymss  # type: ignore
        payload["pymssAvailable"] = True
        payload["pymssPath"] = str(Path(pymss.__file__).resolve()) if getattr(pymss, "__file__", None) else None
    except Exception as exc:
        payload["pymssError"] = str(exc)

    try:
        import torch  # type: ignore
        payload["torchAvailable"] = True
        payload["torchVersion"] = getattr(torch, "__version__", None)
        payload["cudaAvailable"] = bool(torch.cuda.is_available())
        payload["cudaDeviceCount"] = int(torch.cuda.device_count()) if torch.cuda.is_available() else 0
        mps = getattr(torch.backends, "mps", None)
        payload["mpsAvailable"] = bool(mps and mps.is_available())
    except Exception as exc:
        payload["torchError"] = str(exc)

    emit("env_info", payload)
    return 0


def cmd_list_models(payload: dict[str, Any]) -> int:
    try:
        from pymss.model_registry import list_models, model_root  # type: ignore
    except Exception as exc:
        return emit_error("PYMSS_IMPORT_FAILED", str(exc), traceback.format_exc())

    category = payload.get("category") or None
    supported_only = bool(payload.get("supportedOnly", True))
    include_local_state = bool(payload.get("includeLocalState", True))
    model_dir = payload.get("modelDir") or None

    entries = list_models(category=category, supported=True if supported_only else None)
    models = [model_to_dict(entry, model_dir, include_local_state) for entry in entries]
    categories = sorted({m["category"] for m in models if m.get("category")})
    categories_cn = sorted({m["categoryCn"] for m in models if m.get("categoryCn")})
    emit("models", {
        "models": models,
        "categories": categories,
        "categoriesCn": categories_cn,
        "count": len(models),
        "modelDir": str(model_root(model_dir)),
    })
    return 0


def cmd_model_info(payload: dict[str, Any]) -> int:
    model_name = payload.get("model")
    if not model_name:
        return emit_error("MODEL_NOT_FOUND", "Missing model name")
    try:
        from pymss.model_registry import get_model_entry  # type: ignore
        entry = get_model_entry(model_name)
    except KeyError as exc:
        return emit_error("MODEL_NOT_FOUND", str(exc))
    except Exception as exc:
        return emit_error("PYMSS_IMPORT_FAILED", str(exc), traceback.format_exc())

    model_dir = payload.get("modelDir") or None
    emit("model_info", model_to_dict(entry, model_dir, include_local_state=True))
    return 0


def cmd_delete_model(payload: dict[str, Any]) -> int:
    model_name = payload.get("model")
    if not model_name:
        return emit_error("MODEL_NOT_FOUND", "Missing model name")

    model_dir = payload.get("modelDir") or None

    try:
        from pymss.model_registry import (  # type: ignore
            auxiliary_paths_for,
            config_path_for,
            get_model_entry,
            model_path_for,
        )
    except Exception as exc:
        return emit_error("PYMSS_IMPORT_FAILED", str(exc), traceback.format_exc())

    try:
        entry = get_model_entry(model_name)
    except KeyError as exc:
        return emit_error("MODEL_NOT_FOUND", str(exc))

    model_path = model_path_for(entry, model_dir)
    config_path = config_path_for(entry, model_dir)
    auxiliary_paths = auxiliary_paths_for(entry, model_dir)

    deleted: list[str] = []
    errors: list[str] = []

    all_paths = [model_path]
    if config_path is not None:
        all_paths.append(config_path)
    all_paths.extend(auxiliary_paths)

    for path in all_paths:
        if path.is_file():
            try:
                path.unlink()
                deleted.append(str(path))
            except Exception as exc:
                errors.append(f"{path}: {exc}")

    emit("model_deleted", {
        "model": entry.name,
        "deleted": deleted,
        "errors": errors,
        "modelInfo": model_to_dict(entry, model_dir, include_local_state=True),
    })
    return 0


def cmd_download_model(payload: dict[str, Any]) -> int:
    model_name = payload.get("model")
    if not model_name:
        return emit_error("MODEL_NOT_FOUND", "Missing model name")

    task_id = payload.get("taskId") or f"download_{model_name}"
    model_dir = payload.get("modelDir") or None
    source = payload.get("source") or "modelscope"
    endpoint = payload.get("endpoint") or None
    force = bool(payload.get("force", False))

    try:
        from pymss.model_download import download_model  # type: ignore
        from pymss.model_registry import get_model_entry  # type: ignore
    except Exception as exc:
        return emit_error("PYMSS_IMPORT_FAILED", str(exc), traceback.format_exc())

    try:
        entry = get_model_entry(model_name)
        local_state = model_to_dict(entry, model_dir, include_local_state=True)
        missing_before = local_state.get("missingPaths", [])
        total_files = max(1, len(missing_before))
        emit("download_started", {
            "model": entry.name,
            "source": source,
            "force": force,
            "totalFiles": total_files,
            "completedFiles": 0,
            "progress": 0,
        }, task_id=task_id)
        emit("download_stage", {"stage": "resolving_files", "progress": 5}, task_id=task_id)
        result = download_model(
            entry.name,
            model_dir=model_dir,
            source=source,
            endpoint=endpoint,
            force=force,
        )
        files = [(file_path, "skipped") for file_path in result.get("skipped", [])]
        files.extend((file_path, "downloaded") for file_path in result.get("downloaded", []))
        total_files = max(total_files, len(files) or 1)
        for index, (file_path, status) in enumerate(files, start=1):
            progress = min(95, max(8, int(index / total_files * 90)))
            emit("download_file", {
                "status": status,
                "path": file_path,
                "completedFiles": index,
                "totalFiles": total_files,
                "progress": progress,
            }, task_id=task_id)
        emit("download_done", {
            "model": entry.name,
            "downloaded": result.get("downloaded", []),
            "skipped": result.get("skipped", []),
            "modelDir": result.get("model_dir"),
            "modelInfo": model_to_dict(entry, model_dir, include_local_state=True),
            "progress": 100,
        }, task_id=task_id)
        return 0
    except KeyError as exc:
        return emit_error("MODEL_NOT_FOUND", str(exc))
    except Exception as exc:
        return emit_error("MODEL_DOWNLOAD_FAILED", str(exc), traceback.format_exc())


class JsonLogHandler:
    def __init__(self, task_id: str):
        import logging
        self.task_id = task_id
        self.level = logging.INFO

    def setLevel(self, level: int) -> None:
        self.level = level

    def handle(self, record: Any) -> bool:
        if record.levelno < self.level:
            return False
        emit("task_log", {"level": record.levelname.lower(), "message": record.getMessage()}, task_id=self.task_id)
        return True


def collect_outputs(output_dir: str, success_files: list[str], output_format: str) -> list[dict[str, str]]:
    base = Path(output_dir)
    outputs: list[dict[str, str]] = []
    if not base.exists():
        return outputs
    success_stems = {Path(name).stem for name in success_files}
    for path in base.rglob(f"*.{output_format.lower()}"):
        if success_stems and not any(path.stem.startswith(stem + "_") or path.stem == stem for stem in success_stems):
            continue
        stem = path.stem.split("_")[-1] if "_" in path.stem else path.stem
        outputs.append({"stem": stem, "path": str(path)})
    return outputs


def cmd_infer(payload: dict[str, Any]) -> int:
    task_id = payload.get("taskId") or f"sep_{int(datetime.now().timestamp())}"
    model_name = payload.get("model")
    input_path = payload.get("input")
    output_dir = payload.get("output") or "results"
    if not model_name:
        return emit_error("MODEL_NOT_FOUND", "Missing model name")
    if not input_path:
        return emit_error("INPUT_NOT_FOUND", "Missing input path")
    if not Path(input_path).exists():
        return emit_error("INPUT_NOT_FOUND", f"Input path does not exist: {input_path}")

    model_dir = payload.get("modelDir") or None
    download = bool(payload.get("download", True))
    source = payload.get("source") or "modelscope"
    endpoint = payload.get("endpoint") or None
    device = payload.get("device") or "auto"
    device_ids = payload.get("deviceIds") or [0]
    output_format = payload.get("outputFormat") or "wav"
    use_tta = bool(payload.get("useTta", False))
    debug = bool(payload.get("debug", False))
    inference_params = payload.get("inferenceParams") or {}
    audio_params = payload.get("audioParams") or {
        "wav_bit_depth": "FLOAT",
        "flac_bit_depth": "PCM_24",
        "mp3_bit_rate": "320k",
        "m4a_bit_rate": "192k",
        "m4a_aac_at_quality": 2,
    }

    try:
        emit("task_started", {"model": model_name, "input": input_path, "output": output_dir}, task_id=task_id)
        emit("task_stage", {"stage": "validating_input", "message": "Validating input"}, task_id=task_id)
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        if download:
            emit("task_stage", {"stage": "downloading_model", "message": "Checking model files"}, task_id=task_id)
        else:
            emit("task_stage", {"stage": "ensuring_model", "message": "Checking model files"}, task_id=task_id)

        from pymss import MSSeparator  # type: ignore
        emit("task_stage", {"stage": "loading_model", "message": "Loading model"}, task_id=task_id)
        logger = None
        try:
            from pymss import get_separation_logger  # type: ignore
            logger = get_separation_logger()
            logger.addHandler(JsonLogHandler(task_id))
        except Exception:
            logger = None

        separator = MSSeparator.from_model_name(
            model_name,
            model_dir=model_dir,
            download=download,
            source=source,
            endpoint=endpoint,
            device=device,
            device_ids=device_ids,
            output_format=output_format,
            use_tta=use_tta,
            store_dirs=output_dir,
            audio_params=audio_params,
            logger=logger,
            debug=debug,
            inference_params=inference_params,
        )
        emit("task_stage", {"stage": "separating", "message": "Separating audio"}, task_id=task_id)
        success_files = separator.process_folder(input_path)
        emit("task_stage", {"stage": "writing_output", "message": "Collecting outputs"}, task_id=task_id)
        separator.del_cache()
        outputs = collect_outputs(output_dir, success_files, output_format)
        emit("task_done", {"files": success_files, "outputs": outputs, "outputDir": str(Path(output_dir).resolve())}, task_id=task_id)
        return 0
    except Exception as exc:
        return emit_error("INFERENCE_FAILED", str(exc), traceback.format_exc())


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="pymss-studio-worker")
    parser.add_argument("command", nargs="?", default="health")
    parser.add_argument("--payload", help="JSON string or path to a JSON payload file")
    return parser.parse_args(argv[1:])


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        payload = load_payload(args.payload)
        if args.command == "health":
            return cmd_health()
        if args.command == "env_info":
            return cmd_env_info()
        if args.command == "list_models":
            return cmd_list_models(payload)
        if args.command == "model_info":
            return cmd_model_info(payload)
        if args.command == "delete_model":
            return cmd_delete_model(payload)
        if args.command == "download_model":
            return cmd_download_model(payload)
        if args.command == "infer":
            return cmd_infer(payload)
        return emit_error("UNKNOWN_COMMAND", f"Unknown command: {args.command}")
    except Exception as exc:
        return emit_error("UNKNOWN_ERROR", str(exc), traceback.format_exc())


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
