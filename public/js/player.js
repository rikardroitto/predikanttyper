const socket = io();

let currentRound = -1;
let answers = [];

// Screen management
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// Pre-fill code from URL
const params = new URLSearchParams(window.location.search);
const codeFromUrl = params.get('code');
if (codeFromUrl) {
  document.getElementById('code-input').value = codeFromUrl.toUpperCase();
}

// Auto-uppercase
document.getElementById('code-input').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

// === JOIN ===
document.getElementById('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = document.getElementById('code-input').value.toUpperCase().trim();
  if (code.length !== 4) return;
  document.getElementById('join-error').style.display = 'none';
  socket.emit('join-game', { code });
});

socket.on('joined', ({ playerId }) => {
  document.getElementById('player-label').textContent = `Du är Spelare ${playerId}`;
  showScreen('screen-waiting');
});

socket.on('error-msg', ({ message }) => {
  const el = document.getElementById('join-error');
  el.textContent = message;
  el.style.display = 'block';
});

// === ROUND ===
socket.on('round-start', ({ round, totalRounds, categoryName, statements }) => {
  currentRound = round;
  answers = new Array(statements.length).fill(null);

  showScreen('screen-answer');
  document.getElementById('round-label').textContent = `Omgång ${round + 1} av ${totalRounds}`;

  const container = document.getElementById('statements-container');
  container.innerHTML = '';

  statements.forEach((text, i) => {
    const card = document.createElement('div');
    card.className = 'statement-card';
    card.innerHTML = `
      <p class="statement-text"><span class="statement-number">${i + 1}.</span>${text}</p>
      <div class="rating-row" data-index="${i}">
        ${[1,2,3,4,5,6,7].map(v =>
          `<button type="button" class="rating-btn" data-value="${v}">${v}</button>`
        ).join('')}
      </div>
      <div class="rating-labels">
        <span>Håller inte alls med</span>
        <span>Håller med fullständigt</span>
      </div>`;
    container.appendChild(card);
  });

  // Attach click handlers
  container.querySelectorAll('.rating-row').forEach(row => {
    const idx = parseInt(row.dataset.index);
    row.querySelectorAll('.rating-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        answers[idx] = parseInt(btn.dataset.value);
        // Update visual
        row.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        // Enable submit if all answered
        checkSubmitEnabled();
      });
    });
  });

  document.getElementById('btn-submit').disabled = true;
});

function checkSubmitEnabled() {
  const allAnswered = answers.every(a => a !== null);
  document.getElementById('btn-submit').disabled = !allAnswered;
}

document.getElementById('btn-submit').addEventListener('click', () => {
  if (answers.some(a => a === null)) return;
  socket.emit('submit-answers', { round: currentRound, answers });
  showScreen('screen-submitted');
});

socket.on('submit-ack', () => {
  // Already on submitted screen
});

// === ROUND RESULTS ===
socket.on('round-results', ({ categoryName, description, scores, overallAverage, playerOwnScore }) => {
  showScreen('screen-results');
  document.getElementById('result-name').textContent = categoryName;
  document.getElementById('result-quote').textContent = `"${description.quote}"`;
  document.getElementById('result-description').textContent = description.description;
  document.getElementById('result-fav').textContent = description.favoriteExpression;
  document.getElementById('result-worst').textContent = description.worstCase;

  const canvas = document.getElementById('dotplot-round');
  requestAnimationFrame(() => {
    renderDotPlot(canvas, scores, overallAverage, playerOwnScore);
  });
});

// === FINAL RESULTS ===
socket.on('game-finished', ({ categories, correlations, clusters, playerOwnScores, playerCount }) => {
  showScreen('screen-final');

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

  // Correlations
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
});

// === HOST DISCONNECTED ===
socket.on('host-disconnected', () => {
  showScreen('screen-disconnected');
});
