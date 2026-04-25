import cv2
import subprocess

# 1. List /dev/video* devices
print("=== /dev/video* devices ===")
result = subprocess.run(['ls', '-la', '/dev/video*'], capture_output=True, text=True, shell=False)
# shell glob won't work without shell=True
result = subprocess.run('ls -la /dev/video*', capture_output=True, text=True, shell=True)
print(result.stdout or result.stderr)

# 2. Try each index with both default and V4L2 backend
print("=== Camera probe ===")
for idx in range(6):
    for backend, label in [(cv2.CAP_ANY, "ANY"), (cv2.CAP_V4L2, "V4L2")]:
        cap = cv2.VideoCapture(idx, backend)
        opened = cap.isOpened()
        if opened:
            ret, frame = cap.read()
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            print(f"  idx={idx} backend={label}: opened={opened} read={ret} res={w}x{h}")
        cap.release()

print("\n=== v4l2-ctl --list-devices ===")
result = subprocess.run(['v4l2-ctl', '--list-devices'], capture_output=True, text=True)
print(result.stdout or result.stderr)
