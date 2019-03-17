module.exports = function challengeController(io, socket, gameController) {

	const closeAndEmitSurvey = function () {
		const survey = gameController.getCurrentCard();
		survey.closed = true;
		console.log(`Everyone has answered. Emitting Results for Survey: ${JSON.stringify(survey.question)}`);


		const firstOption = survey.options[0];
		const secondOption = survey.options[1];

		console.log(`${firstOption.title} x${firstOption.voters.length}`, `${secondOption.title} x${secondOption.voters.length}`);

		const losers = firstOption.voters.length > secondOption.voters.length
			? survey.options[1].voters
			: secondOption.voters.length > firstOption.voters.length
				? survey.options[0].voters : [];


		console.log(`LOSERS ARE: ${JSON.stringify(losers)}`);

		losers.forEach((loser) => {
			gameController.emitSipsTo(loser.socketId);
		});

		// noinspection JSUnresolvedFunction
		io.in(socket.room).emit("surveyResults", { survey: survey, losers: losers });
		gameController.updateAndEmitGame(socket.room);
	};

	socket.on("surveyAnswer", (data) => {
		if (!socket.user || !socket.room) return;

		const survey = gameController.getCurrentCard();

		const userAnswer = data.answer;

		socket.user.hasAnswered = true;
		survey.answerCount++;

		console.log(`${JSON.stringify(socket.user.name)} answered ${data.survey.question} \n with option: ${data.answer} \n`
			+ `in room: ${socket.room}`);

		// add user answer to currentCard in game
		survey.options.forEach((option) => {
			if (option.title === userAnswer) {
				option.voters.push(socket.user);
				option.answerCount++;
			}
		});

		gameController.waitForUsers()
			.then((users) => {
				survey.playerLeftCount = users.length;
				if (users.length === 0) {
					// close survey
					closeAndEmitSurvey();
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
		closeAndEmit: closeAndEmitSurvey,
	};
};
