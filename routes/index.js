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

    socket.on('disconnect', function () {
        io.to(socket.room).emit('users-changed', {user: socket.user, event: 'left'});
        updateAndEmitUserList();
    });


    socket.on('joinRoomRequest', (data) => {
        //TODO Check for existing sessions and join them
        socket.join(data.room, () => {
            socket.to(socket.room).emit('users-changed', {user: socket.user, event: 'joined'});
            updateAndEmitUserList();
        });

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
