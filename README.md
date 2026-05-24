# Frame Extractor

A lightweight web app for extracting multiple frames from a video as images. Everything runs locally in the browser with the video and canvas APIs.

## Run Locally

```bash
python3 -m http.server 5173
```

Then open:

```text
http://127.0.0.1:5173
```

## Features

- Upload or drag and drop a video.
- Choose an exact extraction range with start and end times in seconds.
- Set the extraction FPS. Example: 30 fps over 10 seconds creates 300 frames.
- Export frames as JPG, PNG, or WebP.
- Adjust quality for JPG and WebP.
- Download individual frames or all frames as a ZIP file.
- Generate ordered filenames such as `frame_001.jpg` and `frame_002.jpg`.
- Preview the estimated frame count before extraction starts.

## Constraints

- Each extraction is limited to 1,000 frames to avoid exhausting browser memory.
- Seek accuracy depends on the browser and video codec. Most MP4 and WebM files work well, but some codecs may seek to the closest available frame.
- Videos are never uploaded to a server.
