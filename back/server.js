/**
 * This is the server for Connect 4.
 */

const express    = require('express'),
      app        = express(),
      bodyParser = require('body-parser'),
      http       = require('http'),
      server = http.createServer(app),
      socketIo = require('socket.io'),
      db = require(`./db.js`),
      logic = require(`./logic.js`),
      sh = require('./socketHandler.js');

// origin: "*" -- Allows all origins, this can be changed to restrict it. 
const io = socketIo(server, {
    cors: {
        origin: "*",                
    }
});
app.use(require('cors')({
    origin: "*",
    methods: ["GET", "POST"],
}));

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

// Get the username with the given id.
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

// Get a list of all usernames.
app.get(`/usernames`, async (req, res) => {
    try {
        const results = await db.getAllUsernames();
        return res.status(200).json({ message: results });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: `An error occurred on the server` });
    }
});

// Check if the users session is valid and stored.
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

// Send challenge to a specfied user.
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

// Reply to a challenge.
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


// Using socket.io this is where handling lobby chat, game chat, game moves, and challenges will be handled.
let userSockets = new Map();  // Map to store user IDs to their sockets

// Handle new connections
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    let userId;

    // Register user
    socket.on('register', (user) => {
        userId = user.id;  // Save user ID for future reference
        userSockets.set(userId, socket);
        console.log(`User ${userId} registered with socket ID ${socket.id}`);
    });

    /**
     * 
     * THE FOLLOWING SECTION OF CODE IS RELATING TO THE LOBBY CHAT, A USER SHOULD CONNECT TO THE
     * LOBBY ONCE THEY LOG IN AND ARE ON THE LOBBY SCREEN. USERS WILL REMAIN IN THE LOBBY CHAT EVEN
     * WHEN THEY JOIN A GAME.
     */

    // Handle incoming lobby messages and actions like sending and declining challenges
    io.on('lobbyMessage', (data) => {
        const { room, message, action, targetUserId, challengeId } = data;

        if (action === 'sendChallenge') {
            handleSendChallenge(socket, targetUserId, challengeId, message);
        } else if (action === 'declineChallenge') {
            handleDeclineChallenge(socket, targetUserId, challengeId);
        } else {
            // Standard lobby message (non-action message)
            if (socket.rooms.has(room)) {
                socket.to(room).emit('message', { room, message });
            } else {
                socket.emit('error', { error: "Room does not exist" });
            }
        }
    });


    /**
     * 
     * THE FOLLOWING CODE IS HOW THE USERS WILL JOIN THE GAME CHAT AND SEND MESSAGES. THIS IS ALSO
     * WHERE SENDING MOVES AND HANDLING GAME STATE WILL OCCUR.
     * 
     */

    // Handle joining a game room
    socket.on('joinGame', (gameId) => {
        if (!gameId) {
            socket.emit('error', { error: "Game ID is required to join the game" });
            return;
        }

        // Add the user to the game room
        socket.join(gameId);
        console.log(`User ${socket.id} joined game room: ${gameId}`);

        // Optionally, you can emit an event to the game room or to the client
        socket.emit('gameJoined', { gameId, message: "You have joined the game room" });

        // Broadcast to other users in the game room that the user has joined
        socket.to(gameId).emit('gameMessage', { gameId, message: `User ${socket.id} has joined the game` });
    });

    // Handle leaving the game room (if the game ends or the user disconnects)
    socket.on('leaveGame', (gameId) => {
        if (socket.rooms.has(gameId)) {
            socket.leave(gameId);
            console.log(`User ${socket.id} left game room: ${gameId}`);

            // Optionally, broadcast to the room that the user has left
            socket.to(gameId).emit('gameMessage', { gameId, message: `User ${socket.id} has left the game` });
        } else {
            socket.emit('error', { error: "User is not in the specified game room" });
        }
    })

    // Handle game chat messages
    socket.on('gameChat', (data) => {
        const { gameId, message } = data;

        // Assuming gameId is unique for each game and used to identify game rooms
        if (socket.rooms.has(gameId)) {
            // Broadcast the message to everyone in the game room
            socket.to(gameId).emit('gameMessage', { gameId, message });
        } else {
            socket.emit('error', { error: "Game room does not exist" });
        }
    });

    // Handle user disconnection
    socket.on('disconnect', () => {
        if (userId) {
            userSockets.delete(userId);
            console.log(`User ${userId} disconnected`);
        }
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));