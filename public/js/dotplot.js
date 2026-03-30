/**
 * Renders a dot plot on a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} scores - Array of player average scores (1-7)
 * @param {number} overallAverage - Group average
 * @param {number|null} highlightScore - The current player's score (null on host)
 */
function renderDotPlot(canvas, scores, overallAverage, highlightScore = null) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padLeft = 30;
  const padRight = 30;
  const plotW = w - padLeft - padRight;
  const centerY = h / 2;

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Scale: map value 1-7 to x position
  const toX = (val) => padLeft + ((val - 1) / 6) * plotW;

  // Draw axis line
  ctx.strokeStyle = '#3a3a5a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padLeft, centerY);
  ctx.lineTo(w - padRight, centerY);
  ctx.stroke();

  // Draw tick marks and labels
  ctx.fillStyle = '#8a8a9a';
  ctx.font = '12px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 1; i <= 7; i++) {
    const x = toX(i);
    ctx.beginPath();
    ctx.moveTo(x, centerY - 6);
    ctx.lineTo(x, centerY + 6);
    ctx.stroke();
    ctx.fillText(i, x, centerY + 22);
  }

  // Jitter dots vertically to avoid overlap
  // Sort scores to place close values near each other
  const sortedScores = scores.map((s, i) => ({ score: s, index: i }));
  sortedScores.sort((a, b) => a.score - b.score);

  // Calculate jitter: stack dots that are close together
  const dotRadius = 6;
  const highlightRadius = 10;
  const jitterPositions = new Array(scores.length);
  const placed = [];

  for (const item of sortedScores) {
    const x = toX(item.score);
    let jitter = 0;
    // Check overlap with already placed dots
    for (const p of placed) {
      if (Math.abs(p.x - x) < dotRadius * 2.2) {
        if (Math.abs(p.y - (centerY - jitter)) < dotRadius * 2.2) {
          jitter += dotRadius * 2.2;
        }
      }
    }
    const y = centerY - jitter - dotRadius;
    placed.push({ x, y });
    jitterPositions[item.index] = { x, y };
  }

  // Draw dots
  for (let i = 0; i < scores.length; i++) {
    const { x, y } = jitterPositions[i];
    const isHighlight = highlightScore !== null && Math.abs(scores[i] - highlightScore) < 0.001;

    ctx.beginPath();
    if (isHighlight) {
      ctx.arc(x, y, highlightRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffc857';
      ctx.fill();
      ctx.strokeStyle = '#ffdb4d';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#e94560';
      ctx.fill();
    }
  }

  // Draw average marker (triangle below)
  const avgX = toX(overallAverage);
  ctx.fillStyle = '#4ecdc4';
  ctx.beginPath();
  ctx.moveTo(avgX, centerY + 10);
  ctx.lineTo(avgX - 7, centerY + 22);
  ctx.lineTo(avgX + 7, centerY + 22);
  ctx.closePath();
  ctx.fill();

  // Average label
  ctx.fillStyle = '#4ecdc4';
  ctx.font = 'bold 11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('x̄ ' + overallAverage.toFixed(1), avgX, centerY + 34);
}
