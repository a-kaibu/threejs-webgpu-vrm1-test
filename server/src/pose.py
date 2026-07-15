import threading

import numpy as np
from rtmlib import PoseTracker, Wholebody3d, draw_skeleton


class PoseEstimator:
    def __init__(
        self,
        det_frequency: int = 7,
        backend: str = "onnxruntime",
        device: str = "cuda",
    ):
        self._lock = threading.Lock()
        self.pose_tracker = PoseTracker(
            Wholebody3d,
            det_frequency=det_frequency,
            tracking=False,
            to_openpose=False,
            backend=backend,
            device=device,
        )

    def estimate(
        self, image: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """BGR画像に対して3D骨格推定を実行する。

        Returns:
            keypoints_3d: shape (num_persons, 133, 3)
            scores: shape (num_persons, 133)
            keypoints_2d: shape (num_persons, 133, 2) pixel coords
        """
        with self._lock:
            keypoints_3d, scores, _, keypoints_2d = self.pose_tracker(image)
            return keypoints_3d, scores, keypoints_2d

    def draw(
        self, image: np.ndarray, keypoints: np.ndarray, scores: np.ndarray
    ) -> np.ndarray:
        """スケルトンをオーバーレイ描画した画像を返す。"""
        return draw_skeleton(
            image.copy(), keypoints, scores, openpose_skeleton=False, kpt_thr=0.43
        )

    def normalize_keypoints_2d(
        self, keypoints: np.ndarray, width: int, height: int
    ) -> list:
        """2Dキーポイントを[0,1]に正規化してlistで返す。

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

    def normalize_keypoints_3d(self, keypoints: np.ndarray) -> list:
        """モデル座標を軸ごとに正規化した3Dキーポイントを返す。"""
        normalized = keypoints.copy().astype(float)
        normalized[:, :, 0] /= 288.0
        normalized[:, :, 1] /= 384.0
        normalized[:, :, 2] /= 2.1744869
        return [
            [
                [round(float(x), 4), round(float(y), 4), round(float(z), 4)]
                for x, y, z in person
            ]
            for person in normalized
        ]
