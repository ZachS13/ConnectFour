/**
 * This file handles certain socket funcions like sending an accepted or declined
 * challenge back to the user who sent it.
 */
const logic = require(`./logic.js`);

/**
 * Handles when a user sends a message to the lobby, will emit the message and save it
 * in the database.
 * @param {io} io - With the given io, emit the message to the room.
 * @param {Integer} userId - UserId that is sending the message.
 * @param {String} action - Action of the message (should be 'message').
 * @param {String} room - Room being sent the messgae (should be 'lobby').
 * @param {String} message - Message being sent.
 */
async function handleLobbyChatMessages(io, userId, action, room, message) {
    await logic.sendLobbyMessage(userId, message);
    io.to(room).emit('lobbyMessage', { action: action, room, message });
}

/**
 * Handle accepting the challenge from the user.
 * @param {Socket} socket - The socket of the user is currently using (most likely lobby) 
 * @param {*} targetUserId - The user you are accepting the challenge from.
 * @param {*} challengeId - ChallengeID.
 */
function handleAcceptChallenge(socket, targetUserId, challengeId) {
    if (targetUserId && userSockets.has(targetUserId)) {
        const targetSocket = userSockets.get(targetUserId);
        const challengeMessage = {
            action: "challenge",
            challengeId,
            senderId: socket.id,
            message,
        };

        targetSocket.emit('challenge', challengeMessage);
        console.log(`Challenge sent from User ${socket.id} to User ${targetUserId}`);
    } else {
        socket.emit('error', { error: "Target user is not connected" });
    }
}

/**
 * Handle sending back to the user a declined challenge message.
 * @param {Socket} socket - The socket of the user is currently using (most likely lobby) 
 * @param {Integer} targetUserId - UserID of the user who sent the challenge.
 * @param {Integer} challengeId - ChallengeID.
 * @returns Reply message for declined challenge.
 */
function handleDeclineChallenge(socket, targetUserId, challengeId) {
    if (!challengeId) {
        socket.emit('error', { error: "challengeId is required to decline a challenge" });
        return;
    }

    try {
        // Assuming logic.getChallengeWithId is a function that retrieves the challenge details
        const challenge = logic.getChallengeWithId(challengeId);
        if (challenge.length === 0) {
            socket.emit('error', { error: `Challenge with ID ${challengeId} not found` });
            console.log(`Challenge ${challengeId} not found`);
            return;
        }

        const senderId = String(challenge.sender_id);

        // Ensure sender is online
        if (userSockets.has(senderId)) {
            const senderSocket = userSockets.get(senderId);
            const declineMessage = {
                action: "challengeDeclined",
                challengeId,
                message: "Challenge declined",
                userId: socket.id,
            };

            senderSocket.emit('challengeDeclined', declineMessage);
            console.log(`Challenge ${challengeId} declined by User ${socket.id}`);
        } else {
            console.log(`Failed to send decline message: User ${senderId} not connected`);
        }
    } catch (err) {
        console.error("Error declining challenge:", err);
        socket.emit('error', { error: "Failed to decline challenge" });
    }
}

module.exports = {
    handleLobbyChatMessages,
    handleAcceptChallenge,
    handleDeclineChallenge,
}