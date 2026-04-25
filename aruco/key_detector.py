import argparse
from dataclasses import dataclass

import cv2
import numpy as np


WHITE_NOTE_PATTERN = ["C", "D", "E", "F", "G", "A", "B"]
BLACK_AFTER_WHITE = {
    "C": "C#",
    "D": "D#",
    "F": "F#",
    "G": "G#",
    "A": "A#",
}


@dataclass
class KeyboardDetection:
    quad: np.ndarray
    warped: np.ndarray
    transform: np.ndarray
    inverse_transform: np.ndarray
    white_key_bounds: list[int]
    black_key_boxes: list[tuple[int, int, int, int]]


def order_points(points: np.ndarray) -> np.ndarray:
    points = points.astype("float32")
    ordered = np.zeros((4, 2), dtype="float32")

    sums = points.sum(axis=1)
    diffs = np.diff(points, axis=1).reshape(-1)
    ordered[0] = points[np.argmin(sums)]   # top-left
    ordered[2] = points[np.argmax(sums)]   # bottom-right
    ordered[1] = points[np.argmin(diffs)]  # top-right
    ordered[3] = points[np.argmax(diffs)]  # bottom-left
    return ordered


def extend_quad_bottom(frame: np.ndarray, quad: np.ndarray, amount: float = 0.55) -> np.ndarray:
    extended = quad.copy().astype("float32")
    height, width = frame.shape[:2]

    extended[3] = extended[3] + (extended[3] - extended[0]) * amount
    extended[2] = extended[2] + (extended[2] - extended[1]) * amount
    extended[:, 0] = np.clip(extended[:, 0], 0, width - 1)
    extended[:, 1] = np.clip(extended[:, 1], 0, height - 1)
    return order_points(extended)


def build_note_labels(count: int, first_white_note: str, first_octave: int) -> list[str]:
    first_white_note = first_white_note.upper()
    if first_white_note not in WHITE_NOTE_PATTERN:
        first_white_note = "C"

    note_idx = WHITE_NOTE_PATTERN.index(first_white_note)
    octave = first_octave
    labels = []

    for _ in range(count):
        note = WHITE_NOTE_PATTERN[note_idx]
        labels.append(f"{note}{octave}")
        note_idx = (note_idx + 1) % len(WHITE_NOTE_PATTERN)
        if note == "B":
            octave += 1

    return labels


def estimate_black_keys(
    white_key_bounds: list[int],
    height: int,
    first_white_note: str,
    first_octave: int,
) -> list[tuple[tuple[int, int, int, int], str]]:
    white_labels = build_note_labels(
        max(0, len(white_key_bounds) - 1),
        first_white_note,
        first_octave,
    )
    black_keys = []

    for idx, label in enumerate(white_labels[:-1]):
        note = label[:-1]
        octave = label[-1]
        black_note = BLACK_AFTER_WHITE.get(note)
        if not black_note:
            continue

        left = white_key_bounds[idx]
        seam = white_key_bounds[idx + 1]
        right = white_key_bounds[idx + 2]
        left_width = seam - left
        right_width = right - seam
        black_width = max(6, round(min(left_width, right_width) * 0.58))
        x = round(seam - black_width / 2)
        y = 0
        h = round(height * 0.62)
        black_keys.append(((x, y, black_width, h), f"{black_note}{octave}"))

    return black_keys


def parse_video_source(value: str):
    return int(value) if value.isdigit() else value


def keyboard_region_score(frame: np.ndarray, quad: np.ndarray) -> float:
    try:
        warped, _, _ = warp_keyboard(frame, quad)
    except cv2.error:
        return 0.0

    height, width = warped.shape[:2]
    if height < 45 or width < frame.shape[1] * 0.35:
        return 0.0

    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(warped, cv2.COLOR_BGR2HSV)
    lower = gray[int(height * 0.45):, :]
    lower_hsv = hsv[int(height * 0.45):, :, :]

    bright_ratio = float((lower > 145).mean())
    white_like_ratio = float(((lower_hsv[:, :, 1] < 95) & (lower_hsv[:, :, 2] > 135)).mean())
    dark_ratio = float((gray[: int(height * 0.75), :] < 95).mean())

    sobel_x = cv2.Sobel(cv2.GaussianBlur(gray, (5, 5), 0), cv2.CV_32F, 1, 0, ksize=3)
    vertical_edge_energy = float(np.abs(sobel_x[int(height * 0.38):, :]).mean() / 255.0)

    # A real key bed has white-key mass plus vertical key seams. The dark term
    # helps black keys without letting the dark control panel dominate.
    return (
        bright_ratio * 4.0
        + white_like_ratio * 3.0
        + min(dark_ratio, 0.35) * 1.2
        + vertical_edge_energy * 2.0
    )


def detect_keyboard_quad(frame: np.ndarray) -> np.ndarray | None:
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # Piano white keys are usually the largest low-saturation, high-value band.
    white_mask = cv2.inRange(hsv, np.array([0, 0, 125]), np.array([179, 95, 255]))
    adaptive = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        41,
        -7,
    )
    mask = cv2.bitwise_and(white_mask, adaptive)

    close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (35, 11))
    open_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, close_kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, open_kernel, iterations=1)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    frame_area = frame.shape[0] * frame.shape[1]
    best_score = 0.0
    best_quad = None

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < frame_area * 0.015:
            continue

        x, y, w, h = cv2.boundingRect(contour)
        touches_top = y <= 2
        too_tall = h > frame.shape[0] * 0.34
        if touches_top and too_tall:
            continue

        rect = cv2.minAreaRect(contour)
        (width, height) = rect[1]
        if width <= 1 or height <= 1:
            continue

        long_side = max(width, height)
        short_side = min(width, height)
        aspect = long_side / short_side
        if aspect < 3.0:
            continue

        box = cv2.boxPoints(rect)
        quad = order_points(box)
        y_center = quad[:, 1].mean() / frame.shape[0]
        region_score = keyboard_region_score(frame, quad)
        if region_score < 2.8:
            continue

        score = area * aspect * region_score * (0.8 + min(y_center, 1.0) * 0.45)

        if score > best_score:
            best_score = score
            best_quad = quad

    edge_quad = detect_keyboard_quad_from_edges(frame)
    if edge_quad is not None:
        edge_score = keyboard_region_score(frame, edge_quad) * frame.shape[0] * frame.shape[1]
        if best_quad is None or edge_score > best_score:
            return edge_quad

    if best_quad is not None:
        return best_quad

    return None


def detect_keyboard_quad_from_edges(frame: np.ndarray) -> np.ndarray | None:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 45, 135)
    lines = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 180,
        threshold=42,
        minLineLength=max(90, frame.shape[1] // 5),
        maxLineGap=35,
    )
    if lines is None:
        return None

    candidates = []
    for x1, y1, x2, y2 in lines[:, 0, :]:
        dx = x2 - x1
        dy = y2 - y1
        length = float(np.hypot(dx, dy))
        if length < frame.shape[1] * 0.18 or abs(dx) < 1:
            continue

        angle = abs(np.degrees(np.arctan2(dy, dx)))
        if angle > 14:
            continue

        y_mid = (y1 + y2) / 2
        if y_mid > frame.shape[0] * 0.98:
            continue

        candidates.append((int(x1), int(y1), int(x2), int(y2), length, y_mid))

    if len(candidates) < 2:
        return None

    groups: list[list[tuple[int, int, int, int, float, float]]] = []
    for line in sorted(candidates, key=lambda item: item[5]):
        for group in groups:
            group_y = np.mean([item[5] for item in group])
            if abs(line[5] - group_y) < 24:
                group.append(line)
                break
        else:
            groups.append([line])

    group_models = []
    for group in groups:
        if sum(item[4] for item in group) < frame.shape[1] * 0.35:
            continue

        points = []
        for x1, y1, x2, y2, *_ in group:
            points.append((x1, y1))
            points.append((x2, y2))

        points_array = np.array(points, dtype="float32")
        xs = points_array[:, 0]
        ys = points_array[:, 1]
        if len(np.unique(xs.astype(int))) < 2:
            continue

        slope, intercept = np.polyfit(xs, ys, 1)
        group_models.append(
            {
                "slope": float(slope),
                "intercept": float(intercept),
                "y": float(np.mean(ys)),
                "x_min": int(xs.min()),
                "x_max": int(xs.max()),
                "length": float(sum(item[4] for item in group)),
            }
        )

    if len(group_models) < 2:
        return None

    best_pair = None
    best_score = 0.0
    for top in group_models:
        for bottom in group_models:
            if bottom["y"] <= top["y"]:
                continue

            separation = bottom["y"] - top["y"]
            if separation < frame.shape[0] * 0.13 or separation > frame.shape[0] * 0.48:
                continue
            if top["y"] < frame.shape[0] * 0.04:
                continue

            left = min(top["x_min"], bottom["x_min"])
            right = max(top["x_max"], bottom["x_max"])
            span = right - left
            if span < frame.shape[1] * 0.45:
                continue

            pad_x = int(span * 0.035)
            candidate_left = max(0, left - pad_x)
            candidate_right = min(frame.shape[1] - 1, right + pad_x)

            def y_at(model, x):
                return model["slope"] * x + model["intercept"]

            quad = order_points(
                np.array(
                    [
                        [candidate_left, y_at(top, candidate_left)],
                        [candidate_right, y_at(top, candidate_right)],
                        [candidate_right, y_at(bottom, candidate_right)],
                        [candidate_left, y_at(bottom, candidate_left)],
                    ],
                    dtype="float32",
                )
            )
            quad = extend_quad_bottom(frame, quad)

            slope_delta = abs(top["slope"] - bottom["slope"])
            region_score = keyboard_region_score(frame, quad)
            if region_score < 2.8:
                continue

            score = (
                region_score * 1000
                + span
                + top["length"] * 0.25
                + bottom["length"] * 0.35
                - slope_delta * 250
                + top["y"] * 0.8
            )
            if score > best_score:
                best_score = score
                best_pair = quad

    if best_pair is None:
        return None

    return best_pair


def warp_keyboard(frame: np.ndarray, quad: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    tl, tr, br, bl = quad
    width = int(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))
    height = int(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))
    width = max(width, 200)
    height = max(height, 60)

    dst = np.array(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
        dtype="float32",
    )
    transform = cv2.getPerspectiveTransform(quad, dst)
    inverse_transform = cv2.getPerspectiveTransform(dst, quad)
    warped = cv2.warpPerspective(frame, transform, (width, height))
    return warped, transform, inverse_transform


def smooth_projection(values: np.ndarray, kernel_size: int = 21) -> np.ndarray:
    kernel_size = max(5, kernel_size | 1)
    return cv2.GaussianBlur(values.reshape(1, -1).astype("float32"), (kernel_size, 1), 0).reshape(-1)


def find_projection_peaks(projection: np.ndarray, min_distance: int, threshold: float) -> list[int]:
    peaks: list[int] = []
    last_peak = -min_distance

    for x in range(1, len(projection) - 1):
        if projection[x] < threshold:
            continue
        if projection[x] < projection[x - 1] or projection[x] < projection[x + 1]:
            continue

        if x - last_peak < min_distance:
            if peaks and projection[x] > projection[peaks[-1]]:
                peaks[-1] = x
                last_peak = x
            continue

        peaks.append(x)
        last_peak = x

    return peaks


def detect_white_key_bounds(warped: np.ndarray, expected_white_keys: int | None) -> list[int]:
    height, width = warped.shape[:2]

    if expected_white_keys and expected_white_keys > 1:
        return [round(i * width / expected_white_keys) for i in range(expected_white_keys + 1)]

    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    sobel_x = cv2.Sobel(blur, cv2.CV_32F, 1, 0, ksize=3)

    # The lower half avoids most black-key bodies and emphasizes white-key seams.
    y0 = int(height * 0.42)
    projection = np.abs(sobel_x[y0:, :]).sum(axis=0)
    projection = smooth_projection(projection, max(9, width // 80))

    threshold = float(projection.mean() + projection.std() * 0.75)
    min_distance = max(10, width // 30)
    peaks = find_projection_peaks(projection, min_distance, threshold)

    if len(peaks) < 4:
        return [0, width]

    peaks = [p for p in peaks if width * 0.015 < p < width * 0.985]
    bounds = [0, *peaks, width]
    gaps = np.diff(bounds)
    median_gap = float(np.median(gaps)) if len(gaps) else 0

    if median_gap > 0:
        cleaned = [bounds[0]]
        for bound in bounds[1:]:
            if bound - cleaned[-1] >= median_gap * 0.38:
                cleaned.append(bound)
        bounds = cleaned

    return bounds if len(bounds) >= 3 else [0, width]


def detect_black_key_boxes(warped: np.ndarray) -> list[tuple[int, int, int, int]]:
    height, width = warped.shape[:2]
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    top = gray[: int(height * 0.72), :]
    _, dark_mask = cv2.threshold(top, 130, 255, cv2.THRESH_BINARY_INV)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 9))
    dark_mask = cv2.morphologyEx(dark_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    dark_mask = cv2.morphologyEx(dark_mask, cv2.MORPH_CLOSE, kernel, iterations=1)

    contours, _ = cv2.findContours(dark_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes: list[tuple[int, int, int, int]] = []

    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        if area < width * height * 0.002:
            continue
        if h < height * 0.18 or w < width * 0.006:
            continue
        if w > width * 0.09 or h > height * 0.75:
            continue
        boxes.append((x, y, w, h))

    boxes.sort(key=lambda box: box[0])
    return boxes


def project_points(points: np.ndarray, inverse_transform: np.ndarray) -> np.ndarray:
    points = points.reshape(-1, 1, 2).astype("float32")
    return cv2.perspectiveTransform(points, inverse_transform).reshape(-1, 2)


def build_detection_from_quad(
    frame: np.ndarray,
    quad: np.ndarray,
    expected_white_keys: int | None = None,
) -> KeyboardDetection:
    warped, transform, inverse_transform = warp_keyboard(frame, quad)
    white_key_bounds = detect_white_key_bounds(warped, expected_white_keys)
    black_key_boxes = detect_black_key_boxes(warped)

    return KeyboardDetection(
        quad=quad,
        warped=warped,
        transform=transform,
        inverse_transform=inverse_transform,
        white_key_bounds=white_key_bounds,
        black_key_boxes=black_key_boxes,
    )


def detect_keyboard(frame: np.ndarray, expected_white_keys: int | None = None) -> KeyboardDetection | None:
    quad = detect_keyboard_quad(frame)
    if quad is None:
        return None

    return build_detection_from_quad(frame, quad, expected_white_keys)


def overlay_detection(
    frame: np.ndarray,
    detection: KeyboardDetection,
    first_white_note: str,
    first_octave: int,
) -> np.ndarray:
    overlay = frame.copy()
    output = frame.copy()
    height, width = detection.warped.shape[:2]

    cv2.polylines(output, [detection.quad.astype(int)], True, (0, 255, 255), 3)

    labels = build_note_labels(
        max(0, len(detection.white_key_bounds) - 1),
        first_white_note,
        first_octave,
    )

    for idx, (left, right) in enumerate(zip(detection.white_key_bounds, detection.white_key_bounds[1:])):
        if right - left < 3:
            continue

        warped_poly = np.array(
            [[left, 0], [right, 0], [right, height - 1], [left, height - 1]],
            dtype="float32",
        )
        poly = project_points(warped_poly, detection.inverse_transform).astype(int)

        fill_color = (70, 180, 255) if idx % 2 else (40, 140, 240)
        cv2.fillConvexPoly(overlay, poly, fill_color)
        cv2.polylines(output, [poly], True, (255, 255, 255), 1)

        center = poly.mean(axis=0).astype(int)
        label = labels[idx] if idx < len(labels) else f"W{idx + 1}"
        cv2.putText(
            output,
            label,
            tuple(center),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 255, 255),
            1,
            cv2.LINE_AA,
        )

    estimated_black_keys = estimate_black_keys(
        detection.white_key_bounds,
        height,
        first_white_note,
        first_octave,
    )

    for (x, y, w, h), label in estimated_black_keys:
        warped_poly = np.array(
            [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
            dtype="float32",
        )
        poly = project_points(warped_poly, detection.inverse_transform).astype(int)
        cv2.fillConvexPoly(overlay, poly, (20, 20, 20))
        cv2.polylines(output, [poly], True, (80, 255, 80), 2)
        center = poly.mean(axis=0).astype(int)
        cv2.putText(
            output,
            label,
            tuple(center),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.38,
            (80, 255, 80),
            1,
            cv2.LINE_AA,
        )

    cv2.addWeighted(overlay, 0.28, output, 0.72, 0, output)
    cv2.putText(
        output,
        f"white keys: {len(detection.white_key_bounds) - 1}  black keys: {len(estimated_black_keys)}",
        (18, 32),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 255),
        2,
        cv2.LINE_AA,
    )
    return output


def run_on_image(args: argparse.Namespace) -> int:
    frame = cv2.imread(args.image)
    if frame is None:
        print(f"Error: could not read image: {args.image}")
        return 1

    detection = detect_keyboard(frame, args.white_keys)
    if detection is None:
        print("No keyboard boundary detected.")
        return 1

    output = overlay_detection(frame, detection, args.first_white_note, args.first_octave)
    cv2.imshow("Piano key detector", output)
    if args.output:
        cv2.imwrite(args.output, output)
        print(f"Wrote {args.output}")
    cv2.waitKey(0)
    cv2.destroyAllWindows()
    return 0


def run_live(args: argparse.Namespace) -> int:
    cap = cv2.VideoCapture(parse_video_source(args.camera))
    if not cap.isOpened():
        print(f"Error: could not open video source {args.camera}")
        return 1

    last_detection = None
    missed_frames = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        detection = detect_keyboard(frame, args.white_keys)
        if detection is not None and last_detection is not None:
            smoothed_quad = last_detection.quad * 0.72 + detection.quad * 0.28
            detection = build_detection_from_quad(frame, smoothed_quad, args.white_keys)

        if detection is not None:
            last_detection = detection
            missed_frames = 0
            frame = overlay_detection(frame, detection, args.first_white_note, args.first_octave)
        elif last_detection is not None and missed_frames < 8:
            missed_frames += 1
            frame = overlay_detection(frame, last_detection, args.first_white_note, args.first_octave)
        else:
            cv2.putText(
                frame,
                "No keyboard boundary detected",
                (18, 32),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 0, 255),
                2,
                cv2.LINE_AA,
            )

        cv2.imshow("Piano key detector", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("s"):
            cv2.imwrite("key_detector_frame.png", frame)
            print("Wrote key_detector_frame.png")

    cap.release()
    cv2.destroyAllWindows()
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Detect a piano keyboard boundary and overlay estimated key positions.",
    )
    parser.add_argument("--camera", default="65", help="Camera index/path for live mode. Default: 65")
    parser.add_argument("--image", help="Run detection on a still image instead of a camera.")
    parser.add_argument("--output", help="Optional output path when using --image.")
    parser.add_argument(
        "--white-keys",
        type=int,
        default=17,
        help="Visible white-key count. Default: 17 for the current keyboard view.",
    )
    parser.add_argument(
        "--auto-white-keys",
        action="store_true",
        help="Use image-based seam detection instead of the fixed --white-keys value.",
    )
    parser.add_argument(
        "--first-white-note",
        default="C",
        help="Label for the leftmost visible white key. Default: C",
    )
    parser.add_argument(
        "--first-octave",
        type=int,
        default=3,
        help="Octave for the leftmost visible white key label. Default: 3",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.auto_white_keys:
        args.white_keys = None
    if args.image:
        return run_on_image(args)
    return run_live(args)


if __name__ == "__main__":
    raise SystemExit(main())
