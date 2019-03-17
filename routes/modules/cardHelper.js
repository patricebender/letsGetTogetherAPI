module.exports = function (io, socket, gameHelper, session, curseController) {

	const guessController = require("./card/guessController")(io, socket, gameHelper, session);
	const challengeController = require("./card/challengeController")(io, socket, gameHelper, session);

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

	const emitRandomCard = function () {
		if (!socket.user || !socket.room) return;
		const game = gameHelper.getGameSession();

		if (gameHelper.cardsLeftInGame() > 0) {
			gameHelper.reduceCurseTime();

			// random value to determine wheter to cast a curse or not
			const random = Math.floor(Math.random() * 100);

			if (random > 90 && game.curseEnabled) {
				console.log("CURSE CARD, random: ", random);
				curseController.emitRandomCurse();
			} else {
				// category object with cards array
				const randomCategory = gameHelper.getRandomCategoryForGame(game);


				if (!randomCategory) {
					gameHelper.emitGameOver("Keine Karten mehr ☹️");
				} else {
					// remove and retrieve card from array
					const randomCard = gameHelper.getRandomCardForCategory(randomCategory);
					game.currentCard = randomCard;
					game.currentCategory = randomCard.category;

					if (game.currentCategory === "challenge") {
						io.in(socket.room).clients((error, clients) => {
							if (error) throw error;
							gameHelper.getCurrentCard().player = gameHelper.getRandomPlayers(1, clients)[0];
						});
					}


					console.log(`emitting ${JSON.stringify(randomCard.category)}`);
					io.in(socket.room).emit("newCard", { card: game.currentCard });
				}
			}

			// ++gameLogs.totalCards;
		} else {
			console.log(`\n no cards left..${JSON.stringify(game.cards)}`);
			gameHelper.emitGameOver("Keine Karten mehr Übrig ☹️");
		}
	};


	const closeAndEmitSurvey = function () {
		const survey = gameHelper.getCurrentCard();
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
			gameHelper.emitSipsTo(loser.socketId);
		});

		// noinspection JSUnresolvedFunction
		io.in(socket.room).emit("surveyResults", { survey: survey, losers: losers });
		gameHelper.updateAndEmitGame(socket.room);
	};

	const closeAndEmitQuiz = function () {
		const quiz = gameHelper.getCurrentCard();

		console.log("Everyone has answered.");
		quiz.closed = true;

		const quizRanking = quiz.ranking;

		quizRanking.sort(compareQuizAnswer);


		// everyone answered correct, so the slowest player drink
		if (quiz.wrongAnswerCount === 0) {
			console.log("everyone answered correctly, slowest player drink");
			gameHelper.emitSipsTo(quizRanking[quizRanking.length - 1].player.socketId);
			quizRanking[quizRanking.length - 1].sips = quizRanking[quizRanking.length - 1].player.multiplier * 1;
		}
		// everyone with wrong answer drink
		quizRanking.forEach((rank) => {
			if (!rank.answer.isCorrect) {
				rank.sips = rank.player.multiplier * 1;
				gameHelper.emitSipsTo(rank.player.socketId);
			}
		});


		console.log(JSON.stringify(quizRanking));


		io.in(socket.room).emit("quizResults", { quiz: quiz, ranking: quizRanking });
		gameHelper.updateAndEmitGame(socket.room);
	};

	const closeAndEmitCurrentCard = function () {
		const currentCategory = gameHelper.getCurrentCard().category;
		switch (currentCategory) {
		case "guess":
			guessController.closeAndEmitGuess();
			break;
		case "quiz":
			closeAndEmitQuiz();
			break;
		case "survey":
			closeAndEmitSurvey();
			break;
		case "challenge":
			challengeController.closeAndEmit();
			break;
		default:
			console.log(`${JSON.stringify(currentCategory)} is not known :O`);
		}
	};

	return {
		closeAndEmitCurrentCard: closeAndEmitCurrentCard,
		emitRandomCard,
	};
};
