module.exports = function (io, socket) {
	return {
		// returns all users who have not answered yet
		waitForUsers: function () {
			return new Promise((resolve) => {
				const users = [];
				io.in(socket.room).clients((error, clients) => {
					clients.forEach((client) => {
						if (!io.sockets.connected[client].user.hasAnswered) {
							users.push(io.sockets.connected[client].user);
						}
					});
				});
				resolve(users);
			});
		},

	};
};
