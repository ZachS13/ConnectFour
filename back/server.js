/**
 * This is the server for Connect 4.
 */

const express    = require('express'),
      app        = express(),
      cors       = require('cors'),
      bodyParser = require('body-parser'),
      db         = require(`./db.js`),
      logic      = require(`./logic.js`),
      http       = require('http'),
      WebSocket  = require('ws');

app.use(cors());
app.use(bodyParser.json());

// Helper to ensure that the ip is ipv4
const getClientIp = (req) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    return ip === '::1' ? '127.0.0.1' : ip;
};

// Handle login requests
app.post(`/login`, async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await logic.getUserWithUsernamePassword(username, password);

        if (result.length === 0) {
            // User was not found username or password is incorrect.
            return res.status(401).json({ error: 'Invalid username or password' });
        } else if (result.error) {
            return res.status(401).json(result);
        } 
        const userId = result.user_id;
        
        // User was found now we should make the session token.
        const clientIp = getClientIp(req);
        const sessionId = await logic.setSession(clientIp, userId, username);
        return res.status(200).json({ message: { userId: userId, sessionId: sessionId } });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: `Internal Server Error Occured` });
    }
});

// Handle creating account
app.post(`/createAccount`, async (req, res) => {
    const { username, password, confirmPassword } = req.body;

    try {
        const result = await logic.addUser(username, password, confirmPassword);
        if(result.error) {
            return res.status(401).json(result);
        } else {
            return res.status(201).json({ message: { userId: result.userId } });
        }
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') { 
            return res.status(400).json({ error: `Username already exists` });
        } else {
            console.log(error);
            return res.status(500).json({ error: `An error occurred on the server` });
        }
    }
});

app.post(`/getUsername`, async (req, res) => {
    const { userId } = req.body;
    try {
        const result = await logic.getUsernameById(userId);
        if(!result) {
            return res.status(404).json({ error: `No user found!` });
        }
        return res.status(200).json({ message: result });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: `An error occurred on the server` });
    }
});

app.get(`/usernames`, async (req, res) => {
    try {
        const results = await db.getAllUsernames();
        return res.status(200).json({ message: results });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: `An error occurred on the server` });
    }
});

app.post(`/checkSession`, async (req, res) => {
    const { userId, sessionId } = req.body;
    try {
        const clientIp = getClientIp(req);
        const username = await logic.getUsernameById(userId);
        const token = logic.createSessionToken(clientIp, userId, username);
        
        // Get the stored session checksum
        const storedToken = await logic.getSessionTokenWithIdUserId(sessionId, userId);
        if (!storedToken || storedToken !== token) {
            return res.status(401).json({ error: `Session is not verified!` });
        } 

        return res.status(200).json({message: username});
    } catch (error) {
        return res.status(500).json({ error: `An error occured on the server!` });
    }
});

app.post(`/sendChallenge`, async (req,res) => {
    const { userId, challengerId } = req.body;
    try {
        const challengeId = await logic.sendChallenge(userId, challengerId);
        if (!challengeId) {
            return res.status(404).json({ error: "Challenger not found!" });
        }
        return res.status(200).json({ message: challengeId});
    } catch (error) {
        return res.status(500).json({ error: `An error occured on the server!` });
    }
});

app.post(`/challengeResponse`, async (req, res) => {
    const { challengeId, reply } = req.body;
    try {
        const response = logic.sendChallengeResponse(challengeId, reply);
        if(!response) {
            return res.status(404).json({ error: "Challenge was not found!" });
        }
        return res.status(200).json({ message: response });
    } catch (error) {
        return res.status(500).json({ error: `An error occured on the server!` });
    }
});


/**
 * This is for the lobby chat, this will also take care of sending a challege to another 
 * user in the lobby.
 */
const server = http.createServer(app),
      wss = new WebSocket.Server({ server }),
      userSockets = new Map(),
      storedChallenges = new Map(),
      rooms = new Map();

rooms.set("lobby", new Set()); // Initialize the lobby

wss.on('connection', (ws, req) => {
    console.log("\tNew WebSocket client connected");

    // Example: Extract userId from query parameters (or headers/session)
    const userId = req.url.split('?userId=')[1];
    if (userId) {
        userSockets.set(userId, ws); // Map the WebSocket to the userId
        console.log(`\tUser ${userId} connected`);

        // Add the user to the lobby
        rooms.get("lobby").add(ws);
    } else {
        console.log("\tConnection rejected: No userId provided");
        ws.close(); // Close the connection if userId is not provided
        return;
    }

    // Handle incoming messages
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const { room, action, challengeId = null, message: textMessage, targetUserId } = data;

            switch (action) {
                case "join":
                    if (!rooms.has(room)) {
                        rooms.set(room, new Set());
                    }
                    rooms.get(room).add(ws);
                    console.log(`\tUser ${userId} joined room: ${room}`);
                    break;

                case "leave":
                    if (rooms.has(room)) {
                        rooms.get(room).delete(ws);
                        console.log(`\tUser ${userId} left room: ${room}`);
                    }
                    break;

                case "message":
                    if (rooms.has(room)) {
                        // Broadcast message to the specified room
                        for (const client of rooms.get(room)) {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ action: "message", room, message: textMessage }));
                            }
                        }
                    } else {
                        ws.send(JSON.stringify({ error: "Room does not exist" }));
                    }
                    break;

                case "sendChallenge":
                    if (data.targetUserId && userSockets.has(data.targetUserId)) {
                        const targetSocket = userSockets.get(data.targetUserId);
                        const challengeMessage = {
                            action: "challenge",
                            challengeId: data.challengeId,
                            senderId: userId,
                            message: data.message,
                        };

                        targetSocket.send(JSON.stringify(challengeMessage));
                        console.log(`\tChallenge sent from User ${userId} to User ${data.targetUserId}`);
                    } else {
                        ws.send(JSON.stringify({ error: "Target user is not connected" }));
                    }
                    break;

                case "declineChallenge":                
                    const { challengeId } = data;

                    if (!challengeId) {
                        ws.send(JSON.stringify({ error: "challengeId is required to decline a challenge" }));
                        break;
                    }

                    try {
                        const challege = await logic.getChallengeWithId(challengeId);
                        if (challege.length === 0) {
                            ws.send(JSON.stringify({ error: `Challenge with ID ${challengeId} not found` }));
                            console.log(`\tChallenge ${challengeId} not found`);
                            break;
                        }
                        const sendId = String(challege.sender_id);

                        // Ensure the sender is online
                        if (userSockets.has(sendId)) {
                            const senderSocket = userSockets.get(sendId);
                            const declineMessage = {
                                action: "challengeDeclined",
                                challengeId,
                                message: "Challenge declined",
                                userId
                            };

                            senderSocket.send(JSON.stringify(declineMessage));
                            console.log(`\tChallenge ${challengeId} declined by User ${userId}`);
                        } else {
                            console.log(`\tFailed to send decline message:  User${sendId} not connected`);
                        }
                    } catch (err) {
                        console.error("Error declining challenge:", err);
                        ws.send(JSON.stringify({ error: "Failed to decline challenge" }));
                    }
                    break;

                default:
                    ws.send(JSON.stringify({ error: "Unknown action" }));
            }
        } catch (err) {
            console.error("Invalid message format:", err);
            ws.send(JSON.stringify({ error: "Invalid message format" }));
        }
    });

    ws.on('close', () => {
        // Remove the user from userSockets
        userSockets.delete(userId);
        console.log(`\tUser ${userId} disconnected`);

        // Remove the client from all rooms
        for (const [room, clients] of rooms.entries()) {
            if (clients.has(ws)) {
                clients.delete(ws);
                console.log(`\tUser ${userId} removed from room: ${room}`);
                if (room !== "lobby" && clients.size === 0) {
                    rooms.delete(room);
                    console.log(`\tRoom deleted: ${room}`);
                }
            }
        }
    });
});

// Start the server
server.listen(3000, () => {
    console.log("Server is running on port 3000");
});
