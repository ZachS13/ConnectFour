/**
 * This file handles certain socket funcions like sending an accepted or declined
 * challenge back to the user who sent it.
 */
const logic = require(`./logic.js`);

/**
 * Handles when a user sends a message to the lobby, will emit the message and save it
 * in the database.
 * @param {io} io - Socket IO object
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
 * Handles sending the challenge from the user to the recipiant.
 * @param {IO} io - Socket IO object
 * @param {*} userId - UserId of the sender of the challenge.
 * @param {*} targetUserId - UserId recieving the challenge.
 * @param {*} targetUserSocketId - SocketId of the user recieving the challenge.
 * @param {*} challengeId - ChallengeId.
 * @param {*} message - Message attached to the challenge.
 */
function handleSendingChallenge(io, userId, targetUserSocketId, challengeId, message) {
    const challengeMessage = {
        action: "challenge",
        challengeId: challengeId,
        senderId: userId,
        message: message,
    };
    io.to(targetUserSocketId).emit("lobbyMessage", challengeMessage);
}

function handleAcceptChallenge(io, senderId, senderSocketId, targetId, targetUserSocketId, challengeId) {
    const acceptChallengeMessage = {
        action: "challengeAccepted",
        challengeId: challengeId,
        senderId: senderId,
        targetId: targetId,
    };
    io.to(targetUserSocketId).emit("lobbyMessage", acceptChallengeMessage);
    io.to(senderSocketId).emit("lobbyMessage", acceptChallengeMessage);
}


function handleDeclineChallenge(io, targetUserSocketId, challengeId) {
    const declineChallengeMessage = {
        action: "challengeDeclined",
        challengeId: challengeId,
    };
    io.to(targetUserSocketId).emit("lobbyMessage", declineChallengeMessage);
}

module.exports = {
    handleLobbyChatMessages,
    handleSendingChallenge,
    handleAcceptChallenge,
    handleDeclineChallenge,
}