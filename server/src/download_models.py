from pose import PoseEstimator


def main() -> None:
    """Download and cache the pose estimation models used by the server."""
    PoseEstimator()
    print("Pose estimation models are ready.")


if __name__ == "__main__":
    main()
