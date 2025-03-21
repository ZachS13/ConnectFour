const API_URL = '://localhost:3000';
const urlParams = new URLSearchParams(window.location.search);
/**
 * Check if the session variables are set, if they're
 * not, redirect to the login page. If they are, use the
 * checksum.
 */
const userId = localStorage.getItem('userId'),
    sessionId = localStorage.getItem('sessionId');
let username = '';
if (!userId || !sessionId) {
    window.location = './login.html';
}
try {
    const responseSession = await fetch(`http${API_URL}/checkSession`, {
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

const socket = io(`http${API_URL}`, {
    query: { userId: userId }
});

const gameId = urlParams.get("gameId");

socket.emit("joinGame", gameId)

const svgns = `http://www.w3.org/2000/svg`;

/**
 * document.getElementById helper function.
 * @param {String} id - Id of the element
 * @returns The element.
 */
function $(id) {
    return document.getElementById(id);
}

// GAME will hold all of the game logic, placing the piece, checking for wins, etc.
const GAME = (function () {
    const COLS = 7,                         // number columns       (7 is the normal board)
          ROWS = 6,                         // number rows          (6 is the normal board)
          colWidth = 100,                   // width of the column 
          pieceRadius = (colWidth / 2.5),   // size of each circle 
          boardWidth = COLS * colWidth,     // width of the board
          boardHeight = ROWS * colWidth,    // height of the board
          offset = colWidth / 2;            // offset is half of the colWidth

    let board = [],             // Board is the gameState of the game being played
        player1,                // Player 1 for the game.
        player2,                // Player 2 for the game.
        currentTurn;            // Who's turn it is (user_id)
    
    // Creates the empty board (2d array full of null values)
    async function init() {
        // Get the board from the database, should just be an empty 6x7 2d array.
        let response = await getGameInformation(gameId);
        console.log(response);
        board = response.game_state;
        player1 = response.player1_id;
        player2 = response.player2_id;
        currentTurn = response.current_turn;

        console.log(board. player1, player2, currentTurn);
        drawBoard();
    }

    // Draws the board.
    function drawBoard() {
        // Create the SVG element
        const svg = document.createElementNS(svgns, "svg");
        svg.setAttribute("width", boardWidth);
        svg.setAttribute("height", boardHeight);

        // Create the groups
        const gameBaord = document.createElementNS(svgns, `g`);
        gameBaord.setAttribute(`id`, `board`);

        svg.appendChild(gameBaord);
        $(`game`).appendChild(svg);

        // Background for the board
        const background = document.createElementNS(svgns, `rect`);
        background.setAttribute(`width`, `${boardWidth}px`);
        background.setAttribute(`height`, `${boardHeight}px`);
        background.setAttribute(`fill`, `lightblue`);
        background.setAttribute(`stroke`, `blue`);
        background.setAttribute(`stroke-width`, 5);
        $(`board`).appendChild(background);

        // Draw the Connect 4 grid with column separation through cell stroke
        for (let col = 0; col < COLS; col++) {
            for (let row = 0; row < ROWS; row++) {
                const x = col * colWidth + (offset);  // Adjust X to center circle in the column
                const y = row * colWidth + offset;
                let cellValue = board[row][col];      // Grabs the value from the board from database (probably null)

                new Circle({
                    cx: x,
                    cy: y,
                    col: col,
                    row: row,
                    playerId: cellValue,
                });
            }

            // column "hit box", when hovering over the column it will turn to a light blue
            new ClearCol(col);
        }
    }

    function Circle(parameters) {
        this.cx = parameters.cx;
        this.cy = parameters.cy;
        this.col = parameters.col;
        this.row = parameters.row;
        this.playerId = parameters.playerId;

        const cir = document.createElementNS(svgns, `circle`);
        cir.setAttribute(`id`, `cell_${this.col}_${this.row}`);
        cir.setAttribute(`class`, `cell`);
        cir.setAttribute(`r`, pieceRadius);
        cir.setAttribute(`cx`, this.cx);
        cir.setAttribute(`cy`, this.cy);
        $(`board`).appendChild(cir);

        if (this.playerId && this.playerId === player1) {
            ClearCol.placePiece(this.row, this.col);
        } else if (this.playerId && this.playerId === player2) {
            ClearCol.placePiece(this.row, this.col);
        }
    }

    // Seperating the clear column from the drawBoard function.
    function ClearCol(col) {
        this.col = col;
        this.x = this.col * colWidth;

        this.makeClearColumn();
    }

    ClearCol.prototype.makeClearColumn = function () {
        // Make the played group
        const played = document.createElementNS(svgns, `g`);
        played.setAttribute(`id`, `played_${this.col}`);
        $(`board`).appendChild(played);


        // Create the column 
        const column = document.createElementNS(svgns, `rect`);
        column.setAttribute(`id`, `col_${this.col}`);
        column.setAttribute(`x`, this.x);
        column.setAttribute(`y`, 0);
        column.setAttribute(`width`, colWidth);
        column.setAttribute(`height`, boardHeight);
        column.setAttribute('fill', `transparent`);
        column.setAttribute(`stroke`, `blue`);

        // This is to handle a piece being played
        // column.onclick = () => this.placePiece();
        column.addEventListener(`click`, (() => (this.placePiece())));

        // Create the hover over effect on the column 
        const mouseOver = document.createElementNS(svgns, `animate`);
        mouseOver.setAttribute(`attributeName`, `fill`);
        mouseOver.setAttribute(`dur`, `.25s`);
        mouseOver.setAttribute(`from`, `transparent`);
        mouseOver.setAttribute(`to`, `rgba(173, 216, 230, 0.35)`);
        mouseOver.setAttribute(`begin`, `col_${this.col}.mouseover`);
        mouseOver.setAttribute(`fill`, `freeze`);

        // reverts back to normal when you leave the column
        const mouseOut = document.createElementNS(svgns, `animate`);
        mouseOut.setAttribute(`attributeName`, `fill`);
        mouseOut.setAttribute(`dur`, `.25s`);
        mouseOut.setAttribute(`from`, `rgba(173, 216, 230, 0.35)`);
        mouseOut.setAttribute(`to`, `transparent`);
        mouseOut.setAttribute(`begin`, `col_${this.col}.mouseout`);
        mouseOut.setAttribute(`fill`, `freeze`);

        // add the animations and add to the DOM
        column.appendChild(mouseOver);
        column.appendChild(mouseOut);
        console.log(this);
        $(`board`).appendChild(column);
    }

    // When you drag the piece over the column and let go, it will drop the piece in the column to the first empty place
    ClearCol.prototype.placePiece = function () {
        console.log(this.col);
        for (let row = ROWS - 1; row >= 0; row--) {
            this.row = row;
            if (!board[row][this.col]) {
                board[this.row][this.col] = currentTurn; // update the memory
                this.drawPiece(this.row, this.col);        // update the DOM
                if (checkWin(this.row, this.col)) {
                    winnerModal(currentTurn);
                    alert(`${currentTurn.toUpperCase()} wins!`);
                }
                currentTurn === player1 ? player2 : player1;  // Switch player
                break;
            }
        }
    }

    // Draws the piece on top of the circle in the row and column
    ClearCol.prototype.drawPiece = function () {
        const x = this.col * colWidth + offset;
        const y = this.row * colWidth + offset;

        const color = currentPlayer;

        // adding the piece to the 'played_{col}' so the transparent box is on top of the piece.
        const piece = `<circle cx="${x}" cy="${y}" r="${pieceRadius}" class="${color}" />`;
        $(`played_${this.col}`).innerHTML += piece;
    }

    /**
     * Given the row and column of theg last piece placed, check if it is a winning move.
     * @param {Integer} row - Piece was placed in this row.
     * @param {Integer} col - Piece was placed in this column. 
     * @returns {boolean} Was the pice placed a winning move?
     */
    function checkWin(row, col) {
        return checkDirection(row, col, 1, 0) ||  // Horizontal -
               checkDirection(row, col, 0, 1) ||  // Vertical |
               checkDirection(row, col, 1, 1) ||  // Diagonal /
               checkDirection(row, col, 1, -1);   // Diagonal \
    }

    /**
     * 
     * @param {Integer} row - Piece was place in this row.
     * @param {Integer} col - Piece was placed in this column.
     * @param {Integer} rowDir - Row direction to check (1 = up, -1 = down, 0 = same)
     * @param {Integer} colDir - Column direction to check (1 = right, -1 = left, 0 = same)
     * @returns {boolean} Is there 4 same colored pieces in a row?
     */
    function checkDirection(row, col, rowDir, colDir) {
        let count = 0;
        for (let i = -3; i <= 3; i++) {
            const r = row + i * rowDir;
            const c = col + i * colDir;
            if (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === currentPlayer) {
                count++;
                if (count === 4) { return true };
            } else {
                count = 0;
            }
        }
        return false;
    }

    /**
     * Who won the game and make a modal instead of an alert.
     * @param {String} winner - Currently just a string of the color.
     */
    function winnerModal(winner) {
        const modal = createElement(`div`);
        modal.setAttribute(`id`, `winnnerModal`);
        
        const title = createElement(`h2`);
        title.textContent = `${winner} has won the game!`;

        modal.appendChild(title);
        $(`winner`).appendChild(modal);
    }

    /**
     * Sends a request to the API to get the game information of the specific game_id.
     * @param {Integer} gameId - Game_id of the current game being played.
     * @returns Response from the server with the game information on the specific game_id.
     */
    async function getGameInformation(gameId) {
        let response = await fetch(`http${API_URL}/getGameInformation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId })
        });

        if (!response || response === undefined) {
            console.log('There was an error getting the game information.');
        }
        response = await response.json();
        return response.message;
    }

    return {
        init: init,
    }
})();

// CHAT will hold all of the logic for the game chat
const CHAT = (function () {
    function init() {
        const chatDiv = document.getElementById('gameChat'),
              messageInput = document.getElementById('messageInput'),
              sendBtn = document.getElementById('sendBtn');

        socket.on("gameChat", (data) => {
            const msg = document.createElement('div');
            const mess = data.message;

            msg.innerHTML = mess || "Empty message";  // Handle any edge cases
            chatDiv.appendChild(msg);

            chatDiv.scrollTop = chatDiv.scrollHeight;  // Scroll the chat to the bottom
        });
       
        // When the user clicks "Send"
        sendBtn.addEventListener('click', () => {
            if (messageInput.value.trim() !== '') {
                const text = `${username}: ${messageInput.value}`;
                const message = {
                    gameId: gameId,
                    message: text,
                };
                socket.emit("gameChat", message);
                messageInput.value = '';
            }
        });

        // Allow pressing Enter to send message
        messageInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                sendBtn.click();
            }
        });   
    }

    return {
        init: init
    }
})();

window.GAME = GAME;
window.CHAT = CHAT;