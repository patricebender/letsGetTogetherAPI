module.exports = function challengeController(io, socket, gameController) {

	const compareQuizAnswer = function (rankingA, rankingB) {
		// compare quiz answers. if both are correct / incorrect the time decides who won
		const isCorrectA = rankingA.answer.isCorrect;
		const isCorrectB = rankingB.answer.isCorrect;

		const timeA = rankingA.time;
		const timeB = rankingB.time;

		if ((isCorrectA && isCorrectB) || (!isCorrectA && !isCorrectB)) {
			if (timeA < timeB) return -1;
			if (timeB < timeA) return 1;
		} else if (isCorrectA) return -1;
		else return 1;

		return 0;
	};
	const closeAndEmitQuiz = function () {
		const quiz = gameController.getCurrentCard();

		console.log("Everyone has answered.");
		quiz.closed = true;

		const quizRanking = quiz.ranking;

		quizRanking.sort(compareQuizAnswer);


		// everyone answered correct, so the slowest player drink
		if (quiz.wrongAnswerCount === 0) {
			console.log("everyone answered correctly, slowest player drink");
			gameController.emitSipsTo(quizRanking[quizRanking.length - 1].player.socketId);
			quizRanking[quizRanking.length - 1].sips = quizRanking[quizRanking.length - 1].player.multiplier * 1;
		}
		// everyone with wrong answer drink
		quizRanking.forEach((rank) => {
			if (!rank.answer.isCorrect) {
				rank.sips = rank.player.multiplier * 1;
				gameController.emitSipsTo(rank.player.socketId);
			}
		});


		console.log(JSON.stringify(quizRanking));


		io.in(socket.room).emit("quizResults", { quiz: quiz, ranking: quizRanking });
		gameController.updateAndEmitGame(socket.room);
	};

	socket.on("quizAnswer", (data) => {
		if (!socket.user || !socket.room) return;
		const quiz = gameController.getCurrentCard();

		const isCorrectAnswer = data.answer.isCorrect;

		console.log(`${socket.user.name} answered ${quiz.question}${isCorrectAnswer ? " correct " : " wrong "}with answer: ${data.answer.text}\n`
			+ `time: ${data.time}`);


		socket.user.hasAnswered = true;


		quiz.answerCount++;

		if (!isCorrectAnswer) {
			quiz.wrongAnswerCount++;
		}

		// add user answer to currentCard in game
		quiz.ranking.push({
			time: data.time,
			player: socket.user,
			sips: 0,
			answer: data.answer,
		});


		gameController.waitForUsers()
			.then((users) => {
				quiz.playerLeftCount = users.length;
				if (users.length === 0) {
					// close quiz
					closeAndEmitQuiz();
				} else {
					console.log(`Wait for users to answer: ${JSON.stringify(users.length)}`);
					gameController.updateAndEmitGame(socket.room);
				}
			});
	});

	return {
		closeAndEmit: closeAndEmitQuiz,
	};
};
