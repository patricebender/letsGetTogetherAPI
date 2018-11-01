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

    let roomExists = function (room) {
        io.in(room).clients((error, clients) => {
            if (error) throw error;
            return clients.length > 0;
        });
    }

    socket.on('disconnect', function () {
        io.to(socket.room).emit('users-changed', {user: socket.user, event: 'left'});
        updateAndEmitUserList();
    });


    socket.on('joinRoomRequest', (data) => {
        //room already exists, so join it
        if (io.sockets.adapter.rooms[data.room]) {
            socket.join(data.room, () => {
                socket.to(socket.room).emit('users-changed', {user: socket.user, event: 'joined'});
                updateAndEmitUserList();
            });
        }
        //no one is in the room so the current client becomes room admin
        else {
            socket.join(data.room, () => {
                socket.user.isAdmin = true;
                socket.to(socket.room).emit('users-changed', {user: socket.user, event: 'joined'});
            });
        }


        //set socket basic data
        socket.room = data.room;
        socket.user = data.user;


        socket.emit('roomJoinSucceed');
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
