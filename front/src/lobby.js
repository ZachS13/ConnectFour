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
    const responseSession = await fetch('http://localhost:3000/checkSession', {
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


const LOBBY = (function () {

    function init() {
        dropDownWithUsernames();

        const socket = new WebSocket(`ws://localhost:3000?userId=${userId}`),
            chatDiv = document.getElementById('chat'),
            messageInput = document.getElementById('messageInput'),
            sendBtn = document.getElementById('sendBtn'),
            challengeBtn = document.getElementById('sendChallengeBtn');

        socket.addEventListener('open', () => {
            console.log("Connected to WebSocket server");
            const joinMessage = {
                action: "join",
                room: "lobby",
            };
            socket.send(JSON.stringify(joinMessage));
        });

        // When we receive a message from the server
        socket.addEventListener('message', async (event) => {
            const data = JSON.parse(event.data);

            if (data.action === "message") {
                // Handle regular chat messages
                const msg = document.createElement('div'),
                      mess = data.message
                msg.innerHTML = mess;
                chatDiv.appendChild(msg);
                chatDiv.scrollTop = chatDiv.scrollHeight;
            } else if (data.action === "challenge") {
                // Handle challenge messages
                console.log(data);  

                const senderUsername = await getUsernameId(data.senderId),
                      challengeMsg = document.createElement('div');
                challengeMsg.setAttribute('id', 'challengeMsg');
                challengeMsg.innerHTML = `Challenge from ${senderUsername}: ${data.message}</br>`;

                // Create the "Accept" button
                const acceptButton = document.createElement('button');
                acceptButton.textContent = 'Accept';
                acceptButton.classList.add('accept-button');
                challengeMsg.appendChild(acceptButton);

                acceptButton.addEventListener('click', async () => {
                    const reply = await sendChallengeResponse(data.challengeId, "accept");
                    console.log("You accepted the game request", reply);
                });

                // Create the "Deny" button
                const denyButton = document.createElement('button');
                denyButton.textContent = 'Decline';
                denyButton.classList.add('deny-button');
                challengeMsg.appendChild(denyButton);

                denyButton.addEventListener('click', async () => {
                    const reply = await sendChallengeResponse(data.challengeId, "decline"),
                          sendDecline = {
                              action: "declineChallenge",
                              challengeId: data.challengeId
                          }
                    socket.send(JSON.stringify(sendDecline));
                    denyButton.style.display = 'none';
                    acceptButton.style.display= 'none';

                    const declineMessage = "You declined the challenge.",
                          declineDiv = document.createElement('div');
                    declineDiv.innerHTML = declineMessage;
                    declineDiv.style.color = "orange";
                    chatDiv.appendChild(declineDiv);
                    console.log("You denied the game request", reply);
                });

                chatDiv.appendChild(challengeMsg);
                chatDiv.scrollTop = chatDiv.scrollHeight;
            } else if (data.action === "challengeDeclined") {
                // Handle challenge declined
                const declineMsg = document.createElement('div');
                declineMsg.style.color = 'orange';
                const challengerUsername = await getUsernameId(data.userId);
                declineMsg.innerHTML = `${challengerUsername} declined your challenge request.`;
                chatDiv.appendChild(declineMsg);
                chatDiv.scrollTop = chatDiv.scrollHeight;
            }
        });

        // When the user clicks "Send"
        sendBtn.addEventListener('click', () => {
            const messageInput = document.getElementById('messageInput');
            const textMessage = `${username}: ${messageInput.value.trim()}`

            if (textMessage !== '') {
                const message = {
                    action: "message",
                    room: "lobby",
                    message: textMessage,
                };
                socket.send(JSON.stringify(message));
                messageInput.value = ''; // Clear the input field
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
            const challengeId = await sendChallengeToDB(userId, targetUserId);
            console.log(challengeId);
            const message = {
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

            socket.send(JSON.stringify(message)); 
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
            const response = await fetch('http://localhost:3000/usernames', {
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
        const response = await fetch('http://localhost:3000/getUsername', {
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
     * @param {Integer} userId - User's ID
     * @param {Integer} challengerId - Who they want to play against.
     * @returns {Integer} - ID of the challenge in the DB.
     */
    async function sendChallengeToDB(userId, challengerId) {
        const response = await fetch('http://localhost:3000/sendChallenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, challengerId })
        });

        if (response.error || !response) {
            console.log('There was an error sending challenge to server.');
        }
        const result = await response.json();
        return result.message;
    }

    async function sendChallengeResponse(challengeId, reply) {
        const response = await fetch('http://localhost:3000/challengeResponse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challengeId, reply })
        });

        if(!response || !response) {
            console.log('There was an error replying to challenge.');
        }

        if(reply === 'accept') {
            console.log('Handle sending them to the game.');
            // window.location = "./game.html";
        }

        return response;
    }

    return {
        init: init,
    };
})();

window.LOBBY = LOBBY;