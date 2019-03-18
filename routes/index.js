const app = require("express")();
const http = require("http").Server(app);


const io = require("socket.io")(http, {
	pingInterval: 4000,
	pingTimeout: 2000,
});
const gameMap = new Map();

const cards = {};
cards.surveys = require("../public/cards/surveys");
cards.guess = require("../public/cards/guesses");
cards.quiz = require("../public/cards/quizzes");
cards.challenge = require("../public/cards/challenges");

const cardCount = cards.surveys.length + cards.guess.length + cards.quiz.length + cards.challenge.length;
console.log(`Number of Cards: ${cardCount}`);

io.on("connection", (socket) => {
	const helper = require("./modules/helper")();
	const gameController = require("./modules/gameController")(io, cards, socket, gameMap);
	const curseController = require("./modules/card/curseController")(io, socket, gameController);
	const room = require("./modules/roomController")(io, socket, gameController, gameMap);
	const cardController = require("./modules/card/cardsController")(io, socket, gameController, curseController);

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
					cardController.closeAndEmitCurrentCard();
				}
				if (playerLeftCount === 0) {
					console.log("closing current card because everyone has answered..");
					cardController.closeAndEmitCurrentCard();
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
					gameController.setNewRandomAdmin();
				}
			}
			if (socket.room) {
				io.to(socket.room).emit("users-changed", { user: socket.user, event: "left" });
				gameController.updateAndEmitGame(socket.room);
			}
		}
	});

	socket.on("startGame", function () {
		io.in(socket.room).emit("gameStarted");
	});

	socket.on("startNewGame", function () {
		if (!socket.user || !socket.room) return;
		const game = gameMap.get(socket.room);

		const cardsLeftInGame = gameController.cardsLeftInGame(game);

		// set cardsPerGame to cards left and keep card array
		if (cardsLeftInGame < game.cardsPerGame) {
			console.log("\n less unique cards than they want to play, resetting cards array");
			game.cards = gameController.getCardsForEnabledCategories(game.categories);
		} else {
			console.log("\n enough unique cards for new round!");
		}

		game.isOver = false;
		game.cardsPlayed = 0;
		cardController.emitRandomCard();
		gameController.updateAndEmitGame(socket.room);
	});

	socket.on("newCardRequest", function () {
		if (!socket.user || !socket.room) return;

		console.log(`${JSON.stringify(socket.user.name)} requests new Card`);

		gameController.nextRound();
		cardController.emitRandomCard();
		gameController.updateAndEmitGame(socket.room);
	});


	socket.on("requestUserList", () => {
		if (!socket.user) return;
		console.log(`${socket.user.name} requests user list`);
		gameController.updateAndEmitGame(socket.room, "Only emit to requester");
	});

	socket.on("requestAvatarList", () => {
		const avatarFolder = "./img/avatar";
		const fs = require("fs");
		const avatarFileNames = [];

		fs.readdir(avatarFolder, (err, files) => {
			files.forEach((fileName) => {
				if (!err && fileName !== "") avatarFileNames.push(fileName);
			});
			socket.emit("receiveAvatarList", { avatarFileNames: avatarFileNames });
		});
	});

	socket.on("setSocketUser", (data) => {
		console.log(`set socket user ${JSON.stringify(data.user)}`, socket.id);
		socket.user = data.user;
		socket.user.socketId = socket.id;
		io.to(socket.id).emit("updateUser", { user: socket.user });
	});

	socket.on("reconnectRequest", (data) => {
		console.log(`${JSON.stringify(data.user)}is back`);
		socket.user = data.user;
		socket.user.socketId = socket.id;
		io.to(socket.id).emit("updateUser", { user: socket.user });

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
			gameController.updateAndEmitGame(socket.room);
		}
	});
	socket.on("avatarChanged", (data) => {
		if (!socket.user || !socket.room) return;
		console.log(`${JSON.stringify(socket.user)} changes avatar to ${data.newAvatar}`);
		socket.user.avatar = data.newAvatar;
		console.log(JSON.stringify(socket.user));
		// if socket is in room inform others about changes
		if (socket.room) {
			gameController.updateAndEmitGame(socket.room);
		}
	});

	socket.on("categoriesChanged", (data) => {
		if (!socket.user || !socket.room) return;
		console.log(`Categories in ${socket.room} changed to: ${JSON.stringify(data.categories)}`);
		const game = gameMap.get(socket.room);
		game.categories = data.categories;
		game.cards = gameController.getCardsForEnabledCategories(game.categories);
		gameController.updateAndEmitGame(socket.room);
	});

	socket.on("themesChanged", (data) => {
		if (!socket.user || !socket.room) return;
		console.log(`Themes in ${socket.room} changed to: ${JSON.stringify(data.themes)}`);
		gameMap.get(socket.room).themes = data.themes;
		gameController.updateAndEmitGame(socket.room);
	});
});


const port = process.env.PORT || 3001;

http.listen(port, function () {
	console.log(`listening on http://localhost:${port}`);
});
