const ws = new WebSocket("ws://10.1.41.129:8080");

let peerConnections = {};
let localStream;
const remoteStreams = {};

// DOM Elements
const localVideo = document.getElementById("localVideo");
const startCallButton = document.getElementById("startCall");

let clientId;

// WebSocket message handling
ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
        case "id":
            clientId = message.id;
            console.log("Assigned Client ID:", clientId);
            break;
        case "peer-list":
            handlePeerList(message.peers);
            break;
        case "new-peer":
            handleNewPeer(message.target);
            break;
        case "offer":
            await handleOffer(message);
            break;
        case "answer":
            await handleAnswer(message);
            break;
        case "candidate":
            await handleCandidate(message);
            break;
        case "peer-disconnected":
            handlePeerDisconnected(message.target);
            break;
        default:
            console.log("Unknown message type:", message.type);
    }
};

// Get user media and start a call
startCallButton.addEventListener("click", async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        ws.send(JSON.stringify({ type: "start-call", sender: clientId }));
    } catch (error) {
        console.error("Error accessing media devices:", error);
    }
});

// Handle peer list
function handlePeerList(peers) {
    peers.forEach(peerId => handleNewPeer(peerId));
}

// Handle new peer
function handleNewPeer(peerId) {
    if (peerId !== clientId && !peerConnections[peerId]) {
        const peerConnection = createPeerConnection(peerId);

        // Create an offer for the new peer
        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => {
                ws.send(JSON.stringify({ type: "offer", offer: peerConnection.localDescription, target: peerId }));
            })
            .catch(error => console.error("Error creating offer:", error));
    }
}

// Create PeerConnection and add tracks
function createPeerConnection(targetId) {
    const peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
        ],
    });

    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
        const stream = event.streams[0];
        const streamKey = `${targetId}-${stream.id}`;

        if (!remoteStreams[streamKey]) {
            remoteStreams[streamKey] = stream;
            addRemoteVideo(stream, targetId);
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate, target: targetId }));
        }
    };

    peerConnections[targetId] = peerConnection;
    return peerConnection;
}

function addRemoteVideo(stream, peerId) {
    const videoContainer = document.getElementById("videoContainer");

    // Create a wrapper for the video and peer ID
    const videoWrapper = document.createElement("div");
    videoWrapper.classList.add("video-wrapper");
    videoWrapper.setAttribute("data-peer-id", peerId); // Add data-peer-id to the wrapper

    // Create the video element
    const videoElement = document.createElement("video");
    videoElement.srcObject = stream;
    videoElement.autoplay = true;
    videoElement.setAttribute("data-peer-id", peerId);

    // Create the peer ID label
    const peerIdLabel = document.createElement("div");
    peerIdLabel.classList.add("peer-id");
    peerIdLabel.textContent = `Peer: ${peerId}`;

    // Create the emotion label
    const emotionLabel = document.createElement("div");
    emotionLabel.classList.add("emotion-label");
    emotionLabel.id = `remoteEmotion-${peerId}`;

    // Create the heatmap bar
    const heatmapBar = document.createElement("div");
    heatmapBar.classList.add("heatmap-bar");

    const heatmapBarFill = document.createElement("div");
    heatmapBarFill.classList.add("heatmap-bar-fill");

    const heatmapBarLabel = document.createElement("div");
    heatmapBarLabel.classList.add("heatmap-bar-label");
    heatmapBarLabel.textContent = "0%";

    heatmapBar.appendChild(heatmapBarFill);
    heatmapBar.appendChild(heatmapBarLabel);

    // Append video and labels to the wrapper
    videoWrapper.appendChild(videoElement);
    videoWrapper.appendChild(peerIdLabel);
    videoWrapper.appendChild(emotionLabel);
    videoWrapper.appendChild(heatmapBar); // Append heatmap bar

    // Append the wrapper to the video container
    videoContainer.appendChild(videoWrapper);
}

// Handle incoming offer
async function handleOffer(message) {
    try {
        const peerConnection = createPeerConnection(message.sender);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", answer, target: message.sender }));
    } catch (error) {
        console.error("Error handling offer:", error);
    }
}

// Handle incoming answer
async function handleAnswer(message) {
    const peerConnection = peerConnections[message.sender];
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
    }
}

// Handle incoming ICE candidate
async function handleCandidate(message) {
    const peerConnection = peerConnections[message.sender];
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
}

// Handle peer disconnection
function handlePeerDisconnected(peerId) {
    const peerConnection = peerConnections[peerId];
    if (peerConnection) {
        peerConnection.close();
        delete peerConnections[peerId];
    }
    const videoWrapper = document.querySelector(`[data-peer-id="${peerId}"]`)?.parentElement;
    if (videoWrapper) {
        videoWrapper.remove();
    }
}

// Function to capture a frame from the video stream
function captureFrame(videoElement) {
    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg"); // Convert to base64
}

function updateHeatmapBar(peerId, percentage) {
    console.log(`Updating heatmap for peer ${peerId} with percentage ${percentage}`);
    const heatmapBarFill = document.querySelector(`.video-wrapper[data-peer-id="${peerId}"] .heatmap-bar-fill`);
    const heatmapBarLabel = document.querySelector(`.video-wrapper[data-peer-id="${peerId}"] .heatmap-bar-label`);

    if (heatmapBarFill && heatmapBarLabel) {
        heatmapBarFill.style.width = `${percentage}%`;
        heatmapBarLabel.textContent = `${percentage.toFixed(2)}%`;
    } else {
        console.error(`Heatmap elements not found for peer ${peerId}`);
    }
}

// Modify the predictEmotion function to return the percentage
async function predictEmotion(imageDataURL) {
    console.log("Predicting emotion...");

    // Convert base64 to Blob
    const blob = await fetch(imageDataURL).then((res) => res.blob());

    // Create FormData and append the Blob
    const formData = new FormData();
    formData.append("image", blob, "frame.jpg"); // Ensure correct key is used

    try {
        console.log("Sending API request with image data...");
        const response = await fetch("http://10.1.41.129:5000/predict-emotion", {
            method: "POST",
            body: formData, // Ensure this is multipart/form-data
        });

        console.log("API response status:", response.status);
        const data = await response.json();
        console.log("Emotion Prediction:", data);

        if (data.error) {
            console.error("Error predicting emotion:", data.error);
        } else {
            console.log("Detected Emotion:", data.emotion);
            return { emotion: data.emotion, percentage: data.percentage }; // Return the detected emotion and percentage
        }
    } catch (error) {
        console.error("Error predicting emotion:", error);
    }
}

setInterval(async () => {
    const localVideo = document.getElementById("localVideo");
    const remoteVideos = document.querySelectorAll("#videoContainer video");

    // Predict emotion for local video
    if (localVideo.videoWidth > 0 && localVideo.videoHeight > 0) {
        const localFrame = captureFrame(localVideo);
        const localEmotionData = await predictEmotion(localFrame);
        if (localEmotionData) {
            document.getElementById("localEmotion").textContent = `You: ${localEmotionData.emotion}`;
            updateHeatmapBar("local", localEmotionData.percentage); // Update local heatmap
        } else {
            document.getElementById("localEmotion").textContent = `None`;
            updateHeatmapBar("local", 0); // Reset local heatmap
        }
    }

    // Predict emotion for remote videos
    remoteVideos.forEach(async (video) => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
            const peerId = video.getAttribute("data-peer-id"); // Get the peer ID
            const remoteFrame = captureFrame(video);
            const remoteEmotionData = await predictEmotion(remoteFrame);
            if (remoteEmotionData) {
                // Find the correct emotion label and update it
                const emotionLabel = document.getElementById(`remoteEmotion-${peerId}`);
                if (emotionLabel) {
                    emotionLabel.textContent = `Peer ${peerId}: ${remoteEmotionData.emotion}`;
                }
                updateHeatmapBar(peerId, remoteEmotionData.percentage); // Update remote heatmap
            }
        }
    });
}, 1000); // Capture frames every 1 second