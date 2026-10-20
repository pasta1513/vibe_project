"""2D 이미지화. 진짜 도구를 정하기 전까지는 가짜입니다. (D-007)"""

import shutil
from pathlib import Path

from . import ExternalError, should_fake_fail


def make_2d_image(photo_path: Path, image_path: Path) -> None:
    """원래 사진으로 2D 이미지를 만들어 image_path에 저장합니다.

    가짜: 올린 사진을 그대로 복사합니다. 배경은 지우지 않습니다.
    """
    if should_fake_fail("imaging"):
        raise ExternalError("imaging_failed")
    shutil.copyfile(photo_path, image_path)
