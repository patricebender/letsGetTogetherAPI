module.exports = function (io, socket, gameHelper, session, curseController) {

	const guessController = require("./card/guessController")(io, socket, gameHelper, session);
	const challengeController = require("./card/challengeController")(io, socket, gameHelper, session);
	const quizController = require("./card/quizController")(io, socket, gameHelper, session);
	const surveyController = require("./card/surveyController")(io, socket, gameHelper, session);

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


	const closeAndEmitCurrentCard = function () {
		const currentCategory = gameHelper.getCurrentCard().category;
		switch (currentCategory) {
		case "guess":
			guessController.closeAndEmitGuess();
			break;
		case "quiz":
			quizController.closeAndEmit();
			break;
		case "survey":
			surveyController.closeAndEmit();
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
