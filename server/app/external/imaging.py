"""2D 이미지화: 사진의 배경을 지워 투명 PNG로 만듭니다. (D-015, P-30)

내 PC 서버에서 Pillow로 처리합니다. 외부 서비스와 AI 모델은 쓰지 않습니다.
- 가장자리 픽셀로 배경색을 정하고, 가장자리에서부터 이어진 비슷한 색만 지웁니다 (Flood Fill).
  옷 안쪽에 배경과 같은 색이 있어도 가장자리와 이어지지 않았으면 남습니다.
- 재귀 대신 큐로 탐색해서 큰 사진에서도 호출이 너무 깊어지지 않습니다.
- 배경이 복잡하거나 거의 모두 지워지면 실패로 보지 않고, 배경을 지우지 않은 사진을 씁니다.
  사용자는 마음에 들지 않으면 사진을 다시 올립니다. (PRD §4 등록하기 3)
"""

import io
import re
from collections import deque
from pathlib import Path
from xml.etree import ElementTree

from PIL import Image, ImageChops, ImageOps

from . import ExternalError, should_fake_fail

SVG_NS = "http://www.w3.org/2000/svg"

# 긴 변이 이보다 크면 줄입니다. 마네킹에 얹는 그림이라 충분하고 처리도 빨라집니다. (제안)
MAX_SIDE = 1024
# 배경색과의 색 차이(R, G, B 차이 중 가장 큰 값, 0~255)가 이 안이면 배경으로 봅니다. (제안)
TOLERANCE = 40
# 가장자리 픽셀 중 배경색에 가까운 것이 이보다 적으면 배경이 복잡한 것으로 보고 지우지 않습니다. (제안)
MIN_PLAIN_BORDER = 0.5
# 지운 비율이 이보다 크면 옷까지 지워진 것으로 보고 지우지 않습니다. (제안)
MAX_REMOVED = 0.95


def make_2d_image(photo_path: Path, image_path: Path) -> None:
    """원래 사진으로 2D 이미지(투명 PNG)를 만들어 image_path에 저장합니다."""
    if should_fake_fail("imaging"):
        raise ExternalError("imaging_failed")
    try:
        with Image.open(photo_path) as photo:
            image = ImageOps.exif_transpose(photo).convert("RGBA")
        image.thumbnail((MAX_SIDE, MAX_SIDE))
        remove_background(image)
        image.save(image_path, "PNG")
    except (OSError, ValueError, Image.DecompressionBombError) as exc:
        raise ExternalError("imaging_failed", type(exc).__name__) from None


# 대표 색을 고르지 못했을 때 (사진이 없거나 모두 투명함). 마네킹 칸이 비어 보이지 않게 회색으로 칠합니다. (제안)
FALLBACK_COLOR = "#9E9E9A"


def main_color(image_path: Path | None, remove: bool = True) -> str:
    """2D 이미지의 불투명한 부분에서 가장 많은 색을 #RRGGBB로 돌려줍니다. (D-016)

    색을 8개로 줄인 뒤 세므로 무늬가 있어도 가장 넓은 색이 나옵니다.
    P-30 전에 만든 2D 이미지는 배경이 남아 있어서, 셀 때 메모리 안에서 배경을 한 번 더 지웁니다 (파일은 그대로).
    remove=False: 사용자가 고친 2D 이미지 (P-34). 복원한 가장자리를 다시 지우지 않습니다.
    """
    try:
        with Image.open(image_path) as source:
            image = ImageOps.exif_transpose(source).convert("RGBA")
    except (OSError, ValueError, TypeError, Image.DecompressionBombError):
        return FALLBACK_COLOR
    image.thumbnail((256, 256))
    if remove:
        remove_background(image)
    alpha = image.getchannel("A")
    reduced = image.convert("RGB").quantize(colors=8)
    counts = {}
    for index, a in zip(reduced.get_flattened_data(), alpha.get_flattened_data()):
        if a >= 128:
            counts[index] = counts.get(index, 0) + 1
    if not counts:
        return FALLBACK_COLOR
    palette = reduced.getpalette()
    best = max(counts, key=counts.get)
    r, g, b = palette[best * 3:best * 3 + 3]
    return f"#{r:02X}{g:02X}{b:02X}"


def remove_background(image: Image.Image, tolerance: int = TOLERANCE) -> float:
    """RGBA 이미지의 배경을 투명하게 바꿉니다. 지운 비율(0~1)을 돌려주고, 지우지 않았으면 0입니다."""
    width, height = image.size
    border = _border_indexes(width, height)
    pixels = image.load()
    colors = [pixels[i % width, i // width] for i in border]
    opaque = [c for c in colors if c[3] > 0]
    if not opaque:
        return 0.0  # 가장자리가 이미 모두 투명함
    background = tuple(sorted(c[k] for c in opaque)[len(opaque) // 2] for k in range(3))

    close = _close_mask(image, background, tolerance)
    seeds = [i for i in border if close[i]]
    if len(seeds) < len(border) * MIN_PLAIN_BORDER:
        return 0.0

    removed = _flood(close, seeds, width, height)
    count = sum(removed)
    if count > width * height * MAX_REMOVED:
        return 0.0

    # 지운 칸은 흰색 + 투명으로 둡니다. 투명을 무시하는 곳(AI에 보낼 때 등)에서도 흰 배경으로 보이게 합니다.
    alpha = Image.frombytes("L", (width, height), bytes(0 if r else 255 for r in removed))
    white = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    image.paste(white, (0, 0), ImageChops.invert(alpha))
    return count / (width * height)


def _border_indexes(width: int, height: int) -> list[int]:
    top = range(width)
    bottom = range((height - 1) * width, height * width)
    sides = [y * width + x for y in range(1, height - 1) for x in (0, width - 1)]
    return sorted(set([*top, *bottom, *sides]))


def _close_mask(image: Image.Image, background: tuple, tolerance: int) -> bytes:
    """칸마다 배경색에 가까우면 1. 이미 투명한 칸도 1. 계산은 Pillow(C)로 합니다."""
    r, g, b, a = image.split()
    diff = [ImageChops.difference(band, Image.new("L", image.size, value))
            for band, value in zip((r, g, b), background)]
    biggest = ImageChops.lighter(ImageChops.lighter(diff[0], diff[1]), diff[2])
    near = biggest.point(lambda v: 1 if v <= tolerance else 0)
    clear = a.point(lambda v: 1 if v == 0 else 0)
    return ImageChops.lighter(near, clear).tobytes()


def _flood(close: bytes, seeds: list[int], width: int, height: int) -> bytearray:
    """가장자리 씨앗에서 위아래 양옆으로 이어진 배경 칸만 찾습니다. 재귀 대신 큐를 씁니다."""
    removed = bytearray(width * height)
    queue = deque()
    for i in seeds:
        removed[i] = 1
        queue.append(i)
    last = width * height
    while queue:
        i = queue.popleft()
        x = i % width
        for j in (i - width, i + width, i - 1 if x > 0 else -1, i + 1 if x < width - 1 else -1):
            if 0 <= j < last and not removed[j] and close[j]:
                removed[j] = 1
                queue.append(j)
    return removed


# 무늬 그림 (D-016, D-020 제안, P-39). 무늬는 화면이 2D 이미지로 만들고(무늬 표현, 벡터 색상 수), 서버는 검사하고 저장만 합니다.
# P-32의 vtracer 무늬 만들기는 더 쓰지 않습니다. 그때 만든 옷의 무늬 파일은 그대로 둡니다.
MAX_PATTERN_BYTES = 400 * 1024
_PATTERN_ATTRS = {"d", "fill"}
# 화면이 만드는 path는 직사각형뿐이라 M, h, v, Z와 숫자만 씁니다.
_PATH_D = re.compile(r"^[0-9MhvZ.\s-]+$")
_FILL = re.compile(r"^#[0-9a-fA-F]{6}$")


def valid_pattern(svg: str) -> bool:
    """화면이 보낸 무늬 그림이 정해진 모양인지 봅니다 (P-39).

    맨 위가 크기(width, height)가 있는 svg이고, 그 안에 d와 fill만 가진 path가 1개 이상 있어야 합니다.
    d는 직선 명령과 숫자만, fill은 #RRGGBB만 받습니다. 사진(<image>), 글자, 스크립트, 바깥 주소는 들어갈 수 없습니다.
    """
    if not isinstance(svg, str) or len(svg.encode("utf-8")) > MAX_PATTERN_BYTES:
        return False
    # DOCTYPE, ENTITY 같은 선언은 받지 않습니다 (XML 확장 공격 막기).
    if "<!" in svg:
        return False
    if not _only_paths(svg):
        return False
    root = ElementTree.fromstring(svg)
    try:
        if not (float(root.get("width")) > 0 and float(root.get("height")) > 0):
            return False
    except ValueError:
        return False
    return all(_PATH_D.match(child.get("d", "")) and _FILL.match(child.get("fill", "")) for child in root)


def working_size(photo_path: Path) -> tuple[int, int]:
    """원래 사진을 2D 이미지 크기로 줄인 가로·세로. 고친 2D 이미지가 이 크기인지 봅니다. (P-34)"""
    with Image.open(photo_path) as photo:
        image = ImageOps.exif_transpose(photo)
        image.thumbnail((MAX_SIDE, MAX_SIDE))
        return image.size


def _only_paths(svg: str) -> bool:
    """맨 위가 svg이고 그 안에 정해진 속성만 가진 path가 1개 이상 있으면 True."""
    try:
        root = ElementTree.fromstring(svg)
    except ElementTree.ParseError:
        return False
    if root.tag != f"{{{SVG_NS}}}svg" or not root.get("width") or not root.get("height"):
        return False
    children = list(root)
    return bool(children) and all(
        child.tag == f"{{{SVG_NS}}}path" and set(child.attrib) <= _PATTERN_ATTRS and len(child) == 0
        for child in children
    )
