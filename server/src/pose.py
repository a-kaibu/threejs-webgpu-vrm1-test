import threading

import numpy as np
from rtmlib import PoseTracker, Wholebody, draw_skeleton


class PoseEstimator:
    def __init__(
        self,
        mode: str = "balanced",
        det_frequency: int = 7,
        backend: str = "onnxruntime",
        device: str = "cpu",
    ):
        self._lock = threading.Lock()
        self.pose_tracker = PoseTracker(
            Wholebody,
            det_frequency=det_frequency,
            mode=mode,
            to_openpose=False,
            backend=backend,
            device=device,
        )

    def estimate(self, image: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """BGR画像に対して骨格推定を実行する。

        Returns:
            keypoints: shape (num_persons, 133, 2) pixel coords
            scores: shape (num_persons, 133)
        """
        with self._lock:
            return self.pose_tracker(image)

    def draw(
        self, image: np.ndarray, keypoints: np.ndarray, scores: np.ndarray
    ) -> np.ndarray:
        """スケルトンをオーバーレイ描画した画像を返す。"""
        return draw_skeleton(
            image.copy(), keypoints, scores, openpose_skeleton=False, kpt_thr=0.43
        )

    def normalize_keypoints(
        self, keypoints: np.ndarray, width: int, height: int
    ) -> list:
        """キーポイントを[0,1]に正規化してlistで返す。

        Args:
            keypoints: shape (num_persons, 133, 2)
            width: 画像の幅
            height: 画像の高さ

        Returns:
            [[[x, y], ...], ...] - 各人物の133点 ([0,1]正規化)
        """
        normalized = keypoints.copy().astype(float)
        normalized[:, :, 0] /= width
        normalized[:, :, 1] /= height
        return [[[round(float(x), 4), round(float(y), 4)] for x, y in person] for person in normalized]
