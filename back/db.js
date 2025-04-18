/**
 * This file will connect to the database and make the changes and get
 * the data. There won`t be that much security in this layer besides
 * prepared statements and small things like that.
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
});

console.log("Connected to the database!");


/////////////////////////////
//  USER DATABASE QUERIES  //
/////////////////////////////
/**
 * Handles logging into an account.
 * @param {String} username - previously checked and can be entered.
 * @returns {Object} Contains the userId and the sessionId
 */
async function getUserWithUsername(username) {
    const [results] = await pool.execute(`SELECT user_id, username, password FROM users WHERE username = ? LIMIT 1`, [username]);

    const user = results[0];
    if(user && user.password) {
        user.password = user.password.toString('utf8');
        return user;
    }
    return null;
}

/**
 * Function to get the username with a userId.
 * @param {Integer} userId - Users ID
 * @returns {Object} username that corresponds to the userId.
 */
async function getUsernameById(userId) {
    const [results] = await pool.execute(`SELECT username FROM users WHERE user_id = ? LIMIT 1`, [userId]);
    return results[0];
}

/**
 * Ger all of the usernames in the user table, this will help with UX creating an account.
 * @returns {Object} Object containing all usernames in the table.
 */
async function getAllUsernames() {
    const [results] = await pool.execute(`SELECT user_id, username FROM users`);
    return results;
}

/**
 * Function for creating a new user.
 * @param {String} username - Username for a new user.
 * @param {String} password - Password for the user.
 * @returns {Object} Contains the userId of the new user.
 */
async function addUser(username, password) {
    const [results] = await pool.execute(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, password]);
    return results.insertId;
}

/**
 * Function to delete a user from the database (OPTIONAL NOT IMPLEMENTED).
 * @param {Integer} userId - Users id.
 * @param {String} username - Username of the user. 
 * @param {String} password - Password of the user.
 * @returns {Object} Contains the number of rows affected, should be >1 if deleted.
 */
async function deleteUser(userId, username, password) {
    const [results] = await pool.execute(`DELETE FROM users WHERE id = ? AND username = ? AND password = ?`, [userId, username, password]);
    return results.affectedRows;
}

////////////////////////////////
//  SESSION DATABASE QUERIES  //
////////////////////////////////

/**
 * Function to get the stored token from the database with the session and
 * userId.
 * @param {Integer} sessionId - User's most recent session ID.
 * @param {Integer} userId - User's ID
 * @returns {Object} Contains the stored token.
 */
async function getStoredSessionToken(sessionId, userId) {
    const [results] = await pool.execute(`SELECT token FROM session WHERE session_id = ? AND user_id = ? AND expr_date > NOW();`, [sessionId, userId]);
    return results[0];
}

/**
 * Add session to the table and return the session ID.
 * @param {Integer} userId - User's ID
 * @param {String} token - String containing user information as a checksum.
 * @param {Date} exprDate - When does the token expire.
 * @returns {Integer} Session's ID
 */
async function addSessionToUser(userId, token, exprDate) {
    const [result] = await pool.execute(`INSERT INTO session (user_id, token, expr_date) VALUES (?, ?, ?);`, [userId, token, exprDate]);
    return result.insertId;
}

/////////////////////////////////
//  MESSAGES DATABASE QUERIES  //
/////////////////////////////////

/**
 * Message sent in the lobby.
 * @param {Integer} senderId - UserId of who sent the message.
 * @param {String} message - Message that is being sent.
 * @param {Date} timeSent - When was the message sent.
 * @returns 
 */
async function sendLobbyMessage(senderId, message, timeSent) {
    const [result] = await pool.execute(`INSERT INTO chatmessage (sender_id, message, time_sent) VALUES (?, ?, ?);`, [senderId, message, timeSent]);
    return result.insertId;
}

/**
 * Gets the sender of the challenge.
 * @param {Integer} challengeId - ChallengeId
 * @returns Sender_id along with the challenge_id
 */
async function getChallengeWithId(challengeId) {
    const [result] = await pool.execute(`SELECT sender_id, challenger_id FROM challenge WHERE challenge_id = ? LIMIT 1;`, [challengeId]);
    return result[0];
}

/**
 * Challenge someone to a game of Connect Four.
 * @param {Integer} userId - User's ID
 * @param {Integer} challengerId - User ID of who you want to play against.
 * @returns {Integer} Challege's ID
 */
async function sendAChallenge(userId, challengerId) {
    const [result] = await pool.execute(`INSERT INTO challenge (sender_id, challenger_id) VALUES (?, ?);`, [userId, challengerId]);
    return result.insertId;
}

/**
 * Add response to the challenge.
 * @param {Integer} challengeId - Challenge ID you are responding to
 * @param {Integer} reply - Accept or deny (1 = accept, 0 = deny)
 * @return {Boolean} Was the response updated?
 */
async function sendChallengeResponse(challengeId, reply) {
    const [result] = await pool.execute(`UPDATE challenge SET accept_deny = ? WHERE challenge_id = ?;`, [reply, challengeId]);
    return result.affectedRows > 0;

}

/////////////////////////////
//  GAME DATABASE QUERIES  //
/////////////////////////////

/**
 * Creates the game in the dataabse, sets all of the values (player1, player2, currentTurn) to the default.
 * @param {Integer} player1 - UserId of the player that sent the challenge.
 * @param {Integer} player2 - UserId of the player that accepted the challenge.
 * @param {Integer} currentTurn - Defaultly player1_id.
 * @param {Date} createdAt - Usually the current data and time.
 * @param {Array<Array<null>>} gameState - 6x7 empty 2d array.
 * @returns GameId of the game created.
 */
async function createConnectFourGame(player1, player2, currentTurn, createdAt, gameState) {
    const [result] = await pool.execute(`INSERT INTO game (player1_id, player2_id, current_turn, created_at, game_state) VALUES (?, ?, ?, ?, ?);`, [player1, player2, currentTurn, createdAt, gameState]);
    return result.insertId;
}

/**
 * Gets the gameBoard of the gameId given.
 * @param {Integer} gameId - gameId of the game board you want to get.
 */
async function getGameInformation(gameId) {
    const [result] = await pool.execute(`SELECT game_state, player1_id, player2_id, current_turn FROM game WHERE game_id = ? LIMIT 1;`, [gameId]);
    if (result.length === 0) return null;
    return result[0];
}

/**
 * Update the game_state and the current_turn in the database.
 * @param {Array<Array<Integer>>} gameState - 2D array of who's turn it is.
 * @param {Integer} currentTurn - UserId of who's turn it is.
 * @param {Integer} gameId - Game Id the game_state is being updated.
 * @returns True or False, Was the game_state and current_turn updated?
 */
async function updateGameState(gameState, currentTurn, gameId) {
    const [result] = await pool.execute(`UPDATE game SET game_state = ?, current_turn = ? WHERE game_id = ?;`, [JSON.stringify(gameState), currentTurn, gameId]);
    return result.affectedRows > 0;
}

/**
 * Update the database with the winner of the game.
 * @param {Integer} winnerId - UserId of the winner of the game.
 * @param {Integer} gameId - Game Id 
 * @returns True or False, Was the winner of the game updated?
 */
async function updateGameWinner(winnerId, gameId) {
    const [result] = await pool.execute(`UPDATE game SET winner_id = ? WHERE game_id = ?;`, [winnerId, gameId]);
    return result.affectedRows > 0;
}

// Export the functions to use in other files
module.exports = {
    getUserWithUsername,
    getUsernameById,
    getAllUsernames,
    addUser,
    deleteUser,

    getStoredSessionToken,
    addSessionToUser,

    sendLobbyMessage,
    getChallengeWithId,
    sendAChallenge,
    sendChallengeResponse,

    createConnectFourGame,
    getGameInformation,
    updateGameState,
    updateGameWinner,
};
