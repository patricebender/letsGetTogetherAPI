module.exports = function (io, cards, socket, gameMap) {
	const gameLogs = {
		totalSips: 0,
		gamesPlayed: 0,
		totalPlayers: 0,
		totalCards: 0,
	};

	return {
		nextRound: function() {
			const game = this.getGameSession();

			// All cards played, emit game over event
			if (game.cardsPlayed === game.cardsPerGame) {
				this.emitGameOver("Alle Karten Gespielt.");
				return;
			}

			game.cardsPlayed++;

			// reset user answers
			game.players.forEach((player) => {
				player.hasAnswered = false;
			});
		},
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
		emitSipsTo: function (socketId, sips) {
			const gameSession = this.getGameSession();
			gameSession.players.forEach((player) => {
				if (socketId === player.socketId) {
					let sipPenalty = sips || 1;
					// apply multiplier
					sipPenalty *= player.multiplier * gameSession.multiplier;

					player.sips += sipPenalty;

					// keep track of sips
					gameLogs.totalSips += sipPenalty;

					console.log(`Emitting sips to: ${JSON.stringify(player)}`);

					io.to(player.socketId).emit("sip", { sips: sipPenalty });
					io.to(player.socketId).emit("updateUser", { user: player });
				}
			});
		},
		getGameSession: function () {
			return gameMap.get(socket.room);
		},
		getCurrentCard: function () {
			return this.getGameSession().currentCard;
		},
		reduceCurseTime: function () {
			this.getGameSession().players.forEach((player) => {
				player.curses.forEach((curse, i) => {
					console.log(`Reducing curse time for ${JSON.stringify(curse)}`);
					--curse.roundsLeft;

					// remove curse from player
					if (curse.roundsLeft === 0) {
						player.curses.splice(i, 1);

						// reduce multiplier
						if (curse.category === "multiplierCurse") {
							player.multiplier -= curse.multiplier;
						}
					}
				});

				io.to(player.socketId).emit("updateUser", { user: player });
			});
		},
		setNewRandomAdmin: function () {
			io.in(socket.room).clients((error, clients) => {
				if (error) throw error;
				this.getGameSession().admin = this.getRandomPlayers(1, clients)[0];
			});
		},
		emitGameOver: function (reason) {
			console.log(`\n game over because: ${reason}`);

			const gameOverCard = {
				category: "gameOver",
				reason: reason,
			};
			const game = this.getGameSession();
			game.currentCard = gameOverCard;
			game.isOver = true;

			this.updateAndEmitGame(socket.room);
		},
		updateAndEmitGame: function (room, emitToSocket) {
			console.log("updating game");
			if (!socket.user || !room) return;

			io.in(room).clients((error, clients) => {
				if (error) throw error;

				const game = this.getGameSession();
				const userList = [];
				clients.forEach(function (client) {
					userList.push(io.sockets.connected[client].user);
				});

				if (!game) return;

				// refresh player list in game object
				game.players = userList;
				game.playerCount = userList.length;


				// only send to one client
				if (emitToSocket) {
					socket.emit("gameUpdate", { game: gameMap.get(room) });
				} else {
					io.in(room).emit("gameUpdate", { game: gameMap.get(room) });
				}
			});
		},

		getRandomPlayers: function (count, players) {
			const selectedPlayers = [];
			let howMany = count;

			while (howMany > 0 && players.length > 0) {
				// get random id from given array and remove it from array
				const randomClientId = players.splice(Math.floor(Math.random() * players.length), 1);
				selectedPlayers.push(io.sockets.connected[randomClientId].user);
				howMany--;
			}

			return selectedPlayers;
		},
		cardsLeftInGame: function () {
			let cardsLeft = 0;
			const game = this.getGameSession();
			for (const key in game.cards) {
				if (game.cards.hasOwnProperty(key) && this.isCategoryEnabled(game, key)) {
					console.log(`${key} -> ${game.cards[key].length}`);
					cardsLeft += game.cards[key].length;
				}
			}
			return cardsLeft;
		},
		// needed for calculation of cards left in game
		isCategoryEnabled: function (game, category) {
			let isEnabled = false;
			game.categories.forEach((c) => {
				if (c.type === category) {
					isEnabled = c.enabled;
				}
			});
			return isEnabled;
		},
		getRandomCategoryForGame: function () {
			const possibleCategories = [];
			const game = this.getGameSession();
			game.categories.forEach((category) => {
				if (category.enabled && game.cards[category.type].length > 0) {
					possibleCategories.push(game.cards[category.type]);
				}
			});

			return possibleCategories[Math.floor(Math.random() * possibleCategories.length)];
		},
		// used before game starts to only copy relevant cards to game cards
		getCardsForEnabledCategories: function (categories) {
			const cardsForGame = {};
			categories.forEach((category) => {
				if (category.enabled) {
					// copy card arrays for enabled categories
					cardsForGame[category.type] = JSON.parse(JSON.stringify(cards[category.type]));
				}
			});
			return cardsForGame;
		},
		getRandomCardForCategory: function (category) {
			return category.splice(Math.floor(Math.random() * category.length), 1)[0];
		},


	};
};
