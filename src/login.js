const API_URL = 'https://your-project-name.railway.app/api';

/**
 * Helper function to send the user to the create account page.
 */
function createAccountPage() {
    window.location.href = "./createAccount.html";
}

/**
 * Initializes the login page.
 */
function init() {
    document.getElementById('login').addEventListener('submit', async function (event) {
        event.preventDefault(); // Prevent form from submitting traditionally

        const username = document.getElementById('username').value.trim(),
              password = document.getElementById('password').value.trim(),
              message = document.getElementById('message');

        // Clear previous messages
        showMessage(message, '');

        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const errorData = await response.json();
                let errorMsg = errorData.error || 'Something went wrong.';

                if (response.status === 401) {
                    // Invalid username or password
                    errorMsg = errorData.error;
                } else if (response.status === 500) {
                    // Internal Server Error
                    errorMsg = 'Internal Server Error. Please try again later.';
                }
                showMessage(message, `${errorMsg}`, 'error');
                return;
            } 
            const data = await response.json();
            // Set session data, we pass the sessionId to do the check with the 
            // user we don't "get" the token.
            localStorage.setItem('userId', data.message.userId);
            localStorage.setItem('sessionId', data.message.sessionId);

            showMessage(message, 'Login successful!', 'success');
            // Redirect to game.html
            setTimeout(() => {
                window.location.href = './lobby.html';
            }, 500);

        } catch (error) {
            console.error('Error:', error);
            showMessage(message, 'Network error. Please try again.', 'error');
        }
    });
}

/**
 * Message that will be displayed to the user, Error or success.
 * @param {HTMLElement} messageElement - Message element.
 * @param {String} text - Message to be displayed.
 * @param {String} className - Error, Success, default blank.
 */
function showMessage(messageElement, text, className = '') {
    messageElement.textContent = text;
    messageElement.className = className;
    messageElement.style.display = 'block';
}
