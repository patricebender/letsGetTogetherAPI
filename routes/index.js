let app = require('express')();
let http = require('http').Server(app);
let io = require('socket.io')(http);


io.on('connection', (socket) => {

    let updateAndEmitUserListOfRoom = function (room, emitToSocket) {
        io.in(room).clients((error, clients) => {
            if (error) throw error;

            let userList = [];
            clients.forEach(function (client) {
                userList.push(io.sockets.connected[client].user)
            })
            //only send to one client
            if (emitToSocket) {
                socket.emit('receiveUserList', {userList: userList});
            } else {
                io.in(room).emit('receiveUserList', {userList: userList});
            }

        })
    }

    let setNewRandomAdmin = function () {

        io.in(socket.room).clients((error, clients) => {
            if (error) throw error;
            const randomClientId = clients[Math.floor(Math.random() * clients.length)];
            let randomUser = io.sockets.connected[randomClientId].user;
            randomUser.isAdmin = true;
            io.to(randomClientId).emit('adminPromotion');
        });
    }

    let isRoomEmpty = function (name) {
        return io.sockets.adapter.rooms[name] === undefined;
    }


    socket.on('disconnect', function () {
        console.log("Socket disconnects: " + JSON.stringify(socket.user))

        if (!isRoomEmpty(socket.room) && socket.user.isAdmin) {
            console.log("admin left");
            setNewRandomAdmin();
        }
        if (socket.room) {
            io.to(socket.room).emit('users-changed', {user: socket.user, event: 'left'});
            updateAndEmitUserListOfRoom(socket.room);
        }
    });

    socket.on('startGame', function () {
        socket.game
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
                socket.user.isAdmin = false;

                socket.to(socket.room).emit('users-changed', {user: socket.user, event: 'joined'});
                socket.emit('roomJoinSucceed', {room: socket.room, user: socket.user});
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
                socket.user.isAdmin = true;
                //set socket basic data
                socket.room = data.room;
                //set game data
                socket.game = data.game;

                console.log("emitting update user: " + JSON.stringify(socket.user))
                socket.emit('updateUser', {user: socket.user});
                socket.emit('roomCreated', {room: socket.room});

                console.log(socket.room + " created!")
            });
        }
    })

    socket.on('leaveRoom', () => {
        socket.leave(socket.room, () => {
            console.log(JSON.stringify(socket.user) + " left room " + socket.room);
            if (!isRoomEmpty(socket.room) && socket.user.isAdmin) {
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

