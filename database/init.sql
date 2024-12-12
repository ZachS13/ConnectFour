-- This will be the file to initialize the database.
DROP DATABASE IF EXISTS connectFour;
CREATE DATABASE connectFour;
USE connectFour;

-- user table will hold all of the user information.
CREATE TABLE users (
    user_id     INT                 PRIMARY KEY AUTO_INCREMENT,
    username    VARCHAR(50)         NOT NULL UNIQUE,
    password    VARBINARY(128)      NOT NULL,
    last_login  TIMESTAMP           DEFAULT CURRENT_TIMESTAMP
);

-- session table will hold all of the session data.
CREATE TABLE session (
    session_id  INT             NOT NULL    PRIMARY KEY AUTO_INCREMENT,
    user_id     INT,
    token       CHAR(192)       NOT NULL,
    expr_date   TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- chatMessage table will hold all of the chat information
CREATE TABLE chatMessage (
    message_id  INT         PRIMARY KEY AUTO_INCREMENT,
    sender_id   INT,
    message     TEXT,
    time_sent   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- challenge table will hold the challenge request that is sent to a specific user like a message
CREATE TABLE challenge (
    challenge_id    INT         PRIMARY KEY AUTO_INCREMENT,
    sender_id       INT,
    challenger_id   INT,
    accept_deny     BOOLEAN     DEFAULT NULL,
    FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (challenger_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CHECK (sender_id != challenger_id)
);

-- game table will hold the information regarding who's playing, who won, etc.
CREATE TABLE game (
    game_id         INT         PRIMARY KEY AUTO_INCREMENT,
    player1_id      INT,
    player2_id      INT,
    current_turn    INT,
    winner_id       INT         DEFAULT NULL,
    created_at      TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    ended_at        TIMESTAMP   DEFAULT NULL,
    game_state      JSON        DEFAULT NULL,
    FOREIGN KEY (player1_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (player2_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (current_turn) REFERENCES users(user_id),
    FOREIGN KEY (winner_id) REFERENCES users(user_id),
    CHECK (player1_id != player2_id)
);

CREATE TABLE move (
    move_id     INT         PRIMARY KEY AUTO_INCREMENT,
    game_id     INT,
    player_id   INT,
    column_num  INT,
    move_num    INT,
    move_time   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES game(game_id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES users(user_id),
    CHECK (column_num BETWEEN 0 AND 6)
);
