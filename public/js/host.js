const socket = io();

let gameCode = null;
let totalPlayers = 0;

// Get version from URL
const params = new URLSearchParams(window.location.search);
const version = params.get('version') || 'saklig';
document.getElementById('version-label').textContent =
  version === 'absurdistisk' ? 'Absurdistisk version' : 'Saklig version';

// Screen management
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// === CREATE GAME ===
socket.emit('create-game', { version });

socket.on('game-created', ({ code }) => {
  gameCode = code;
  document.getElementById('game-code').textContent = code;

  // Generate QR code
  const joinUrl = `${window.location.origin}/play.html?code=${code}`;
  QRCode.toCanvas(document.getElementById('qr-canvas'), joinUrl, {
    width: 200,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });
});

socket.on('player-joined', ({ playerCount }) => {
  totalPlayers = playerCount;
  document.getElementById('player-count').textContent = playerCount;
  document.getElementById('btn-start').disabled = playerCount < 1;
});

socket.on('player-left', ({ playerCount }) => {
  totalPlayers = playerCount;
  document.getElementById('player-count').textContent = playerCount;
});

// === START GAME ===
document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('start-game', { code: gameCode });
});

// === ROUND ===
socket.on('round-start', ({ round, totalRounds, categoryName, statements }) => {
  showScreen('screen-round');
  document.getElementById('round-label').textContent = `Omgång ${round + 1} av ${totalRounds}`;
  document.getElementById('round-category').textContent = '';
  document.getElementById('progress-bar').style.width = '0%';
  document.getElementById('progress-text').textContent = `0 av ${totalPlayers} har svarat`;
});

socket.on('player-submitted', ({ submittedCount, totalCount }) => {
  totalPlayers = totalCount;
  const pct = totalCount > 0 ? (submittedCount / totalCount) * 100 : 0;
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-text').textContent = `${submittedCount} av ${totalCount} har svarat`;
});

document.getElementById('btn-force-end').addEventListener('click', () => {
  socket.emit('force-end-round', { code: gameCode });
});

// === ROUND RESULTS ===
socket.on('round-results', ({ categoryName, description, scores, overallAverage }) => {
  showScreen('screen-results');
  document.getElementById('result-name').textContent = categoryName;
  document.getElementById('result-quote').textContent = `"${description.quote}"`;
  document.getElementById('result-description').textContent = description.description;
  document.getElementById('result-fav').textContent = description.favoriteExpression;
  document.getElementById('result-worst').textContent = description.worstCase;

  // Render dot plot (no highlight for host)
  const canvas = document.getElementById('dotplot-round');
  // Small delay to ensure canvas is visible and sized
  requestAnimationFrame(() => {
    renderDotPlot(canvas, scores, overallAverage, null);
  });
});

document.getElementById('btn-next').addEventListener('click', () => {
  socket.emit('next-round', { code: gameCode });
});

// === FINAL RESULTS ===
socket.on('game-finished', ({ categories, correlations, clusters, playerCount }) => {
  showScreen('screen-final');
  renderFinalResults(categories, correlations, clusters, null, playerCount);
});

function renderFinalResults(categories, correlations, clusters, playerOwnScores, playerCount) {
  const container = document.getElementById('final-plots');
  container.innerHTML = '';

  categories.forEach((cat, i) => {
    const div = document.createElement('div');
    div.className = 'dotplot-container';

    const descHtml = cat.description ? `
      <div class="expandable-desc" id="desc-toggle-${i}">
        <button class="btn-expand" onclick="this.parentElement.classList.toggle('open')">Visa beskrivning</button>
        <div class="desc-content">
          <p class="category-quote">"${cat.description.quote}"</p>
          <p class="category-description">${cat.description.description}</p>
          <p class="category-meta"><strong>Favorituttryck:</strong> ${cat.description.favoriteExpression}</p>
          <p class="category-meta"><strong>Skräckscenario:</strong> ${cat.description.worstCase}</p>
        </div>
      </div>` : '';

    div.innerHTML = `<p class="dotplot-title" style="color: var(--accent-soft); font-weight: 600;">${i + 1}. ${cat.name}</p>
      <canvas class="dotplot-canvas" id="final-plot-${i}"></canvas>
      ${descHtml}`;
    container.appendChild(div);

    requestAnimationFrame(() => {
      const canvas = document.getElementById(`final-plot-${i}`);
      const highlight = playerOwnScores ? playerOwnScores[i] : null;
      renderDotPlot(canvas, cat.scores, cat.average, highlight);
    });
  });

  // Correlations table
  const tbody = document.getElementById('correlation-body');
  tbody.innerHTML = '';
  correlations.forEach(({ cat1, cat2, r }) => {
    const tr = document.createElement('tr');
    const colorClass = r >= 0 ? 'correlation-positive' : 'correlation-negative';
    tr.innerHTML = `<td>${cat1}</td><td>${cat2}</td><td class="${colorClass}">${r > 0 ? '+' : ''}${r.toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });

  // Clusters
  const clustersDiv = document.getElementById('clusters-container');
  clustersDiv.innerHTML = '';
  if (clusters.length === 0) {
    clustersDiv.innerHTML = '<p style="color: var(--text-muted);">Inga tydliga kluster hittades.</p>';
  } else {
    clusters.forEach((cluster, i) => {
      const div = document.createElement('div');
      div.className = 'cluster-group';
      div.innerHTML = `
        <p class="cluster-label">Kluster ${i + 1}</p>
        <div class="cluster-names">
          ${cluster.map(name => `<span class="cluster-tag">${name}</span>`).join('')}
        </div>`;
      clustersDiv.appendChild(div);
    });
  }

  // Footnote
  const footnote = document.createElement('p');
  footnote.className = 'stats-footnote';
  footnote.textContent = `Statistiken baseras på ${playerCount || '?'} deltagare. Korrelationer (Pearsons r) blir mer tillförlitliga med fler deltagare — med färre än ~10 bör resultaten tolkas med försiktighet.`;
  document.getElementById('final-clusters').appendChild(footnote);
}

// === ERRORS ===
socket.on('error-msg', ({ message }) => {
  alert(message);
});
