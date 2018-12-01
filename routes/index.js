let app = require('express')();
let http = require('http').Server(app);
let io = require('socket.io')(http, {
    pingInterval: 4000,
    pingTimeout: 2000,
    }
);


let gameMap = new Map();


let cards = {}
cards['surveys'] = require('./surveys');
cards['guess'] = require('./guesses');
console.log("Survey Count: " + cards['surveys'].length, "Guess Count:" + cards['guess'].length)

io.on('connection', (socket) => {

    let updateAndEmitGame = function (room, emitToSocket) {

        if (!socket.user || !room) return;

        io.in(room).clients((error, clients) => {
            if (error) throw error;

            let userList = [];
            clients.forEach(function (client) {
                userList.push(io.sockets.connected[client].user)
            })

            //refresh player list in game object
            gameMap.get(room).players = userList;


            //only send to one client
            if (emitToSocket) {
                socket.emit('gameUpdate', {game: gameMap.get(room)});
            } else {
                io.in(room).emit('gameUpdate', {game: gameMap.get(room)});
            }

        })
    }
    compareGuessAnswer = function (rankingA, rankingB) {
        //compare absolute difference to correct answer for sorting
        diffAbsA = rankingA.difference;
        diffAbsB = rankingB.difference;

        if (diffAbsA < diffAbsB) return -1;
        if (diffAbsB < diffAbsA) return 1;

        return 0;

    }


    socket.on('guessAnswer', (data) => {
        if (!socket.user || !socket.room) return;
        let game = gameMap.get(socket.room);
        let guess = game.currentCard;

        let userAnswer = data['answer'];

        socket.user.hasAnswered = true;
        guess.answerCount++;

        console.log(JSON.stringify(socket.user.name) + " answered " + guess.question + " \n with guess: " + userAnswer);

        let diff = round(Math.abs(userAnswer - guess.answer), 2);
        // add user answer to currentCard in game
        guess.ranking.push({answer: userAnswer, player: socket.user, difference: diff, rankNumber: 0, sips: 0});

        waitForUsers().then((users) => {
            if (users.length === 0) {
                //close guess
                guess.closed = true;
                console.log("Everyone has answered. Sort Ranking and emit results for Guess: " + JSON.stringify(guess.question))
                guess.ranking.sort(compareGuessAnswer);

                // big groups should drink more e.g. for 10 player I want the last two to drink.
                let howManyDrink = guess.answerCount / 5 < 1 ? 1 : Math.floor(guess.answerCount / 5);
                console.log(howManyDrink + " drink!")


                //find last n players with baddest guess
                let rank = 1;
                guess.ranking.forEach((answer, index) => {
                    //last index reached
                    if (!guess.ranking[index + 1]) {
                        answer.rankNumber = rank;
                    } else {
                        //same rank for same difference so don't increase rank count
                        if (answer.difference === guess.ranking[index + 1].difference) {
                            answer.rankNumber = rank;
                        } else {
                            answer.rankNumber = rank;
                            rank++;
                        }
                    }
                });

                // calculate sips
                let ranking = guess.ranking;
                let i = ranking.length - 1;
                while (howManyDrink > 0 && i > 0) {
                    // both drink
                    if (ranking[i].rankNumber === ranking[i - 1].rankNumber) {
                        ranking[i].sips = ranking[i].player.multiplier * game.multiplier * 1;
                        emitSipsTo(ranking[i].player.socketId);
                        // if the two got the first rank and there still need to be sipped, sip.
                        if (i === 1) {
                            console.log("also emit to first one: " + JSON.stringify(ranking[i - 1].player));
                            ranking[i - 1].sips = ranking[i - 1].player.multiplier * game.multiplier * 1;
                            emitSipsTo(ranking[i - 1].player.socketId);
                        }

                    } else {
                        ranking[i].sips = ranking[i].player.multiplier * game.multiplier * 1;
                        emitSipsTo(ranking[i].player.socketId);
                        howManyDrink--;
                    }
                    i--;
                }


                // noinspection JSUnresolvedFunction
                io.in(socket.room).emit('guessResults', {guess: guess, ranking: guess.ranking});
                updateAndEmitGame(socket.room)
            } else {
                console.log("Wait for users to answer: " + JSON.stringify(users))
                // noinspection JSUnresolvedFunction
                io.in(socket.room).emit('guessUpdate', {guess: gameMap.get(socket.room).currentCard});


            }
        })

    });



    let emitSipsTo = function (socketId) {

        let game = gameMap.get(socket.room);
        game.players.forEach((player) => {
            if (socketId === player.socketId) {
                player.sips += game.multiplier * player.multiplier * 1
                //TODO emit sip event
                console.log("Emitting sips to: " + JSON.stringify(player))
                io.to(player.socketId).emit('updateUser', {user: player});
            }
        })
    }

    let emitRandomCard = function () {
        if (!socket.user || !socket.room) return;
        let game = gameMap.get(socket.room);

        if (game.categories.length > 0) {

            let categoryIndex = Math.floor(Math.random() * game.categories.length);
            const randomCategory = game.categories[categoryIndex].type;

            switch (randomCategory) {
                case 'surveys':
                    game.currentCategory = 'surveys';
                    break;
                case 'guess':
                    game.currentCategory = 'guess';
                    break;
                default:
                    console.log(randomCategory + " not yet implemented!");

            }

            console.log("Survey Count: " + game.cards['surveys'].length, "Guess Count: " + game.cards['guess'].length)
            let cards = game.cards[game.currentCategory];

            // no more cards in current category
            if (cards.length === 0) {
                console.log("\n No more " + game.currentCategory + " deleting category.." + game.categories.splice(categoryIndex, 1));


                // recursive call for card of other category
                emitRandomCard();
            } else {
                // remove and retrieve card from array
                let card = cards.splice(Math.floor(Math.random() * cards.length), 1)[0];
                console.log("emitting " + JSON.stringify(card.category) + " to " + socket.room);
                game.currentCard = card;
                io.in(socket.room).emit('newCard', {card: game.currentCard});
            }

        } else {
            console.log("\n no cards left..");
        }

    };


    socket.on('surveyAnswer', (data) => {
        if (!socket.user || !socket.room) return;

        let survey = gameMap.get(socket.room).currentCard;

        let userAnswer = data['answer'];

        socket.user.hasAnswered = true;
        survey.answerCount++;

        console.log(JSON.stringify(socket.user) + " answered " + data['survey'].question + " \n with option: " + data['answer'] + " \n" +
            "in room: " + socket.room)

        // add user answer to currentCard in game
        survey.options.forEach((option) => {
            if (option.title === userAnswer) {
                option.voters.push(socket.user);
                option.answerCount++;
            }
        });

        waitForUsers()
            .then((users) => {
                if (users.length === 0) {
                    // close survey
                    survey.closed = true;
                    console.log("Everyone has answered. Emitting Results for Survey: " + JSON.stringify(survey))


                    let firstOption = survey.options[0].voters.length;
                    let secondOption = survey.options[1].voters.length;
                    console.log(firstOption, secondOption)

                    let losers = firstOption > secondOption ?
                        survey.options[1].voters :
                        secondOption > firstOption ?
                            survey.options[0].voters : [];


                    console.log("LOSERS ARE: " + JSON.stringify(losers));

                    losers.forEach((loser) => {
                        emitSipsTo(loser.socketId);
                    })

                    // noinspection JSUnresolvedFunction
                    io.in(socket.room).emit('surveyResults', {survey: survey, losers: losers});
                    updateAndEmitGame(socket.room)

                } else {
                    console.log("Wait for users to answer: " + JSON.stringify(users))
                    // noinspection JSUnresolvedFunction
                    io.in(socket.room).emit('surveyUpdate', {survey: gameMap.get(socket.room).currentCard});


                }

            })
            .catch((error) => {
                console.log(error);
            })

    });


    //returns all users who have not answered yet
    function waitForUsers() {
        return new Promise(resolve => {
            let users = [];
            // noinspection JSUnresolvedFunction
            io.in(socket.room).clients((error, clients) => {
                clients.forEach((client) => {
                    if (!io.sockets.connected[client].user.hasAnswered) {
                        users.push(io.sockets.connected[client].user)
                    }
                })

            });
            resolve(users);
        });


    }


    let setNewRandomAdmin = function () {

        io.in(socket.room).clients((error, clients) => {
            if (error) throw error;
            const randomClientId = clients[Math.floor(Math.random() * clients.length)];
            let randomUser = io.sockets.connected[randomClientId].user;
            gameMap.get(socket.room).admin = randomUser;
        });
    }

    let isRoomEmpty = function (name) {
        return io.sockets.adapter.rooms[name] === undefined;
    }


    socket.on('disconnect', function () {
        if (!socket.user) return;

        console.log("Socket disconnects: " + JSON.stringify(socket.user))
        if (isRoomEmpty(socket.room)) {
            // if room is empty delete it from session array
            console.log("no one is in the room anymore.. Deleting room");
            gameMap.set(socket.room, undefined);

        } else {
            if (socket.user === gameMap.get(socket.room).admin) {
                console.log("admin left");
                setNewRandomAdmin();
            }
            if (socket.room) {
                io.to(socket.room).emit('users-changed', {user: socket.user, event: 'left'});
                updateAndEmitGame(socket.room);

            }
        }

    });

    socket.on('startGame', function () {
        io.in(socket.room).emit('gameStarted');
    });

    let emitGameOver = function(reason) {

        console.log("\n game over because: " + reason);

        let gameOverCard = {
            category: 'gameOver',
            reason: reason
        };
        let game = gameMap.get(socket.room);
        game.currentCard = gameOverCard;
        game.isOver = true;

        updateAndEmitGame(socket.room);


    };


    socket.on('newCardRequest', function () {
        if (!socket.user) return;
        let game = gameMap.get(socket.room);

        // All cards played, emit game over event
        if (game.cardsPlayed === game.cardsPerGame) {
            emitGameOver('Alle Karten Gespielt.');
            return;
        }

        game.cardsPlayed++;


        // reset user answers
        game.players.forEach((player) => {
            player.hasAnswered = false;
        });

        console.log(JSON.stringify(socket.user.name) + " requests new Card");

        emitRandomCard();

        updateAndEmitGame(socket.room)

    });


    socket.on('joinRoomRequest', (data) => {
        if (!socket.user) return;
        console.log(socket.user.name + " want's to join " + data.room)

        //room already exists, so join it
        if (!isRoomEmpty(data.room)) {
            socket.join(data.room, () => {
                //set socket basic data
                socket.room = data.room;
                console.log(socket.user.name + " joined: " + socket.room);

                socket.to(socket.room).emit('users-changed', {user: socket.user, event: 'joined'});
                socket.emit('roomJoinSucceed', {room: socket.room, game: gameMap.get(socket.room)});
                updateAndEmitGame(socket.room);
            });

        }
        else {
            console.log(data.room + " does not exist")
            socket.emit('noSuchRoom');
        }

    });

    socket.on('createRoomRequest', (data) => {
        if (!socket.user) return;
        console.log(JSON.stringify(socket.user) + " want's to create " + data.room);

        if (!isRoomEmpty(data.room)) {
            socket.emit('roomAlreadyExists');
        }
        else {
            socket.join(data.room, () => {
                //set socket basic data
                socket.room = data.room;

                console.log("emitting update user: " + JSON.stringify(socket.user))

                socket.emit('updateUser', {user: socket.user});


                let game = {
                    players: [],
                    isOver: false,
                    admin: socket.user,
                    categories: data.categories,
                    themes: data.themes,
                    cardsPerGame: data.cardsPerGame,
                    cardsPlayed: 0,
                    cards: JSON.parse(JSON.stringify(cards)),
                    currentCard: {},
                    currentCategory: 'none',
                    multiplier: 1
                }

                gameMap.set(data.room, game);
                console.log(socket.room + " created!" +
                    " with settings: " + JSON.stringify(game));

                for (let [key, value] of gameMap) {
                    console.log(key + " = " + value);
                }

                socket.emit('roomCreated', {room: socket.room, game: game});

            });
        }
    })


    socket.on('leaveRoom', () => {
        socket.leave(socket.room, () => {
            console.log(JSON.stringify(socket.user) + " left room " + socket.room);
            if (isRoomEmpty(socket.room)) {
                // if room is empty delete it from session array
                console.log("no one is in the room anymore..")
                gameMap.set(socket.room, undefined);
            } else {
                if (socket.user.isAdmin) {
                    console.log("admin left");
                    setNewRandomAdmin();
                    socket.user.isAdmin = false;
                    socket.emit('updateUser', {user: socket.user});
                }

                console.log("emit user change: " + socket.room)
                io.to(socket.room).emit('users-changed', {user: socket.user, event: 'left'});


                const room = socket.room;
                socket.room = '';
                updateAndEmitGame(room);
            }


        });
    })


    socket.on('requestUserList', () => {
        console.log(socket.user + " requests user list");
        updateAndEmitGame(socket.room, "Only emit to requester");
    });

    socket.on('requestAvatarList', () => {
        const avatarFolder = './img/avatar';
        const fs = require('fs');
        let avatarFileNames = [];

        fs.readdir(avatarFolder, (err, files) => {
            files.forEach(fileName => {
                if (!err && fileName !== '')
                    avatarFileNames.push(fileName);
            });
            socket.emit('receiveAvatarList', {avatarFileNames: avatarFileNames});
        })


    })

    socket.on('setSocketUser', (data) => {
        console.log("set socket user " + data.user, socket.id)
        socket.user = data.user;
        socket.user.socketId = socket.id;
        io.to(socket.id).emit('updateUser', {user: socket.user});
    });

    socket.on('userNameChanged', (data) => {
        if (!socket.user) return;
        console.log(JSON.stringify(socket.user.name) + " changes name to " + data.newName);
        socket.user.name = data.newName;
        //if socket is in room inform others about changes
        if (socket.room) {
            updateAndEmitGame(socket.room);
        }
    });

    socket.on('avatarChanged', (data) => {
        console.log(JSON.stringify(socket.user) + " changes avatar to " + data.newAvatar);
        socket.user.avatar = data.newAvatar;
        console.log(JSON.stringify(socket.user))
        //if socket is in room inform others about changes
        if (socket.room) {
            updateAndEmitGame(socket.room);
        }
    });

    socket.on('categoriesChanged', (data) => {
        if (!socket.user || !socket.room) return;
        console.log("Categories in " + socket.room + " changed to: " + JSON.stringify(data.categories));
        gameMap.get(socket.room).categories = data.categories;
        updateAndEmitGame(socket.room);
    });

    socket.on('themesChanged', (data) => {
        if (!socket.user || !socket.room) return;
        console.log("Themes in " + socket.room + " changed to: " + JSON.stringify(data.themes));
        gameMap.get(socket.room).themes = data.themes;
        updateAndEmitGame(socket.room);
    });

});


//helper rounding function
function round(value, exp) {
    if (typeof exp === 'undefined' || +exp === 0)
        return Math.round(value);

    value = +value;
    exp = +exp;

    if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0))
        return NaN;

    // Shift
    value = value.toString().split('e');
    value = Math.round(+(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp)));

    // Shift back
    value = value.toString().split('e');
    return +(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp));
}

let port = process.env.PORT || 3001;

http.listen(port, function () {
    console.log('listening on http://localhost:' + port);
});

