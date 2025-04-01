/**
 * This is the server for Connect 4.
 */

const express    = require('express'),
      app        = express(),
      bodyParser = require('body-parser'),
      http       = require('http'),
      server     = http.createServer(app),
      socketIo   = require('socket.io'),
      db         = require(`./db.js`),
      logic      = require(`./logic.js`),
      sHandler   = require('./socketHandler.js');

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

// Get the game board for a specific game.
app.post('/getGameInformation', async (req, res) => {
    const { gameId } = req.body;
    console.log(`Game Id: ${gameId}`);
    try {
        const response = await logic.getGameInformation(gameId);
        if (!response || response === undefined) {
            return res.status(404).json({ error: "Game was not found!" });
        }
        return res.status(200).json({ message: response });
    } catch (error) {
        return res.status(500).json({ error: "An error occured getting the game board!" });
    }
});


// Using socket.io this is where handling lobby chat, game chat, game moves, and challenges will be handled.
let userSockets = new Map();  // Map to store user IDs to their sockets

// Handle new connections
io.on('connection', (socket) => {
    let userId;

    // Register user
    socket.on('register', (user) => {
        userId = user.id;  // Save user ID for future reference
        userSockets.set(userId, socket.id);
        socket.join('lobby');  // Ensure the user joins the 'lobby' room
        console.log(`User ${userId} registered with socket ID ${socket.id}`);
    });

    /**
     * 
     * THE FOLLOWING SECTION OF CODE IS RELATING TO THE LOBBY CHAT, A USER SHOULD CONNECT TO THE
     * LOBBY ONCE THEY LOG IN AND ARE ON THE LOBBY SCREEN. USERS WILL REMAIN IN THE LOBBY CHAT EVEN
     * WHEN THEY JOIN A GAME.
     */

    // Handle incoming lobby messages and actions like sending and declining challenges
    socket.on('lobbyMessage', async (data) => {
        const { userId, room, message, action, targetUserId, challengeId } = data;

        if (action === 'message') {
            await sHandler.handleLobbyChatMessages(io, userId, action, room, message);
        } else if (action === 'sendChallenge') {
            const targetUserSocketId = userSockets.get(targetUserId);
            sHandler.handleSendingChallenge(io, userId, targetUserSocketId, challengeId, message);
        } else if (action === 'acceptChallenge') {
            console.log(data);
            const targetId = data.userId;
            const targetUserSocketId = userSockets.get(targetId);
            const senderId = data.senderId;
            const senderSocketId = userSockets.get(senderId);
            sHandler.handleAcceptChallenge(io, senderId, senderSocketId, targetId, targetUserSocketId, challengeId, message);
        } else if (action === 'declineChallenge') {
            const targetUserSocketId = userSockets.get(data.senderId);
            const declineUserId = data.userId;
            sHandler.handleDeclineChallenge(io, declineUserId, targetUserSocketId, challengeId);
        } else {
            socket.emit('error', { error: `Action does not exist: ${action}` });
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
    });

    // Handle game chat messages
    socket.on('gameChat', (data) => {
        if (socket.rooms.has(data.gameId)) {
            const message = {
                gameId: data.gameId,
                message: data.message,
            };
            io.to(data.gameId).emit('gameChat', message);
        } else {
            socket.emit('error', { error: "Game room does not exist" });
        }
    });

    // Handle in game moves.
    socket.on('makeMove', async (data) => {
        if (socket.rooms.has(data.gameId)) {
            const message = {
                gameId: data.gameId,
                row: data.row,
                col: data.col,
                turn: data.turn
            };
            const gameState = data.gameState,
                  gameId = data.gameId,
                  currentTurn = data.turn;
            const response = await logic.updateGameState(gameState, currentTurn,  gameId);
            if (response) {
                io.to(gameId).emit('makeMove', message);
            }
        } else {
            socket.emit('error', { error: "Game room does not exist" });
        }
    });

    // Handle when someone wins.
    socket.on('winner', async (data) => {
        if (socket.rooms.has(data.gameId)) {
            const gameId = data.gameId,
                  winnerId = data.winnerId;
            const message = {
                gameId: gameId,
                winnerId: winnerId
            }
            const response = await logic.updateGameWinner(winnerId, gameId);
            if (response) {
                io.to(gameId).emit('winner', message);
            }
        }
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