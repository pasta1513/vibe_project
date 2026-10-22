"""2D 이미지화. `server/.env`의 IMAGING_PROVIDER가 rembg이면 진짜, 없거나 fake면 가짜입니다. (D-007, D-017)

진짜: 내 PC에서 rembg의 isnet-general-use 모델로 배경을 지운 투명 PNG를 만들고, 정리 단계를 거칩니다. (P-30)
모델 파일은 `data/models/isnet-general-use.onnx`에 둡니다 (git에 올리지 않음).
"""

import os
import shutil
import threading
from pathlib import Path

from . import ExternalError, should_fake_fail

MODEL_NAME = "isnet-general-use"
MODEL_DIR = Path(__file__).resolve().parents[3] / "data" / "models"
# 정리 단계 (D-017): 투명도를 있음/없음으로 나누는 기준, 남길 조각의 최소 크기(가장 큰 조각 대비), 잘라낼 때 남길 여백
ALPHA_CUT = 128
MIN_PART_RATIO = 0.10
MARGIN_RATIO = 0.03

_session = None
_session_lock = threading.Lock()


def is_real() -> bool:
    return os.environ.get("IMAGING_PROVIDER", "fake").strip().lower() == "rembg"


def image_extension(original_ext: str) -> str:
    """2D 이미지 파일의 확장자. 진짜는 투명 PNG, 가짜는 원래 사진과 같음."""
    return "png" if is_real() else original_ext


def make_2d_image(photo_path: Path, image_path: Path) -> None:
    """원래 사진으로 2D 이미지를 만들어 image_path에 저장합니다.

    가짜: 올린 사진을 그대로 복사합니다. 배경은 지우지 않습니다.
    진짜: 배경을 지우고 정리한 투명 PNG를 저장합니다. 실패하면 ExternalError("imaging_failed").
    """
    if should_fake_fail("imaging"):
        raise ExternalError("imaging_failed")
    if not is_real():
        shutil.copyfile(photo_path, image_path)
        return
    try:
        from PIL import Image, ImageOps
        from rembg import remove

        with Image.open(photo_path) as photo:
            photo = ImageOps.exif_transpose(photo).convert("RGB")
            cut = remove(photo, session=_get_session())
        cleanup(cut).save(image_path, "PNG")
    except ExternalError:
        raise
    except Exception as exc:  # noqa: BLE001  사진이 깨졌거나 모델을 쓰지 못한 경우 모두 2D 이미지화 실패
        raise ExternalError("imaging_failed", f"2D 이미지화 실패 ({type(exc).__name__})") from None


def _get_session():
    """isnet 모델은 처음 쓸 때 한 번 올리고 계속 씁니다 (메모리 약 1.9GB, P-30 측정)."""
    global _session
    with _session_lock:
        if _session is None:
            model_file = MODEL_DIR / f"{MODEL_NAME}.onnx"
            if not model_file.exists():
                raise ExternalError("imaging_failed", "2D 이미지화 모델 파일이 없습니다.")
            os.environ.setdefault("U2NET_HOME", str(MODEL_DIR))
            from rembg import new_session
            _session = new_session(MODEL_NAME)
        return _session


def cleanup(image):
    """정리 단계 (D-017): 흐린 잔상을 없애고 옷만 남긴 뒤 옷 둘레로 잘라냅니다.

    1. 투명도를 있음/없음으로 나눔 (ALPHA_CUT)
    2. 가장 큰 조각의 10%보다 작은 떨어진 조각을 버림
    3. 남은 부분 둘레에 여백(긴 변의 3%)을 남기고 잘라냄
    """
    import numpy as np
    from PIL import Image
    from scipy import ndimage

    rgba = np.array(image.convert("RGBA"))
    mask = rgba[:, :, 3] >= ALPHA_CUT
    labels, count = ndimage.label(mask, structure=np.ones((3, 3)))
    if count > 1:
        areas = np.bincount(labels.ravel())
        areas[0] = 0
        keep = areas >= MIN_PART_RATIO * areas.max()
        keep[0] = False
        mask = keep[labels]
    if not mask.any():
        raise ExternalError("imaging_failed", "옷을 찾지 못했습니다.")
    rgba[:, :, 3] = np.where(mask, 255, 0).astype(np.uint8)
    ys, xs = np.nonzero(mask)
    margin = int(max(rgba.shape[:2]) * MARGIN_RATIO)
    top, bottom = max(ys.min() - margin, 0), min(ys.max() + margin + 1, rgba.shape[0])
    left, right = max(xs.min() - margin, 0), min(xs.max() + margin + 1, rgba.shape[1])
    return Image.fromarray(rgba[top:bottom, left:right])
