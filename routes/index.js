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
            console.log(userList);
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
        });
    }

    let isRoomEmpty = function (name) {
        return io.sockets.adapter.rooms[name] === undefined;
    }

    socket.on('disconnect', function () {
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

        //set socket basic data
        socket.room = data.room;
        socket.user = data.user;

        //room already exists, so join it
        if (!isRoomEmpty(data.room)) {
            socket.join(data.room, () => {
                socket.to(socket.room).emit('users-changed', {user: socket.user, event: 'joined'});
                socket.emit('roomJoinSucceed', {room: socket.room, user: socket.user});
                updateAndEmitUserList();
            });
        }
        //no one is in the room so the current client becomes room admin
        else {
            socket.join(data.room, () => {
                socket.user.isAdmin = true;
                socket.to(socket.room).emit('users-changed', {user: socket.user, event: 'joined'});
                socket.emit('roomJoinSucceed', {room: socket.room, user: socket.user});
            });
        }


        console.log(socket.user.name + " joined: " + socket.room);

    });

    socket.on('requestUserList', () => {
        updateAndEmitUserList("Only emit to requester");
    });


});


let port = process.env.PORT || 3001;

http.listen(port, function () {
    console.log('listening on http://localhost:' + port);
});
