from flask import Flask, request, jsonify
from deepface import DeepFace
import cv2
import numpy as np
from flask_cors import CORS  # Import CORS

app = Flask(__name__)
CORS(app)
@app.route("/predict-emotion", methods=["POST"])
@app.route("/predict-emotion", methods=["POST"])
def predict_emotion():
    print("Request received!")

    # Check if image is in request
    if "image" not in request.files:
        print("No image received! Request files:", request.files)
        return jsonify({"error": "No image provided"}), 400

    try:
        file = request.files["image"]
        image_bytes = file.read()

        if not image_bytes:
            print("Empty image file!")
            return jsonify({"error": "Empty image file"}), 400

        # Convert bytes to numpy array
        image_np = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(image_np, cv2.IMREAD_COLOR)

        if image is None:
            print("Failed to decode image!")
            return jsonify({"error": "Invalid image data"}), 400

        # Analyze emotions using DeepFace
        result = DeepFace.analyze(image, actions=["emotion"], enforce_detection=False)

        if result and len(result) > 0:
            dominant_emotion = result[0]["dominant_emotion"]
            percentage=float(result[0]['emotion'][dominant_emotion])
            return jsonify({"emotion": dominant_emotion,'percentage':percentage})
        else:
            return jsonify({"error": "No face detected"}), 400

    except Exception as e:
        print("Error:", str(e))
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)