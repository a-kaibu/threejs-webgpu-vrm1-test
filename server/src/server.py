# Ref: https://github.com/aiortc/aiortc/tree/main/examples/server
import argparse
import asyncio
import json
import logging
import os
import ssl
import time
import uuid

from aiohttp import web
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaRelay
from av import VideoFrame

from pose import PoseEstimator

ROOT = os.path.dirname(__file__)

logger = logging.getLogger("pc")
pcs = set()
relay = MediaRelay()
pose_estimator = PoseEstimator()


class VideoTransformTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self, track, transform, data_channel=None):
        super().__init__()
        self.track = track
        self.transform = transform
        self.data_channel = data_channel
        self.frame_count = 0

    async def recv(self):
        frame = await self.track.recv()

        if self.transform in ("pose", "data_only"):
            img = frame.to_ndarray(format="bgr24")
            h, w = img.shape[:2]

            inference_started = time.perf_counter()
            keypoints, scores = await asyncio.to_thread(pose_estimator.estimate, img)
            inference_ms = round((time.perf_counter() - inference_started) * 1000)

            self._send_pose_data(keypoints, scores, w, h, inference_ms)

            if self.transform == "pose" and len(keypoints) > 0:
                img = pose_estimator.draw(img, keypoints, scores)
                new_frame = VideoFrame.from_ndarray(img, format="bgr24")
                new_frame.pts = frame.pts
                new_frame.time_base = frame.time_base
                self.frame_count += 1
                return new_frame

        self.frame_count += 1
        return frame

    def _send_pose_data(
        self,
        keypoints,
        scores,
        width: int,
        height: int,
        inference_ms: int,
    ):
        if self.data_channel is None or self.data_channel.readyState != "open":
            return

        persons = []
        if len(keypoints) > 0:
            normalized = pose_estimator.normalize_keypoints(keypoints, width, height)
            for i in range(len(keypoints)):
                persons.append(
                    {
                        "keypoints": normalized[i],
                        "scores": [round(float(s), 4) for s in scores[i]],
                    }
                )

        payload = json.dumps(
            {
                "frame": self.frame_count,
                "timestamp": round(time.time(), 3),
                "inference_ms": inference_ms,
                "persons": persons,
                "image_size": [width, height],
            }
        )

        try:
            self.data_channel.send(payload)
        except Exception:
            pass


async def offer(request):
    params = await request.json()
    offer_desc = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    pc = RTCPeerConnection()
    pc_id = "PeerConnection(%s)" % uuid.uuid4()
    pcs.add(pc)

    def log_info(msg, *args):
        logger.info(pc_id + " " + msg, *args)

    log_info("Created for %s", request.remote)

    video_tracks = []

    @pc.on("datachannel")
    def on_datachannel(channel):
        if channel.label != "pose":
            return
        for video_track in video_tracks:
            video_track.data_channel = channel
        log_info("DataChannel 'pose' received")

    @pc.on("connectionstatechange")
    async def on_connectionstatechange():
        log_info("Connection state is %s", pc.connectionState)
        if pc.connectionState == "failed":
            await pc.close()
            pcs.discard(pc)

    @pc.on("track")
    def on_track(track):
        log_info("Track %s received", track.kind)

        if track.kind == "video":
            transform = params.get("video_transform", "pose")
            video_track = VideoTransformTrack(
                relay.subscribe(track, buffered=False),
                transform=transform,
            )
            video_tracks.append(video_track)
            pc.addTrack(video_track)

        @track.on("ended")
        async def on_ended():
            log_info("Track %s ended", track.kind)

    await pc.setRemoteDescription(offer_desc)

    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return web.Response(
        content_type="application/json",
        text=json.dumps(
            {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}
        ),
    )


async def on_shutdown(app):
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        return web.Response(headers=CORS_HEADERS)
    response = await handler(request)
    response.headers.update(CORS_HEADERS)
    return response


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="WebRTC pose estimation server")
    parser.add_argument("--cert-file", help="SSL certificate file (for HTTPS)")
    parser.add_argument("--key-file", help="SSL key file (for HTTPS)")
    parser.add_argument(
        "--host", default="0.0.0.0", help="Host for HTTP server (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port", type=int, default=8989, help="Port for HTTP server (default: 8989)"
    )
    parser.add_argument("--verbose", "-v", action="count")
    args = parser.parse_args()

    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%H:%M:%S",
    )
    # enable access log
    logging.getLogger("aiohttp.access").setLevel(log_level)

    if args.cert_file:
        ssl_context = ssl.SSLContext()
        ssl_context.load_cert_chain(args.cert_file, args.key_file)
    else:
        ssl_context = None

    async def preflight(_request):
        return web.Response(headers=CORS_HEADERS)

    app = web.Application(middlewares=[cors_middleware])
    app.on_shutdown.append(on_shutdown)
    app.router.add_route("OPTIONS", "/offer", preflight)
    app.router.add_post("/offer", offer)
    web.run_app(
        app, host=args.host, port=args.port, ssl_context=ssl_context
    )
