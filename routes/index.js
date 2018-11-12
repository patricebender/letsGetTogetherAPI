let app = require('express')();
let http = require('http').Server(app);
let io = require('socket.io')(http);


io.on('connection', (socket) => {

    let updateAndEmitUserList = function (emitToSocket) {


        io.in(socket.room).clients((error, clients) => {
            if (error) throw error;

            let userList = [];
            clients.forEach(function (client) {
                userList.push(io.sockets.connected[client].user)
            })
            //only send to one client
            if (emitToSocket) {
                socket.emit('receiveUserList', {userList: userList});
            } else {
                io.in(socket.room).emit('receiveUserList', {userList: userList});
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
            updateAndEmitUserList();
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
        io.to(socket.room).emit('users-changed', {user: socket.user, event: 'left'});
        updateAndEmitUserList();
    });

    socket.on('startGame', function () {
        io.in(socket.room).emit('gameStarted');
    });


    socket.on('joinRoomRequest', (data) => {
        //TODO Check for duplicate user
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
                updateAndEmitUserList();
            });

        }
        else {
            console.log(data.room + " does not exist")
            socket.emit('noSuchRoom');
        }

    });

    socket.on('createRoomRequest', (data) => {
        console.log(JSON.stringify(socket.user.name) + " want's to create " + data.room);

        if (!isRoomEmpty(data.room)) {
            socket.emit('roomAlreadyExists');
        }
        else {
            socket.join(data.room, () => {
                socket.user.isAdmin = true;
                //set socket basic data
                socket.room = data.room;

                console.log("emitting update user: "+ JSON.stringify(socket.user))
                socket.emit('updateUser', {user: socket.user});
                socket.emit('roomCreated', {room: socket.room});

                console.log(socket.room + " created!")
            });
        }
    })

    socket.on('leaveRoom', () => {
        socket.leave(socket.room, () => {
            console.log(socket.user.name + " left room " + socket.room);
            if (!isRoomEmpty(socket.room) && socket.user.isAdmin) {
                console.log("admin left");
                setNewRandomAdmin();
                socket.user.isAdmin = false;
                socket.emit('updateUser', {user: socket.user});
            }

            io.to(socket.room).emit('users-changed', {user: socket.user, event: 'left'});
        })
        updateAndEmitUserList();
    });


    socket.on('requestUserList', () => {
        console.log(socket.user.name + " requests user list")
        updateAndEmitUserList("Only emit to requester");
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
        console.log("set socket user" + data.user.name)
        socket.user = data.user;
    })

})
;


let port = process.env.PORT || 3001;

http.listen(port, function () {
    console.log('listening on http://localhost:' + port);
});

