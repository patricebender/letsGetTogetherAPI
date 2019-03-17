module.exports = function (io, socket, gameController) {
	const helper = require("../helper")();

	const compareGuessAnswer = function (rankingA, rankingB) {
		// compare absolute difference to correct answer for sorting
		const diffAbsA = rankingA.difference;
		const diffAbsB = rankingB.difference;

		if (diffAbsA < diffAbsB) return -1;
		if (diffAbsB < diffAbsA) return 1;

		return 0;
	};

	const calcSips = function (ranking, howManyDrink) {
		let i = ranking.length - 1;

		while (howManyDrink > 0 && i > 0) {
			// both drink
			if (ranking[i].rankNumber === ranking[i - 1].rankNumber) {
				ranking[i].sips = ranking[i].player.multiplier * 1;
				gameController.emitSipsTo(ranking[i].player.socketId);
				// if the two got the first rank and there still need to be sipped, sip.
				if (i === 1) {
					console.log(`also emit to first one: ${JSON.stringify(ranking[i - 1].player)}`);
					ranking[i - 1].sips = ranking[i - 1].player.multiplier * 1;
					gameController.emitSipsTo(ranking[i - 1].player.socketId);
				}
			} else {
				ranking[i].sips = ranking[i].player.multiplier * 1;
				gameController.emitSipsTo(ranking[i].player.socketId);
				howManyDrink--;
			}
			i--;
		}
	};

	const closeAndEmitGuess = function () {
		const guess = gameController.getCurrentCard();
		guess.closed = true;
		console.log(`Everyone has answered. Sort Ranking and emit results for Guess: ${JSON.stringify(guess.question)}`);
		guess.ranking.sort(compareGuessAnswer);

		// big groups should drink more e.g. for 10 player I want the last two to drink.
		const howManyDrink = guess.answerCount / 5 < 1 ? 1 : Math.floor(guess.answerCount / 5);
		console.log(`${howManyDrink} drink!`);


		// find last n players with baddest guess
		let rank = 1;
		guess.ranking.forEach((answer, index) => {
			// last index reached
			if (!guess.ranking[index + 1]) {
				answer.rankNumber = rank;
			} else if (answer.difference === guess.ranking[index + 1].difference) {
				answer.rankNumber = rank;
			} else {
				answer.rankNumber = rank;
				rank++;
			}
		});

		// calculate sips
		calcSips(guess.ranking, howManyDrink);

		// noinspection JSUnresolvedFunction
		io.in(socket.room).emit("guessResults", {guess: guess, ranking: guess.ranking});
		gameController.updateAndEmitGame(socket.room);
	};

	socket.on("guessAnswer", (data) => {
		if (!socket.user || !socket.room) return;

		const guess = gameController.getCurrentCard();

		const userAnswer = data.answer;

		socket.user.hasAnswered = true;
		guess.answerCount++;

		console.log(`${JSON.stringify(socket.user.name)} answered ${guess.question} \n with guess: ${userAnswer}`);

		const diff = helper.round(Math.abs(userAnswer - guess.answer), 2);
		// add user answer to currentCard in game
		guess.ranking.push({
			answer: userAnswer, player: socket.user, difference: diff, rankNumber: 0, sips: 0,
		});

		gameController.waitForUsers().then((users) => {
			// to provide info about remaining players
			gameController.getCurrentCard().playerLeftCount = users.length;

			if (users.length === 0) {
				// close guess
				closeAndEmitGuess();
			} else {
				console.log(`Wait for users to answer: ${users.length}`);
				gameController.updateAndEmitGame(socket.room);
			}
		});
	});

	return {
		closeAndEmit: closeAndEmitGuess,
	};
};
