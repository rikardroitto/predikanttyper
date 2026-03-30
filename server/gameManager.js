const crypto = require('crypto');

class GameManager {
  constructor(questionData) {
    this.questionData = questionData; // { saklig: [...], absurdistisk: [...] }
    this.games = new Map();
  }

  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
    let code;
    do {
      code = Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join('');
    } while (this.games.has(code));
    return code;
  }

  createGame(hostSocketId, version) {
    const code = this.generateCode();
    const categories = this.questionData[version];
    if (!categories) return null;

    this.games.set(code, {
      code,
      version,
      categories,
      hostSocketId,
      state: 'lobby', // lobby | playing | roundResults | finished
      currentRound: 0,
      players: new Map(),
      playerCounter: 0,
    });
    return code;
  }

  getGame(code) {
    return this.games.get(code);
  }

  getGameBySocket(socketId) {
    for (const game of this.games.values()) {
      if (game.hostSocketId === socketId) return game;
      if (game.players.has(socketId)) return game;
    }
    return null;
  }

  joinGame(code, playerSocketId) {
    const game = this.games.get(code);
    if (!game) return { error: 'Spelet hittades inte' };
    if (game.state !== 'lobby') return { error: 'Spelet har redan startat' };

    game.playerCounter++;
    const playerId = game.playerCounter;
    game.players.set(playerSocketId, {
      id: playerId,
      answers: [], // answers[round] = [a1, a2, a3, a4, a5]
      submitted: new Set(),
    });
    return { playerId, playerCount: game.players.size };
  }

  startGame(code) {
    const game = this.games.get(code);
    if (!game || game.state !== 'lobby') return null;
    if (game.players.size === 0) return null;

    game.state = 'playing';
    game.currentRound = 0;
    return this.getRoundData(game);
  }

  getRoundData(game) {
    const cat = game.categories[game.currentRound];
    return {
      round: game.currentRound,
      totalRounds: game.categories.length,
      categoryName: cat.name,
      statements: cat.statements,
    };
  }

  submitAnswers(socketId, round, answers) {
    const game = this.getGameBySocket(socketId);
    if (!game || game.state !== 'playing') return null;
    if (round !== game.currentRound) return null;

    const player = game.players.get(socketId);
    if (!player || player.submitted.has(round)) return null;

    player.answers[round] = answers;
    player.submitted.add(round);

    const submittedCount = this.getSubmittedCount(game);
    return {
      submittedCount,
      totalCount: game.players.size,
      allDone: submittedCount === game.players.size,
    };
  }

  getSubmittedCount(game) {
    let count = 0;
    for (const p of game.players.values()) {
      if (p.submitted.has(game.currentRound)) count++;
    }
    return count;
  }

  computeRoundResults(game) {
    const round = game.currentRound;
    const cat = game.categories[round];
    const scores = []; // average per player
    const playerScoreMap = new Map(); // socketId -> avg

    for (const [socketId, player] of game.players) {
      if (player.submitted.has(round)) {
        const ans = player.answers[round];
        const avg = ans.reduce((a, b) => a + b, 0) / ans.length;
        scores.push(avg);
        playerScoreMap.set(socketId, avg);
      }
    }

    const overallAverage = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    game.state = 'roundResults';

    return {
      categoryName: cat.name,
      description: {
        quote: cat.quote,
        description: cat.description,
        favoriteExpression: cat.favoriteExpression,
        worstCase: cat.worstCase,
      },
      scores,
      overallAverage,
      playerScoreMap,
    };
  }

  nextRound(code) {
    const game = this.games.get(code);
    if (!game) return null;

    game.currentRound++;
    if (game.currentRound >= game.categories.length) {
      game.state = 'finished';
      return { finished: true };
    }

    game.state = 'playing';
    return { finished: false, roundData: this.getRoundData(game) };
  }

  computeFinalResults(game) {
    const numRounds = game.categories.length;
    // categoryScores[round] = array of player averages
    const categoryScores = [];
    const playerOrder = [...game.players.keys()];

    for (let r = 0; r < numRounds; r++) {
      const roundScores = [];
      for (const socketId of playerOrder) {
        const player = game.players.get(socketId);
        if (player.submitted.has(r)) {
          const ans = player.answers[r];
          roundScores.push(ans.reduce((a, b) => a + b, 0) / ans.length);
        } else {
          roundScores.push(null);
        }
      }
      categoryScores.push(roundScores);
    }

    // Per-player score map for each round (for highlight)
    const playerScoreMaps = [];
    for (let r = 0; r < numRounds; r++) {
      const map = new Map();
      playerOrder.forEach((socketId, idx) => {
        if (categoryScores[r][idx] !== null) {
          map.set(socketId, categoryScores[r][idx]);
        }
      });
      playerScoreMaps.push(map);
    }

    const categories = game.categories.map((cat, r) => {
      const validScores = categoryScores[r].filter(s => s !== null);
      return {
        name: cat.name,
        description: {
          quote: cat.quote,
          description: cat.description,
          favoriteExpression: cat.favoriteExpression,
          worstCase: cat.worstCase,
        },
        scores: validScores,
        average: validScores.length > 0
          ? validScores.reduce((a, b) => a + b, 0) / validScores.length
          : 0,
      };
    });

    return { categories, categoryScores, playerOrder, playerScoreMaps };
  }

  removePlayer(socketId) {
    const game = this.getGameBySocket(socketId);
    if (!game) return null;

    if (game.hostSocketId === socketId) {
      // Host disconnected — end game
      game.state = 'finished';
      return { hostLeft: true, code: game.code };
    }

    game.players.delete(socketId);
    return {
      hostLeft: false,
      code: game.code,
      playerCount: game.players.size,
      submittedCount: game.state === 'playing' ? this.getSubmittedCount(game) : null,
    };
  }

  deleteGame(code) {
    this.games.delete(code);
  }
}

module.exports = GameManager;
