module.exports = function challengeController(io, socket, gameHelper, session) {

	const closeAndEmitChallenge = function () {
		const challenge = gameHelper.getGameSession().currentCard;
		challenge.closed = true;
		console.log(`Everyone has answered. Emitting Results for Challenge: ${JSON.stringify(challenge.title)}`);


		const upVotes = challenge.upVotes;
		const downVotes = challenge.downVotes;
		console.log(`upVotes x ${upVotes} \n`
			+ `downVotes x ${downVotes}`);

		downVotes >= upVotes ? challenge.failed = true : challenge.failed = false;
		challenge.failed ? gameHelper.emitSipsTo(challenge.player.socketId, 5) : "";

		gameHelper.updateAndEmitGame(socket.room);
	};

	socket.on("challengeAccepted", () => {
		if (!socket.user || !socket.room) return;

		const challenge = gameHelper.getCurrentCard();
		console.log(`${socket.user.name}accepted the challenge. `);

		challenge.isAccepted = true;
		gameHelper.updateAndEmitGame(socket.room);
	});

	socket.on("challengeDeclined", () => {
		if (!socket.user || !socket.room) return;


		const challenge = gameHelper.getCurrentCard();

		console.log(`${socket.user.name}declined the challenge. `);
		gameHelper.emitSipsTo(socket.user.socketId, challenge.sips);

		challenge.isDeclined = true;
		challenge.closed = true;
		gameHelper.updateAndEmitGame(socket.room);
	});

	socket.on("challengedPlayerLeaves", () => {
		console.log("challengedPlayerLeaves");
	});

	socket.on("challengeVote", (data) => {
		if (!socket.user || !socket.room) return;
		socket.user.hasAnswered = true;
		const challenge = gameHelper.getCurrentCard();

		const upVote = !!data.success;
		console.log(socket.user.name, upVote ? "up" : "down", "votes challenge");
		upVote ? challenge.upVotes++ : challenge.downVotes++;

		session.waitForUsers()
			.then((users) => {
				// -1 => dont wait for challenged player
				challenge.playerLeftCount = users.length - 1;
				if (challenge.playerLeftCount === 0) {
					// close survey
					closeAndEmitChallenge();
				} else {
					console.log(`Wait for users to answer: ${JSON.stringify(users.length)}`);

					gameHelper.updateAndEmitGame(socket.room);
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
