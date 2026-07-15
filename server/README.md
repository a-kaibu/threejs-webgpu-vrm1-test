# Pose Estimation WebRTC Server

リアルタイム骨格推定サーバー。カメラ映像をWebRTC経由で受け取り、rtmlib Wholebody（133キーポイント）で骨格推定して2系統で返す。

- **Video track**: スケルトンオーバーレイを描画した映像をWebRTCビデオトラックで返す
- **DataChannel "pose"**: 推定したキーポイントデータをJSONでリアルタイム送信

## Quick Start

```bash
cd server

# 依存インストール（初回）
uv sync

# サーバー起動
uv run python src/server.py

# 初回起動時はONNXモデルを自動ダウンロード（~300MB）
```

デフォルトは `http://0.0.0.0:8787` で待ち受け。

## Architecture

```
Browser                                    Python Server (HTTP :8787)
┌─────────────────────────┐                ┌──────────────────────────────┐
│ getUserMedia (camera)   │                │ aiohttp (signaling)          │
│ RTCPeerConnection       │──video track──>│ aiortc (WebRTC)              │
│                         │                │ VideoTransformTrack.recv()   │
│ <video> tag             │<─video track──│   frame → PoseEstimator      │
│ (skeleton overlay)      │                │   → draw_skeleton()          │
│                         │                │                              │
│ ondatachannel           │<──DC "pose"───│   keypoints → JSON           │
│ → pose JSON             │                │   → DataChannel.send()       │
└─────────────────────────┘                └──────────────────────────────┘
         │
         │ POST /offer (SDP)
         └────────────────────────────────────────────────────────────────>
```

## API

### `POST /offer`

WebRTCシグナリング用エンドポイント。SDPオファーを受け取り、SDPアンサーを返す。

**Request**

```
Content-Type: application/json
```

```json
{
  "sdp": "<SDP offer string>",
  "type": "offer",
  "video_transform": "pose"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `sdp` | string | ✓ | SDPオファー文字列 |
| `type` | string | ✓ | 常に `"offer"` |
| `video_transform` | string | | 処理モード（下記参照） |

**`video_transform` の値**

| 値 | 動作 |
|---|---|
| `"pose"` (デフォルト) | スケルトンオーバーレイを描画した映像を返す + DataChannelでposeデータ送信 |
| `"data_only"` | 映像はパススルー（処理なし） + DataChannelでposeデータ送信 |
| その他 / 省略時 | 映像パススルー、DataChannelは送信しない |

**Response**

```
Content-Type: application/json
Access-Control-Allow-Origin: *
```

```json
{
  "sdp": "<SDP answer string>",
  "type": "answer"
}
```

**CORS**

全オリジン許可（`Access-Control-Allow-Origin: *`）。OPTIONSプリフライトも処理する。

---

### `OPTIONS /offer`

CORSプリフライト用。`200 OK` と適切なCORSヘッダーを返す。

## WebRTC Signaling Flow

```
Client                              Server
  |                                    |
  |-- POST /offer (SDP offer) -------->|
  |                                    | RTCPeerConnection作成
  |                                    | DataChannel "pose" 作成 (server-side)
  |                                    | VideoTransformTrack 準備
  |                                    | SDP answer 生成
  |<-- 200 OK (SDP answer) -----------|
  |                                    |
  | setRemoteDescription(answer)       |
  | ICE candidate交換 (Trickle-free)   |
  |                                    |
  | ondatachannel イベント発火          |
  | → "pose" チャネルを受け取る         |
  |                                    |
  | 映像受信開始                        |
  | DataChannel "pose" からJSON届き始める|
```

**ICE gathering**: サーバーはICE候補が全部揃う（`iceGatheringState === "complete"`）まで待ってからanswerを返す（trickle-free方式）。WebSocketなしにHTTP POST 1往復でシグナリング完了。

**DataChannelの向き**: サーバー側で `pc.createDataChannel()` して作成する。クライアントは `RTCPeerConnection.ondatachannel` イベントでチャネルを受け取る。

## DataChannel Protocol

### チャネル: `"pose"`

| 属性 | 値 |
|---|---|
| name | `"pose"` |
| ordered | `false` |
| maxRetransmits | `0` |
| 方向 | Server → Client（単方向） |

unreliable / unordered 設定で最低遅延を実現。古いフレームが届くより届かない方がマシなのでこの設定。

### JSONメッセージフォーマット

フレームごとに1件のJSONメッセージを送信する。

```json
{
  "frame": 42,
  "timestamp": 1234567890.123,
  "persons": [
    {
      "keypoints": [
        [0.5000, 0.3000],
        [0.4800, 0.2800],
        ...
      ],
      "scores": [
        0.9500,
        0.8700,
        ...
      ]
    }
  ],
  "image_size": [640, 480]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `frame` | number | フレーム番号（0始まりインクリメント） |
| `timestamp` | number | Unix timestamp（秒、小数点以下3桁） |
| `persons` | array | 検出された人物の配列（0人以上） |
| `persons[i].keypoints` | array of [x, y] | 133点の座標（[0,1]正規化、4桁丸め） |
| `persons[i].scores` | array of number | 133個の信頼度スコア（[0,1]、4桁丸め） |
| `image_size` | [width, height] | 元フレームの解像度（ピクセル） |

**座標の正規化**: `keypoints[i] = [x / width, y / height]`。フロント側が解像度に依存せず描画できる。

**人物なしの場合**: `"persons": []` で送信される（毎フレーム必ず送信）。

## Keypoint Index Mapping (COCO-WholeBody 133)

### Body (0–16): 17点

| Index | 名前 |
|---|---|
| 0 | nose |
| 1 | left_eye |
| 2 | right_eye |
| 3 | left_ear |
| 4 | right_ear |
| 5 | left_shoulder |
| 6 | right_shoulder |
| 7 | left_elbow |
| 8 | right_elbow |
| 9 | left_wrist |
| 10 | right_wrist |
| 11 | left_hip |
| 12 | right_hip |
| 13 | left_knee |
| 14 | right_knee |
| 15 | left_ankle |
| 16 | right_ankle |

### Foot (17–22): 6点

| Index | 名前 |
|---|---|
| 17 | left_big_toe |
| 18 | left_small_toe |
| 19 | left_heel |
| 20 | right_big_toe |
| 21 | right_small_toe |
| 22 | right_heel |

### Face (23–90): 68点

68点の顔ランドマーク（`face-0` ～ `face-67`）。DLib 68点形式に対応。

| 範囲 | 部位 |
|---|---|
| face-0 – face-16 (index 23–39) | 顔輪郭（17点） |
| face-17 – face-21 (index 40–44) | 左眉（5点） |
| face-22 – face-26 (index 45–49) | 右眉（5点） |
| face-27 – face-30 (index 50–53) | 鼻梁（4点） |
| face-31 – face-35 (index 54–58) | 鼻先（5点） |
| face-36 – face-41 (index 59–64) | 左目（6点） |
| face-42 – face-47 (index 65–70) | 右目（6点） |
| face-48 – face-59 (index 71–82) | 外唇（12点） |
| face-60 – face-67 (index 83–90) | 内唇（8点） |

### Left Hand (91–111): 21点

| Index | 名前 |
|---|---|
| 91 | left_hand_root（手首） |
| 92–95 | left_thumb1 – left_thumb4 |
| 96–99 | left_forefinger1 – left_forefinger4 |
| 100–103 | left_middle_finger1 – left_middle_finger4 |
| 104–107 | left_ring_finger1 – left_ring_finger4 |
| 108–111 | left_pinky_finger1 – left_pinky_finger4 |

### Right Hand (112–132): 21点

| Index | 名前 |
|---|---|
| 112 | right_hand_root（手首） |
| 113–116 | right_thumb1 – right_thumb4 |
| 117–120 | right_forefinger1 – right_forefinger4 |
| 121–124 | right_middle_finger1 – right_middle_finger4 |
| 125–128 | right_ring_finger1 – right_ring_finger4 |
| 129–132 | right_pinky_finger1 – right_pinky_finger4 |

### サマリー

| 範囲 | 部位 | 点数 |
|---|---|---|
| 0–16 | Body | 17 |
| 17–22 | Foot | 6 |
| 23–90 | Face | 68 |
| 91–111 | Left Hand | 21 |
| 112–132 | Right Hand | 21 |
| **合計** | | **133** |

## Video Overlay

`video_transform: "pose"` の場合、rtmlib `draw_skeleton()` でスケルトンを描画して映像トラックで返す。

- スコアが `0.43` 未満のキーポイントは描画しない
- 左半身: 緑 (`[0, 255, 0]`)
- 右半身: オレンジ (`[255, 128, 0]`)
- 中央・顔: 青 (`[51, 153, 255]`)
- 顔ランドマーク: 白 (`[255, 255, 255]`)

## Configuration (CLI Args)

```
uv run python src/server.py [options]
```

| 引数 | デフォルト | 説明 |
|---|---|---|
| `--host` | `0.0.0.0` | リッスンするIPアドレス |
| `--port` | `8787` | ポート番号 |
| `--cert-file` | なし | SSL証明書ファイルパス（HTTPS用） |
| `--key-file` | なし | SSL秘密鍵ファイルパス（HTTPS用） |
| `--verbose`, `-v` | なし | デバッグログ出力 |

**HTTPS対応**:
```bash
uv run python src/server.py --cert-file cert.pem --key-file key.pem
```

## Architecture Notes

### モデル

- **Detector**: YOLOX-M（人物検出、640×640入力）
- **Pose**: RTMW-DW-X-L / RTMW-DW-L-M（`balanced` モード、256×192入力）
- 初回起動時に `~/.cache/` 以下にONNXモデルを自動ダウンロード

### 処理フロー

1. `VideoTransformTrack.recv()` がWebRTCフレームを受け取る
2. `asyncio.to_thread()` でCPU-bound推定処理をスレッドプールで実行（イベントループブロック防止）
3. `PoseEstimator.estimate()` 内は `threading.Lock` で排他制御（複数接続時の状態破損防止）
4. 推定結果を `_send_pose_data()` でDataChannelにJSON送信
5. `video_transform == "pose"` の場合はスケルトン描画して映像フレームを返す

### PoseTracker 設定

| パラメータ | 値 | 理由 |
|---|---|---|
| `det_frequency` | 7 | 7フレームに1回フル検出、間はIoUトラッキング。CPUで10fps以上出す |
| `mode` | `balanced` | 精度と速度のバランス（`performance` より速い、`lightweight` より正確） |
| `to_openpose` | `False` | coco133フォーマット。`draw_skeleton()` がネイティブ対応 |
| `backend` | `onnxruntime` | PyTorch不要、軽量 |
| `device` | `cpu` | デフォルトCPU推論 |

### DataChannel設計

- `ordered=False, maxRetransmits=0`: unreliable/unordered。最低遅延優先
- サーバー側で `createDataChannel()` してからクライアントの `ondatachannel` で受け取る方式
- `createDataChannel()` は `setRemoteDescription()` より前に呼ぶ（SDPに含める必要があるため）
- DataChannelの `readyState` が `"open"` でない場合は送信をスキップ

### JSONサイズ概算

1人の場合: `133点 × 2座標 × ~7文字 ≒ ~2KB` + スコア `133 × ~7文字 ≒ ~1KB` = 合計 **~3–4KB/フレーム**
