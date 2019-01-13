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
cards['quiz'] = require('./quizzes');
cards['challenge'] = require('./challenges');

let cardCount = cards['surveys'].length + cards['guess'].length + cards['quiz'].length;
console.log("Number of Cards: " + cardCount);

io.on('connection', (socket) => {

    let updateAndEmitGame = function (room, emitToSocket) {
        console.log("updating game");
        if (!socket.user || !room) return;

        io.in(room).clients((error, clients) => {
            if (error) throw error;


            let game = gameMap.get(room);
            let userList = [];
            clients.forEach(function (client) {
                userList.push(io.sockets.connected[client].user)
            })

            if (!game) return;

            //refresh player list in game object
            game.players = userList;
            game.playerCount = userList.length;


            //only send to one client
            if (emitToSocket) {
                socket.emit('gameUpdate', {game: gameMap.get(room)});
            } else {
                io.in(room).emit('gameUpdate', {game: gameMap.get(room)});
            }

        })
    }


    socket.on('guessAnswer', (data) => {
        if (!socket.user || !socket.room) return;
        let guess = gameMap.get(socket.room).currentCard;

        let userAnswer = data['answer'];

        socket.user.hasAnswered = true;
        guess.answerCount++;

        console.log(JSON.stringify(socket.user.name) + " answered " + guess.question + " \n with guess: " + userAnswer);

        let diff = round(Math.abs(userAnswer - guess.answer), 2);
        // add user answer to currentCard in game
        guess.ranking.push({answer: userAnswer, player: socket.user, difference: diff, rankNumber: 0, sips: 0});

        waitForUsers().then((users) => {
            // to provide info about remaining players
            gameMap.get(socket.room).currentCard.playerLeftCount = users.length;

            if (users.length === 0) {
                //close guess
                closeAndEmitGuess();
            } else {
                console.log("Wait for users to answer: " + users.length)
                updateAndEmitGame(socket.room)


            }
        })

    });

    function calcSips(ranking, howManyDrink) {

        let i = ranking.length - 1;

        while (howManyDrink > 0 && i > 0) {
            // both drink
            if (ranking[i].rankNumber === ranking[i - 1].rankNumber) {
                ranking[i].sips = ranking[i].player.multiplier * 1;
                emitSipsTo(ranking[i].player.socketId);
                // if the two got the first rank and there still need to be sipped, sip.
                if (i === 1) {
                    console.log("also emit to first one: " + JSON.stringify(ranking[i - 1].player));
                    ranking[i - 1].sips = ranking[i - 1].player.multiplier * 1;
                    emitSipsTo(ranking[i - 1].player.socketId);
                }

            } else {
                ranking[i].sips = ranking[i].player.multiplier * 1;
                emitSipsTo(ranking[i].player.socketId);
                howManyDrink--;
            }
            i--;
        }
    };

    socket.on('quizAnswer', (data) => {
        if (!socket.user || !socket.room) return;
        let quiz = gameMap.get(socket.room).currentCard;
        let isCorrectAnswer = data.answer.isCorrect;

        console.log(socket.user.name + " answered " + quiz.question + "" + (isCorrectAnswer ? " correct " : " wrong ") + "with answer: " + data.answer.text + "\n" +
            "time: " + data.time);


        socket.user.hasAnswered = true;


        quiz.answerCount++;

        !isCorrectAnswer ? quiz.wrongAnswerCount++ : '';

        // add user answer to currentCard in game
        quiz.ranking.push({
            time: data.time,
            player: socket.user,
            sips: 0,
            answer: data.answer,
        });


        waitForUsers()
            .then((users) => {
                gameMap.get(socket.room).currentCard.playerLeftCount = users.length;
                if (users.length === 0) {
                    // close quiz
                    closeAndEmitQuiz();
                } else {
                    console.log("Wait for users to answer: " + JSON.stringify(users.length));
                    updateAndEmitGame(socket.room);

                }

            });

    });


    socket.on('surveyAnswer', (data) => {
        if (!socket.user || !socket.room) return;

        let survey = gameMap.get(socket.room).currentCard;

        let userAnswer = data['answer'];

        socket.user.hasAnswered = true;
        survey.answerCount++;

        console.log(JSON.stringify(socket.user.name) + " answered " + data['survey'].question + " \n with option: " + data['answer'] + " \n" +
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
                gameMap.get(socket.room).currentCard.playerLeftCount = users.length;
                if (users.length === 0) {
                    // close survey
                    closeAndEmitSurvey();

                } else {
                    console.log("Wait for users to answer: " + JSON.stringify(users.length));

                    updateAndEmitGame(socket.room)

                }

            })
            .catch((error) => {
                console.log(error);
            })

    });

    let closeAndEmitCurrentCard = function () {
        let currentCategory = gameMap.get(socket.room).currentCard.category;
        switch (currentCategory) {
            case "guess":
                closeAndEmitGuess();
                break;
            case "quiz":
                closeAndEmitQuiz()
                break;
            case "survey":
                closeAndEmitSurvey();
                break;
            case "challenge":
                closeAndEmitChallenge()
                break;
            default:
                console.log(JSON.stringify(currentCategory) + " is not known :O")

        }
    };

    let closeAndEmitGuess = function () {
        let guess = gameMap.get(socket.room).currentCard;
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
        calcSips(guess.ranking, howManyDrink);

        // noinspection JSUnresolvedFunction
        io.in(socket.room).emit('guessResults', {guess: guess, ranking: guess.ranking});
        updateAndEmitGame(socket.room)
    };

    let closeAndEmitSurvey = function () {
        let survey = gameMap.get(socket.room).currentCard;
        survey.closed = true;
        console.log("Everyone has answered. Emitting Results for Survey: " + JSON.stringify(survey.question))


        let firstOption = survey.options[0];
        let secondOption = survey.options[1];
        console.log(firstOption.title + " x" + firstOption.voters.length, secondOption.title + " x" + secondOption.voters.length)

        let losers = firstOption.voters.length > secondOption.voters.length ?
            survey.options[1].voters :
            secondOption.voters.length > firstOption.voters.length ?
                survey.options[0].voters : [];


        console.log("LOSERS ARE: " + JSON.stringify(losers));

        losers.forEach((loser) => {
            emitSipsTo(loser.socketId);
        })

        // noinspection JSUnresolvedFunction
        io.in(socket.room).emit('surveyResults', {survey: survey, losers: losers});
        updateAndEmitGame(socket.room)
    };

    socket.on('challengedPlayerLeaves', () => {
        console.log("challengedPlayerLeaves");
    })

    let closeAndEmitChallenge = function () {
        let challenge = gameMap.get(socket.room).currentCard;
        challenge.closed = true;
        console.log("Everyone has answered. Emitting Results for Challenge: " + JSON.stringify(challenge.title))


        let upVotes = challenge.upVotes;
        let downVotes = challenge.downVotes;
        console.log("upVotes x " + upVotes + " \n" +
            "downVotes x " + downVotes);

        downVotes > upVotes ? challenge.failed = true : challenge.failed = false;
        challenge.failed ? emitSipsTo(challenge.player.socketId, 5) : "" ;

        updateAndEmitGame(socket.room)
    };

    let closeAndEmitQuiz = function () {
        let quiz = gameMap.get(socket.room).currentCard;

        console.log("Everyone has answered.")
        quiz.closed = true;

        let quizRanking = quiz.ranking;

        quizRanking.sort(compareQuizAnswer);


        // everyone answered correct, so the slowest player drink
        if (quiz.wrongAnswerCount === 0) {
            console.log("everyone answered correctly, slowest player drink");
            emitSipsTo(quizRanking[quizRanking.length - 1].player.socketId);
            quizRanking[quizRanking.length - 1].sips = quizRanking[quizRanking.length - 1].player.multiplier * 1;
        }
        // everyone with wrong answer drink
        quizRanking.forEach((rank) => {
            if (!rank.answer.isCorrect) {
                rank.sips = rank.player.multiplier * 1;
                emitSipsTo(rank.player.socketId);
            }
        });


        console.log(JSON.stringify(quizRanking));


        io.in(socket.room).emit('quizResults', {quiz: quiz, ranking: quizRanking});
        updateAndEmitGame(socket.room);
    }


    socket.on('challengeAccepted', () => {
        if (!socket.user || !socket.room) return;

        let challenge = gameMap.get(socket.room).currentCard;
        console.log(socket.user.name + "accepted the challenge. ");

        challenge.isAccepted = true;
        updateAndEmitGame(socket.room)
    });

    socket.on('challengeDeclined', () => {
        if (!socket.user || !socket.room) return;


        let challenge = gameMap.get(socket.room).currentCard;

        console.log(socket.user.name + "declined the challenge. ");
        emitSipsTo(socket.user.socketId, challenge.sips);

        challenge.isDeclined = true;
        challenge.closed = true;
        updateAndEmitGame(socket.room)
    });

    socket.on('challengeVote', (data) => {
        if (!socket.user || !socket.room) return;
        socket.user.hasAnswered = true;
        let challenge = gameMap.get(socket.room).currentCard;

        let upVote = data.success ? true : false;
        console.log(socket.user.name, upVote ? "up" : "down", "votes challenge");
        upVote ? challenge.upVotes++ : challenge.downVotes++;

        waitForUsers()
            .then((users) => {
                // -1 => dont wait for challenged player
                gameMap.get(socket.room).currentCard.playerLeftCount = users.length - 1;
                if (gameMap.get(socket.room).currentCard.playerLeftCount === 0) {
                    // close survey
                    closeAndEmitChallenge();

                } else {
                    console.log("Wait for users to answer: " + JSON.stringify(users.length));

                    updateAndEmitGame(socket.room)

                }

            })
            .catch((error) => {
                console.log(error);
            })


    });

    let emitSipsTo = function (socketId, sips) {

        let game = gameMap.get(socket.room);
        game.players.forEach((player) => {
            if (socketId === player.socketId) {
                let sipPenalty = game.multiplier * player.multiplier * sips ? sips : 1;
                player.sips += sipPenalty;

                console.log("Emitting sips to: " + JSON.stringify(player))

                io.to(player.socketId).emit('sip', {sips: sipPenalty});
                io.to(player.socketId).emit('updateUser', {user: player});
            }
        })
    }

    let emitRandomCard = function () {
        if (!socket.user || !socket.room) return;
        let game = gameMap.get(socket.room);

        if (cardsLeftInGame(game) > 0) {

            // category object with cards array
            const randomCategory = getRandomCategoryForGame(game);


            if (!randomCategory) {
                emitGameOver('Keine Karten mehr ☹️');
            } else {
                // remove and retrieve card from array
                const randomCard = getRandomCardForCategory(randomCategory);
                game.currentCard = randomCard;
                game.currentCategory = randomCard.category;

                if (game.currentCategory === 'challenge') {
                    io.in(socket.room).clients((error, clients) => {
                        if (error) throw error;
                        game.currentCard.player = getRandomPlayers(1, clients)[0];
                    });
                }
                console.log("emitting " + JSON.stringify(randomCard.category));
                io.in(socket.room).emit('newCard', {card: game.currentCard});


            }


        } else {
            console.log("\n no cards left.." + JSON.stringify(game.cards));
            emitGameOver('Keine Karten mehr Übrig ☹️')
        }

    };

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

    function getClientIds() {
        return new Promise(resolve => {
            let users = [];
            // noinspection JSUnresolvedFunction
            io.in(socket.room).clients((error, clients) => {
                clients.forEach((client) => {
                    users.push(io.sockets.connected[client])
                })

            });
            resolve(users);
        });
    }


    let setNewRandomAdmin = function () {

        io.in(socket.room).clients((error, clients) => {
            if (error) throw error;
            let randomUser = getRandomPlayers(1, clients)[0];
            gameMap.get(socket.room).admin = randomUser;
        });
    }

    let isRoomEmpty = function (name) {
        return io.sockets.adapter.rooms[name] === undefined;
    }


    socket.on('disconnect', function () {
        if (!socket.user || !socket.room) return;

        let game = gameMap.get(socket.room);

        // if user has not answered current card yet, decrease playerLeftCount
        if (!socket.user.hasAnswered && game) {
            if (!isEmpty(game.currentCard)) {
                console.log(JSON.stringify(game.currentCard))
                let playerLeftCount = --gameMap.get(socket.room).currentCard.playerLeftCount;

                // TODO need better solution than this..
                // if challenged player leaves the game, end challenge.
                if(game.currentCard.category === "challenge" && game.currentCard.player.socketId === socket.user.socketId) {
                    game.currentCard.playerQuit = true;
                    closeAndEmitChallenge()
                }
                if (playerLeftCount === 0) {
                    console.log("closing current card because everyone has answered..");
                    closeAndEmitCurrentCard();
                }
            }
        }

        console.log("Socket disconnects: " + JSON.stringify(socket.user))
        if (isRoomEmpty(socket.room)) {
            // if room is empty delete it from session array
            console.log("no one is in the room anymore.. Deleting room");
            gameMap.set(socket.room, undefined);

        } else {
            if (socket.user === gameMap.get(socket.room).admin) {
                console.log("admin left");
                if (gameMap.get(socket.room).players.length > 0) {
                    setNewRandomAdmin();
                }
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

    //start new game and if there are still unplayed cards, start new game with them.
    socket.on('startNewGame', function () {
        if (!socket.user || !socket.room) return;
        let game = gameMap.get(socket.room);

        let unplayedCardsInGame = cardsLeftInGame(game);

        // set cardsPerGame to cards left and keep card array
        if (unplayedCardsInGame < game.cardsPerGame) {
            console.log("\n less unique cards than they want to play, resetting cards array");
            game.cards = getCardsForEnabledCategories(game.categories);
        } else {
            console.log("\n enough unique cards for new round!");
        }

        game.isOver = false;
        game.cardsPlayed = 0;
        emitRandomCard();
        updateAndEmitGame(socket.room);


    });

    let emitGameOver = function (reason) {

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
        if (!socket.user || !socket.room) return;
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


                // if a card is currently active, increase playerLeftCount because new player also want to play!
                if (!isEmpty(gameMap.get(socket.room).currentCard)) {
                    ++gameMap.get(socket.room).currentCard.playerLeftCount;
                }

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
        console.log(JSON.stringify(socket.user.name) + " want's to create " + data.room);

        if (!isRoomEmpty(data.room)) {
            socket.emit('roomAlreadyExists');
        }
        else {
            socket.join(data.room, () => {
                //set socket basic data
                socket.room = data.room;


                let game = {
                    players: [],
                    isOver: false,
                    admin: socket.user,
                    categories: data.categories,
                    themes: data.themes,
                    cardsPerGame: data.cardsPerGame,
                    cardsPlayed: 0,
                    cards: getCardsForEnabledCategories(data.categories),
                    currentCard: {},
                    currentCategory: 'none',
                    multiplier: 1,
                    playerCount: 1
                }

                gameMap.set(data.room, game);
                console.log(socket.room + " created! \n" +
                    "Number of games in gameMap: " + gameMap.size);

                updateAndEmitGame(socket.room);
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
        if (!socket.user) return;
        console.log(socket.user.name + " requests user list");
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
        console.log("set socket user " + JSON.stringify(data.user), socket.id)
        socket.user = data.user;
        socket.user.socketId = socket.id;
        io.to(socket.id).emit('updateUser', {user: socket.user});

    });


    socket.on('reconnectRequest', (data) => {
        console.log(JSON.stringify(data.user) + "is back");
        socket.user = data.user;
        socket.user.socketId = socket.id;
        io.to(socket.id).emit('updateUser', {user: socket.user});

        let usersLastRoom = data.lastRoom;
        console.log(usersLastRoom ? "users last room was: " + usersLastRoom : '');

        let game = gameMap.get(usersLastRoom);

        if (game) {
            console.log("Room still exists. " +
                "\nWill Reconnect User");
            socket.emit('userReconnected');

        } else {
            console.log("Room does not exist.");
            socket.emit('userReconnected');
        }


    })

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
        if (!socket.user || !socket.room) return;
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
        let game = gameMap.get(socket.room);
        game.categories = data.categories;
        game.cards = getCardsForEnabledCategories(game.categories);
        updateAndEmitGame(socket.room);
    });

    socket.on('themesChanged', (data) => {
        if (!socket.user || !socket.room) return;
        console.log("Themes in " + socket.room + " changed to: " + JSON.stringify(data.themes));
        gameMap.get(socket.room).themes = data.themes;
        updateAndEmitGame(socket.room);
    });

})
;


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

//needed for starting new game logic and also handy in general
function cardsLeftInGame(game) {
    let cardsLeft = 0;
    for (let key in game.cards) {
        if (game.cards.hasOwnProperty(key) && isCategoryEnabled(game, key)) {
            console.log(key + " -> " + game.cards[key].length);
            cardsLeft += game.cards[key].length;
        }
    }
    return cardsLeft;

}


// used before game starts to only copy relevant cards to game cards
function getCardsForEnabledCategories(categories) {
    let cardsForGame = {};
    categories.forEach((category) => {
        if (category.enabled) {
            //copy card arrays for enabled categories
            cardsForGame[category.type] = JSON.parse(JSON.stringify(cards[category.type]));
        }
    });
    return cardsForGame;
}

function getRandomCategoryForGame(game) {
    let possibleCategories = [];
    game.categories.forEach((category) => {
        if (category.enabled && game.cards[category.type].length > 0) {
            possibleCategories.push(game.cards[category.type]);
        }
    });

    return possibleCategories[Math.floor(Math.random() * possibleCategories.length)];

}

function getRandomCardForCategory(category) {
    return category.splice(Math.floor(Math.random() * category.length), 1)[0];
}


// needed for calculation of cards left in game
function isCategoryEnabled(game, category) {
    let isEnabled = false;
    game.categories.forEach((c) => {
        if (c.type === category) {
            isEnabled = c.enabled
        }
    });
    return isEnabled;
}

function getRandomPlayers(howMany, players) {
    let selectedPlayers = [];

    while (howMany > 0 && players.length > 0) {
        // get random id from given array and remove it from array
        let randomClientId = players.splice(Math.floor(Math.random() * players.length), 1);
        selectedPlayers.push(io.sockets.connected[randomClientId].user);
        howMany--;
    }

    return selectedPlayers;
}

function compareGuessAnswer(rankingA, rankingB) {
    //compare absolute difference to correct answer for sorting
    diffAbsA = rankingA.difference;
    diffAbsB = rankingB.difference;

    if (diffAbsA < diffAbsB) return -1;
    if (diffAbsB < diffAbsA) return 1;

    return 0;

}

function compareQuizAnswer(rankingA, rankingB) {
    //compare quiz answers. if both are correct / incorrect the time decides who won
    let isCorrectA = rankingA.answer.isCorrect;
    let isCorrectB = rankingB.answer.isCorrect;

    let timeA = rankingA.time;
    let timeB = rankingB.time;

    if ((isCorrectA && isCorrectB) || (!isCorrectA && !isCorrectB)) {
        if (timeA < timeB) return -1;
        if (timeB < timeA) return 1;
    } else {
        if (isCorrectA) return -1;
        else return 1;
    }

    return 0;

}

function isEmpty(obj) {
    return Object.keys(obj).length === 0 && obj.constructor === Object
}

let port = process.env.PORT || 3001;

http.listen(port, function () {
    console.log('listening on http://localhost:' + port);
});

