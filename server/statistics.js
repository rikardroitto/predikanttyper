function pearson(x, y) {
  // Filter out pairs where either value is null
  const pairs = [];
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== null && y[i] !== null) {
      pairs.push([x[i], y[i]]);
    }
  }
  const n = pairs.length;
  if (n < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (const [xi, yi] of pairs) {
    sumX += xi;
    sumY += yi;
    sumXY += xi * yi;
    sumX2 += xi * xi;
    sumY2 += yi * yi;
  }

  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function computeCorrelations(categoryScores, categoryNames) {
  const n = categoryScores.length;
  const pairs = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = pearson(categoryScores[i], categoryScores[j]);
      pairs.push({
        cat1: categoryNames[i],
        cat2: categoryNames[j],
        r: Math.round(r * 100) / 100,
      });
    }
  }

  return pairs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

function clustersAtThreshold(correlations, categoryNames, threshold) {
  const adj = new Map();
  for (const name of categoryNames) adj.set(name, new Set());

  for (const { cat1, cat2, r } of correlations) {
    // Only cluster on positive correlations — negative means opposites
    if (r >= threshold) {
      adj.get(cat1).add(cat2);
      adj.get(cat2).add(cat1);
    }
  }

  const visited = new Set();
  const clusters = [];

  for (const name of categoryNames) {
    if (visited.has(name)) continue;
    if (adj.get(name).size === 0) continue;

    const cluster = [];
    const queue = [name];
    visited.add(name);

    while (queue.length > 0) {
      const current = queue.shift();
      cluster.push(current);
      for (const neighbor of adj.get(current)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (cluster.length >= 2) clusters.push(cluster);
  }

  return clusters;
}

function computeClusters(correlations, categoryNames) {
  // Try thresholds from high to low, pick the one that gives
  // the most interesting result: 2+ clusters, no single mega-cluster
  const thresholds = [0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4];
  let best = [];

  for (const t of thresholds) {
    const result = clustersAtThreshold(correlations, categoryNames, t);
    if (result.length >= 2) {
      // Check that not all categories are in one cluster
      const maxSize = Math.max(...result.map(c => c.length));
      if (maxSize <= categoryNames.length - 2) {
        return result; // Good split found
      }
    }
    // Keep the last non-empty result as fallback
    if (result.length > 0) best = result;
  }

  return best;
}

module.exports = { computeCorrelations, computeClusters };
