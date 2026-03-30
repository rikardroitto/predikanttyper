const fs = require('fs');
const path = require('path');

function parseStatements(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const categories = [];
  const blocks = content.split(/^## \d+\.\s+/m).slice(1);

  for (const block of blocks) {
    const name = block.match(/^(.+)/)[1].trim();
    const statements = [];
    const re = /^\d+\.\s+(.+)$/gm;
    let m;
    while ((m = re.exec(block)) !== null) {
      statements.push(m[1].trim());
    }
    categories.push({ name, statements });
  }
  return categories;
}

function parseDescriptions(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const categories = [];
  const blocks = content.split(/^## \d+\.\s+/m).slice(1);

  for (const block of blocks) {
    const name = block.match(/^(.+)/)[1].trim();

    const quoteMatch = block.match(/\*\*"(.+?)"\*\*/);
    const quote = quoteMatch ? quoteMatch[1] : '';

    // Description: the paragraph(s) between the quote and the italic lines
    const lines = block.split('\n');
    const descLines = [];
    let inDesc = false;
    for (const line of lines) {
      if (line.includes('**"') && line.includes('"**')) {
        inDesc = true;
        continue;
      }
      if (inDesc && line.startsWith('*Favorituttryck')) break;
      if (inDesc && line.trim()) descLines.push(line.trim());
    }
    const description = descLines.join(' ');

    const favMatch = block.match(/\*Favorituttryck:\*\s*"?(.+?)"?\s*$/m);
    const favoriteExpression = favMatch ? favMatch[1].replace(/^"|"$/g, '') : '';

    const worstMatch = block.match(/\*Skräckscenario:\*\s*(.+)$/m);
    const worstCase = worstMatch ? worstMatch[1].trim() : '';

    categories.push({ name, quote, description, favoriteExpression, worstCase });
  }
  return categories;
}

function loadAllData(rootDir) {
  const descriptions = parseDescriptions(path.join(rootDir, 'predikanttyper.md'));
  const saklig = parseStatements(path.join(rootDir, 'fragor.md'));
  const absurdistisk = parseStatements(path.join(rootDir, 'fragor_v2.md'));

  // Merge descriptions with statements by index
  const buildVersion = (statementsArr) =>
    statementsArr.map((cat, i) => ({
      ...descriptions[i],
      name: cat.name,
      statements: cat.statements,
    }));

  return {
    saklig: buildVersion(saklig),
    absurdistisk: buildVersion(absurdistisk),
  };
}

module.exports = { loadAllData };
