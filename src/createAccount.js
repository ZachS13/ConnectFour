const API_URL = 'connectfour-production.up.railway.app';

/**
 * Helper function to send the user to the login page.
 */
function loginPage() {
    window.location.href = "./index.html";
}

/**
 * Initalizes the create account page.
 */
function init() {
    document.getElementById('signup').addEventListener('submit', async function (event) {
        event.preventDefault(); // Stop the form from navigating away

        const username = document.getElementById('new-username').value.trim(),
              password = document.getElementById('new-password').value.trim(),
              confirmPassword = document.getElementById('confirm-password').value,
              message = document.getElementById('message'),
              matchingPass = arePasswordsMatching(password, confirmPassword);

        if(!matchingPass) {
            showMessage(message, 'Passwords do not match!', 'error');
            return;
        }

        // Clear previous messages
        showMessage(message, '');

        try {
            // Create account
            const response = await fetch(`${API_URL}/createAccount`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, confirmPassword })
            });

            // Something went wrong
            if (!response.ok) {
                const errorData = await response.json();
                showMessage(message, `${errorData.error}` || `Error creating account`, 'error')
                return;
            }

            // Created Account Successfully
            showMessage(message, 'Account Created Successfully', 'success');

            setTimeout(() => {
                window.location = `./login.html`;
            }, 750);

        } catch (error) {
            console.error('Error:', error);
            showMessage(message, 'A Network Error Occured, Try again later.', 'error');
            return;
        }
    });
}

/**
 * Checks if the passwords are matching, since hashing takes place on the server, we will check the
 * password hash on the server matches.
 * @param {String} password Original password
 * @param {String} confirmPassword Password confirm
 * @returns {boolean} Do they match?
 */
function arePasswordsMatching(password, confirmPassword) {
    return password === confirmPassword;
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
