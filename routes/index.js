let app = require('express')();
let http = require('http').Server(app);
let io = require('socket.io')(http);

let gameMap = new Map();

io.on('connection', (socket) => {

    let updateAndEmitUserListOfRoom = function (room, emitToSocket) {

        if (!socket.user) return;

        io.in(room).clients((error, clients) => {
            if (error) throw error;

            let userList = [];
            clients.forEach(function (client) {
                userList.push(io.sockets.connected[client].user)
            })

            //refresh player list in game object
            gameMap.get(room).players = userList;


            //only send to one client
            if (emitToSocket) {
                socket.emit('gameUpdate', {game: gameMap.get(room)});
            } else {
                console.log("emitting game: " + JSON.stringify(gameMap.get(room)));
                io.in(room).emit('gameUpdate', {game: gameMap.get(room)});
            }

        })
    }

    let setNewRandomAdmin = function () {

        io.in(socket.room).clients((error, clients) => {
            if (error) throw error;
            const randomClientId = clients[Math.floor(Math.random() * clients.length)];
            let randomUser = io.sockets.connected[randomClientId].user;
            gameMap.get(socket.room).admin = randomUser;
        });
    }

    let isRoomEmpty = function (name) {
        return io.sockets.adapter.rooms[name] === undefined;
    }


    socket.on('disconnect', function () {
        if (!socket.user) return;

        console.log("Socket disconnects: " + JSON.stringify(socket.user))
        if (isRoomEmpty(socket.room)) {
            // if room is empty delete it from session array
            console.log("no one is in the room anymore.. Deleting room")
            gameMap.set(socket.room, undefined);

        } else {
            if (socket.user === gameMap.get(socket.room).admin) {
                console.log("admin left");
                setNewRandomAdmin();
            }
            if (socket.room) {
                io.to(socket.room).emit('users-changed', {user: socket.user, event: 'left'});
                updateAndEmitUserListOfRoom(socket.room);
            }
        }

    });

    socket.on('startGame', function () {
        io.in(socket.room).emit('gameStarted');
    });


    socket.on('joinRoomRequest', (data) => {
        socket.user = data.user;


        console.log(socket.user.name + " want's to join " + data.room)

        //room already exists, so join it
        if (!isRoomEmpty(data.room)) {
            socket.join(data.room, () => {
                //set socket basic data
                socket.room = data.room;
                console.log(socket.user.name + " joined: " + socket.room);

                socket.to(socket.room).emit('users-changed', {user: socket.user, event: 'joined'});
                socket.emit('roomJoinSucceed', {room: socket.room, game: gameMap.get(socket.room)});
                updateAndEmitUserListOfRoom(socket.room);
            });

        }
        else {
            console.log(data.room + " does not exist")
            socket.emit('noSuchRoom');
        }

    });

    socket.on('createRoomRequest', (data) => {
        socket.user = data.user;
        console.log(JSON.stringify(socket.user) + " want's to create " + data.room);

        if (!isRoomEmpty(data.room)) {
            socket.emit('roomAlreadyExists');
        }
        else {
            socket.join(data.room, () => {
                //set socket basic data
                socket.room = data.room;

                console.log("emitting update user: " + JSON.stringify(socket.user))
                socket.emit('updateUser', {user: socket.user});

                let game = {
                    players: [],
                    admin: socket.user,
                    categories: data.categories,
                    themes: data.themes,
                    cardsPerGame: data.cardsPerGame,
                    currentCard: {}
                }

                gameMap.set(data.room, game);
                console.log(socket.room + " created!");

                for (let [key, value] of gameMap) {
                    console.log(key + " = " + value);
                }

                socket.emit('roomCreated', {room: socket.room, game: game});

            });
        }
    })


    socket.on('leaveRoom', () => {
        socket.leave(socket.room, () => {
            console.log(JSON.stringify(socket.user) + " left room " + socket.room);
            if (isRoomEmpty(socket.room)) {
                // if room is empty delete it from session array
                console.log("no one is in the room anymore..")
                gameMap.set(socket.room, undefined);
            } else {
                if (socket.user.isAdmin) {
                    console.log("admin left");
                    setNewRandomAdmin();
                    socket.user.isAdmin = false;
                    socket.emit('updateUser', {user: socket.user});
                }

                console.log("emit user change: " + socket.room)
                io.to(socket.room).emit('users-changed', {user: socket.user, event: 'left'});


                const room = socket.room;
                socket.room = '';
                updateAndEmitUserListOfRoom(room);
            }


        });
    })


    socket.on('requestUserList', () => {
        console.log(socket.user + " requests user list");
        updateAndEmitUserListOfRoom(socket.room, "Only emit to requester");
    });

    socket.on('requestAvatarList', () => {
        const avatarFolder = './img/avatar';
        const fs = require('fs');
        let avatarFileNames = [];

        fs.readdir(avatarFolder, (err, files) => {
            files.forEach(fileName => {
                if (!err && fileName !== '')
                    avatarFileNames.push(fileName);
            });
            socket.emit('receiveAvatarList', {avatarFileNames: avatarFileNames});
        })


    })

    socket.on('setSocketUser', (data) => {
        console.log("set socket user " + JSON.stringify(data.user))
        socket.user = data.user;
    });

    socket.on('userNameChanged', (data) => {
        console.log(JSON.stringify(socket.user.name) + " changes name to " + data.newName);
        socket.user.name = data.newName;
        //if socket is in room inform others about changes
        if (socket.room) {
            updateAndEmitUserListOfRoom(socket.room);
        }
    });

    socket.on('avatarChanged', (data) => {
        console.log(JSON.stringify(socket.user) + " changes avatar to " + data.newAvatar);
        socket.user.avatar = data.newAvatar;
        console.log(JSON.stringify(socket.user))
        //if socket is in room inform others about changes
        if (socket.room) {
            updateAndEmitUserListOfRoom(socket.room);
        }
    });

})
;


let port = process.env.PORT || 3001;

http.listen(port, function () {
    console.log('listening on http://localhost:' + port);
});

