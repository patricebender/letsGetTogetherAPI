const app = require("express")();
const http = require("http").Server(app);


const io = require("socket.io")(http, {
	pingInterval: 4000,
	pingTimeout: 2000,
});
const gameMap = new Map();

const cards = {};
cards.surveys = require("./surveys");
cards.guess = require("./guesses");
cards.quiz = require("./quizzes");
cards.challenge = require("./challenges");

const cardCount = cards.surveys.length + cards.guess.length + cards.quiz.length + cards.challenge.length;
console.log(`Number of Cards: ${cardCount}`);

io.on("connection", (socket) => {
	const helper = require("./modules/helper")();
	const gameHelper = require("./modules/gameHelper")(io, cards, socket, gameMap);
	const curseController = require("./modules/card/curseController")(io, socket, gameHelper);
	const room = require("./modules/room")(io, socket, gameHelper, gameMap);
	const session = require("./modules/session")(io, socket);
	const cardHelper = require("./modules/cardHelper")(io, socket, gameHelper, session, curseController)

	socket.on("disconnect", function () {
		if (!socket.user || !socket.room) return;

		const gameSession = gameMap.get(socket.room);

		// if user has not answered current card yet, decrease playerLeftCount
		if (!socket.user.hasAnswered && gameSession) {
			if (!helper.isEmpty(gameSession.currentCard)) {
				console.log(JSON.stringify(gameSession.currentCard));
				const playerLeftCount = --gameMap.get(socket.room).currentCard.playerLeftCount;

				// if challenged player leaves the game, end challenge.
				if (gameSession.currentCard.category === "challenge" && gameSession.currentCard.player.socketId === socket.user.socketId) {
					gameSession.currentCard.playerQuit = true;
					cardHelper.closeAndEmitCurrentCard();
				}
				if (playerLeftCount === 0) {
					console.log("closing current card because everyone has answered..");
					cardHelper.closeAndEmitCurrentCard();
				}
			}
		}

		console.log(`Socket disconnects: ${JSON.stringify(socket.user)}`);
		if (room.isRoomEmpty(socket.room)) {
			// if room is empty delete it from session array
			console.log("no one is in the room anymore.. Deleting room");
			gameMap.set(socket.room, undefined);
		} else {
			if (socket.user === gameMap.get(socket.room).admin) {
				console.log("admin left");
				if (gameMap.get(socket.room).players.length > 0) {
					gameHelper.setNewRandomAdmin();
				}
			}
			if (socket.room) {
				io.to(socket.room).emit("users-changed", {user: socket.user, event: "left"});
				gameHelper.updateAndEmitGame(socket.room);
			}
		}
	});

	socket.on("quizAnswer", (data) => {
		if (!socket.user || !socket.room) return;
		const quiz = gameMap.get(socket.room).currentCard;
		const isCorrectAnswer = data.answer.isCorrect;

		console.log(`${socket.user.name} answered ${quiz.question}${isCorrectAnswer ? " correct " : " wrong "}with answer: ${data.answer.text}\n`
			+ `time: ${data.time}`);


		socket.user.hasAnswered = true;


		quiz.answerCount++;

		!isCorrectAnswer ? quiz.wrongAnswerCount++ : "";

		// add user answer to currentCard in game
		quiz.ranking.push({
			time: data.time,
			player: socket.user,
			sips: 0,
			answer: data.answer,
		});


		session.waitForUsers()
			.then((users) => {
				gameMap.get(socket.room).currentCard.playerLeftCount = users.length;
				if (users.length === 0) {
					// close quiz
					cardHelper.closeAndEmitCurrentCard();
				} else {
					console.log(`Wait for users to answer: ${JSON.stringify(users.length)}`);
					gameHelper.updateAndEmitGame(socket.room);
				}
			});
	});
	socket.on("challengedPlayerLeaves", () => {
		console.log("challengedPlayerLeaves");
	});


	socket.on("startGame", function () {
		io.in(socket.room).emit("gameStarted");
	});

	socket.on("startNewGame", function () {
		if (!socket.user || !socket.room) return;
		const game = gameMap.get(socket.room);

		const unplayedCardsInGame = gameHelper.cardsLeftInGame(game);

		// set cardsPerGame to cards left and keep card array
		if (unplayedCardsInGame < game.cardsPerGame) {
			console.log("\n less unique cards than they want to play, resetting cards array");
			game.cards = gameHelper.getCardsForEnabledCategories(game.categories);
		} else {
			console.log("\n enough unique cards for new round!");
		}

		game.isOver = false;
		game.cardsPlayed = 0;
		cardHelper.emitRandomCard();
		gameHelper.updateAndEmitGame(socket.room);
	});
	socket.on("surveyAnswer", (data) => {
		if (!socket.user || !socket.room) return;

		const survey = gameMap.get(socket.room).currentCard;

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

		session.waitForUsers()
			.then((users) => {
				gameMap.get(socket.room).currentCard.playerLeftCount = users.length;
				if (users.length === 0) {
					// close survey
					cardHelper.closeAndEmitCurrentCard();
				} else {
					console.log(`Wait for users to answer: ${JSON.stringify(users.length)}`);

					gameHelper.updateAndEmitGame(socket.room);
				}
			})
			.catch((error) => {
				console.log(error);
			});
	});

	socket.on("newCardRequest", function () {
		if (!socket.user || !socket.room) return;
		const game = gameMap.get(socket.room);

		// All cards played, emit game over event
		if (game.cardsPlayed === game.cardsPerGame) {
			gameHelper.emitGameOver("Alle Karten Gespielt.");
			return;
		}

		game.cardsPlayed++;

		// reset user answers
		game.players.forEach((player) => {
			player.hasAnswered = false;
		});

		console.log(`${JSON.stringify(socket.user.name)} requests new Card`);

		cardHelper.emitRandomCard();

		gameHelper.updateAndEmitGame(socket.room);
	});
	socket.on("challengeAccepted", () => {
		if (!socket.user || !socket.room) return;

		const challenge = gameMap.get(socket.room).currentCard;
		console.log(`${socket.user.name}accepted the challenge. `);

		challenge.isAccepted = true;
		gameHelper.updateAndEmitGame(socket.room);
	});
	socket.on("challengeDeclined", () => {
		if (!socket.user || !socket.room) return;


		const challenge = gameMap.get(socket.room).currentCard;

		console.log(`${socket.user.name}declined the challenge. `);
		gameHelper.emitSipsTo(socket.user.socketId, challenge.sips);

		challenge.isDeclined = true;
		challenge.closed = true;
		gameHelper.updateAndEmitGame(socket.room);
	});

	socket.on("challengeVote", (data) => {
		if (!socket.user || !socket.room) return;
		socket.user.hasAnswered = true;
		const challenge = gameMap.get(socket.room).currentCard;

		const upVote = !!data.success;
		console.log(socket.user.name, upVote ? "up" : "down", "votes challenge");
		upVote ? challenge.upVotes++ : challenge.downVotes++;

		session.waitForUsers()
			.then((users) => {
				// -1 => dont wait for challenged player
				gameMap.get(socket.room).currentCard.playerLeftCount = users.length - 1;
				if (gameMap.get(socket.room).currentCard.playerLeftCount === 0) {
					// close survey
					cardHelper.closeAndEmitCurrentCard();
				} else {
					console.log(`Wait for users to answer: ${JSON.stringify(users.length)}`);

					gameHelper.updateAndEmitGame(socket.room);
				}
			})
			.catch((error) => {
				console.log(error);
			});
	});

	socket.on("requestUserList", () => {
		if (!socket.user) return;
		console.log(`${socket.user.name} requests user list`);
		gameHelper.updateAndEmitGame(socket.room, "Only emit to requester");
	});

	socket.on("requestAvatarList", () => {
		const avatarFolder = "./img/avatar";
		const fs = require("fs");
		const avatarFileNames = [];

		fs.readdir(avatarFolder, (err, files) => {
			files.forEach((fileName) => {
				if (!err && fileName !== "") avatarFileNames.push(fileName);
			});
			socket.emit("receiveAvatarList", {avatarFileNames: avatarFileNames});
		});
	});

	socket.on("setSocketUser", (data) => {
		console.log(`set socket user ${JSON.stringify(data.user)}`, socket.id);
		socket.user = data.user;
		socket.user.socketId = socket.id;
		io.to(socket.id).emit("updateUser", {user: socket.user});
	});

	socket.on("reconnectRequest", (data) => {
		console.log(`${JSON.stringify(data.user)}is back`);
		socket.user = data.user;
		socket.user.socketId = socket.id;
		io.to(socket.id).emit("updateUser", {user: socket.user});

		const usersLastRoom = data.lastRoom;
		console.log(usersLastRoom ? `users last room was: ${usersLastRoom}` : "");

		const game = gameMap.get(usersLastRoom);

		if (game) {
			console.log("Room still exists. "
				+ "\nWill Reconnect User");
			socket.emit("userReconnected");
		} else {
			console.log("Room does not exist.");
			socket.emit("userReconnected");
		}
	});

	socket.on("userNameChanged", (data) => {
		if (!socket.user) return;
		console.log(`${JSON.stringify(socket.user.name)} changes name to ${data.newName}`);
		socket.user.name = data.newName;
		// if socket is in room inform others about changes
		if (socket.room) {
			gameHelper.updateAndEmitGame(socket.room);
		}
	});
	socket.on("avatarChanged", (data) => {
		if (!socket.user || !socket.room) return;
		console.log(`${JSON.stringify(socket.user)} changes avatar to ${data.newAvatar}`);
		socket.user.avatar = data.newAvatar;
		console.log(JSON.stringify(socket.user));
		// if socket is in room inform others about changes
		if (socket.room) {
			gameHelper.updateAndEmitGame(socket.room);
		}
	});

	socket.on("categoriesChanged", (data) => {
		if (!socket.user || !socket.room) return;
		console.log(`Categories in ${socket.room} changed to: ${JSON.stringify(data.categories)}`);
		const game = gameMap.get(socket.room);
		game.categories = data.categories;
		game.cards = gameHelper.getCardsForEnabledCategories(game.categories);
		gameHelper.updateAndEmitGame(socket.room);
	});

	socket.on("themesChanged", (data) => {
		if (!socket.user || !socket.room) return;
		console.log(`Themes in ${socket.room} changed to: ${JSON.stringify(data.themes)}`);
		gameMap.get(socket.room).themes = data.themes;
		gameHelper.updateAndEmitGame(socket.room);
	});
});


const port = process.env.PORT || 3001;

http.listen(port, function () {
	console.log(`listening on http://localhost:${port}`);
});
