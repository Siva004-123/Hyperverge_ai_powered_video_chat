const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });
const clients = {};

wss.on("connection", (ws) => {
    console.log("New client connected");

    const clientId = Math.random().toString(36).substring(7);
    clients[clientId] = ws;
    ws.send(JSON.stringify({ type: "id", id: clientId }));

    // Send the new peer a list of all existing peers
    const peerList = Object.keys(clients).filter(id => id !== clientId);
    ws.send(JSON.stringify({ type: "peer-list", peers: peerList }));

    ws.on("message", (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case "start-call":
                // Notify all other peers about the new peer
                for (const id in clients) {
                    if (id !== clientId) {
                        clients[id].send(JSON.stringify({ type: "new-peer", target: clientId }));
                    }
                }
                break;
            case "offer":
            case "answer":
            case "candidate":
                if (data.target && clients[data.target]) {
                    clients[data.target].send(JSON.stringify({ ...data, sender: clientId }));
                }
                break;
            default:
                console.log("Unknown message type:", data.type);
        }
    });

    ws.on("close", () => {
        console.log("Client disconnected:", clientId);
        delete clients[clientId];
        // Notify all other peers about the disconnection
        for (const id in clients) {
            clients[id].send(JSON.stringify({ type: "peer-disconnected", target: clientId }));
        }
    });
});

console.log("WebRTC signaling server running on ws://localhost:8080");