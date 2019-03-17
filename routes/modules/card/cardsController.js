module.exports = function (io, socket, gameController, curseController) {

	const guessController = require("./guessController")(io, socket, gameController);
	const challengeController = require("./challengeController")(io, socket, gameController);
	const quizController = require("./quizController")(io, socket, gameController);
	const surveyController = require("./surveyController")(io, socket, gameController);

	const emitRandomCard = function () {
		if (!socket.user || !socket.room) return;
		const game = gameController.getGameSession();

		if (gameController.cardsLeftInGame() > 0) {
			gameController.reduceCurseTime();

			// random value to determine wheter to cast a curse or not
			const random = Math.floor(Math.random() * 100);

			if (random > 90 && game.curseEnabled) {
				console.log("CURSE CARD, random: ", random);
				curseController.emitRandomCurse();
			} else {
				// category object with cards array
				const randomCategory = gameController.getRandomCategoryForGame(game);


				if (!randomCategory) {
					gameController.emitGameOver("Keine Karten mehr ☹️");
				} else {
					// remove and retrieve card from array
					const randomCard = gameController.getRandomCardForCategory(randomCategory);
					game.currentCard = randomCard;
					game.currentCategory = randomCard.category;

					if (game.currentCategory === "challenge") {
						io.in(socket.room).clients((error, clients) => {
							if (error) throw error;
							gameController.getCurrentCard().player = gameController.getRandomPlayers(1, clients)[0];
						});
					}


					console.log(`emitting ${JSON.stringify(randomCard.category)}`);
					io.in(socket.room).emit("newCard", { card: game.currentCard });
				}
			}

			// ++gameLogs.totalCards;
		} else {
			console.log(`\n no cards left..${JSON.stringify(game.cards)}`);
			gameController.emitGameOver("Keine Karten mehr Übrig ☹️");
		}
	};


	const closeAndEmitCurrentCard = function () {
		const currentCategory = gameController.getCurrentCard().category;
		switch (currentCategory) {
		case "guess":
			guessController.closeAndEmit();
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
		emitRandomCard: emitRandomCard,
	};
};
