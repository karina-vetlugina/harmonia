import cv2
import numpy as np

# 1. Set up the dictionary and detector
aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
detector_params = cv2.aruco.DetectorParameters()
detector = cv2.aruco.ArucoDetector(aruco_dict, detector_params)

# 2. Open webcam
cap = cv2.VideoCapture(65)  # webcam AC310 at /dev/video65

if not cap.isOpened():
    print("Error: Could not open video source.")
    exit()

while True:
    ret, frame = cap.read()
    if not ret:
        break

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # 3. Detect
    corners, ids, rejected = detector.detectMarkers(gray)

    # 4. Draw + print (with higher detection threshold)
    # Raise the minimum marker detection confidence
    detector_params.minMarkerPerimeterRate = 0.05  # increase from default (0.03)
    detector_params.minCornerDistanceRate = 0.10   # increase from default (0.05)
    # Redetect with new, stricter params
    detector = cv2.aruco.ArucoDetector(aruco_dict, detector_params)
    corners, ids, rejected = detector.detectMarkers(gray)

    if ids is not None:
        cv2.aruco.drawDetectedMarkers(frame, corners, ids)
        centers = []
        for i, marker_id in enumerate(ids.flatten()):
            c = corners[i].reshape(4, 2)
            center = c.mean(axis=0).astype(int)
            centers.append(center)
            print(f"ID {marker_id} at pixel {tuple(center)}")
        if len(centers) >= 2:
            for i in range(len(centers)):
                for j in range(i+1, len(centers)):
                    cv2.line(frame, tuple(centers[i]), tuple(centers[j]), (0, 255, 0), 2)
             
       

    cv2.imshow("ArUco 4x4_50", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
