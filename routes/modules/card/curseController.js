module.exports = function (io, socket, gameController) {


	const emitMultiplierCurse = function () {
		io.in(socket.room).clients((error, clients) => {
			if (error) throw error;

			const randomPlayer = gameController.getRandomPlayers(1, clients)[0];
			const multiplier = Math.floor(Math.random() * 3) + 1;
			const curseTime = Math.floor(Math.random() * 10) + 1;

			const game = gameController.getGameSession();


			const multiplierCurse = {
				roundsLeft: curseTime,
				multiplier: multiplier,
				cursedPlayer: randomPlayer.name,
				playerSocketId: randomPlayer.socketId,
				category: "multiplierCurse",
			};

			randomPlayer.multiplier += multiplier;
			randomPlayer.curses.push(multiplierCurse);
			game.currentCard = multiplierCurse;
			game.currentCategory = multiplierCurse.category;


			console.log(`Multiplier Curse x ${multiplier} @ ${randomPlayer} for ${curseTime}  Rounds: `);

			io.to(randomPlayer.socketId).emit("updateUser", { user: randomPlayer });

			gameController.updateAndEmitGame(socket.room);
		});
	};

	const emitRandomCurse = function () {
		emitMultiplierCurse();
	};


	return {
		emitRandomCurse: emitRandomCurse,
	};
};
