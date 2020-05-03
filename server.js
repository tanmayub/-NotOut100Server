// Setup basic express server
// Credits - https://github.com/Frankenmint/mmserver/tree/66fa53a583221d2dac53ec4a2de5a2631b2a9095
// Article - https://www.codementor.io/@codementorteam/socketio-multi-user-app-matchmaking-game-server-2-uexmnux4p

var express = require('express');
var GameCollection = require('./classes/GameCollection');
var GameObject = require('./classes/GameObject');
var Player = require('./classes/Player');
var maxPlayersAllowed = 20;
var maxLoopLimit = 20;
var app = express();
var fs = require('fs');
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 3000;

server.listen(port, function () {
  console.log('Server listening at port %d', port);
  fs.writeFile(__dirname + '/start.log', 'started', function(){console.log("returned")}); 
});

// Routing
app.use(express.static(__dirname));

// Entire GameCollection Object holds all games and info

var gameCollection =  new GameCollection();

var loopLimit = 0; 

function buildGame(socket) {
    var setUsers = new Set();
    setUsers.add(socket.username);
    var gameObject = new GameObject((Math.random()+1).toString(36).slice(2, 18), setUsers);
    gameCollection.TotalGameCount ++;
    gameCollection.GameList.push({gameObject});

    console.log("Game Created by "+ socket.username + " w/ " + gameObject.GameId);

    io.emit('gameCreated', {
        username: socket.username,
        gameId: gameObject.GameId
    });
};

function gameSeeker (socket) {
    ++loopLimit;
    
    if (gameCollection.TotalGameCount === 0 || loopLimit >= maxLoopLimit) {
        buildGame(socket);
        loopLimit = 0;
    }
     else {
        var rndPick = Math.floor(Math.random() * gameCollection.TotalGameCount);
        if (gameCollection.GameList[rndPick].gameObject.PlayerCt < maxPlayersAllowed){
            gameCollection.GameList[rndPick].gameObject.PlayerList.add(socket.username);
            socket.emit('joinSuccess', {
                gameId: gameCollection.GameList[rndPick].gameObject.GameId
            });
            gameCollection.GameList[rndPick].gameObject.PlayerCt++;
            console.log( socket.username + " has been added to: " + gameCollection.GameList[rndPick].gameObject.GameId);    
        } 
        else {
            gameSeeker(socket);
        }
    }
}

function killGame(socket) {
    var notInGame = true, destroyGame = false;
    var destroyGameId = 0, destroyGameIndex = -1;

    if(gameCollection.TotalGameCount > 0) {
        gameCollection.GameList.map((game, index) => {
            if(game.gameObject.PlayerList.has(socket.username) && game.gameObject.PlayerCt === 1) {
                destroyGame = true;
                destroyGameId = game.gameObject.GameId;
                destroyGameIndex = index;
            }
            else { // leave game
                RemoveUserFromActiveGames(socket.username);
            }
        });

        if(destroyGame) {
            DestroyGame(socket, destroyGameId, destroyGameIndex);
        }

        notInGame = false;
    }
  
    if (notInGame) {
        socket.emit('notInGame');
    }  
}

function DestroyGame(socket, destroyGameId, destroyGameIndex) {

    --gameCollection.TotalGameCount; 
    console.log("Destroy Game "+ destroyGameId + "!");
    gameCollection.GameList.splice(destroyGameIndex, 1);
    console.log(gameCollection.GameList);
    socket.emit('leftGame', { gameId: destroyGameId });
    io.emit('gameDestroyed', {gameId: destroyGameId, gameOwner: socket.username });
}

function RemoveUserFromActiveGames(socket) {
    var destroyGame = false;
    var destroyGameId = 0, destroyGameIndex = -1;

    if(gameCollection.TotalGameCount > 0) {
        gameCollection.GameList.map((game, index) => {
            if(game.gameObject.PlayerList.has(socket)) {
                game.gameObject.PlayerList.remove(socket);
                game.gameObject.PlayerCt--;
                if(game.gameObject.PlayerCt === 1) {
                    destroyGame = true;
                    destroyGameId = game.GameId;
                    destroyGameIndex = index;
                }
            }
        });

        if(destroyGame) {
            DestroyGame(socket, destroyGameId, destroyGameIndex);
        }
    }
}




// Chatroom

var numUsers = 0;

io.on('connection', function (socket) {
  var addedUser = false;

  // when the client emits 'new message', this listens and executes
    socket.on('new message', function (data) {
        // we tell the client to execute 'new message'
        socket.broadcast.emit('new message', {
            username: socket.username,
            message: data
        });
    });

    // when the client emits 'add user', this listens and executes
    socket.on('add user', function (username) {
        if (addedUser) return;

        // we store the username in the socket session for this client
        socket.username = username;
        ++numUsers;
        addedUser = true;
        socket.emit('login', {
            numUsers: numUsers,
            lobbies: gameCollection.GameList
        });
        // echo globally (all clients) that a person has connected
        socket.broadcast.emit('user joined', {
            username: socket.username,
            numUsers: numUsers
        });
    });

    // when the client emits 'typing', we broadcast it to others
    socket.on('typing', function () {
        socket.broadcast.emit('typing', {
            username: socket.username
        });
    });

    // when the client emits 'stop typing', we broadcast it to others
    socket.on('stop typing', function () {
        socket.broadcast.emit('stop typing', {
            username: socket.username
        });
    });

    // when the user disconnects.. perform this
    socket.on('disconnect', function () {
        if (addedUser) {
            --numUsers;
            RemoveUserFromActiveGames(socket);
            // echo globally that this client has left
            socket.broadcast.emit('user left', {
                username: socket.username,
                numUsers: numUsers
            });
        }
    });

    socket.on('joinGame', function () {
        console.log(socket.username + " wants to join a game");
        
        var alreadyInGame = false;
        
        if(gameCollection.TotalGameCount > 0) {
            gameCollection.GameList.map(game => {
                if(game.gameObject.PlayerList && game.gameObject.PlayerList.has(socket.username)) {
                    console.log(socket.username + " already has a Game!");
    
                    socket.emit('alreadyJoined', {
                        gameId: game.gameObject.GameId
                    });
                    alreadyInGame = true;
                }
            });
        }

        if (!alreadyInGame) {            
            console.log("Add them into a Game!!!");
            gameSeeker(socket);
        }
    });

    socket.on('leaveGame', function() {
        if (gameCollection.TotalGameCount == 0){
           socket.emit('notInGame');         
        }    
        else {
          killGame(socket);
        }    
    });

});