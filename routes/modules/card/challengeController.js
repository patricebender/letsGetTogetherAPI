module.exports = function challengeController(io, socket, gameController) {
	const closeAndEmitChallenge = function () {
		const challenge = gameController.getGameSession().currentCard;
		challenge.closed = true;
		console.log(`Everyone has answered. Emitting Results for Challenge: ${JSON.stringify(challenge.title)}`);


		const { upVotes } = challenge;
		const { downVotes } = challenge;
		console.log(`upVotes x ${upVotes} \n`
			+ `downVotes x ${downVotes}`);

		if (downVotes >= upVotes) {
			challenge.failed = true;
		} else {
			challenge.failed = false;
			gameController.emitSipsTo(challenge.player.socketId, challenge.sips);
		}

		gameController.updateAndEmitGame(socket.room);
	};

	socket.on("challengeAccepted", () => {
		if (!socket.user || !socket.room) return;

		const challenge = gameController.getCurrentCard();
		console.log(`${socket.user.name}accepted the challenge. `);

		challenge.isAccepted = true;
		gameController.updateAndEmitGame(socket.room);
	});

	socket.on("challengeDeclined", () => {
		if (!socket.user || !socket.room) return;


		const challenge = gameController.getCurrentCard();

		console.log(`${socket.user.name}declined the challenge. `);
		gameController.emitSipsTo(socket.user.socketId, challenge.sips);

		challenge.isDeclined = true;
		challenge.closed = true;
		gameController.updateAndEmitGame(socket.room);
	});

	socket.on("challengedPlayerLeaves", () => {
		console.log("challengedPlayerLeaves");
	});

	socket.on("challengeVote", (data) => {
		if (!socket.user || !socket.room) return;
		socket.user.hasAnswered = true;
		const challenge = gameController.getCurrentCard();

		const upVote = !!data.success;
		console.log(socket.user.name, upVote ? "up" : "down", "votes challenge");
		if (upVote) challenge.upVotes++;
		else challenge.downVotes++;

		gameController.waitForUsers()
			.then((users) => {
				// -1 => don't wait for challenged player
				challenge.playerLeftCount = users.length - 1;
				if (challenge.playerLeftCount === 0) {
					// close survey
					closeAndEmitChallenge();
				} else {
					console.log(`Wait for users to answer: ${JSON.stringify(users.length)}`);

					gameController.updateAndEmitGame(socket.room);
				}
			})
			.catch((error) => {
				console.log(error);
			});
	});


	return {
		closeAndEmit: closeAndEmitChallenge,
	};
};
