const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { loadAllData } = require('./server/questionParser');
const GameManager = require('./server/gameManager');
const { computeCorrelations, computeClusters } = require('./server/statistics');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Parse question data at startup
const questionData = loadAllData(__dirname);
const gm = new GameManager(questionData);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {

  // === HOST EVENTS ===

  socket.on('create-game', ({ version }) => {
    const code = gm.createGame(socket.id, version);
    if (!code) {
      socket.emit('error-msg', { message: 'Kunde inte skapa spel' });
      return;
    }
    socket.join(code);
    socket.emit('game-created', { code });
  });

  socket.on('start-game', ({ code }) => {
    const roundData = gm.startGame(code);
    if (!roundData) {
      socket.emit('error-msg', { message: 'Kunde inte starta spelet' });
      return;
    }
    io.to(code).emit('round-start', roundData);
  });

  socket.on('force-end-round', ({ code }) => {
    const game = gm.getGame(code);
    if (!game || game.state !== 'playing') return;
    const results = gm.computeRoundResults(game);
    emitRoundResults(game, results);
  });

  socket.on('next-round', ({ code }) => {
    const result = gm.nextRound(code);
    if (!result) return;

    if (result.finished) {
      const game = gm.getGame(code);
      const final = gm.computeFinalResults(game);
      const correlations = computeCorrelations(
        final.categoryScores,
        game.categories.map(c => c.name)
      );
      const clusters = computeClusters(correlations, game.categories.map(c => c.name));

      const playerCount = game.players.size;

      // Send to host (no player highlights)
      socket.emit('game-finished', {
        categories: final.categories,
        correlations: correlations.slice(0, 20),
        clusters,
        playerCount,
      });

      // Send to each player with their own scores
      for (const [playerSocketId, player] of game.players) {
        const playerScores = final.playerScoreMaps.map(m => m.get(playerSocketId) ?? null);
        io.to(playerSocketId).emit('game-finished', {
          categories: final.categories,
          correlations: correlations.slice(0, 20),
          clusters,
          playerCount,
          playerOwnScores: playerScores,
        });
      }
    } else {
      io.to(code).emit('round-start', result.roundData);
    }
  });

  // === PLAYER EVENTS ===

  socket.on('join-game', ({ code }) => {
    const upperCode = (code || '').toUpperCase().trim();
    const result = gm.joinGame(upperCode, socket.id);
    if (result.error) {
      socket.emit('error-msg', { message: result.error });
      return;
    }
    socket.join(upperCode);
    socket.emit('joined', { playerId: result.playerId });

    // Notify host
    const game = gm.getGame(upperCode);
    if (game) {
      io.to(game.hostSocketId).emit('player-joined', { playerCount: result.playerCount });
    }
  });

  socket.on('submit-answers', ({ round, answers }) => {
    const result = gm.submitAnswers(socket.id, round, answers);
    if (!result) return;

    socket.emit('submit-ack', {});

    // Notify host of progress
    const game = gm.getGameBySocket(socket.id);
    if (game) {
      io.to(game.hostSocketId).emit('player-submitted', {
        submittedCount: result.submittedCount,
        totalCount: result.totalCount,
      });

      if (result.allDone) {
        const results = gm.computeRoundResults(game);
        emitRoundResults(game, results);
      }
    }
  });

  // === DISCONNECT ===

  socket.on('disconnect', () => {
    const result = gm.removePlayer(socket.id);
    if (!result) return;

    if (result.hostLeft) {
      io.to(result.code).emit('host-disconnected', {});
      gm.deleteGame(result.code);
    } else {
      const game = gm.getGame(result.code);
      if (game) {
        io.to(game.hostSocketId).emit('player-left', {
          playerCount: result.playerCount,
        });
      }
    }
  });
});

function emitRoundResults(game, results) {
  // Send to host (all scores, no highlight)
  io.to(game.hostSocketId).emit('round-results', {
    categoryName: results.categoryName,
    description: results.description,
    scores: results.scores,
    overallAverage: results.overallAverage,
  });

  // Send to each player with their own score highlighted
  for (const [socketId] of game.players) {
    io.to(socketId).emit('round-results', {
      categoryName: results.categoryName,
      description: results.description,
      scores: results.scores,
      overallAverage: results.overallAverage,
      playerOwnScore: results.playerScoreMap.get(socketId) ?? null,
    });
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Predikanttyper körs på port ${PORT}`);
});
