const API_URL = 'connectfour-production.up.railway.app';

/**
 * Check if the session variables are set, if they're
 * not, redirect to the login page. If they are, use the
 * checksum.
 */
const userId = localStorage.getItem('userId'),
      sessionId = localStorage.getItem('sessionId');
let username = '';
if(!userId || !sessionId) {
    window.location = './login.html';
}
try {
    const responseSession = await fetch(`${API_URL}/checkSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, sessionId })
    });
    if (responseSession.error) {
        console.log(dataSession.error);
        window.location = './login.html';
    }
    const dataSession = await responseSession.json();
    username = dataSession.message;
} catch (error) {
    console.log("Failed to validate session:", error);
    window.location = './login.html';
}

/**
 * Handles all of the logic for sending lobby chats, challenges, accepting, and denying challenges.
 */
const LOBBY = (function () {
    /**
     * Initializes the lobby page.
     */
    function init() {
        dropDownWithUsernames();
        const socket = io(`${API_URL}`, {
            query: { userId: userId }
        });
        const chatDiv = document.getElementById('chat'),
              messageInput = document.getElementById('messageInput'),
              sendBtn = document.getElementById('sendBtn'),
              challengeBtn = document.getElementById('sendChallengeBtn');

        socket.on('connect', () => {
            console.log('Successfully connected to the server!'); 

            const joinMessage = {
                action: "join",
                room: "lobby",
            };
            socket.emit('register', { id: userId });
            socket.emit('lobbyMessage', joinMessage);
        });

        // Chat messages (lobby chat)
        socket.on('lobbyMessage', async (data) => {

            if (data.action === 'message') {
                const msg = document.createElement('div');
                const mess = data.message;

                msg.innerHTML = mess || "Empty message";  // Handle any edge cases
                chatDiv.appendChild(msg);
            } else if (data.action === 'challenge') { 
                // Create how the message will look.
                const senderUsername = await getUsernameId(data.senderId);
                const challengeMsg = document.createElement('div');
                challengeMsg.setAttribute('id', 'challengeMsg');
                challengeMsg.innerHTML = `Challenge from ${senderUsername}: ${data.message}</br>`;

                // Create the accept button. 
                const acceptButton = document.createElement('button');
                acceptButton.textContent = 'Accept';
                acceptButton.classList.add('accept-button');
                challengeMsg.appendChild(acceptButton);

                // Create the decline button
                const denyButton = document.createElement('button');
                denyButton.textContent = 'Decline';
                denyButton.classList.add('deny-button');
                challengeMsg.appendChild(denyButton);

                acceptButton.addEventListener('click', async () => {
                    const reply = await sendChallengeResponse(sessionId, data.challengeId, "accept"),
                          sendAccept= {
                              userId: userId,
                              action: "acceptChallenge",
                              senderId: data.senderId,
                              challengeId: data.challengeId
                          };
                    denyButton.style.display = 'none';
                    acceptButton.style.display = 'none';
                    socket.emit('lobbyMessage', sendAccept);                          
                    console.log("You accepted the game request", reply);
                });

                denyButton.addEventListener('click', async () => {
                    const reply = await sendChallengeResponse(sessionId, data.challengeId, "decline"),
                           sendDecline = {
                                userId: userId,
                                action: "declineChallenge",
                                senderId: data.senderId,
                                challengeId: data.challengeId
                            };
                    socket.emit('lobbyMessage', sendDecline);
                    denyButton.style.display = 'none';
                    acceptButton.style.display = 'none';

                    const declineMessage = "You declined the challenge.",
                          declineDiv = document.createElement('div');
                    declineDiv.innerHTML = declineMessage;
                    declineDiv.style.color = "orange";
                    chatDiv.appendChild(declineDiv);
                    console.log("You denied the game request", reply);
                });

                chatDiv.appendChild(challengeMsg);
                chatDiv.scrollTop = chatDiv.scrollHeight;
            } else if (data.action === 'challengeDeclined') {
                // Handle challenge declined
                const declineMsg = document.createElement('div');
                declineMsg.style.color = 'orange';
                const challengerUsername = await getUsernameId(data.declineUserId);
                declineMsg.innerHTML = `${challengerUsername} declined your challenge request.`;
                chatDiv.appendChild(declineMsg);
                chatDiv.scrollTop = chatDiv.scrollHeight;

            } else if (data.action === 'challengeAccepted') {
                // Handle challenge declined
                const acceptMsg = document.createElement('div');
                acceptMsg.style.color = 'green';
                const senderUsername = await getUsernameId(data.senderId);
                const challengerUsername = await getUsernameId(data.targetId);
                acceptMsg.innerHTML = `${challengerUsername} and ${senderUsername} playing...`;
                chatDiv.appendChild(acceptMsg);
                chatDiv.scrollTop = chatDiv.scrollHeight;

                window.location.href = `game.html?gameId=${data.gameId}`;
            }
        });

        // User sends a normal message.
        sendBtn.addEventListener('click', () => {
            const messageInput = document.getElementById('messageInput'),
                  textMessage = `${username}: ${messageInput.value.trim()}`;
            if (textMessage !== '') {
                const message = {
                    userId: userId,
                    action: "message",
                    room: "lobby",
                    message: textMessage,
                };
                console.log(message);
                socket.emit('lobbyMessage', message);   // Emit the message to the lobby.
                messageInput.value = '';            // Clear the message field.
            }
        });

        challengeBtn.addEventListener('click', async () => {
            const targetUserId = document.getElementById('userSelect').value;
            let challengeMessage = document.getElementById('challengeMessage').value.trim();

            if (!targetUserId) {
                const select = document.getElementById('userSelect');
                select.style.backgroundColor = `rgb(225, 100, 100)`;
                return;
            }
            if (!challengeMessage) {
                challengeMessage = `I challenge you to a game!`;
            }
            const challengeId = await sendChallengeToDB(sessionId, userId, targetUserId);
            console.log(challengeId);
            const message = {
                userId: userId,
                action: "sendChallenge",
                targetUserId,
                message: challengeMessage,
                challengeId
            };

            const challengerUsername = await getUsernameId(targetUserId),
                  confirmMessage = `Challenge sent to ${challengerUsername}, waiting for reply.`,
                  challSent = document.createElement('div');
            challSent.innerHTML = confirmMessage;
            challSent.style.color = "grey";
            chatDiv.appendChild(challSent);

            socket.emit('lobbyMessage', message);
        });

        // Allow pressing Enter to send message
        messageInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                sendBtn.click();
            }
        });
    }

    /**
     * Make the dropdown menu to select from, user needs to be in the lobby to send
     * the challenge over.
     */
    async function dropDownWithUsernames() {
        const dropdown = document.getElementById('userSelect');

        try {
            const response = await fetch(`${API_URL}/usernames`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) {
                console.log(response.statusText);
            }

            const data = await response.json();
            dropdown.innerHTML = '<option value="" disabled selected>Select a user</option>';

            data.message.forEach(user => {
                if (userId != user.user_id) {
                    const option = document.createElement('option');
                    option.value = user.user_id;
                    option.textContent = user.username;
                    dropdown.appendChild(option);
                }
            });
        } catch (error) {
            console.log('Error populating dropdown:', error);
        }
    }

    /**
     * Get the username with the given userID
     * @param {Integer} userId - User's ID 
     * @returns {String} Username corresponding to the ID.
     */
    async function getUsernameId(userId) {
        const response = await fetch(`${API_URL}/getUsername`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });

        if(response.error || !response) {
            console.log('There was an error getting username.');
        } 
        const result = await response.json();
        return result.message;
    }

    /**
     * Send the challenge to the database.
     * @param {Integer} sessionId - Users sessionId.
     * @param {Integer} userId - User's ID
     * @param {Integer} challengerId - Who they want to play against.
     * @returns {Integer} - ID of the challenge in the DB.
     */
    async function sendChallengeToDB(sessionId, userId, challengerId) {
        const response = await fetch(`${API_URL}/sendChallenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, userId, challengerId })
        });

        if (response.error || !response) {
            console.log('There was an error sending challenge to server.');
        }
        const result = await response.json();
        return result.message;
    }

    /**
     * Send the response to the challenge to the database.
     * @param {Integer} sessionId - Users sessionId.
     * @param {Integer} challengeId - Id of the challenge.
     * @param {Object} reply - Object of the reply to the challenge.
     * @returns Rseponse from the database.
     */
    async function sendChallengeResponse(sessionId, challengeId, reply) {
        const response = await fetch(`${API_URL}/challengeResponse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, challengeId, reply })
        });

        if(!response || !response) {
            console.log('There was an error replying to challenge.');
        }

        return response;
    }

    return {
        init: init,
    };
})();

window.LOBBY = LOBBY;